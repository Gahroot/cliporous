// ---------------------------------------------------------------------------
// Segment-based render pipeline — renders each segment independently then
// concatenates with configurable transitions.
// ---------------------------------------------------------------------------
//
// Each segment is dispatched directly on its archetype to a layout builder in
// `src/main/layouts/segment-layouts.ts`. No per-segment caption / hero /
// drawtext is ever drawn during the segment encode. A single clip-level ASS
// caption track, hook title, and rehook overlay are burned post-concat.
// ---------------------------------------------------------------------------

import { join } from 'path'
import { unlinkSync, writeFileSync, renameSync, existsSync } from 'fs'
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
import type { HookTitleConfig } from './types'
import type { CaptionStyleInput, ArchetypeWindow, WordInput } from '../captions'
import type { EmphasizedWord } from '@shared/types'
import { toFFmpegPath, buildASSFilter } from './helpers'
import { generateCaptions } from '../captions'
import { resolveTemplate, isSpeakerFullscreen, DEFAULT_EDIT_STYLE_ID } from '../edit-styles'
import { analyzeEmphasisHeuristic } from '../word-emphasis'
import { resolveFontsDir } from '../font-registry'
import { buildSnapZoom, buildWordPulseZoom, buildDriftZoom, buildZoomOutReveal } from '../zoom-filters'
import { applyFilterPass } from './overlay-runner'
import { getIntermediateQuality } from './quality'
import { generateHookTitleASSFile } from './features/hook-title.feature'
import { generateRehookASSFile } from './features/rehook.feature'
import { buildArchetypeLayout, type SegmentLayoutParams } from '../layouts/segment-layouts'
import { buildEditStyleColorGradeFilter } from './color-grade-filter'
import type { RehookConfig, OverlayVisualSettings } from '../overlays/rehook'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedSegment {
  /** Segment time range in source video (absolute seconds) */
  startTime: number
  endTime: number
  /** Archetype drives the segment's visual layout. */
  archetype: Archetype
  /** Zoom parameters (segment-local — applied after the layout filter). */
  zoom: {
    style: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out'
    intensity: number
  }
  /** Transition INTO this segment (ignored on the first segment). */
  transitionIn: TransitionType
  /** Contextual image path (legacy — still accepted but unused by the active
   *  split-image / fullscreen-image layouts, which now consume `videoPath`). */
  imagePath?: string
  /** Contextual b-roll video path (for split-image / fullscreen-image archetypes). */
  videoPath?: string
  /** Per-segment face crop override on the source video. */
  cropRect?: { x: number; y: number; width: number; height: number }
  /**
   * Set when a requested archetype could not be honored at render time
   * (e.g. split-image / fullscreen-image with no image) and was degraded
   * to talking-head. Mirrored to upstream via SegmentRenderConfig.onFallback.
   */
  fallbackReason?: string
}

export interface SegmentRenderConfig {
  /** Source video path */
  sourceVideoPath: string
  /** Per-segment render instructions */
  segments: ResolvedSegment[]
  /** Edit style providing color-grade and transition defaults */
  editStyle: EditStyle
  /** Target output dimensions */
  width: number
  height: number
  /** Video FPS */
  fps: number
  /** Source video metadata */
  sourceWidth: number
  sourceHeight: number
  /** Word timestamps (absolute, for caption generation) */
  wordTimestamps?: { text: string; start: number; end: number }[]
  /** Word emphasis data (clip-relative or absolute — matched by start time) */
  wordEmphasis?: EmphasizedWord[]
  /** Caption style — required for the clip-level caption pass to render. */
  captionStyle?: CaptionStyleInput
  /** Whether captions are enabled */
  captionsEnabled?: boolean
  /** Archetype windows for per-line marginV / fontSize in the captions pass. */
  archetypeWindows?: ArchetypeWindow[]
  /** Template layout positions (only titleText.y + rehookText.y are read). */
  templateLayout?: {
    titleText: { x: number; y: number }
    subtitles: { x: number; y: number }
    rehookText: { x: number; y: number }
  }
  /** Hook title text + config — burned post-concat into the first N seconds. */
  hookTitleText?: string
  hookTitleConfig?: HookTitleConfig
  /** Rehook text + config — burned post-concat after the hook title. */
  rehookText?: string
  rehookConfig?: RehookConfig
  /** Clip-relative seconds at which the rehook should appear. */
  rehookAppearTime?: number
  /** Visual settings used for the rehook pill (inherits from hook by default). */
  rehookVisuals?: OverlayVisualSettings
  /**
   * Called when a segment's requested archetype could not be honored
   * and was degraded at render time (image archetype with no image →
   * talking-head). Implementations typically forward this as IPC via
   * `Ch.Send.SEGMENT_FALLBACK`.
   */
  onFallback?: (info: { segmentIndex: number; archetype: string; reason: string }) => void
  /**
   * Encoder quality (CRF + speed preset). Forwarded to every per-segment
   * encode, xfade concat, and post-concat overlay pass so the user's
   * "High / Normal / Draft / Custom" preset actually takes effect on the
   * segmented render path. When omitted, falls back to the encoder defaults
   * (CRF 20, medium preset).
   */
  qualityParams?: QualityParams
}

