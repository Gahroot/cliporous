/**
 * Segment Layout Filter Builders
 *
 * Creates FFmpeg filter_complex strings for each segment style layout type.
 * These define the visual composition for segments in the Captions.ai-style
 * per-segment editing pipeline.
 *
 * Layout categories:
 *   - main-video (normal / tight / wide)       — crop/scale variations
 *   - main-video-text (center / lower)          — speaker + large text overlay
 *   - main-video-images (pip / side / behind)   — speaker + contextual image
 *   - fullscreen-image (dark / clean)           — image fills frame
 *   - fullscreen-text (center / headline)       — solid bg + large text
 *
 * All layouts produce a `[outv]` output label with pixel format yuv420p
 * and SAR 1:1, ready for encoding.
 */

import { join } from 'path'
import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { app } from 'electron'
import { escapeDrawtext } from '../hook-title'
import { BRAND_BG } from '../edit-styles/shared/brand'

// ---------------------------------------------------------------------------
// Canvas constants
// ---------------------------------------------------------------------------

const CANVAS_W = 1080
const CANVAS_H = 1920

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SegmentLayoutParams {
  width: number                // 1080
  height: number               // 1920
  segmentDuration: number
  /** Path to contextual image (for image-based layouts). */
  imagePath?: string
  /** Large text to render on screen (for text-based layouts). */
  overlayText?: string
  /** Text color as hex string (e.g. '#FFFFFF'). Default: white. */
  textColor?: string
  /** Accent color as hex string (from EditStyle). Default: '#FFD700'. */
  accentColor?: string
  /** Caption background opacity 0–1. Default: 0.6. */
  captionBgOpacity?: number
  /**
   * Solid backdrop hex color (e.g. '#23100c') for layouts that paint a
   * full-frame background — fullscreen-text-center / fullscreen-text-headline.
   * Default: BRAND_BG.
   */
  backgroundColor?: string
  /** Font size for text overlays. Default: 96. */
  fontSize?: number
  /** Source video width (for crop calculations). */
  sourceWidth?: number
  /** Source video height (for crop calculations). */
  sourceHeight?: number
  /** Face-detection crop rect (x, y, width, height on source). */
  cropRect?: { x: number; y: number; width: number; height: number }
  /** Text reveal animation for drawtext overlays in text-based layouts. */
  textAnimation?: TextAnimationStyle
}

export interface SegmentLayoutResult {
  /** Complete FFmpeg filter_complex string with output label [outv]. */
  filterComplex: string
  /**
   * Number of -i inputs the caller must supply:
   *   1 = video only (or generated color source)
   *   2 = video + image
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

/** Convert hex + alpha to FFmpeg color with opacity. */
function hexToFFmpegAlpha(hex: string, alpha: number): string {
  return `${hexToFFmpeg(hex)}@${alpha.toFixed(2)}`
}

/**
 * Resolve a bold sans-serif font from resources/fonts/.
 * Returns the path to Montserrat-Bold (preferred), Inter-Bold, or first .ttf found.
 * Falls back to system fontconfig name if nothing found.
 */
async function resolveBoldFont(): Promise<{ fontFile: string } | { fontName: string }> {
  let resourcesPath: string
  try {
    resourcesPath = app.isPackaged
      ? join(process.resourcesPath, 'fonts')
      : join(__dirname, '../../resources/fonts')
  } catch {
    resourcesPath = join(__dirname, '../../resources/fonts')
  }

  if (existsSync(resourcesPath)) {
    try {
      const entries = await readdir(resourcesPath)
      // Prefer Montserrat-Bold, then Inter-Bold, then any bold TTF
      const preferred = ['Montserrat-Bold.ttf', 'Inter-Bold.ttf', 'Poppins-Bold.ttf']
      for (const name of preferred) {
        if (entries.includes(name)) {
          return { fontFile: join(resourcesPath, name) }
        }
      }
      const anyTtf = entries.find((f) => /\.(ttf|otf)$/i.test(f))
      if (anyTtf) {
        return { fontFile: join(resourcesPath, anyTtf) }
      }
    } catch {
      // fall through
    }
  }

  return { fontName: 'Sans Bold' }
}

/** Build the fontfile= or font= spec for drawtext (for -vf / simple filtergraph context). */
function fontSpec(font: { fontFile: string } | { fontName: string }, size: number): string {
  if ('fontFile' in font) {
    const escaped = font.fontFile.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
    return `fontfile='${escaped}':fontsize=${size}`
  }
  return `font='${font.fontName}':fontsize=${size}`
}

/**
 * Build the fontfile= or font= spec for drawtext inside -filter_complex.
 *
 * Same escaping as `fontSpec` — colons must always be escaped as `\:`
 * even inside single-quoted values, because FFmpeg's filter parser does NOT
 * treat single quotes as protecting colons from being parsed as option
 * separators.  Without this, a Windows path like `C:/...` causes
 * "No option name near ..." parse errors.
 */
function fontSpecForComplex(font: { fontFile: string } | { fontName: string }, size: number): string {
  return fontSpec(font, size)
}

/** Standard finalization: SAR 1:1 + yuv420p pixel format. */
function finalize(label: string): string {
  return `[${label}]setsar=1,format=yuv420p[outv]`
}

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

