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
//
// The core trim+concat+remap logic is exposed as `runFillerRemoval()` so the
// segmented render path in pipeline.ts can reuse it (the feature pipeline's
// `prepare()` chain doesn't run on the segmented branch).
// ---------------------------------------------------------------------------

import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { RenderFeature, PrepareResult } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import { toFFmpegPath } from '../helpers'
import { detectFillers, type FillerSegment } from '../../filler-detection'
import { buildKeepSegments, remapWordTimestamps } from '../../filler-cuts'
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
// Public API — shared trim+concat helper
// ---------------------------------------------------------------------------

export interface FillerRemovalResult {
  /** Whether the job was actually modified (filler segments were cut). */
  modified: boolean
  /**
   * Filler segments that were removed, in source-video absolute time. Empty
   * when `modified` is false. Callers that need to remap their own data onto
   * the cleaned timeline (e.g. segmented render needing to remap
   * `segmentedSegments[].startTime/endTime`) use these.
   */
  fillerSegments: FillerSegment[]
  /**
   * Original clip start in source-video time (before the job was rewritten
   * to look like a 0-based clip on the cleaned intermediate). Required by
   * downstream remapping that operates in source-video coordinates.
   */
  originalStart: number
  /** Original clip end in source-video time. */
  originalEnd: number
  /** Temp files created by the pass — the caller is responsible for cleanup. */
  tempFiles: string[]
}

/**
 * Detect fillers/silences/repeats in `job`, trim them out via re-encode +
 * concat-demuxer, and mutate the job in place to point at the cleaned
 * intermediate file. Also remaps `job.wordTimestamps` onto the cleaned
 * timeline so downstream features see clip-local times consistent with the
 * new source.
 *
 * This function is the shared core used by both:
 *   • `createFillerRemovalFeature().prepare()` — the regular non-segmented
 *     render path's feature-pipeline hook
 *   • the segmented render branch in `pipeline.ts`, which short-circuits the
 *     feature pipeline and must invoke filler removal directly
 *
 * Returns `{ modified: false, ... }` when filler removal is disabled, the
 * job has no word timestamps, no fillers are detected, or the keep segments
 * collapse to the entire clip. In all of these cases the job is left
 * untouched.
 */