// ---------------------------------------------------------------------------
// Zoom filter (applied after the layout's [outv] when intensity > 1)
// ---------------------------------------------------------------------------

function buildSegmentZoomFilter(
  seg: ResolvedSegment,
  segDuration: number,
  targetWidth: number,
  targetHeight: number,
  fps: number,
  wordTimestamps?: { text: string; start: number; end: number }[],
  wordEmphasis?: EmphasizedWord[]
): string {
  const { style, intensity } = seg.zoom
  if (style === 'none' || intensity <= 1.001) return ''

  switch (style) {
    case 'snap': {
      const segStart = seg.startTime
      const segEnd = seg.endTime
      const localEmphasis: { time: number; duration: number }[] = []
      if (wordEmphasis) {
        for (const em of wordEmphasis) {
          if (em.emphasis === 'normal') continue
          if (em.end > segStart && em.start < segEnd) {
            const cs = Math.max(em.start, segStart)
            const ce = Math.min(em.end, segEnd)
            localEmphasis.push({ time: cs - segStart, duration: ce - cs })
          }
        }
      }
      if (localEmphasis.length > 0) {
        return buildSnapZoom({
          width: targetWidth,
          height: targetHeight,
          fps,
          duration: segDuration,
          zoomIntensity: intensity,
          startTime: 0,
          emphasisTimestamps: localEmphasis
        })
      }
      return buildDriftZoom({
        width: targetWidth,
        height: targetHeight,
        fps,
        duration: segDuration,
        zoomIntensity: intensity,
        startTime: 0
      })
    }
    case 'drift':
      return buildDriftZoom({
        width: targetWidth,
        height: targetHeight,
        fps,
        duration: segDuration,
        zoomIntensity: intensity,
        startTime: 0
      })
    case 'zoom-out':
      return buildZoomOutReveal({
        width: targetWidth,
        height: targetHeight,
        fps,
        duration: segDuration,
        zoomIntensity: intensity,
        startTime: 0
      })
    case 'word-pulse': {
      const segStart = seg.startTime
      const segEnd = seg.endTime
      const localWords: { time: number; duration: number }[] = []
      if (wordTimestamps) {
        for (const w of wordTimestamps) {
          if (w.end > segStart && w.start < segEnd) {
            const cs = Math.max(w.start, segStart)
            const ce = Math.min(w.end, segEnd)
            localWords.push({ time: cs - segStart, duration: ce - cs })
          }
        }
      }
      return buildWordPulseZoom({
        width: targetWidth,
        height: targetHeight,
        fps,
        duration: segDuration,
        zoomIntensity: intensity,
        startTime: 0,
        allWordTimestamps: localWords.length > 0 ? localWords : undefined,
        emphasisTimestamps: localWords.length === 0 ? [{ time: 0, duration: segDuration }] : undefined
      })
    }
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Single-archetype segment encoder
// ---------------------------------------------------------------------------

/**
 * Encode a single segment as a temp MP4 file. Dispatches on archetype to
 * `buildArchetypeLayout()` and appends optional zoom + color grade after the
 * layout's `[outv]` output. Media-archetype fallback to talking-head when no
 * videoPath is available.
 *
 * Returns any temp files created (currently empty — kept for API symmetry).
 */
async function encodeSegment(
  config: SegmentRenderConfig,
  seg: ResolvedSegment,
  segIndex: number,
  segDuration: number,
  tempPath: string,
  onProgress: (percent: number) => void
): Promise<string[]> {
  const segmentTempFiles: string[] = []
  const { width: tw, height: th, sourceWidth, sourceHeight, fps } = config

  // ── Image-archetype fallback: degrade to talking-head when no image ──
  let archetype: Archetype = seg.archetype
  const needsMedia = archetype === 'split-image' || archetype === 'fullscreen-image'
  if (needsMedia && (!seg.videoPath || !existsSync(seg.videoPath))) {
    const reason = 'No b-roll video available; showing talking-head instead'
    console.warn(
      `[SegmentRender] Segment ${segIndex} requested '${archetype}' but b-roll is ` +
      `missing — degrading to talking-head. ` +
      `[SEGMENT_FALLBACK] segmentIndex=${segIndex} archetype=${archetype} reason="${reason}"`
    )
    config.onFallback?.({ segmentIndex: segIndex, archetype, reason })
    archetype = 'talking-head'
  }

  // ── Build the archetype's filter_complex ──────────────────────────────
  const layoutParams: SegmentLayoutParams = {
    width: tw,
    height: th,
    segmentDuration: segDuration,
    fps,
    mediaPath: seg.videoPath,
    sourceWidth,
    sourceHeight,
    cropRect: seg.cropRect
  }
  const layout = buildArchetypeLayout(archetype, layoutParams)
  const filterComplex = layout.filterComplex

  // split-image / fullscreen-image read the b-roll from [1:v]; the source
  // video stays at [0:v] so `-map 0:a` pulls the speaker's audio.
  // fullscreen-quote produces a color source — it does not reference [0:v].
  // The source video is still input 0 so audio maps cleanly.

  // ── Append post-layout filters (zoom, color grade) ────────────────────
  let currentLabel = 'outv'
  const extras: string[] = []

  // Zoom after the layout, before color grade.
  const zoomFilter = buildSegmentZoomFilter(
    seg,
    segDuration,
    tw,
    th,
    fps,
    config.wordTimestamps,
    config.wordEmphasis
  )
  if (zoomFilter) {
    extras.push(`[${currentLabel}]${zoomFilter}[zoom]`)
    currentLabel = 'zoom'
  }

  // Edit-style color grade.
  if (config.editStyle?.colorGrade) {
    const gradeFilter = buildEditStyleColorGradeFilter(config.editStyle.colorGrade)
    if (gradeFilter) {
      extras.push(`[${currentLabel}]${gradeFilter}[grade]`)
      currentLabel = 'grade'
    }
  }

  let fullFilterComplex: string
  if (extras.length > 0) {
    fullFilterComplex = filterComplex + ';' + extras.join(';')
    fullFilterComplex += `;[${currentLabel}]format=yuv420p[finalv]`
    currentLabel = 'finalv'
  } else {
    fullFilterComplex = filterComplex
  }

  // ── Pick encoder ──────────────────────────────────────────────────────
  // Per-segment outputs are *intermediates* — they will be re-decoded by
  // the xfade concat and again by the overlay pass before reaching the user.
  // Encoding them at the user's CRF baked three generations of libx264 loss
  // into every clip and was the dominant cause of the "looks upscaled from
  // 480p" softness. Use near-lossless intermediate quality (CRF 12, veryfast)
  // here; the final overlay pass is the only encode that honours the user's
  // selected preset, which is the correct place for that knob.
  const qp = getIntermediateQuality()
  const { encoder: detectedEncoder, presetFlag: detectedPresetFlag } = getEncoder(qp)
  const useSwFallback = isGpuEncoderDisabled() && detectedEncoder !== 'libx264'
  const sw = useSwFallback ? getSoftwareEncoder(qp) : null
  const encoder = sw ? sw.encoder : detectedEncoder
  const presetFlag = sw ? sw.presetFlag : detectedPresetFlag

  await new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false

    function runEncode(enc: string, flags: string[], useHwAccel = true): void {
      const cmd = ffmpeg(toFFmpegPath(config.sourceVideoPath))
      let stderrOutput = ''

      if (useHwAccel) {
        cmd.inputOptions(['-hwaccel', 'auto'])
      }

      // Seek source video to segment start (audio + speaker video)
      cmd.seekInput(seg.startTime)
      cmd.duration(segDuration)

      // Add the b-roll video as input 1 for media-based layouts. We loop
      // the b-roll (`-stream_loop -1`) so segments longer than the source
      // Pexels clip still fill the frame; `-t segDuration` trims the
      // looped output so vstack sees matched stream lengths.
      const needsMediaInput =
        !!seg.videoPath &&
        (archetype === 'split-image' || archetype === 'fullscreen-image')

      if (needsMediaInput && seg.videoPath) {
        cmd.input(toFFmpegPath(seg.videoPath))
        cmd.inputOptions(['-stream_loop', '-1', '-t', segDuration.toFixed(3)])
      }

      cmd
        .outputOptions([
          '-filter_complex', fullFilterComplex,
          '-map', `[${currentLabel}]`,
          '-map', '0:a',
          '-c:v', enc,
          ...flags,
          '-r', String(fps),
          // Force 4:2:0 at the encoder sink to match what every downstream
          // consumer (xfade concat, overlay pass) expects. The filter graph
          // already ends in `format=yuv420p` but encoder negotiation can
          // promote to yuv444p mid-pipeline if upstream filters report it.
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-y'
        ])
        .on('progress', (progress: { percent?: number }) => {
          onProgress(Math.min(99, progress.percent ?? 0))
        })
        .on('stderr', (line: string) => { stderrOutput += line + '\n' })
        .on('end', () => {
          onProgress(100)
          resolve()
        })
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            console.warn(
              `[SegmentRender] GPU error in segment encode, falling back to software encoder: ${err.message}`
            )
            const fb = getSoftwareEncoder(qp)
            runEncode(fb.encoder, fb.presetFlag, false)
          } else {
            const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
            reject(new Error(`${err.message}\n[stderr tail] ${stderrTail}`))
          }
        })
        .save(toFFmpegPath(tempPath))
    }

    runEncode(encoder, presetFlag)
  })

  return segmentTempFiles
}

