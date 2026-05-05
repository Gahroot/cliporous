// ---------------------------------------------------------------------------
// Filler removal feature — pre-render pass that produces a clean intermediate
// file with filler words, silences, and repeated phrases removed.
//
// FIX: Previous implementation used FFmpeg's `select` filter with complex
// expressions on the command line. On Windows, CreateProcess mangles single
// quotes and parentheses, causing FFmpeg to fail with EINVAL. This new
// approach avoids command-line escaping entirely by:
//   1. Trimming each "keep" segment to a separate temp file using -ss/-t
//   2. Concatenating all trimmed segments via the concat demuxer (stream copy)
//   3. Replacing the job's source path with the clean intermediate file
// ---------------------------------------------------------------------------

import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { RenderFeature, PrepareResult } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import { toFFmpegPath } from '../helpers'
import { detectFillers } from '../../filler-detection'
import { buildKeepSegments, remapWordTimestamps, type KeepSegment } from '../../filler-cuts'
import { generateCaptions } from '../../captions'
import { ASPECT_RATIO_CONFIGS } from '../../aspect-ratios'
import { ffmpeg as createFfmpeg, getEncoder, getSoftwareEncoder, isGpuSessionError, isGpuEncoderDisabled, disableGpuEncoderForSession } from '../../ffmpeg'

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Trim a single segment from the source video using re-encode.
 * Re-encoding is required for frame-accurate cuts — stream copy would produce
 * keyframe-aligned boundaries that don't match the filler timestamps.
 */
function trimSegment(
  sourcePath: string,
  startTime: number,
  duration: number,
  outputPath: string
): Promise<void> {
  const { encoder, presetFlag } = isGpuEncoderDisabled() ? getSoftwareEncoder() : getEncoder()

  return new Promise<void>((resolve, reject) => {
    let stderrOutput = ''
    const cmd = createFfmpeg(sourcePath)
      .setStartTime(startTime)
      .setDuration(duration)
      .audioFilters([
        `afade=t=in:st=0:d=0.015`,
        `afade=t=out:st=${Math.max(0, duration - 0.015)}:d=0.015`
      ])
      .outputOptions(['-y', '-c:v', encoder, ...presetFlag, '-c:a', 'aac', '-b:a', '192k'])
      .on('stderr', (line: string) => { stderrOutput += line + '\n' })
      .on('end', () => resolve())
      .on('error', (err: Error) => {
        // GPU session exhaustion → retry with software encoder
        if (isGpuSessionError(err.message + '\n' + stderrOutput)) {
          disableGpuEncoderForSession()
          const sw = getSoftwareEncoder()
          createFfmpeg(sourcePath)
            .setStartTime(startTime)
            .setDuration(duration)
            .audioFilters([
              `afade=t=in:st=0:d=0.015`,
              `afade=t=out:st=${Math.max(0, duration - 0.015)}:d=0.015`
            ])
            .outputOptions(['-y', '-c:v', sw.encoder, ...sw.presetFlag, '-c:a', 'aac', '-b:a', '192k'])
            .on('end', () => resolve())
            .on('error', reject)
            .save(toFFmpegPath(outputPath))
        } else {
          reject(err)
        }
      })
      .save(toFFmpegPath(outputPath))
  })
}

/**
 * Concatenate multiple video segments using the concat demuxer (stream copy).
 * All segments must have been encoded with identical codec/resolution/fps by
 * trimSegment() above, so stream copy is safe.
 */
function concatSegments(segmentPaths: string[], outputPath: string): Promise<void> {
  const listFile = join(tmpdir(), `batchcontent-filler-concat-${Date.now()}.txt`)
  const listContent = segmentPaths
    .map((p) => `file '${toFFmpegPath(p).replace(/'/g, "'\\''")}'`)
    .join('\n')
  writeFileSync(listFile, listContent, 'utf-8')

  return new Promise<void>((resolve, reject) => {
    createFfmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy', '-movflags', '+faststart', '-y'])
      .on('end', () => {
        try { unlinkSync(listFile) } catch { /* ignore */ }
        resolve()
      })
      .on('error', (err: Error) => {
        try { unlinkSync(listFile) } catch { /* ignore */ }
        reject(err)
      })
      .save(toFFmpegPath(outputPath))
  })
}

