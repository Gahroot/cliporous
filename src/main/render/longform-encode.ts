// ---------------------------------------------------------------------------
// Long-form (16:9) encode primitives — leaf module.
//
// Shared FFmpeg encode helpers for the Hormozi long-form pipeline. Kept free
// of any dependency on the feature/pipeline modules so both can import it.
//
//   - encodeSpeakerSegment        — crop/scale/zoom/grade a source range → mp4
//   - muxRemotionVisualWithAudio  — Remotion card/header visual + source audio
//   - compositePhraseOverlays     — composite N alpha ProRes phrase overlays
//
// Every produced segment is normalized to the same parameters (yuv420p, CFR
// at the target fps, AAC 48 kHz) so the concat demuxer can stream-copy them.
// ---------------------------------------------------------------------------

import {
  ffmpeg,
  getEncoder,
  getSoftwareEncoder,
  isGpuSessionError,
  isGpuEncoderDisabled,
  disableGpuEncoderForSession,
  type QualityParams
} from '../ffmpeg'
import { getIntermediateQuality } from './quality'
import { toFFmpegPath } from './helpers'
import type { SegmentLayoutResult } from '../layouts/segment-layouts'

// ---------------------------------------------------------------------------
// Shared output options
// ---------------------------------------------------------------------------

/** Normalized intermediate sink options — keep every segment concat-compatible. */
function intermediateSink(encoder: string, presetFlag: string[], fps: number): string[] {
  return [
    '-c:v', encoder,
    ...presetFlag,
    '-r', String(fps),
    '-fps_mode', 'cfr',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-movflags', '+faststart',
    '-y'
  ]
}

function pickEncoder(qp: QualityParams): { encoder: string; presetFlag: string[] } {
  const detected = getEncoder(qp)
  const useSwFallback = isGpuEncoderDisabled() && detected.encoder !== 'libx264'
  const sw = useSwFallback ? getSoftwareEncoder(qp) : null
  return sw
    ? { encoder: sw.encoder, presetFlag: sw.presetFlag }
    : { encoder: detected.encoder, presetFlag: detected.presetFlag }
}

// ---------------------------------------------------------------------------
// Speaker segment
// ---------------------------------------------------------------------------

export interface EncodeSpeakerSegmentOptions {
  sourceVideoPath: string
  outputPath: string
  /** Absolute source start time (seconds). */
  startTime: number
  /** Segment duration (seconds). */
  duration: number
  fps: number
  /** Layout filter_complex (ends in `[outv]`). */
  layout: SegmentLayoutResult
  /**
   * Extra filters chained after the layout's `[outv]`, in order (e.g. zoom,
   * color grade). Each entry is a bare filter string (no input/output labels).
   */
  extraFilters?: string[]
}

/**
 * Encode a single speaker segment: seek the source to `startTime`, apply the
 * landscape layout + optional zoom/grade, and write a normalized intermediate.
 */
export function encodeSpeakerSegment(opts: EncodeSpeakerSegmentOptions): Promise<void> {
  const { sourceVideoPath, outputPath, startTime, duration, fps, layout, extraFilters } = opts

  // Chain extras after the layout's [outv] → [fx0] → [fx1] … → [finalv].
  let currentLabel = 'outv'
  const extras: string[] = []
  ;(extraFilters ?? []).forEach((f, i) => {
    if (!f) return
    const next = `fx${i}`
    extras.push(`[${currentLabel}]${f}[${next}]`)
    currentLabel = next
  })

  let fullFilterComplex = layout.filterComplex
  if (extras.length > 0) {
    fullFilterComplex += ';' + extras.join(';')
    fullFilterComplex += `;[${currentLabel}]format=yuv420p[finalv]`
    currentLabel = 'finalv'
  }

  const qp = getIntermediateQuality()

  return new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false

    const run = (encoder: string, presetFlag: string[], useHwAccel: boolean): void => {
      const cmd = ffmpeg(toFFmpegPath(sourceVideoPath))
      let stderr = ''
      if (useHwAccel) cmd.inputOptions(['-hwaccel', 'auto'])
      cmd.seekInput(startTime)
      cmd.duration(duration)
      cmd
        .outputOptions([
          '-filter_complex', fullFilterComplex,
          '-map', `[${currentLabel}]`,
          '-map', '0:a',
          ...intermediateSink(encoder, presetFlag, fps)
        ])
        .on('stderr', (line: string) => { stderr += line + '\n' })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderr)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            const fb = getSoftwareEncoder(qp)
            run(fb.encoder, fb.presetFlag, false)
          } else {
            const tail = stderr.split('\n').slice(-10).join('\n')
            reject(new Error(`${err.message}\n[stderr tail] ${tail}`))
          }
        })
        .save(toFFmpegPath(outputPath))
    }

    const { encoder, presetFlag } = pickEncoder(qp)
    run(encoder, presetFlag, true)
  })
}

// ---------------------------------------------------------------------------
// Remotion visual + source audio (concept cards / section headers)
// ---------------------------------------------------------------------------

export interface MuxRemotionVisualOptions {
  /** Pre-rendered Remotion clip (opaque mp4, no audio needed). */
  visualPath: string
  /** Source video — supplies the narration audio under the card. */
  sourceVideoPath: string
  outputPath: string
  /** Absolute source start time (seconds) for the audio slice. */
  startTime: number
  /** Segment duration (seconds). */
  duration: number
  width: number
  height: number
  fps: number
}