// ---------------------------------------------------------------------------
// Concatenation
// ---------------------------------------------------------------------------

/**
 * Concatenate segment files using FFmpeg concat demuxer (stream copy, fast).
 * Used when all transitions are hard-cut (or none).
 */
async function concatWithDemuxer(
  segmentFiles: string[],
  outputPath: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const listFile = join(tmpdir(), `batchcontent-seg-list-${Date.now()}.txt`)
  const listContent = segmentFiles
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')
  writeFileSync(listFile, listContent, 'utf-8')

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy', '-movflags', '+faststart', '-y'])
        .on('progress', () => onProgress(95))
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
  } catch {
    try { unlinkSync(listFile) } catch { /* ignore */ }
    throw new Error('Concat demuxer failed for segmented clip')
  }
}

/**
 * Pick fadewhite vs fadeblack based on the perceived brightness of a hex color.
 * Used as a fallback for FFmpeg builds (e.g. ffmpeg-static 6.0) that do not
 * ship the `fadecolor` xfade transition (added in FFmpeg 7.1).
 */
function pickFadeByBrightness(hex: string): 'fadewhite' | 'fadeblack' {
  const m = hex.replace(/^#/, '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return 'fadewhite'
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return luma >= 128 ? 'fadewhite' : 'fadeblack'
}

/**
 * Get the xfade transition name for a TransitionType.
 * Returns null for hard-cut (use concat demuxer instead).
 */
function getXfadeType(transition: TransitionType, flashColor?: string): string | null {
  switch (transition) {
    case 'crossfade':
      return 'fade'
    case 'flash-cut': {
      if (flashColor) return pickFadeByBrightness(flashColor)
      return 'fadewhite'
    }
    case 'color-wash': {
      if (flashColor) return pickFadeByBrightness(flashColor)
      return 'fadeblack'
    }
    case 'hard-cut':
    case 'none':
    default:
      return null
  }
}

/**
 * Concatenate segment files using xfade filter_complex for non-hard transitions.
 * Chains segments pairwise with transition filters.
 *
 * NOTE: the trailing `_xfQuality` parameter is intentionally ignored. The
 * concat output is an *intermediate* — the overlay pass immediately re-decodes
 * it to burn captions / hook title — so we always encode near-losslessly here
 * (CRF 12, veryfast). Honouring the user's CRF/preset at this layer baked a
 * second generation of H.264 loss into every clip. The parameter is retained
 * to avoid churning callers; remove it once all call sites are updated.
 */
async function concatWithXfade(
  segmentFiles: string[],
  transitions: TransitionType[],
  outputPath: string,
  onProgress: (percent: number) => void,
  flashColor?: string,
  transitionDuration?: number,
  _xfQuality?: QualityParams
): Promise<void> {
  if (segmentFiles.length === 0) throw new Error('No segments to concatenate')
  if (segmentFiles.length === 1) {
    const { copyFileSync } = await import('fs')
    copyFileSync(segmentFiles[0], outputPath)
    return
  }

  const durations: number[] = []
  for (const f of segmentFiles) {
    const meta = await getVideoMetadata(f)
    durations.push(meta.duration)
  }

  // Build the video xfade chain and a parallel audio acrossfade chain.
  // Without the audio chain, `-map 0:a` would only pull the first segment's
  // audio, leaving the rest of the concatenated output silent. acrossfade
  // mirrors xfade's crossfade duration so audio fades through transitions.
  const filterParts: string[] = []
  const audioParts: string[] = []
  const xfadeDuration = transitionDuration ?? 0.3
  // Minimum duration the xfade filter can resolve at the output framerate.
  // At 30 fps that's 1/30 ≈ 0.033 s; using 0.05 s gives a safety margin and
  // matches what local FFmpeg 6.0 testing showed to be the lower bound that
  // does NOT truncate the second segment to the first segment's length.
  const hardCutXfade = 0.05

  let inputLabel = '0:v'
  let outputLabel = 'v0'
  let audioInputLabel = '0:a'
  let audioOutputLabel = 'a0'
  let accumulatedDuration = durations[0]

  for (let i = 1; i < segmentFiles.length; i++) {
    const transition = transitions[i] ?? 'hard-cut'
    const xfadeType = getXfadeType(transition, flashColor)

    let stepDuration: number
    if (xfadeType === null) {
      stepDuration = hardCutXfade
      const offset = Math.max(0, accumulatedDuration - stepDuration)
      filterParts.push(
        `[${inputLabel}][${i}:v]xfade=transition=fade:duration=${stepDuration.toFixed(3)}:offset=${offset.toFixed(3)}[${outputLabel}]`
      )
    } else {
      stepDuration = xfadeDuration
      const offset = Math.max(0, accumulatedDuration - stepDuration)
      filterParts.push(
        `[${inputLabel}][${i}:v]xfade=transition=${xfadeType}:duration=${stepDuration.toFixed(3)}:offset=${offset.toFixed(3)}[${outputLabel}]`
      )
    }
    audioParts.push(
      `[${audioInputLabel}][${i}:a]acrossfade=d=${stepDuration.toFixed(3)}:c1=tri:c2=tri[${audioOutputLabel}]`
    )
    accumulatedDuration += durations[i] - stepDuration

    inputLabel = outputLabel
    outputLabel = `v${i}`
    audioInputLabel = audioOutputLabel
    audioOutputLabel = `a${i}`
  }

  // Rename the final video stream to an intermediate label so we can append
  // a `format=yuv420p` normalization step. xfade can promote the pixel
  // format to yuv444p when the input segments report 4:4:4 (or when libavfilter
  // negotiates up), which then makes libx264 try the `high` profile and fail
  // with "high profile doesn't support 4:4:4". Forcing yuv420p on the chain
  // output lets libx264 pick a compatible profile every time.
  const lastVideoLabel = `v${segmentFiles.length - 2}`
  const lastVideoFilter = filterParts[filterParts.length - 1]
  filterParts[filterParts.length - 1] = lastVideoFilter.replace(
    new RegExp(`\\[${lastVideoLabel}\\]$`),
    '[vxfaded]'
  )
  filterParts.push('[vxfaded]format=yuv420p[outv]')

  const lastAudioLabel = `a${segmentFiles.length - 2}`
  const lastAudioFilter = audioParts[audioParts.length - 1]
  audioParts[audioParts.length - 1] = lastAudioFilter.replace(
    new RegExp(`\\[${lastAudioLabel}\\]$`),
    '[outa]'
  )

  const filterComplex = [...filterParts, ...audioParts].join(';')

  await new Promise<void>((resolve, reject) => {
    // Intermediate encode — see comment on `concatWithXfade`. Always use
    // near-lossless params so the immediate-downstream overlay pass starts
    // from a clean source rather than CRF-20 mush.
    const xfIntermediate = getIntermediateQuality()
    const { encoder: xfDetectedEnc, presetFlag: xfDetectedFlags } = getEncoder(xfIntermediate)
    const xfUseSw = isGpuEncoderDisabled() && xfDetectedEnc !== 'libx264'
    const xfSw = xfUseSw ? getSoftwareEncoder(xfIntermediate) : null
    const xfEncoder = xfSw ? xfSw.encoder : xfDetectedEnc
    const xfPresetFlag = xfSw ? xfSw.presetFlag : xfDetectedFlags
    let fallbackAttempted = false
    let stderrOutput = ''

    function runXfade(enc: string, flags: string[], useHwAccel = true): void {
      const cmd = ffmpeg()

      for (let fi = 0; fi < segmentFiles.length; fi++) {
        cmd.input(toFFmpegPath(segmentFiles[fi]))
        if (fi === 0 && useHwAccel) {
          cmd.inputOptions(['-hwaccel', 'auto'])
        }
      }

      cmd
        .outputOptions([
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', enc,
          ...flags,
          // Belt-and-suspenders for the `format=yuv420p` filter at the tail
          // of the xfade chain — also force the encoder pixel format so any
          // future filter that re-negotiates upward still hits a 4:2:0 sink.
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-y'
        ])
        .on('start', (cmdLine: string) => {
          console.log(`[SegmentRender] xfade command: ${cmdLine}`)
        })
        .on('stderr', (line: string) => { stderrOutput += line + '\n' })
        .on('progress', (progress) => {
          onProgress(Math.min(95, progress.percent ?? 0))
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          console.error(`[SegmentRender] xfade stderr:\n${stderrOutput}`)
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            const fb = getSoftwareEncoder(xfIntermediate)
            runXfade(fb.encoder, fb.presetFlag, false)
          } else {
            const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
            reject(new Error(`xfade concat failed: ${err.message}\n[stderr tail] ${stderrTail}`))
          }
        })
        .save(toFFmpegPath(outputPath))
    }

    runXfade(xfEncoder, xfPresetFlag, !xfUseSw)
  })
}

