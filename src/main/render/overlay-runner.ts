// ---------------------------------------------------------------------------
// Overlay runner — generic multi-pass FFmpeg filter executor
// ---------------------------------------------------------------------------
//
// Each overlay (captions, hook title, progress bar, etc.) is applied as a
// separate FFmpeg re-encode pass. This avoids Windows failures with massive
// combined filter strings and keeps each pass independently debuggable.
// ---------------------------------------------------------------------------

import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync, renameSync } from 'fs'
import type { FfmpegCommand, QualityParams } from '../ffmpeg'
import { ffmpeg, getEncoder, getSoftwareEncoder, isGpuSessionError, isGpuEncoderDisabled, disableGpuEncoderForSession } from '../ffmpeg'
import { toFFmpegPath } from './helpers'
import type { OverlayPassResult } from './features/feature'

// ---------------------------------------------------------------------------
// Active command tracking (for cancellation)
// ---------------------------------------------------------------------------

/**
 * Set of all currently running FFmpeg commands across the render pipeline.
 * Used by cancelRender() to kill active processes.
 */
export const activeCommands = new Set<FfmpegCommand>()

// ---------------------------------------------------------------------------
// Single filter pass
// ---------------------------------------------------------------------------

// Overlay passes re-encode the whole clip. We want to (a) minimise quality
// loss vs. the base encode (CRF 18 ≈ visually transparent) and (b) avoid
// the `ultrafast` preset — it disables CABAC, deblock, B-frames and motion
// search on libx264, causing visible blocking that compounds across passes.
// `medium` is the smallest preset that keeps all the coding tools enabled.
const OVERLAY_QUALITY: QualityParams = { crf: 18, preset: 'medium' }

/**
 * Resolve the effective quality for an overlay pass. We always want the
 * overlay pass to be at least as good as the base encode (otherwise the
 * overlay becomes the weak link in the generation chain), so we clamp to
 * the better of the supplied quality and the default OVERLAY_QUALITY —
 * lower CRF = higher quality.
 */
function resolveOverlayQuality(override?: QualityParams): QualityParams {
  if (!override) return OVERLAY_QUALITY
  const overrideCrf = override.crf ?? OVERLAY_QUALITY.crf!
  const crf = Math.min(overrideCrf, OVERLAY_QUALITY.crf!)
  return { crf, preset: override.preset ?? OVERLAY_QUALITY.preset }
}

/**
 * Run a single FFmpeg filter pass: read inputPath, apply videoFilter, write
 * to outputPath.
 *
 * Encodes with CRF 18 / medium preset so the overlay pass adds essentially
 * no visible quality loss compared to the base encode. Audio is stream-copied
 * (no re-encode). format=yuv420p is appended to keep the output in
 * universally-playable subsampling.
 */
export function applyFilterPass(
  inputPath: string,
  outputPath: string,
  videoFilter: string,
  qualityOverride?: QualityParams
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const quality = resolveOverlayQuality(qualityOverride)
    const gpuDisabled = isGpuEncoderDisabled()
    const { encoder, presetFlag } = gpuDisabled ? getSoftwareEncoder(quality) : getEncoder(quality)
    let fallbackAttempted = false

    // Ensure the final output is yuv420p — subtitles/drawtext can leave the
    // chain in a different pix_fmt depending on the input.
    const filterWithPixFmt = /,format=yuv420p$/.test(videoFilter)
      ? videoFilter
      : `${videoFilter},format=yuv420p`

    function runPass(enc: string, flags: string[], useHwAccel = true): void {
      const cmd = ffmpeg(toFFmpegPath(inputPath))
      let stderrOutput = ''

      // Enable hardware-accelerated decoding (NVDEC, DXVA2, VAAPI, etc.)
      // Skipped on software fallback — broken GPU drivers can cause -hwaccel auto to crash
      if (useHwAccel) {
        cmd.inputOptions(['-hwaccel', 'auto'])
      }

      cmd
        .videoFilters(filterWithPixFmt)
        .outputOptions([
          '-c:v',
          enc,
          ...flags,
          '-c:a',
          'copy',
          '-movflags',
          '+faststart',
          '-y'
        ])
        .on('start', (cmdLine: string) => {
          console.log(`[Overlay] FFmpeg command: ${cmdLine}`)
        })
        .on('stderr', (line: string) => { stderrOutput += line + '\n' })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          console.error(`[Overlay] FFmpeg stderr:\n${stderrOutput}`)
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            const sw = getSoftwareEncoder(quality)
            runPass(sw.encoder, sw.presetFlag, false)
          } else {
            const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
            const enhanced = new Error(`${err.message}\n[stderr tail] ${stderrTail}`)
            reject(enhanced)
          }
        })
        .save(toFFmpegPath(outputPath))

      activeCommands.add(cmd)
      cmd.on('end', () => activeCommands.delete(cmd))
      cmd.on('error', () => activeCommands.delete(cmd))
    }

    runPass(encoder, presetFlag)
  })
}

/**
 * Run a single FFmpeg filter_complex pass: read inputPath, apply a
 * filter_complex that maps [0:v] → [outv], write to outputPath.
 *
 * Used for overlays that need multiple filter inputs (e.g. animated
 * progress bar using color source + crop + overlay). Audio is
 * stream-copied from input 0.
 */
