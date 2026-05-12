// ---------------------------------------------------------------------------
// Stitched clip assembly
// ---------------------------------------------------------------------------
//
// Stitched clips are multiple source-video time ranges concatenated into one
// output. This module is responsible ONLY for the stitched-specific work:
// per-segment crop/scale via the edit-style layout system, then concatenation
// into a single MP4. All editing (captions, hook title, rehook, color grade,
// accent color, sound design, etc.) runs on the concatenated output via the
// regular render feature pipeline — stitched clips go through the SAME edit
// pipeline as regular clips.
// ---------------------------------------------------------------------------

import { join } from 'path'
import { unlinkSync, writeFileSync, renameSync } from 'fs'
import { tmpdir } from 'os'
import {
  ffmpeg,
  getEncoder,
  getSoftwareEncoder,
  isGpuSessionError,
  isGpuEncoderDisabled,
  disableGpuEncoderForSession,
  getVideoMetadata,
  type QualityParams
} from '../ffmpeg'
import type { RenderStitchedClipJob } from './types'
import { toFFmpegPath } from './helpers'
import { buildSceneCropFilter } from './scene-crop-filter'
import { OUTPUT_WIDTH, OUTPUT_HEIGHT, OUTPUT_FPS } from '../aspect-ratios'

/**
 * Assemble a stitched video: extract each source segment at the target
 * resolution (with the per-segment layout variant applied), then concatenate
 * into a single MP4. The result has no text overlays, no color grade, no
 * audio effects — that's the job of the feature pipeline that runs on this
 * output afterwards.
 *
 * @param job          Stitched job (segments with resolved style variants)
 * @param outputPath   Where to write the concatenated MP4
 * @param onProgress   0..100 progress callback (assembly only; feature pipeline
 *                     progresses separately)
 * @returns outputPath on success
 */