// ---------------------------------------------------------------------------
// Clip-level captions
// ---------------------------------------------------------------------------

/**
 * Build the WordInput list for the clip-level caption ASS. Times are
 * shifted to clip-relative (0-based) seconds by subtracting the first
 * segment's startTime.
 */
function buildClipLevelWords(
  segments: ResolvedSegment[],
  wordTimestamps: { text: string; start: number; end: number }[] | undefined,
  wordEmphasis: EmphasizedWord[] | undefined
): WordInput[] {
  if (!wordTimestamps || wordTimestamps.length === 0) return []
  if (segments.length === 0) return []

  // The clip's source-time range is [first.startTime, last.endTime). Words
  // outside this range are dropped. We map source time → concatenated clip
  // time by walking the segments in order and accumulating each segment's
  // local offset.
  const clipWords: WordInput[] = []
  let cumulative = 0
  for (const seg of segments) {
    const segDuration = seg.endTime - seg.startTime
    for (const w of wordTimestamps) {
      if (w.end <= seg.startTime || w.start >= seg.endTime) continue
      const localStart = Math.max(0, w.start - seg.startTime)
      const localEnd = Math.min(segDuration, w.end - seg.startTime)
      clipWords.push({
        text: w.text,
        start: cumulative + localStart,
        end: cumulative + localEnd
      })
    }
    cumulative += segDuration
  }

  // Attach emphasis. We match by source-time start (within 50 ms) against
  // the per-word emphasis array. When no emphasis data is supplied, run the
  // heuristic on the (clip-relative) word list.
  if (wordEmphasis && wordEmphasis.length > 0) {
    // Rebuild with emphasis by re-walking — we need the source time to match.
    const out: WordInput[] = []
    let cum2 = 0
    for (const seg of segments) {
      const segDuration = seg.endTime - seg.startTime
      for (const w of wordTimestamps) {
        if (w.end <= seg.startTime || w.start >= seg.endTime) continue
        const localStart = Math.max(0, w.start - seg.startTime)
        const localEnd = Math.min(segDuration, w.end - seg.startTime)
        const match = wordEmphasis.find((ov) => Math.abs(ov.start - w.start) < 0.05)
        out.push({
          text: w.text,
          start: cum2 + localStart,
          end: cum2 + localEnd,
          emphasis: match?.emphasis ?? 'normal'
        })
      }
      cum2 += segDuration
    }
    return out
  }

  const heuristic = analyzeEmphasisHeuristic(clipWords.map((w) => ({ text: w.text, start: w.start, end: w.end })))
  return clipWords.map((w, i) => ({
    ...w,
    emphasis: (heuristic[i]?.emphasis ?? 'normal') as 'normal' | 'emphasis' | 'supersize' | 'box'
  }))
}

