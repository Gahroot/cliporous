// ---------------------------------------------------------------------------
// Base render — core FFmpeg encoding (crop → scale → encode)
// ---------------------------------------------------------------------------
//
// Three paths depending on active features:
//   1. Sound design path: filter_complex with video + audio nodes + optional logo
//   2. Logo-only path: filter_complex with 2 inputs (video + logo image)
//   3. Simple path: just -vf with crop+scale+zoom
//
// After the base encode, optional bumper concat and overlay passes are applied.
// ---------------------------------------------------------------------------

import { existsSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { FfmpegCommand } from '../ffmpeg'
import {
  ffmpeg,
  getEncoder,
  getSoftwareEncoder,
  isGpuSessionError,
  isGpuEncoderDisabled,
  disableGpuEncoderForSession,
  stripCudaScaleFilter,
  hasScaleCuda,
  type QualityParams
} from '../ffmpeg'
import { computeCenterCropForRatio, OUTPUT_WIDTH, OUTPUT_HEIGHT, OUTPUT_FPS } from '../aspect-ratios'
import type { OutputAspectRatio } from '../aspect-ratios'
import type { RenderClipJob, BrandKitRenderOptions } from './types'
import { toFFmpegPath } from './helpers'
import { buildLogoOnlyFilterComplex } from './features/brand-kit.feature'
import { buildSoundFilterComplex } from './features/sound-design.feature'
import { concatWithBumpers } from './bumpers'
import { activeCommands, runOverlayPasses } from './overlay-runner'
import type { OverlayPassResult } from './features/feature'
import { buildFaceTrackCropFilter } from './face-track-filter'
import { buildSceneCropFilter } from './scene-crop-filter'

// Re-export activeCommands so the pipeline orchestrator can access it
export { activeCommands }

// ---------------------------------------------------------------------------
// Video filter builder
// ---------------------------------------------------------------------------

/**
 * Build the crop → scale video filter chain.
 *
 * Precedence (first match wins):
 *   1. `faceTimeline` (≥2 entries) → animated smooth pan (dormant path).
 *   2. `cropTimeline` (>1 scene)   → expression-based step crop that switches
 *                                    rectangles at scene boundaries.
 *   3. `cropRegion`                → static crop rect.
 *   4. center crop for the target aspect ratio.
 *
 * Note: Auto-zoom (Ken Burns) is handled by the AutoZoomFeature's videoFilter()
 * method. This function only produces the base crop + scale chain.
 */
export function buildVideoFilter(
  job: RenderClipJob,
  sourceWidth: number,
  sourceHeight: number,
  targetResolution?: { width: number; height: number },
  outputAspectRatio?: OutputAspectRatio,
  sourceFps?: number
): string {
  // Output is hard-locked to 720×1280 (9:16). Inputs are ignored.
  void targetResolution
  void outputAspectRatio
  const outW = OUTPUT_WIDTH
  const outH = OUTPUT_HEIGHT

  // Center-crop fallback always targets the locked 9:16 ratio.
  const aspectRatioForCrop: OutputAspectRatio = '9:16'

  // Face-tracking animated crop: takes precedence over static cropRegion when ≥2 entries.
  if (job.faceTimeline && job.faceTimeline.length >= 2) {
    const animated = buildFaceTrackCropFilter(job.faceTimeline, sourceWidth, sourceHeight, outW, outH)
    if (animated !== null) return animated
  }

  const clipDuration = Math.max(0, job.endTime - job.startTime)
  let cropFilter: string | null = null

  // Scene-timeline (multi-scene) crop — takes precedence over static cropRegion.
  if (job.cropTimeline && job.cropTimeline.length > 1) {
    cropFilter = buildSceneCropFilter(
      job.cropTimeline,
      job.cropRegion,
      job.startTime,
      0,
      clipDuration,
      sourceWidth,
      sourceHeight,
      sourceFps ?? 30
    )
  }

  if (!cropFilter && job.cropRegion) {
    const { x, y, width, height } = job.cropRegion
    const cw = Math.min(width, sourceWidth)
    const ch = Math.min(height, sourceHeight)
    const cx = Math.max(0, Math.min(x, sourceWidth - cw))
    const cy = Math.max(0, Math.min(y, sourceHeight - ch))
    cropFilter = `crop=${cw}:${ch}:${cx}:${cy}`
  }

  if (!cropFilter) {
    const { x, y, width, height } = computeCenterCropForRatio(sourceWidth, sourceHeight, aspectRatioForCrop)
    cropFilter = `crop=${width}:${height}:${x}:${y}`
  }

  // GPU scale is only used for the base crop+scale. Feature video filters
  // (auto-zoom, etc.) that append to this string will work because
  // hwdownload+format=nv12 at the end returns frames to CPU format that
  // subsequent filters can process.
  //
  // Since we use `-hwaccel auto` (not `-hwaccel_output_format cuda`), decoded
  // frames arrive in CPU memory. The pipeline is therefore:
  //   crop (CPU) → hwupload_cuda → scale_cuda (GPU) → hwdownload → format=nv12
  const useGpuScale = hasScaleCuda()

  // Always force the locked output framerate after scaling so downstream
  // concat / overlay passes see consistent timing.
  const fpsLock = `fps=${OUTPUT_FPS}`

  if (useGpuScale) {
    // Hybrid pipeline: CPU crop → upload to GPU → GPU scale → download back
    const scaleFilter = `hwupload_cuda,scale_cuda=${outW}:${outH}:interp_algo=lanczos,hwdownload,format=nv12`
    return `${cropFilter},${scaleFilter},${fpsLock}`
  } else {
    const scaleFilter = `scale=${outW}:${outH}`
    return `${cropFilter},${scaleFilter},${fpsLock}`
  }
}

// ---------------------------------------------------------------------------
// Single-clip render
// ---------------------------------------------------------------------------

/**
 * Render a single clip through the base encode pipeline, then optionally:
 *   - Concatenate bumpers (intro/outro)
 *   - Apply overlay passes (captions, hook title, rehook, progress bar)
 *
 * Returns the path to the final rendered file (always `outputPath`).
 */
export function renderClip(
  job: RenderClipJob,
  outputPath: string,
  videoFilter: string,
  onProgress: (percent: number) => void,
  onCommand?: (command: string) => void,
  qualityParams?: QualityParams,
  outputFormat?: 'mp4' | 'webm',
  _hookFontPath?: string | null,
  _captionFontsDir?: string | null,
  overlaySteps?: OverlayPassResult[]
): Promise<string> {
  console.log(`[Render] clipId=${job.clipId}`)
  console.log(`[Render] outputPath=${outputPath}`)
  console.log(`[Render] sourceVideoPath=${job.sourceVideoPath}`)
  console.log(`[Render] toFFmpegPath(outputPath)=${toFFmpegPath(outputPath)}`)

  const bk = job.brandKit
  const hasLogo = !!(bk?.logoPath && existsSync(bk.logoPath))
  const hasSoundDesign =
    Array.isArray(job.soundPlacements) && job.soundPlacements.length > 0
  const hasBumpers = !!(
    (bk?.introBumperPath && existsSync(bk.introBumperPath)) ||
    (bk?.outroBumperPath && existsSync(bk.outroBumperPath))
  )
  const useWebm = outputFormat === 'webm'

  // If bumpers are needed, render main content to a temp file first, then concat
  const mainOutputPath = hasBumpers
    ? join(tmpdir(), `batchcontent-main-${Date.now()}.mp4`)
    : outputPath

  // For WebM, use libvpx-vp9 with matching CRF (vp9 uses -crf + -b:v 0 for constrained quality)
  // GPU encoders don't support WebM; always use software for WebM
  function getVideoCodecFlags(): { encoder: string; flags: string[] } {
    if (useWebm) {
      const crf = qualityParams?.crf ?? 23
      return {
        encoder: 'libvpx-vp9',
        flags: ['-crf', String(crf), '-b:v', '0', '-cpu-used', '4']
      }
    }
    // If GPU encoder was disabled by a prior crash this session, go straight to software
    if (isGpuEncoderDisabled()) {
      return getSoftwareCodecFlags()
    }
    const { encoder, presetFlag } = getEncoder(qualityParams)
    return { encoder, flags: presetFlag }
  }

  function getSoftwareCodecFlags(): { encoder: string; flags: string[] } {
    if (useWebm) {
      const crf = qualityParams?.crf ?? 23
      return {
        encoder: 'libvpx-vp9',
        flags: ['-crf', String(crf), '-b:v', '0', '-cpu-used', '4']
      }
    }
    const sw = getSoftwareEncoder(qualityParams)
    return { encoder: sw.encoder, flags: sw.presetFlag }
  }

  const audioOptions = useWebm ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '192k']
  const containerFlags = useWebm ? ['-y'] : ['-y', '-movflags', '+faststart']

  const hasOverlays = overlaySteps && overlaySteps.length > 0

  const renderMain = (): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const { encoder, flags: presetFlag } = getVideoCodecFlags()
      let activeCommand: FfmpegCommand | null = null

      if (hasSoundDesign) {
        // ── Sound-design path ────────────────────────────────────────────────
        const clipDuration = job.endTime - job.startTime
        const placements = job.soundPlacements!

        const logoOverlay: { bk: BrandKitRenderOptions; inputIndex: number } | undefined =
          hasLogo ? { bk: bk!, inputIndex: placements.length + 1 } : undefined

        let soundFallbackAttempted = false

        function runWithSoundEncoder(enc: string, flags: string[], useHwAccel = true): FfmpegCommand {
          const cmd = ffmpeg(toFFmpegPath(job.sourceVideoPath))
          let stderrOutput = ''

          // Enable hardware-accelerated decoding (NVDEC, DXVA2, VAAPI, etc.)
          // Skipped on software fallback — broken GPU drivers can cause -hwaccel auto to crash
          if (useHwAccel) {
            cmd.inputOptions(['-hwaccel', 'auto'])
          }

          cmd
            .seekInput(job.startTime)
            .duration(clipDuration)

          // Sound placement inputs (indices 1..N)
          for (const p of placements) {
            cmd.input(toFFmpegPath(p.filePath))
          }

          // Logo input (index N+1), looped to cover full clip duration
          if (hasLogo) {
            cmd.input(toFFmpegPath(bk!.logoPath!)).inputOptions(['-loop', '1'])
          }

          const filterComplex = buildSoundFilterComplex(
            videoFilter,
            placements,
            clipDuration,
            logoOverlay
          )
          console.log(`[Render] Sound filter_complex for clip ${job.clipId}: ${filterComplex}`)

          // When sound design IS present, [outa] is always produced by amix.
          const audioMap = hasSoundDesign ? '[outa]' : '0:a'

          cmd
            .outputOptions([
              '-filter_complex', filterComplex,
              '-filter_threads', '0',
              '-filter_complex_threads', '0',
              '-map', '[outv]',
              '-map', audioMap,
              '-c:v', enc,
              ...flags,
              ...audioOptions,
              ...containerFlags
            ])
            .on('start', (cmdLine: string) => { onCommand?.(cmdLine) })
            .on('stderr', (line: string) => { stderrOutput += line + '\n' })
            .on('progress', (progress) => {
              onProgress(Math.min(hasBumpers ? 85 : (hasOverlays ? 65 : 99), progress.percent ?? 0))
            })
            .on('end', () => {
              onProgress(hasBumpers ? 85 : (hasOverlays ? 65 : 100))
              activeCommands.delete(cmd)
              activeCommand = null
              resolve(mainOutputPath)
            })
            .on('error', (err: Error) => {
              activeCommands.delete(cmd)
              activeCommand = null
              console.error(`[Render] FFmpeg stderr for clip ${job.clipId}:\n${stderrOutput}`)
              if (!soundFallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
                soundFallbackAttempted = true
                disableGpuEncoderForSession()
                console.warn(`[Render] GPU error in sound-design path, falling back to software encoder + CPU scale: ${err.message}`)
                videoFilter = stripCudaScaleFilter(videoFilter)
                const { encoder: swEnc, flags: swFlags } = getSoftwareCodecFlags()
                const swCmd = runWithSoundEncoder(swEnc, swFlags, false)
                activeCommand = swCmd
                activeCommands.add(swCmd)
              } else {
                const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
                const enhanced = new Error(`${err.message}\n[stderr tail] ${stderrTail}`)
                reject(enhanced)
              }
            })
            .save(toFFmpegPath(mainOutputPath))

          return cmd
        }

        const cmd = runWithSoundEncoder(encoder, presetFlag)
        activeCommand = cmd
        activeCommands.add(cmd)

      } else if (hasLogo) {
        // ── Logo-only path (no sound design) ────────────────────────────────
        let logoFallbackAttempted = false
        function runWithLogoEncoder(enc: string, flags: string[], useHwAccel = true): FfmpegCommand {
          const filterComplex = buildLogoOnlyFilterComplex(videoFilter, bk!)
          const cmd = ffmpeg(toFFmpegPath(job.sourceVideoPath))
          let stderrOutput = ''

          // Enable hardware-accelerated decoding (NVDEC, DXVA2, VAAPI, etc.)
          // Skipped on software fallback — broken GPU drivers can cause -hwaccel auto to crash
          if (useHwAccel) {
            cmd.inputOptions(['-hwaccel', 'auto'])
          }

          cmd
            .seekInput(job.startTime)
            .duration(job.endTime - job.startTime)
            // Logo image input — loop it for the clip duration
            .input(toFFmpegPath(bk!.logoPath!))
            .inputOptions(['-loop', '1'])

          cmd
            .outputOptions([
              '-filter_complex', filterComplex,
              '-filter_threads', '0',
              '-filter_complex_threads', '0',
              '-map', '[outv]',
              '-map', '0:a',
              '-c:v', enc,
              ...flags,
              ...audioOptions,
              ...containerFlags
            ])
            .on('start', (cmdLine: string) => { onCommand?.(cmdLine) })
            .on('stderr', (line: string) => { stderrOutput += line + '\n' })
            .on('progress', (progress) => {
              onProgress(Math.min(hasBumpers ? 85 : (hasOverlays ? 65 : 99), progress.percent ?? 0))
            })
            .on('end', () => {
              onProgress(hasBumpers ? 85 : (hasOverlays ? 65 : 100))
              activeCommands.delete(cmd)
              activeCommand = null
              resolve(mainOutputPath)
            })
            .on('error', (err: Error) => {
              activeCommands.delete(cmd)
              activeCommand = null
              console.error(`[Render] FFmpeg stderr for clip ${job.clipId}:\n${stderrOutput}`)
              if (!logoFallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
                logoFallbackAttempted = true
                disableGpuEncoderForSession()
                console.warn('[Render] GPU error in logo-only path, falling back to software encoder + CPU scale')
                videoFilter = stripCudaScaleFilter(videoFilter)
                const { encoder: swEnc, flags: swFlags } = getSoftwareCodecFlags()
                const swCmd = runWithLogoEncoder(swEnc, swFlags, false)
                activeCommand = swCmd
                activeCommands.add(swCmd)
              } else {
                const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
                const enhanced = new Error(`${err.message}\n[stderr tail] ${stderrTail}`)
                reject(enhanced)
              }
            })
            .save(toFFmpegPath(mainOutputPath))

          return cmd
        }

        const cmd = runWithLogoEncoder(encoder, presetFlag)
        activeCommand = cmd
        activeCommands.add(cmd)

      } else {
        // ── Simple path: no sound mixing, no logo (existing behavior) ────────
        let simpleFallbackAttempted = false
        function runWithEncoder(enc: string, flags: string[], useHwAccel = true): FfmpegCommand {
          const cmd = ffmpeg(toFFmpegPath(job.sourceVideoPath))
          let stderrOutput = ''

          // Enable hardware-accelerated decoding (NVDEC, DXVA2, VAAPI, etc.)
          // Skipped on software fallback — broken GPU drivers can cause -hwaccel auto to crash
          if (useHwAccel) {
            cmd.inputOptions(['-hwaccel', 'auto'])
          }

          cmd
            .seekInput(job.startTime)
            .duration(job.endTime - job.startTime)
            .videoFilters(videoFilter)
            .outputOptions([
              '-c:v', enc,
              ...flags,
              ...audioOptions,
              ...containerFlags
            ])
            .on('start', (cmdLine: string) => { onCommand?.(cmdLine) })
            .on('stderr', (line: string) => { stderrOutput += line + '\n' })
            .on('progress', (progress) => {
              onProgress(Math.min(hasBumpers ? 85 : (hasOverlays ? 65 : 99), progress.percent ?? 0))
            })
            .on('end', () => {
              onProgress(hasBumpers ? 85 : (hasOverlays ? 65 : 100))
              activeCommands.delete(cmd)
              activeCommand = null
              resolve(mainOutputPath)
            })
            .on('error', (err: Error) => {
              activeCommands.delete(cmd)
              activeCommand = null
              console.error(`[Render] FFmpeg stderr for clip ${job.clipId}:\n${stderrOutput}`)
              if (!simpleFallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
                simpleFallbackAttempted = true
                disableGpuEncoderForSession()
                console.warn('[Render] GPU error in simple path, falling back to software encoder + CPU scale')
                videoFilter = stripCudaScaleFilter(videoFilter)
                const { encoder: swEnc, flags: swFlags } = getSoftwareCodecFlags()
                const swCmd = runWithEncoder(swEnc, swFlags, false)
                activeCommand = swCmd
                activeCommands.add(swCmd)
              } else {
                const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
                const enhanced = new Error(`${err.message}\n[stderr tail] ${stderrTail}`)
                reject(enhanced)
              }
            })
            .save(toFFmpegPath(mainOutputPath))

          return cmd
        }

        const cmd = runWithEncoder(encoder, presetFlag)
        activeCommand = cmd
        activeCommands.add(cmd)
      }
    })
  }

  // ── Phase 1: Base render (crop + scale + zoom + logo + sound design) ──────
  const baseResult = hasBumpers
    ? renderMain().then(async (mainPath) => {
        try {
          onProgress(68)
          await concatWithBumpers(
            mainPath,
            outputPath,
            bk?.introBumperPath ?? null,
            bk?.outroBumperPath ?? null
          )
          onProgress(70)
          return outputPath
        } finally {
          try { unlinkSync(mainPath) } catch { /* ignore cleanup errors */ }
        }
      })
    : renderMain()

  return baseResult.then(async (resultPath) => {
    // ── Phase 2: Multi-pass overlay post-processing ─────────────────────────
    if (!overlaySteps || overlaySteps.length === 0) {
      onProgress(100)
      return resultPath
    }

    const overlayProgressBase = 70
    const overlayProgressRange = 30

    const finalPath = await runOverlayPasses(
      resultPath,
      overlaySteps,
      resultPath,
      {
        onProgress: (percent) => {
          onProgress(Math.round(overlayProgressBase + (overlayProgressRange * percent / 100)))
        }
      }
    )

    onProgress(100)
    return finalPath
  })
}