/**
 * Combine a Remotion-rendered card/header visual with the source narration
 * audio for the same time range, normalized for concat.
 */
export function muxRemotionVisualWithAudio(opts: MuxRemotionVisualOptions): Promise<void> {
  const { visualPath, sourceVideoPath, outputPath, startTime, duration, width, height, fps } = opts
  const qp = getIntermediateQuality()

  // Normalize the visual: lock fps/sar/size and pad/trim to the exact duration.
  const filter =
    `[0:v]scale=${width}:${height}:flags=lanczos+accurate_rnd,setsar=1,fps=${fps},` +
    `format=yuv420p,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[v]`

  return new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false

    const run = (encoder: string, presetFlag: string[], useHwAccel: boolean): void => {
      const cmd = ffmpeg(toFFmpegPath(visualPath))
      let stderr = ''
      if (useHwAccel) cmd.inputOptions(['-hwaccel', 'auto'])
      // Input 1: source audio slice.
      cmd.input(toFFmpegPath(sourceVideoPath))
      cmd.inputOptions(['-ss', String(startTime), '-t', String(duration)])
      cmd
        .outputOptions([
          '-filter_complex', filter,
          '-map', '[v]',
          '-map', '1:a',
          '-shortest',
          ...intermediateSink(encoder, presetFlag, fps)
        ])
        .on('stderr', (line: string) => { stderr += line + '\n' })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderr)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            const fb = getSoftwareEncoder(qp)
            run(fb.encoder, fb.presetFlag, false)
          } else {
            const tail = stderr.split('\n').slice(-10).join('\n')
            reject(new Error(`${err.message}\n[stderr tail] ${tail}`))
          }
        })
        .save(toFFmpegPath(outputPath))
    }

    const { encoder, presetFlag } = pickEncoder(qp)
    run(encoder, presetFlag, true)
  })
}

// ---------------------------------------------------------------------------
// Phrase overlay compositing
// ---------------------------------------------------------------------------

export interface PhraseOverlayInput {
  /** Alpha ProRes (.mov) clip for this phrase. */
  overlayPath: string
  /** Absolute timeline start (seconds) on the concatenated video. */
  startTime: number
  /** Absolute timeline end (seconds). */
  endTime: number
}

export interface CompositePhraseOverlaysOptions {
  inputPath: string
  outputPath: string
  overlays: PhraseOverlayInput[]
  /** Final encode quality (the user's selected preset). */
  qualityParams: QualityParams
}

/**
 * Composite N alpha phrase overlays onto the base video in a single encode.
 * Each overlay input is time-shifted with `-itsoffset` so its first frame
 * lands at the phrase start, and gated with `enable='between(t,start,end)'`.
 */
export function compositePhraseOverlays(opts: CompositePhraseOverlaysOptions): Promise<void> {
  const { inputPath, outputPath, overlays, qualityParams } = opts

  return new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false

    const run = (encoder: string, presetFlag: string[], useHwAccel: boolean): void => {
      const cmd = ffmpeg(toFFmpegPath(inputPath))
      let stderr = ''
      if (useHwAccel) cmd.inputOptions(['-hwaccel', 'auto'])

      // Each overlay is an input shifted to its phrase start.
      for (const ov of overlays) {
        cmd.input(toFFmpegPath(ov.overlayPath))
        cmd.inputOptions(['-itsoffset', ov.startTime.toFixed(3)])
      }

      // Build the overlay chain: [0:v][1:v]overlay…[v1];[v1][2:v]overlay…[v2]…
      const steps: string[] = []
      let prev = '0:v'
      overlays.forEach((ov, i) => {
        const inIdx = i + 1
        const outLabel = `v${i + 1}`
        const enable = `between(t\\,${ov.startTime.toFixed(3)}\\,${ov.endTime.toFixed(3)})`
        steps.push(
          `[${prev}][${inIdx}:v]overlay=(W-w)/2:(H-h)/2:eof_action=pass:enable='${enable}'[${outLabel}]`
        )
        prev = outLabel
      })
      // Normalize pixel format on a separate node — appending a filter after a
      // labelled pad ([outv]) is invalid filtergraph syntax.
      steps.push(`[${prev}]format=yuv420p[outv]`)
      const filterComplex = steps.join(';')

      cmd
        .outputOptions([
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-map', '0:a',
          '-c:v', encoder,
          ...presetFlag,
          '-pix_fmt', 'yuv420p',
          '-c:a', 'copy',
          '-movflags', '+faststart',
          '-y'
        ])
        .on('stderr', (line: string) => { stderr += line + '\n' })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderr)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            const fb = getSoftwareEncoder(qualityParams)
            run(fb.encoder, fb.presetFlag, false)
          } else {
            const tail = stderr.split('\n').slice(-10).join('\n')
            reject(new Error(`${err.message}\n[stderr tail] ${tail}`))
          }
        })
        .save(toFFmpegPath(outputPath))
    }

    const gpuDisabled = isGpuEncoderDisabled()
    const { encoder, presetFlag } = gpuDisabled
      ? getSoftwareEncoder(qualityParams)
      : getEncoder(qualityParams)
    run(encoder, presetFlag, true)
  })
}