export async function runFillerRemoval(
  job: RenderClipJob,
  batchOptions: RenderBatchOptions,
  onProgress?: (message: string, percent: number) => void
): Promise<FillerRemovalResult> {
  const empty: FillerRemovalResult = {
    modified: false,
    fillerSegments: [],
    originalStart: job.startTime,
    originalEnd: job.endTime,
    tempFiles: []
  }

  if (!batchOptions.fillerRemoval?.enabled) return empty

  const words = job.wordTimestamps ?? []
  if (words.length === 0) {
    console.log(`[FillerRemoval] Clip ${job.clipId}: no word timestamps — skipping`)
    return empty
  }

  const clipWords = words.filter(
    (w) => w.start >= job.startTime && w.end <= job.endTime
  )
  if (clipWords.length === 0) return empty

  // Use precomputed (user-curated) segments when available, otherwise detect
  let fillerSegments: FillerSegment[]
  if (job.precomputedFillerSegments && job.precomputedFillerSegments.length > 0) {
    fillerSegments = job.precomputedFillerSegments as FillerSegment[]
    console.log(
      `[FillerRemoval] Clip ${job.clipId}: using ${fillerSegments.length} precomputed segments`
    )
  } else {
    const fr = batchOptions.fillerRemoval
    const detectionSettings = {
      removeFillerWords: fr.removeFillerWords,
      trimSilences: fr.trimSilences,
      removeRepeats: fr.removeRepeats,
      silenceThreshold: fr.silenceThreshold,
      silenceTargetGap: fr.silenceTargetGap ?? 0.15,
      fillerWords: fr.fillerWords
    }

    const detection = detectFillers(clipWords, detectionSettings)
    if (detection.segments.length === 0) {
      console.log(`[FillerRemoval] Clip ${job.clipId}: no fillers detected`)
      return empty
    }

    fillerSegments = detection.segments
    console.log(
      `[FillerRemoval] Clip ${job.clipId}: found ${detection.segments.length} segments ` +
      `(${detection.counts.filler} fillers, ${detection.counts.silence} silences, ` +
      `${detection.counts.repeat} repeats) — saving ${detection.timeSaved.toFixed(1)}s`
    )
  }

  const keepSegments = buildKeepSegments(job.startTime, job.endTime, fillerSegments)
  if (keepSegments.length === 0) {
    console.warn(`[FillerRemoval] Clip ${job.clipId}: no keep segments — skipping`)
    return empty
  }

  if (keepSegments.length === 1 && keepSegments[0].start < 0.001) {
    const fullDur = job.endTime - job.startTime
    if (Math.abs(keepSegments[0].end - fullDur) < 0.001) {
      console.log(`[FillerRemoval] Clip ${job.clipId}: single keep segment — no cuts needed`)
      return empty
    }
  }

  // ── Pre-render pass: trim + concat ───────────────────────────────────────
  const tempFiles: string[] = []
  const trimmedPaths: string[] = []
  const ts = Date.now()

  try {
    for (let i = 0; i < keepSegments.length; i++) {
      const seg = keepSegments[i]
      const segDuration = seg.end - seg.start
      if (segDuration < 0.05) continue

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
      return empty
    }

    const cleanPath = join(tmpdir(), `batchcontent-filler-clean-${ts}.mp4`)
    if (trimmedPaths.length > 1) {
      console.log(`[FillerRemoval] Clip ${job.clipId}: concatenating ${trimmedPaths.length} segments`)
      onProgress?.(`Concatenating ${trimmedPaths.length} segments…`, 85)
      await concatSegments(trimmedPaths, cleanPath)
      tempFiles.push(cleanPath)
    }

    const intermediateFile = trimmedPaths.length === 1 ? trimmedPaths[0] : cleanPath

    const totalKeptDuration = keepSegments.reduce(
      (sum, seg) => sum + (seg.end - seg.start),
      0
    )

    // Snapshot the original time range BEFORE mutating the job — callers
    // (segmented render) need it to remap their own absolute-time data.
    const originalStart = job.startTime
    const originalEnd = job.endTime

    job.sourceVideoPath = intermediateFile
    job.startTime = 0
    job.endTime = totalKeptDuration

    // Remap wordTimestamps onto the cleaned 0-based timeline so downstream
    // features (captions, segmented render's clip-level caption pass) see
    // times consistent with the new source.
    const remapped = remapWordTimestamps(
      clipWords,
      originalStart,
      originalEnd,
      fillerSegments
    )
    job.wordTimestamps = remapped.map((w) => ({
      text: w.text,
      start: w.start,
      end: w.end
    }))

    console.log(
      `[FillerRemoval] Clip ${job.clipId}: intermediate file ready ` +
      `(${totalKeptDuration.toFixed(2)}s, was ${(originalEnd - originalStart).toFixed(2)}s)`
    )

    return {
      modified: true,
      fillerSegments,
      originalStart,
      originalEnd,
      tempFiles
    }
  } catch (err) {
    for (const f of tempFiles) {
      try { unlinkSync(f) } catch { /* ignore */ }
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[FillerRemoval] Clip ${job.clipId}: pre-render pass failed: ${msg}`)
    return empty
  }
}

// ---------------------------------------------------------------------------
// Feature factory
// ---------------------------------------------------------------------------

export function createFillerRemovalFeature(): RenderFeature {
  return {
    name: 'filler-removal',

    async prepare(job: RenderClipJob, batchOptions: RenderBatchOptions, onProgress?: (message: string, percent: number) => void): Promise<PrepareResult> {
      const result = await runFillerRemoval(job, batchOptions, onProgress)
      if (!result.modified) {
        return { tempFiles: result.tempFiles, modified: false }
      }

      // ── Caption ASS re-generation (non-segmented path only) ────────────────
      // The captions feature regenerates its own ASS file later anyway, but
      // historically this feature wrote one too so a job missing the captions
      // feature still got captions. We keep that behavior. The segmented
      // render path does NOT call this feature — it generates its own ASS
      // post-concat with full archetype awareness — so this block is fine.
      if (batchOptions.captionsEnabled && batchOptions.captionStyle && job.wordTimestamps) {
        try {
          const arCfg = ASPECT_RATIO_CONFIGS[batchOptions.outputAspectRatio ?? '9:16']
          const marginVOverride = batchOptions.templateLayout?.subtitles
            ? Math.round((1 - batchOptions.templateLayout.subtitles.y / 100) * arCfg.height)
            : undefined

          const newAssPath = await generateCaptions(
            job.wordTimestamps,
            batchOptions.captionStyle,
            undefined,
            arCfg.width,
            arCfg.height,
            marginVOverride
          )
          console.log(`[FillerRemoval] Clip ${job.clipId}: captions re-synced → ${newAssPath}`)
          job.assFilePath = newAssPath
          result.tempFiles.push(newAssPath)
        } catch (captionErr) {
          console.warn(`[FillerRemoval] Clip ${job.clipId}: caption re-sync failed:`, captionErr)
        }
      }

      return { tempFiles: result.tempFiles, modified: true }
    }

    // No videoFilter() — filler removal is a pre-render pass, not a filter chain modification.
    // No overlayPass() — no visual overlay.
    // No postProcess() — all work is done in prepare().
  }
}