/**
 * Maximum shift (seconds) applied at any segment boundary by
 * `rebalanceSegmentBoundaries()`. Keeps cuts from drifting more than this
 * far from the ASR-reported word boundary even if the inter-word gap is
 * huge — so we never bleed into the next word's audio under the wrong scene.
 */
const BOUNDARY_HOLD_MAX_SECONDS = 0.15

/**
 * Push each segment boundary later into the inter-word silence so the
 * trailing acoustic decay of the last word in segment N plays under segment
 * N's visual instead of bleeding into segment N+1.
 *
 * Why this exists: ASR word-end timestamps mark the perceptual end of the
 * phoneme, not the acoustic tail. Cutting visually at `word.end` leaves
 * ~50-300ms of audible decay that lands under the next visual scene — most
 * noticeable on dramatic transitions like `fullscreen-quote` → speaker.
 *
 * Algorithm (adapted from Kaldi's `extend_segment_times.py` overlap-fix):
 * for each adjacent pair (N, N+1), find the inter-word gap, then shift the
 * shared boundary later by `min(gap/2, BOUNDARY_HOLD_MAX_SECONDS)`. Because
 * segments are contiguous (segment N+1's startTime equals segment N's
 * endTime), the same shift is applied to both — total clip duration is
 * preserved, audio plays continuously across the join, and no word's
 * midpoint crosses the boundary (so caption-window assignment is unchanged).
 *
 * Returns a new array; input is not mutated.
 */
