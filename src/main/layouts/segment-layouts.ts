/**
 * Segment Layout Filter Builders
 *
 * Creates FFmpeg filter_complex strings for each archetype's per-segment
 * visual layout. Archetypes are self-contained — there are no style
 * variants underneath them.
 *
 * Layouts:
 *   - talking-head      — face-centered 9:16 crop
 *   - tight-punch       — 1.15× speaker zoom
 *   - wide-breather     — 0.9× speaker over blurred bg
 *   - quote-lower       — same as talking-head (captions hero)
 *   - split-image       — b-roll video on top half + speaker on bottom half
 *   - fullscreen-image  — b-roll video fills the frame
 *   - fullscreen-quote  — solid sand BRAND_FG color source (captions hero,
 *                          dark-brown serif italic captions on top)
 *
 * All layouts produce a `[outv]` output label with pixel format yuv420p
 * and SAR 1:1, ready for encoding.
 */

import { BRAND_FG } from '../edit-styles/shared/brand'
import type { Archetype } from '@shared/types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SegmentLayoutParams {
  width: number                // 1080
  height: number               // 1920
  segmentDuration: number
  /** Output framerate — used to lock media inputs to the video's rate so
   *  vstack/overlay don't drop frames from the slower stream. */
  fps?: number
  /** Path to the contextual media (b-roll mp4) for split-image /
   *  fullscreen-image layouts. The encoder wires this as the second -i
   *  input, so layouts read from `[1:v]`. */
  mediaPath?: string
  /** Source video width (for crop calculations). */
  sourceWidth?: number
  /** Source video height (for crop calculations). */
  sourceHeight?: number
  /** Face-detection crop rect (x, y, width, height on source). */
  cropRect?: { x: number; y: number; width: number; height: number }
}