  // Apply face-detection crop if available
  if (crop) {
    parts.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`)
  }

  if (scaleFactor !== 1.0) {
    // Scale up/down then crop to target
    const scaledW = roundEven(Math.round(targetW * scaleFactor))
    const scaledH = roundEven(Math.round(targetH * scaleFactor))
    parts.push(`scale=${scaledW}:${scaledH}`)
    // Center-crop to target
    const cropX = Math.max(0, Math.round((scaledW - targetW) / 2))
    const cropY = Math.max(0, Math.round((scaledH - targetH) / 2))
    if (scaleFactor > 1.0) {
      parts.push(`crop=${targetW}:${targetH}:${cropX}:${cropY}`)
    } else {
      // For wide (scale < 1), we pad instead of crop — handled by blur-bg caller
      parts.push(`scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease`)
    }
  } else {
    // Standard: crop to target aspect then scale
    const availW = crop?.width ?? srcW
    const availH = crop?.height ?? srcH
    const targetAspect = targetW / targetH
    const availAspect = availW / availH

    if (!crop) {
      // No face crop — do aspect-correct center crop
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
    }
    parts.push(`scale=${targetW}:${targetH}`)
  }

  return parts.join(',')
}

// ---------------------------------------------------------------------------
// Layout builders
// ---------------------------------------------------------------------------

/**
 * main-video-normal: Standard face-centered 9:16 crop.
 */
function buildMainVideoNormal(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height
  const chain = buildSpeakerCropScale(params, w, h, 1.0)
  const fc = `[0:v]${chain}[scaled];${finalize('scaled')}`
  return { filterComplex: fc, inputCount: 1 }
}

/**
 * main-video-tight: 1.15x scale (closer on face) then crop to frame.
 */
function buildMainVideoTight(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height
  const chain = buildSpeakerCropScale(params, w, h, 1.15)
  const fc = `[0:v]${chain}[scaled];${finalize('scaled')}`
  return { filterComplex: fc, inputCount: 1 }
}

/**
 * main-video-wide: 0.9x scale with blur-fill background.
 * Uses split → blur bg + scaled fg overlay pattern from blur-background.ts.
 */
function buildMainVideoWide(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height

  // Foreground: scale down to 90%
  const fgW = roundEven(Math.round(w * 0.9))
  const fgH = roundEven(Math.round(h * 0.9))

  const parts: string[] = [
    // Split input for bg and fg
    `[0:v]split=2[bg][fg]`,
    // Background: scale to cover + blur
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=25,eq=brightness=-0.15[bgfinal]`,
    // Foreground: crop to face + scale down
    `[fg]${buildSpeakerCropScale(params, fgW, fgH, 1.0)}[fgfinal]`,
    // Overlay centered
    `[bgfinal][fgfinal]overlay=(W-w)/2:(H-h)/2[composed]`,
    finalize('composed')
  ]

  return { filterComplex: parts.join(';'), inputCount: 1 }
}

/**
 * main-video-text-center: Speaker with large centered text overlay.
 */