function rebalanceSegmentBoundaries(
  segments: ResolvedSegment[],
  wordTimestamps: { text: string; start: number; end: number }[] | undefined
): ResolvedSegment[] {
  if (segments.length < 2 || !wordTimestamps || wordTimestamps.length === 0) {
    return segments
  }

  const out = segments.map((s) => ({ ...s }))

  for (let i = 0; i < out.length - 1; i++) {
    const boundary = out[i].endTime // == out[i + 1].startTime by construction

    // Last word of segment N: the latest word whose end is <= boundary.
    let prevLastEnd = -Infinity
    for (const w of wordTimestamps) {
      if (w.end <= boundary + 1e-6 && w.end > prevLastEnd) prevLastEnd = w.end
    }
    // First word of segment N+1: the earliest word whose start is >= boundary.
    let nextFirstStart = Infinity
    for (const w of wordTimestamps) {
      if (w.start >= boundary - 1e-6 && w.start < nextFirstStart) nextFirstStart = w.start
    }

    if (!isFinite(prevLastEnd) || !isFinite(nextFirstStart)) continue
    const gap = nextFirstStart - prevLastEnd
    if (gap <= 0) continue // words overlap or are adjacent — no silence to use

    const shift = Math.min(gap / 2, BOUNDARY_HOLD_MAX_SECONDS)
    if (shift <= 0) continue

    out[i].endTime = boundary + shift
    out[i + 1].startTime = boundary + shift
  }

  return out
}

/**
 * Build the per-segment ArchetypeWindow list in clip-relative time. The
 * caption builder uses this to vary marginV + fontSize for each segment.
 */
function buildClipArchetypeWindows(segments: ResolvedSegment[]): ArchetypeWindow[] {
  const windows: ArchetypeWindow[] = []
  let cumulative = 0
  for (const seg of segments) {
    const segDuration = seg.endTime - seg.startTime
    windows.push({
      startTime: cumulative,
      endTime: cumulative + segDuration,
      archetype: seg.archetype
    })
    cumulative += segDuration
  }
  return windows
}

/**
 * Find the archetype of the segment window that covers a given clip-relative
 * timestamp. Falls back to the last window's archetype if no window covers
 * `t` (e.g. when `t` lands exactly on a boundary), or to 'talking-head' if
 * the window list is empty.
 */