export async function assembleStitchedVideo(
  job: RenderStitchedClipJob,
  outputPath: string,
  onProgress: (percent: number) => void,
  qualityParams?: QualityParams
): Promise<string> {
  const tempDir = tmpdir()
  const tempFiles: string[] = []
  // Honour the user's quality preset on per-segment encodes. The downstream
  // feature pipeline encodes the final clip again with the same qualityParams,
  // so matching the stitch encode here keeps both halves of the chain in sync.
  const { encoder, presetFlag } = isGpuEncoderDisabled()
    ? getSoftwareEncoder(qualityParams)
    : getEncoder(qualityParams)

  let meta: { width: number; height: number; codec: string; fps: number; audioCodec: string; duration: number }
  try {
    meta = await getVideoMetadata(job.sourceVideoPath)
  } catch (err) {
    throw new Error(
      `Failed to read source video metadata for stitched render: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // 90% for per-segment encode, 10% for concat
  const segmentWeight = 90
  const concatBase = segmentWeight

  const segmentOutputFiles: string[] = []

  try {
    // ── Step 1: Encode each segment independently ───────────────────────────
    for (let i = 0; i < job.segments.length; i++) {
      const seg = job.segments[i]
      const tempPath = join(tempDir, `batchcontent-stitch-${Date.now()}-${i}.mp4`)
      tempFiles.push(tempPath)
      segmentOutputFiles.push(tempPath)

      const segProgress = (percent: number): void => {
        const weight = segmentWeight / job.segments.length
        const base = weight * i
        onProgress(Math.round(base + (percent * weight) / 100))
      }

      const segDuration = seg.endTime - seg.startTime
      const effectiveCropRect = seg.cropRect ?? job.cropRegion

      // Stitched render does pure assembly — crop/scale only. Per-archetype
      // visual treatments live in the segmented render path; the stitched
      // path just concats raw source ranges to be edited by the feature
      // pipeline downstream.
      let cropFilter: string
      const sceneFilter = !seg.cropRect && job.cropTimeline && job.cropTimeline.length > 1
        ? buildSceneCropFilter(
            job.cropTimeline,
            effectiveCropRect,
            seg.startTime,
            0,
            segDuration,
            meta.width,
            meta.height,
            meta.fps
          )
        : null

      if (sceneFilter) {
        cropFilter = sceneFilter
      } else if (effectiveCropRect) {
        const { x, y, width, height } = effectiveCropRect
        const cw = Math.min(width, meta.width)
        const ch = Math.min(height, meta.height)
        const cx = Math.max(0, Math.min(x, meta.width - cw))
        const cy = Math.max(0, Math.min(y, meta.height - ch))
        cropFilter = `crop=${cw}:${ch}:${cx}:${cy}`
      } else {
        const targetAspect = 9 / 16
        const sourceAspect = meta.width / meta.height
        if (sourceAspect > targetAspect) {
          const cropWidth = Math.round(meta.height * targetAspect)
          const cropX = Math.round((meta.width - cropWidth) / 2)
          cropFilter = `crop=${cropWidth}:${meta.height}:${cropX}:0`
        } else {
          const cropHeight = Math.round(meta.width / targetAspect)
          const cropY = Math.round((meta.height - cropHeight) / 2)
          cropFilter = `crop=${meta.width}:${cropHeight}:0:${cropY}`
        }
      }

      // Lanczos + accurate rounding + full-chroma interpolation matches the
      // base-render path; default bilinear visibly softens detail on faces.
      const videoFilter = `${cropFilter},scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:flags=lanczos+accurate_rnd+full_chroma_int,fps=${OUTPUT_FPS}`

      await new Promise<void>((resolve, reject) => {
        let fallbackAttempted = false

        function runSegmentEncode(enc: string, flags: string[], useHwAccel = true): void {
          const cmd = ffmpeg(toFFmpegPath(job.sourceVideoPath))
          let stderrOutput = ''

          if (useHwAccel) {
            cmd.inputOptions(['-hwaccel', 'auto'])
          }

          cmd.seekInput(seg.startTime).duration(segDuration)
          cmd.videoFilters(videoFilter)

          cmd
            .outputOptions([
              '-y',
              '-c:v',
              enc,
              ...flags,
              '-c:a',
              'aac',
              '-b:a',
              '192k',
              '-movflags',
              '+faststart'
            ])
            .on('progress', (progress) => {
              segProgress(Math.min(99, progress.percent ?? 0))
            })
            .on('stderr', (line: string) => {
              stderrOutput += line + '\n'
            })
            .on('end', () => {
              segProgress(100)
              resolve()
            })
            .on('error', (err: Error) => {
              if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
                fallbackAttempted = true
                disableGpuEncoderForSession()
                console.warn(
                  `[StitchedRender] GPU error in segment encode, falling back to software encoder: ${err.message}`
                )
                const sw = getSoftwareEncoder(qualityParams)
                runSegmentEncode(sw.encoder, sw.presetFlag, false)
              } else {
                const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
                reject(new Error(`${err.message}\n[stderr tail] ${stderrTail}`))
              }
            })
            .save(toFFmpegPath(tempPath))
        }

        runSegmentEncode(encoder, presetFlag)
      })
    }

    onProgress(concatBase)

    // ── Step 2: Concatenate via concat demuxer ──────────────────────────────
    const listFile = join(tempDir, `batchcontent-stitch-list-${Date.now()}.txt`)
    const listContent = segmentOutputFiles
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n')
    writeFileSync(listFile, listContent, 'utf-8')

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy', '-movflags', '+faststart', '-y'])
        .on('progress', () => onProgress(concatBase + 3))
        .on('end', () => {
          try {
            unlinkSync(listFile)
          } catch {
            /* ignore */
          }
          onProgress(100)
          resolve()
        })
        .on('error', (err: Error) => {
          try {
            unlinkSync(listFile)
          } catch {
            /* ignore */
          }
          reject(err)
        })
        .save(toFFmpegPath(outputPath))
    })

    return outputPath
  } finally {
    for (const tf of tempFiles) {
      try {
        unlinkSync(tf)
      } catch {
        /* ignore */
      }
    }
  }
}