// ---------------------------------------------------------------------------
// Feature factory
// ---------------------------------------------------------------------------

export function createFillerRemovalFeature(): RenderFeature {
  return {
    name: 'filler-removal',

    async prepare(job: RenderClipJob, batchOptions: RenderBatchOptions, onProgress?: (message: string, percent: number) => void): Promise<PrepareResult> {
      // Check: filler removal enabled?
      if (!batchOptions.fillerRemoval?.enabled) {
        return { tempFiles: [], modified: false }
      }

      // Need word timestamps to detect fillers
      const words = job.wordTimestamps ?? []
      if (words.length === 0) {
        console.log(`[FillerRemoval] Clip ${job.clipId}: no word timestamps — skipping`)
        return { tempFiles: [], modified: false }
      }

      // Filter words to this clip's time range
      const clipWords = words.filter(
        (w) => w.start >= job.startTime && w.end <= job.endTime
      )
      if (clipWords.length === 0) {
        return { tempFiles: [], modified: false }
      }

      // Use precomputed (user-curated) segments when available, otherwise detect
      let fillerSegments: Array<{ start: number; end: number; type: string; label: string }>
      if (job.precomputedFillerSegments && job.precomputedFillerSegments.length > 0) {
        fillerSegments = job.precomputedFillerSegments
        console.log(
          `[FillerRemoval] Clip ${job.clipId}: using ${fillerSegments.length} precomputed segments`
        )
      } else {
        // Build detection settings from batch options
        const fr = batchOptions.fillerRemoval
        const detectionSettings = {
          removeFillerWords: fr.removeFillerWords,
          trimSilences: fr.trimSilences,
          removeRepeats: fr.removeRepeats,
          silenceThreshold: fr.silenceThreshold,
          silenceTargetGap: fr.silenceTargetGap ?? 0.15,
          fillerWords: fr.fillerWords
        }

        // Detect fillers
        const detection = detectFillers(clipWords, detectionSettings)
        if (detection.segments.length === 0) {
          console.log(`[FillerRemoval] Clip ${job.clipId}: no fillers detected`)
          return { tempFiles: [], modified: false }
        }

        fillerSegments = detection.segments

        console.log(
          `[FillerRemoval] Clip ${job.clipId}: found ${detection.segments.length} segments ` +
          `(${detection.counts.filler} fillers, ${detection.counts.silence} silences, ` +
          `${detection.counts.repeat} repeats) — saving ${detection.timeSaved.toFixed(1)}s`
        )
      }

      // Build keep segments (0-based relative to clip start)
      const keepSegments = buildKeepSegments(job.startTime, job.endTime, fillerSegments as Array<{ start: number; end: number; type: 'filler' | 'silence' | 'repeat'; label: string }>)
      if (keepSegments.length === 0) {
        console.warn(`[FillerRemoval] Clip ${job.clipId}: no keep segments — skipping`)
        return { tempFiles: [], modified: false }
      }

      // If only one segment covers the full clip, no cuts are needed
      if (keepSegments.length === 1 && keepSegments[0].start < 0.001) {
        console.log(`[FillerRemoval] Clip ${job.clipId}: single keep segment — no cuts needed`)
        return { tempFiles: [], modified: false }
      }

      // ── Pre-render pass: trim + concat ─────────────────────────────────────
      const tempFiles: string[] = []
      const trimmedPaths: string[] = []
      const ts = Date.now()

      try {
        // Trim each keep segment from the source
        for (let i = 0; i < keepSegments.length; i++) {
          const seg = keepSegments[i]
          const segDuration = seg.end - seg.start
          if (segDuration < 0.05) continue // skip micro segments

          onProgress?.(
            `Trimming segment ${i + 1}/${keepSegments.length}…`,
            Math.round(((i + 1) / keepSegments.length) * 80)
          )

          const trimPath = join(tmpdir(), `batchcontent-filler-trim-${ts}-${i}.mp4`)
          const absoluteStart = job.startTime + seg.start
          console.log(
            `[FillerRemoval] Clip ${job.clipId}: trimming segment ${i + 1}/${keepSegments.length} ` +
            `[${absoluteStart.toFixed(2)}s → ${(absoluteStart + segDuration).toFixed(2)}s] (${segDuration.toFixed(2)}s)`
          )
          await trimSegment(job.sourceVideoPath, absoluteStart, segDuration, trimPath)
          trimmedPaths.push(trimPath)
          tempFiles.push(trimPath)
        }

        if (trimmedPaths.length === 0) {
          console.warn(`[FillerRemoval] Clip ${job.clipId}: all segments too short — skipping`)
          return { tempFiles: [], modified: false }
        }

        // Concatenate all trimmed segments into a single clean file
        const cleanPath = join(tmpdir(), `batchcontent-filler-clean-${ts}.mp4`)
        tempFiles.push(cleanPath)

        if (trimmedPaths.length === 1) {
          // Only one segment — no concat needed, just use it directly
          // Remove from tempFiles since we'll point the job at it
          // Actually, keep it in tempFiles — the orchestrator cleans up after render
        } else {
          console.log(`[FillerRemoval] Clip ${job.clipId}: concatenating ${trimmedPaths.length} segments`)
          onProgress?.(`Concatenating ${trimmedPaths.length} segments…`, 85)
          await concatSegments(trimmedPaths, cleanPath)
        }

        const intermediateFile = trimmedPaths.length === 1 ? trimmedPaths[0] : cleanPath

        // Calculate total kept duration
        const totalKeptDuration = keepSegments.reduce(
          (sum, seg) => sum + (seg.end - seg.start),
          0
        )

        // Update the job to use the clean intermediate file
        const originalSource = job.sourceVideoPath
        const originalStart = job.startTime
        const originalEnd = job.endTime
        job.sourceVideoPath = intermediateFile
        job.startTime = 0
        job.endTime = totalKeptDuration

        console.log(
          `[FillerRemoval] Clip ${job.clipId}: intermediate file ready ` +
          `(${totalKeptDuration.toFixed(2)}s, was ${(originalEnd - originalStart).toFixed(2)}s)`
        )

        // ── Caption re-sync ────────────────────────────────────────────────
        if (batchOptions.captionsEnabled && batchOptions.captionStyle) {
          try {
            const remapped = remapWordTimestamps(
              clipWords,
              originalStart,
              originalEnd,
              fillerSegments as Array<{ start: number; end: number; type: 'filler' | 'silence' | 'repeat'; label: string }>
            )
            if (remapped.length > 0) {
              const arCfg = ASPECT_RATIO_CONFIGS[batchOptions.outputAspectRatio ?? '9:16']

              // Respect template layout subtitle position (same calc as captions.feature.ts)
              const marginVOverride = batchOptions.templateLayout?.subtitles
                ? Math.round((1 - batchOptions.templateLayout.subtitles.y / 100) * arCfg.height)
                : undefined

              const newAssPath = await generateCaptions(
                remapped,
                batchOptions.captionStyle,
                undefined,
                arCfg.width,
                arCfg.height,
                marginVOverride
              )
              console.log(`[FillerRemoval] Clip ${job.clipId}: captions re-synced → ${newAssPath}`)
              job.assFilePath = newAssPath
              tempFiles.push(newAssPath)

              // Update word timestamps to remapped 0-based values so downstream
              // features (captions.feature.ts) see words matching the new time range
              // and don't silently skip or overwrite with wrong positioning.
              job.wordTimestamps = remapped.map((w) => ({
                text: w.text,
                start: w.start,
                end: w.end
              }))
            }
          } catch (captionErr) {
            console.warn(`[FillerRemoval] Clip ${job.clipId}: caption re-sync failed:`, captionErr)
          }
        }

        return { tempFiles, modified: true }
      } catch (err) {
        // Clean up any temp files created so far
        for (const f of tempFiles) {
          try { unlinkSync(f) } catch { /* ignore */ }
        }
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[FillerRemoval] Clip ${job.clipId}: pre-render pass failed: ${msg}`)
        // Don't throw — let the clip render without filler removal
        return { tempFiles: [], modified: false }
      }
    }

    // No videoFilter() — filler removal is a pre-render pass, not a filter chain modification.
    // No overlayPass() — no visual overlay.
    // No postProcess() — all work is done in prepare().
  }
}