function archetypeAtTime(
  windows: ArchetypeWindow[],
  t: number
): Archetype {
  if (windows.length === 0) return 'talking-head'
  const hit = windows.find((w) => t >= w.startTime && t <= w.endTime)
  return hit?.archetype ?? windows[windows.length - 1].archetype
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render a segmented clip: encode each segment independently, then concatenate
 * with configurable transitions. Post-concat passes burn (in order):
 *
 *   1. Clip-level captions (single ASS, archetype-aware marginV + fontSize)
 *   2. Hook title overlay
 *   3. Rehook overlay
 */
export async function renderSegmentedClip(
  config: SegmentRenderConfig,
  outputPath: string,
  onProgress: (percent: number) => void
): Promise<string> {
  const tempDir = tmpdir()
  const tempFiles: string[] = []
  const { width: tw, height: th } = config

  // Ensure fonts dir is resolved once before any ASS pass needs it.
  await resolveFontsDir()

  // Shift every segment boundary into the inter-word silence so the trailing
  // acoustic tail of each scene's last word stays under that scene's visual.
  // See `rebalanceSegmentBoundaries()` for the why + algorithm.
  const balancedSegments = rebalanceSegmentBoundaries(config.segments, config.wordTimestamps)

  // Archetype windows must reflect the shifted boundaries, otherwise the
  // caption pass would partition words against the pre-shift timeline. Any
  // pre-supplied `config.archetypeWindows` is rebuilt from the rebalanced
  // segments here.
  const balancedArchetypeWindows = buildClipArchetypeWindows(balancedSegments)

  // Transitions are indexed by segment; transitions[0] is for the first
  // segment (= ignored at concat time).
  const transitions: TransitionType[] = balancedSegments.map((s) => s.transitionIn)
  const needsXfade = transitions.slice(1).some((t) => t !== 'hard-cut' && t !== 'none')

  // Progress allocation: 80% segment encode, 5% concat, 15% post-concat.
  const segmentWeight = 80
  const concatBase = segmentWeight
  const postConcatBase = concatBase + 5

  const segmentOutputFiles: string[] = []

  try {
    // ── Phase 1: Encode each segment ────────────────────────────────────
    for (let i = 0; i < balancedSegments.length; i++) {
      const seg = balancedSegments[i]
      const segDuration = seg.endTime - seg.startTime
      const tempPath = join(tempDir, `batchcontent-seg-${Date.now()}-${i}.mp4`)
      tempFiles.push(tempPath)
      segmentOutputFiles.push(tempPath)

      const segProgress = (percent: number): void => {
        const weight = segmentWeight / balancedSegments.length
        const base = weight * i
        onProgress(Math.round(base + (percent * weight / 100)))
      }

      const segTempFiles = await encodeSegment(config, seg, i, segDuration, tempPath, segProgress)
      tempFiles.push(...segTempFiles)
    }

    onProgress(concatBase)

    // ── Phase 2: Concatenate ────────────────────────────────────────────
    const concatOutputPath = join(tempDir, `batchcontent-seg-concat-${Date.now()}.mp4`)
    tempFiles.push(concatOutputPath)

    if (needsXfade) {
      console.log(`[SegmentRender] Using xfade concat for ${balancedSegments.length} segments`)
      await concatWithXfade(
        segmentOutputFiles,
        transitions,
        concatOutputPath,
        (percent) => onProgress(concatBase + (percent - concatBase) * 0.05),
        config.editStyle.flashColor,
        config.editStyle.transitionDuration,
        config.qualityParams
      )
    } else {
      console.log(`[SegmentRender] Using concat demuxer for ${balancedSegments.length} segments`)
      await concatWithDemuxer(
        segmentOutputFiles,
        concatOutputPath,
        () => onProgress(concatBase + 3)
      )
    }

    onProgress(postConcatBase)

    // ── Phase 3: Post-concat overlays ───────────────────────────────────
    //
    // Captions, hook title, and rehook all burn through libass via the same
    // `ass=...` filter primitive. Previously each ran as its own re-encode
    // pass — three full encode/decode cycles of the same pixels, with the
    // associated generational mosquito noise / blocking on faces. We now
    // collect every ASS filter into a single comma-joined -vf chain and run
    // a single post-concat encode. Result is visually identical at the
    // overlay layer but materially sharper at the source-video layer.
    let currentPath = concatOutputPath
    const assFilters: string[] = []
    const overlayLabels: string[] = []

    // 3a. Clip-level captions — single ASS for the whole concatenated clip.
    if (config.captionsEnabled && config.captionStyle) {
      const clipWords = buildClipLevelWords(
        balancedSegments,
        config.wordTimestamps,
        config.wordEmphasis
      )
      if (clipWords.length > 0) {
        try {
          const windows = balancedArchetypeWindows
          const marginVOverride = config.templateLayout?.subtitles
            ? Math.round((1 - config.templateLayout.subtitles.y / 100) * th)
            : undefined
          const editStyleId = config.editStyle?.id ?? DEFAULT_EDIT_STYLE_ID
          const captionAssPath = await generateCaptions(
            clipWords,
            config.captionStyle,
            undefined,
            tw,
            th,
            marginVOverride,
            undefined,
            windows,
            undefined,
            editStyleId
          )
          tempFiles.push(captionAssPath)
          assFilters.push(buildASSFilter(captionAssPath))
          overlayLabels.push('captions')
        } catch (err) {
          console.warn(`[SegmentRender] Caption ASS generation failed, skipping:`, err)
        }
      }
    }

    // 3b. Hook title overlay.
    if (config.hookTitleText && config.hookTitleConfig?.enabled) {
      // Resolve the archetype that covers the hook's midpoint (the hook lives
      // in the first ~hookDuration seconds of the clip, clip-relative time).
      const hookWindows = balancedArchetypeWindows
      const hookMid = config.hookTitleConfig.displayDuration / 2
      const hookArchetype = archetypeAtTime(hookWindows, hookMid)
      const hookEditStyleId = config.editStyle?.id ?? DEFAULT_EDIT_STYLE_ID
      const hookTpl = resolveTemplate(hookArchetype, hookEditStyleId)

      // Speaker-fullscreen archetypes let the user's global template
      // editor move the pill; non-speaker layouts ignore it and use the
      // per-archetype default.
      const yPositionPx = isSpeakerFullscreen(hookArchetype) && config.templateLayout?.titleText
        ? Math.round((config.templateLayout.titleText.y / 100) * th)
        : hookTpl.hookTitleY

      try {
        const assPath = generateHookTitleASSFile(
          config.hookTitleText,
          config.hookTitleConfig,
          tw,
          th,
          yPositionPx
        )
        tempFiles.push(assPath)
        assFilters.push(buildASSFilter(assPath))
        overlayLabels.push('hook')
      } catch (err) {
        console.warn(`[SegmentRender] Hook title ASS generation failed, skipping:`, err)
      }
    }

    // 3c. Rehook overlay — burned after the hook title.
    if (
      config.rehookText &&
      config.rehookConfig?.enabled &&
      typeof config.rehookAppearTime === 'number'
    ) {
      // Resolve the archetype that covers the rehook's midpoint.
      const rehookWindows = balancedArchetypeWindows
      const rehookMid = config.rehookAppearTime + (config.rehookConfig.displayDuration / 2)
      const rehookArchetype = archetypeAtTime(rehookWindows, rehookMid)
      const rehookEditStyleId = config.editStyle?.id ?? DEFAULT_EDIT_STYLE_ID
      const rehookTpl = resolveTemplate(rehookArchetype, rehookEditStyleId)

      const yPositionPx = isSpeakerFullscreen(rehookArchetype) && config.templateLayout?.rehookText
        ? Math.round((config.templateLayout.rehookText.y / 100) * th)
        : rehookTpl.rehookY
      const visuals: OverlayVisualSettings =
        config.rehookVisuals ??
        (config.hookTitleConfig
          ? {
              fontSize: config.hookTitleConfig.fontSize,
              textColor: config.hookTitleConfig.textColor,
              outlineColor: config.hookTitleConfig.outlineColor,
              outlineWidth: config.hookTitleConfig.outlineWidth
            }
          : { fontSize: 72, textColor: '#FFFFFF', outlineColor: '#000000', outlineWidth: 4 })
      try {
        const rehookAssPath = generateRehookASSFile(
          config.rehookText,
          config.rehookConfig,
          visuals,
          config.rehookAppearTime,
          tw,
          th,
          yPositionPx
        )
        tempFiles.push(rehookAssPath)
        assFilters.push(buildASSFilter(rehookAssPath))
        overlayLabels.push('rehook')
      } catch (err) {
        console.warn(`[SegmentRender] Rehook ASS generation failed, skipping:`, err)
      }
    }

    // Single combined burn-in pass. Each ass=... filter renders its events
    // on top of the previous one; the order matches the original three-pass
    // ordering (captions → hook → rehook). format=yuv420p is appended by
    // applyFilterPass automatically.
    if (assFilters.length > 0) {
      console.log(
        `[SegmentRender] Applying ${assFilters.length} overlay(s) in one pass: ` +
        overlayLabels.join(', ')
      )
      const overlayTempPath = join(tempDir, `batchcontent-seg-overlays-${Date.now()}.mp4`)
      tempFiles.push(overlayTempPath)
      try {
        await applyFilterPass(
          currentPath,
          overlayTempPath,
          assFilters.join(','),
          config.qualityParams
        )
        currentPath = overlayTempPath
        onProgress(postConcatBase + 14)
      } catch (err) {
        console.warn(`[SegmentRender] Combined overlay pass failed, skipping:`, err)
      }
    }

    // Move final result to output path.
    if (currentPath !== outputPath) {
      if (existsSync(outputPath)) {
        try { unlinkSync(outputPath) } catch { /* ignore */ }
      }
      renameSync(currentPath, outputPath)
    }

    onProgress(100)
    return outputPath
  } finally {
    for (const tf of tempFiles) {
      try { unlinkSync(tf) } catch { /* ignore */ }
    }
  }
}