async function buildMainVideoTextCenter(params: SegmentLayoutParams): Promise<SegmentLayoutResult> {
  const w = params.width
  const h = params.height
  // Replace escaped single quotes with Unicode right single quotation mark (U+2019)
  // so they survive the filter_complex single-quote parsing without terminating
  // the text value early.
  const text = escapeDrawtext(params.overlayText ?? '').replace(/\\'/g, '\u2019')
  const textCol = hexToFFmpeg(params.textColor ?? '#FFFFFF')
  const fontSize = params.fontSize ?? 96
  const bgOpacity = params.captionBgOpacity ?? 0.6
  const font = await resolveBoldFont()

  const speakerChain = buildSpeakerCropScale(params, w, h, 1.0)

  // Semi-transparent dark box behind text for readability
  const boxH = fontSize + 60
  const boxY = Math.round((h - boxH) / 2)

  const drawbox =
    `drawbox=x=0:y=${boxY}:w=${w}:h=${boxH}` +
    `:color=black@${bgOpacity.toFixed(2)}:t=fill`

  const drawtext =
    `drawtext=${fontSpecForComplex(font, fontSize)}` +
    `:text='${text}'` +
    `:fontcolor=${textCol}` +
    `:x=(w-text_w)/2` +
    `:y=(h-text_h)/2` +
    `:borderw=3` +
    `:bordercolor=black@0.80` +
    `:shadowx=2:shadowy=2:shadowcolor=black@0.50`

  const fc = `[0:v]${speakerChain},${drawbox},${drawtext}[composed];${finalize('composed')}`
  return { filterComplex: fc, inputCount: 1 }
}

/**
 * main-video-text-lower: Speaker with large text in lower 40%.
 */
async function buildMainVideoTextLower(params: SegmentLayoutParams): Promise<SegmentLayoutResult> {
  const w = params.width
  const h = params.height
  // Replace escaped single quotes with Unicode right single quotation mark (U+2019)
  // so they survive the filter_complex single-quote parsing without terminating
  // the text value early.
  const text = escapeDrawtext(params.overlayText ?? '').replace(/\\'/g, '\u2019')
  const textCol = hexToFFmpeg(params.textColor ?? '#FFFFFF')
  const fontSize = params.fontSize ?? 80
  const bgOpacity = params.captionBgOpacity ?? 0.6
  const font = await resolveBoldFont()

  const speakerChain = buildSpeakerCropScale(params, w, h, 1.0)

  // Box in lower 40%
  const boxH = Math.round(h * 0.15)
  const boxY = Math.round(h * 0.65)
  const textY = boxY + Math.round((boxH - fontSize) / 2)

  const drawbox =
    `drawbox=x=0:y=${boxY}:w=${w}:h=${boxH}` +
    `:color=black@${bgOpacity.toFixed(2)}:t=fill`

  const drawtext =
    `drawtext=${fontSpecForComplex(font, fontSize)}` +
    `:text='${text}'` +
    `:fontcolor=${textCol}` +
    `:x=(w-text_w)/2` +
    `:y=${textY}` +
    `:borderw=3` +
    `:bordercolor=black@0.80` +
    `:shadowx=2:shadowy=2:shadowcolor=black@0.50`

  const fc = `[0:v]${speakerChain},${drawbox},${drawtext}[composed];${finalize('composed')}`
  return { filterComplex: fc, inputCount: 1 }
}

/**
 * main-video-images-pip: Speaker full-frame + small image overlay in top-right.
 * Input 0: speaker video, Input 1: contextual image.
 */
function buildMainVideoImagesPip(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height

  // PiP image: ~30% of frame width
  const pipW = roundEven(Math.round(w * 0.30))
  const pipH = roundEven(Math.round(pipW * 0.75)) // 4:3 aspect for images
  const margin = 40 // padding from edge
  const borderPx = 3

  const speakerChain = buildSpeakerCropScale(params, w, h, 1.0)

  const parts: string[] = [
    // Speaker fills frame
    `[0:v]${speakerChain}[mainv]`,
    // Scale image to PiP size, add dark border for separation + subtle shadow
    `[1:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=decrease,` +
      `pad=${pipW}:${pipH}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `drawbox=x=0:y=0:w=${pipW}:h=${pipH}:color=black@0.70:t=${borderPx}[pipv]`,
    // Overlay PiP in top-right corner with margin
    `[mainv][pipv]overlay=x=W-w-${margin}:y=${margin}[composed]`,
    finalize('composed')
  ]

  return { filterComplex: parts.join(';'), inputCount: 2 }
}

/**
 * main-video-images-side: 50/50 split — speaker left, image right.
 * Input 0: speaker video, Input 1: contextual image.
 */
function buildMainVideoImagesSide(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height

  // Each panel: half width, full height
  const panelW = roundEven(w / 2) // 540
  const panelH = h                // 1920

  const speakerChain = buildSpeakerCropScale(params, panelW, panelH, 1.0)

  const parts: string[] = [
    // Speaker on left half
    `[0:v]${speakerChain}[left]`,
    // Image on right half — scale to fill
    `[1:v]scale=${panelW}:${panelH}:force_original_aspect_ratio=increase,crop=${panelW}:${panelH}[right]`,
    // Horizontal stack
    `[left][right]hstack=inputs=2[composed]`,
    finalize('composed')
  ]

  return { filterComplex: parts.join(';'), inputCount: 2 }
}

/**
 * main-video-images-topbottom: Speaker fills top half (960px), contextual image fills bottom half.
 * Input 0: speaker video, Input 1: contextual image.
 * Optional accent-colored divider line at the split point.
 */
function buildMainVideoImagesTopBottom(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width   // 1080
  const h = params.height  // 1920
  const halfH = roundEven(h / 2) // 960

  const accentColor = hexToFFmpeg(params.accentColor ?? '#FFD700')
  const dividerH = 4 // px — thin accent line at the split

  const speakerChain = buildSpeakerCropScale(params, w, halfH, 1.0)

  const parts: string[] = [
    // Top half: speaker cropped and scaled to 1080×960
    `[0:v]${speakerChain}[top]`,
    // Bottom half: image scaled to cover-fill 1080×960 (no letterbox)
    `[1:v]scale=${w}:${halfH}:force_original_aspect_ratio=increase,crop=${w}:${halfH}[bottom]`,
    // Stack vertically to produce 1080×1920
    `[top][bottom]vstack=inputs=2[stacked]`,
    // Draw accent divider at the split point (y = halfH - dividerH/2)
    `[stacked]drawbox=x=0:y=${halfH - Math.round(dividerH / 2)}:w=${w}:h=${dividerH}:color=${accentColor}@0.90:t=fill[composed]`,
    finalize('composed')
  ]

  return { filterComplex: parts.join(';'), inputCount: 2 }
}

/**
 * main-video-images-behind: Image as background, speaker in smaller window center-bottom.
 * Input 0: contextual image (background), Input 1: speaker video.
 *
 * NOTE: Caller must supply image as input 0 and speaker as input 1, OR
 * the more natural order (speaker=0, image=1) — we use 0=speaker, 1=image
 * to match the convention of other layouts. The image is input 1.
 */
function buildMainVideoImagesBehind(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height

  // Speaker window: 60% width, maintain 9:16 aspect
  const speakerW = roundEven(Math.round(w * 0.60))
  const speakerH = roundEven(Math.round(speakerW * (16 / 9)))
  const speakerY = h - speakerH - 100 // 100px from bottom

  const speakerChain = buildSpeakerCropScale(params, speakerW, speakerH, 1.0)

  const parts: string[] = [
    // Background image: scale to fill canvas
    `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[bgraw]`,
    // Dark overlay on background for contrast
    `[bgraw]drawbox=x=0:y=0:w=${w}:h=${h}:color=black@0.40:t=fill[bgdark]`,
    // Speaker video: scaled to 60% width
    `[0:v]${speakerChain},` +
      `drawbox=x=0:y=0:w=${speakerW}:h=${speakerH}:color=black@0.60:t=3[speaker]`,
    // Overlay speaker center-bottom on darkened background
    `[bgdark][speaker]overlay=x=(W-w)/2:y=${speakerY}[composed]`,
    finalize('composed')
  ]

  return { filterComplex: parts.join(';'), inputCount: 2 }
}

/**
 * fullscreen-image-dark: Image fills frame with 40% opacity dark overlay.
 * Input 0: image file.
 */
function buildFullscreenImageDark(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height

  const parts: string[] = [
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
      `drawbox=x=0:y=0:w=${w}:h=${h}:color=black@0.40:t=fill[composed]`,
    finalize('composed')
  ]

  return { filterComplex: parts.join(';'), inputCount: 1 }
}

/**
 * fullscreen-image-clean: Image fills frame without dark overlay.
 * Input 0: image file.
 */
function buildFullscreenImageClean(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width
  const h = params.height

  const fc =
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[composed];` +
    finalize('composed')

  return { filterComplex: fc, inputCount: 1 }
}

/**
 * fullscreen-text-center: Solid brand background. The hero ASS pass
 * (archetype-hero.ts) draws the animated text on top; fall back to a static
 * drawtext when no overlayText is set so the frame isn't blank.
 *
 * Background defaults to BRAND_BG (#23100c). The template can override via
 * `layoutParamOverrides.backgroundColor` — keeps the FFmpeg backdrop in
 * lockstep with the Remotion FullscreenQuote composition and the renderer
 * CSS tokens.
 */
async function buildFullscreenTextCenter(params: SegmentLayoutParams): Promise<SegmentLayoutResult> {
  const w = params.width
  const h = params.height
  const dur = params.segmentDuration
  const bgColor = hexToFFmpeg(params.backgroundColor ?? BRAND_BG)

  const bg = `color=c=${bgColor}:s=${w}x${h}:d=${dur.toFixed(3)}:r=30`
  const fc = `${bg}[composed];` + finalize('composed')
  return { filterComplex: fc, inputCount: 0 }
}

/**
 * fullscreen-text-headline: Solid brand background. The hero ASS pass
 * (archetype-hero.ts) renders the animated headline + subtext; this layout
 * only produces the solid background.
 *
 * See buildFullscreenTextCenter for the brand-color background contract.
 */
async function buildFullscreenTextHeadline(params: SegmentLayoutParams): Promise<SegmentLayoutResult> {
  const w = params.width
  const h = params.height
  const dur = params.segmentDuration
  const bgColor = hexToFFmpeg(params.backgroundColor ?? BRAND_BG)

  const bg = `color=c=${bgColor}:s=${w}x${h}:d=${dur.toFixed(3)}:r=30`
  const fc = `${bg}[composed];` + finalize('composed')
  return { filterComplex: fc, inputCount: 0 }
}

// ---------------------------------------------------------------------------
// Public API — Dispatcher
// ---------------------------------------------------------------------------

/**
 * Builds an FFmpeg `filter_complex` string for the given segment style variant.
 *
 * The returned filter_complex produces an output stream labeled `[outv]` with
 * pixel format yuv420p and SAR 1:1, ready for direct encoding.
 *
 * @param variant  The segment style variant (from SEGMENT_STYLE_VARIANTS).
 * @param params   Layout parameters (dimensions, text, image path, etc.).
 * @returns        `{ filterComplex, inputCount }` ready for FFmpeg invocation.
 */
export async function buildSegmentLayout(
  variant: SegmentStyleVariant,
  params: SegmentLayoutParams
): Promise<SegmentLayoutResult> {
  switch (variant.id) {
    // ── main-video ──────────────────────────────────────────────────────
    case 'main-video-normal':
      return buildMainVideoNormal(params)
    case 'main-video-tight':
      return buildMainVideoTight(params)
    case 'main-video-wide':
      return buildMainVideoWide(params)

    // ── main-video-text ─────────────────────────────────────────────────
    case 'main-video-text-center':
      return buildMainVideoTextCenter(params)
    case 'main-video-text-lower':
      return buildMainVideoTextLower(params)

    // ── main-video-images ───────────────────────────────────────────────
    case 'main-video-images-pip':
      return buildMainVideoImagesPip(params)
    case 'main-video-images-side':
      return buildMainVideoImagesSide(params)
    case 'main-video-images-behind':
      return buildMainVideoImagesBehind(params)
    case 'main-video-images-topbottom':
      return buildMainVideoImagesTopBottom(params)

    // ── fullscreen-image ────────────────────────────────────────────────
    case 'fullscreen-image-dark':
      return buildFullscreenImageDark(params)
    case 'fullscreen-image-clean':
      return buildFullscreenImageClean(params)

    // ── fullscreen-text ─────────────────────────────────────────────────
    case 'fullscreen-text-center':
      return buildFullscreenTextCenter(params)
    case 'fullscreen-text-headline':
      return buildFullscreenTextHeadline(params)

    default:
      // Unknown variant — fall back to normal crop
      return buildMainVideoNormal(params)
  }
}