export interface SegmentLayoutResult {
  /** Complete FFmpeg filter_complex string with output label [outv]. */
  filterComplex: string
  /**
   * Number of -i inputs the caller must supply:
   *   0 = generated color source (no -i needed)
   *   1 = source video only
   *   2 = source video + b-roll video
   */
  inputCount: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Ensures pixel dimensions are even (required by most video codecs). */
function roundEven(n: number): number {
  const v = Math.round(n)
  return v % 2 === 0 ? v : v - 1
}

/** Convert CSS hex (#RRGGBB or #RGB) to FFmpeg color format (0xRRGGBB). */
function hexToFFmpeg(hex: string): string {
  let clean = hex.replace(/^#/, '')
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
  }
  return '0x' + clean
}

/** Standard finalization: SAR 1:1 + yuv420p pixel format. */
function finalize(label: string): string {
  return `[${label}]setsar=1,format=yuv420p[outv]`
}

/**
 * High-quality scaling flags. Lanczos with accurate rounding + full-chroma
 * interpolation matches the base-render path and is materially sharper than
 * FFmpeg's default bilinear, especially on faces and high-frequency detail
 * like text-in-frame.
 */
const SCALE_FLAGS = 'lanczos+accurate_rnd+full_chroma_int'

/**
 * Builds the crop+scale chain for the speaker video.
 * If cropRect is provided (from face detection), crops to that region first.
 */
function buildSpeakerCropScale(
  params: SegmentLayoutParams,
  targetW: number,
  targetH: number,
  scaleFactor: number = 1.0
): string {
  const srcW = params.sourceWidth ?? targetW
  const srcH = params.sourceHeight ?? targetH
  const crop = params.cropRect

  const parts: string[] = []

  // Step 1 — Apply face-detection crop if available.
  if (crop) {
    parts.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`)
  }

  // Step 2 — Aspect-correct sub-crop. After step 1 the available frame may
  // have any aspect ratio (face boxes are not 9:16); cropping it to the
  // target's aspect first prevents the next scale from stretching pixels.
  const availW = crop?.width ?? srcW
  const availH = crop?.height ?? srcH
  const targetAspect = targetW / targetH
  const availAspect = availW / availH

  if (Math.abs(availAspect - targetAspect) > 0.01) {
    let cw: number, ch: number
    if (availAspect > targetAspect) {
      ch = availH
      cw = roundEven(Math.round(availH * targetAspect))
    } else {
      cw = availW
      ch = roundEven(Math.round(availW / targetAspect))
    }
    parts.push(`crop=${cw}:${ch}`)
  }

  // Step 3 — Scale to the target box. After step 2 the aspect already
  // matches, so this is a uniform resize (no distortion).
  if (scaleFactor > 1.0) {
    // Tight-punch path: oversize, then center-crop back to target.
    const scaledW = roundEven(Math.round(targetW * scaleFactor))
    const scaledH = roundEven(Math.round(targetH * scaleFactor))
    parts.push(`scale=${scaledW}:${scaledH}:flags=${SCALE_FLAGS}`)
    const cropX = Math.max(0, Math.round((scaledW - targetW) / 2))
    const cropY = Math.max(0, Math.round((scaledH - targetH) / 2))
    parts.push(`crop=${targetW}:${targetH}:${cropX}:${cropY}`)
  } else {
    parts.push(`scale=${targetW}:${targetH}:flags=${SCALE_FLAGS}`)
  }

  return parts.join(',')
}

// ---------------------------------------------------------------------------
// Layout builders (one per archetype)
// ---------------------------------------------------------------------------

/** talking-head: face-centered 9:16 crop. Also used by quote-lower. */
function buildTalkingHead(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height
  const chain = buildSpeakerCropScale(params, w, h, 1.0)
  const fc = `[0:v]${chain}[scaled];${finalize('scaled')}`
  return { filterComplex: fc, inputCount: 1 }
}

/** tight-punch: 1.15× scale (closer on the face) then crop to frame. */
function buildTightPunch(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height
  const chain = buildSpeakerCropScale(params, w, h, 1.15)
  const fc = `[0:v]${chain}[scaled];${finalize('scaled')}`
  return { filterComplex: fc, inputCount: 1 }
}

/**
 * wide-breather: 1.0× framing — the pulled-back counterpart to tight-punch's
 * 1.15× zoom-in. Visually identical to talking-head; the difference is the
 * pacing role (relief beat) and the crossfade transition-in.
 */
function buildWideBreather(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height
  const chain = buildSpeakerCropScale(params, w, h, 1.0)
  const fc = `[0:v]${chain}[scaled];${finalize('scaled')}`
  return { filterComplex: fc, inputCount: 1 }
}

/**
 * split-image: contextual b-roll video fills the top half, speaker fills the
 * bottom half. Input 0: speaker (source video), Input 1: b-roll video.
 *
 * Both streams have native framerates, so we normalize them to the output
 * fps (`fps=FPS`) and SAR before vstacking. `shortest=1` pins the stack to
 * the speaker's duration (the b-roll is `-stream_loop -1`'d at the encoder
 * so it can cover any segment length).
 */
function buildSplitImage(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height
  const fps = params.fps ?? 30
  const halfH = roundEven(h / 2)

  const speakerChain = buildSpeakerCropScale(params, w, halfH, 1.0)

  const parts: string[] = [
    `[1:v]scale=${w}:${halfH}:force_original_aspect_ratio=increase:flags=${SCALE_FLAGS},crop=${w}:${halfH},fps=${fps},setsar=1[top]`,
    `[0:v]${speakerChain},fps=${fps},setsar=1[bottom]`,
    `[top][bottom]vstack=inputs=2:shortest=1[composed]`,
    finalize('composed')
  ]

  return { filterComplex: parts.join(';'), inputCount: 2 }
}

/**
 * fullscreen-image: b-roll video fills the entire frame. Input 0: source
 * clip (kept only so `-map 0:a` still pulls the speaker's audio). Input 1:
 * b-roll video. The b-roll stream is locked to the output framerate so the
 * audio mapping from input 0 stays in sync.
 */
function buildFullscreenImage(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height
  const fps = params.fps ?? 30

  const fc =
    `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase:flags=${SCALE_FLAGS},crop=${w}:${h},fps=${fps},setsar=1[composed];` +
    finalize('composed')

  return { filterComplex: fc, inputCount: 2 }
}

/**
 * fullscreen-quote: solid sand (BRAND_FG) color source for the segment
 * duration. No baked text — captions are the hero. This archetype inverts
 * the brand palette (sand bg, dark-brown text) so a quote moment doesn't
 * read like the video has cut to black. Audio still comes from input 0
 * (the source video) at the encode site.
 */
function buildFullscreenQuote(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height
  const dur = params.segmentDuration
  const bgColor = hexToFFmpeg(BRAND_FG)

  const bg = `color=c=${bgColor}:s=${w}x${h}:d=${dur.toFixed(3)}:r=30`
  const fc = `${bg}[composed];` + finalize('composed')
  return { filterComplex: fc, inputCount: 0 }
}

// ---------------------------------------------------------------------------
// Public API — Dispatcher
// ---------------------------------------------------------------------------

/**
 * Build the FFmpeg `filter_complex` for the given archetype.
 *
 * The returned filter_complex produces an output stream labeled `[outv]`
 * with pixel format yuv420p and SAR 1:1, ready for direct encoding.
 *
 * @param archetype  The segment archetype (from `Archetype`).
 * @param params     Layout parameters (dimensions, image path, crop rect).
 * @returns          `{ filterComplex, inputCount }` ready for FFmpeg.
 */
export function buildArchetypeLayout(
  archetype: Archetype,
  params: SegmentLayoutParams
): SegmentLayoutResult {
  switch (archetype) {
    case 'talking-head':
    case 'quote-lower':
      return buildTalkingHead(params)
    case 'tight-punch':
      return buildTightPunch(params)
    case 'wide-breather':
      return buildWideBreather(params)
    case 'split-image':
      return buildSplitImage(params)
    case 'fullscreen-image':
      return buildFullscreenImage(params)
    case 'fullscreen-quote':
      return buildFullscreenQuote(params)
    default:
      return buildTalkingHead(params)
  }
}