export function applyFilterComplexPass(
  inputPath: string,
  outputPath: string,
  filterComplex: string,
  qualityOverride?: QualityParams
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const quality = resolveOverlayQuality(qualityOverride)
    const gpuDisabled2 = isGpuEncoderDisabled()
    const { encoder, presetFlag } = gpuDisabled2 ? getSoftwareEncoder(quality) : getEncoder(quality)
    let fallbackAttempted = false

    function runPass(enc: string, flags: string[], useHwAccel = true): void {
      const cmd = ffmpeg(toFFmpegPath(inputPath))
      let stderrOutput = ''

      // Enable hardware-accelerated decoding (NVDEC, DXVA2, VAAPI, etc.)
      // Skipped on software fallback — broken GPU drivers can cause -hwaccel auto to crash
      if (useHwAccel) {
        cmd.inputOptions(['-hwaccel', 'auto'])
      }

      cmd
        .outputOptions([
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-map', '0:a',
          '-c:v', enc,
          ...flags,
          '-c:a', 'copy',
          '-movflags', '+faststart',
          '-y'
        ])
        .on('start', (cmdLine: string) => {
          console.log(`[Overlay] FFmpeg filter_complex command: ${cmdLine}`)
        })
        .on('stderr', (line: string) => { stderrOutput += line + '\n' })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          console.error(`[Overlay] FFmpeg filter_complex stderr:\n${stderrOutput}`)
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            const sw = getSoftwareEncoder(quality)
            runPass(sw.encoder, sw.presetFlag, false)
          } else {
            const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
            const enhanced = new Error(`${err.message}\n[stderr tail] ${stderrTail}`)
            reject(enhanced)
          }
        })
        .save(toFFmpegPath(outputPath))

      activeCommands.add(cmd)
      cmd.on('end', () => activeCommands.delete(cmd))
      cmd.on('error', () => activeCommands.delete(cmd))
    }

    runPass(encoder, presetFlag)
  })
}

// ---------------------------------------------------------------------------
// Multi-pass overlay runner
// ---------------------------------------------------------------------------

export interface OverlayRunnerOptions {
  /** Called after each pass with cumulative progress (0–100 scale of the overlay phase) */
  onProgress?: (percent: number) => void
  /** Return true to abort between passes */
  cancelCheck?: () => boolean
}

/**
 * Collapse a run of steps into batches. Adjacent non-filterComplex passes are
 * merged into a single FFmpeg invocation with a comma-joined -vf chain, which
 * eliminates the intermediate re-encode + disk I/O between them. Passes that
 * need filter_complex (e.g. animated progress bar, B-roll overlay) stay as
 * their own batch since they can't be composed by simple filter concatenation.
 */
function batchSteps(steps: OverlayPassResult[]): Array<{ names: string[]; filter: string; filterComplex: boolean }> {
  const batches: Array<{ names: string[]; filter: string; filterComplex: boolean }> = []
  for (const step of steps) {
    const last = batches[batches.length - 1]
    const isComplex = step.filterComplex === true
    if (!isComplex && last && !last.filterComplex) {
      last.names.push(step.name)
      last.filter = `${last.filter},${step.filter}`
    } else {
      batches.push({ names: [step.name], filter: step.filter, filterComplex: isComplex })
    }
  }
  return batches
}

/**
 * Apply a sequence of overlay filter passes to a rendered clip.
 *
 * Consecutive simple (non-filterComplex) steps are merged into a single
 * FFmpeg invocation to avoid redundant decode/encode cycles between them.
 * filter_complex steps always run as their own pass.
 *
 * @param inputPath   Path to the base-rendered clip
 * @param steps       Array of { name, filter } overlay passes to apply in order
 * @param finalPath   The desired final output path (the last pass writes here)
 * @param options     Progress callback and cancellation check
 * @returns           Path to the final rendered file (always finalPath on success)
 */
export async function runOverlayPasses(
  inputPath: string,
  steps: OverlayPassResult[],
  finalPath: string,
  options: OverlayRunnerOptions = {}
): Promise<string> {
  const { onProgress, cancelCheck } = options

  if (steps.length === 0) {
    return inputPath
  }

  const batches = batchSteps(steps)
  let currentPath = inputPath
  const tempsToClean: string[] = []

  try {
    for (let b = 0; b < batches.length; b++) {
      if (cancelCheck?.()) return currentPath

      const batch = batches[b]
      const batchName = batch.names.join('+')
      const tempOut = join(tmpdir(), `batchcontent-${batch.names[0]}-${Date.now()}-${b}.mp4`)
      console.log(`[Overlay] Applying pass ${batchName} (${batch.names.length} step${batch.names.length > 1 ? 's' : ''} merged)`)

      if (batch.filterComplex) {
        await applyFilterComplexPass(currentPath, tempOut, batch.filter)
      } else {
        await applyFilterPass(currentPath, tempOut, batch.filter)
      }

      // Queue previous intermediate for cleanup (but not the original input)
      if (currentPath !== inputPath) {
        tempsToClean.push(currentPath)
      }
      currentPath = tempOut

      if (onProgress) {
        onProgress(Math.round(((b + 1) / batches.length) * 100))
      }
    }

    // Move the final result to the desired output path
    if (currentPath !== finalPath) {
      // If finalPath === inputPath, remove it first so rename succeeds
      if (finalPath === inputPath) {
        try {
          unlinkSync(finalPath)
        } catch {
          /* ignore */
        }
      }
      renameSync(currentPath, finalPath)
    }

    return finalPath
  } finally {
    // Clean up intermediate temp files
    for (const tmp of tempsToClean) {
      try {
        unlinkSync(tmp)
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
}
