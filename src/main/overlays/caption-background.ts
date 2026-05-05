/**
 * Caption Background & Letterbox Bar Overlays
 *
 * Provides FFmpeg filter builders for two visual elements that define the
 * "feel" of each Captions.ai edit style:
 *
 * 1. **Caption background** — a semi-transparent dark rectangle behind the
 *    caption zone (typically y: 55–90% of frame height). Opacity varies by
 *    style:
 *      - Light (0–5%):   clarity, lumen, paper_ii, recess
 *      - Medium (10–25%): align, ember, film, growth, cinematic, elevate, prime
 *      - Heavy (30–50%):  impact (44%), pulse (33%), rebel (39%), volt (47%)
 *
 * 2. **Letterbox bars** — cinematic black bars at top/bottom of frame:
 *      - 'none'   — no bars
 *      - 'bottom' — bottom bar only (ember, elevate, growth, volt)
 *      - 'both'   — top + bottom bars (impact, pulse) — cinematic 2.35:1 feel
 *
 * Both return FFmpeg drawbox filter strings that can be appended to a
 * filter_complex chain. The drawbox filter is used because it evaluates
 * in-place on the existing video stream (no extra color source needed),
 * keeping the filter graph simple.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaptionBgParams {
  /** Frame width in pixels (e.g. 1080). */
  width: number
  /** Frame height in pixels (e.g. 1920). */
  height: number
  /** Background opacity: 0.0 (transparent / none) to 1.0 (fully opaque). */
  opacity: number
  /** Fill color in CSS hex format. Default: '#000000'. */
  color?: string
  /** Normalized Y start position (0.0–1.0). Default: 0.55. */
  yStart?: number
  /** Normalized Y end position (0.0–1.0). Default: 0.90. */
  yEnd?: number
  /** Corner radius in pixels. 0 = sharp edges. Default: 0. */
  cornerRadius?: number
}

export interface LetterboxParams {
  /** Frame width in pixels (e.g. 1080). */
  width: number
  /** Frame height in pixels (e.g. 1920). */
  height: number
  /** Letterbox mode: 'none', 'bottom', or 'both'. */
  mode: 'none' | 'bottom' | 'both'
  /** Bar height in pixels. Default: ~8% of frame height. */
  barHeight?: number
  /** Bar opacity: 0.0–1.0. Default: 0.85. */
  opacity?: number
  /** Bar color in CSS hex format. Default: '#000000'. */
  color?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a CSS hex color to FFmpeg's `0xRRGGBB@alpha` format.
 * Accepts '#RGB', '#RRGGBB', '#AARRGGBB'. Falls back to `black@alpha`.
 */
function hexToFFmpegColor(hex: string, alpha: number): string {
  const h = hex.replace(/^#/, '')
  let r: number, g: number, b: number

  if (h.length === 8) {
    // AARRGGBB — use the RGB portion, override alpha
    r = parseInt(h.slice(2, 4), 16)
    g = parseInt(h.slice(4, 6), 16)
    b = parseInt(h.slice(6, 8), 16)
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  } else if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16)
    g = parseInt(h[1] + h[1], 16)
    b = parseInt(h[2] + h[2], 16)
  } else {
    return `black@${alpha.toFixed(2)}`
  }

  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `0x${toHex(r)}${toHex(g)}${toHex(b)}@${alpha.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// buildCaptionBackground
// ---------------------------------------------------------------------------

/**
 * Build an FFmpeg drawbox filter string for a semi-transparent dark rectangle
 * behind the caption zone.
 *
 * Returns a single drawbox filter expression (e.g.
 * `drawbox=x=0:y=1056:w=1080:h=672:color=0x000000@0.35:t=fill`).
 *
 * Returns an empty string when opacity is 0 or effectively invisible (< 0.01).
 *
 * @param params  Caption background configuration.
 * @returns       FFmpeg drawbox filter string, or '' if disabled.
 */
export function buildCaptionBackground(params: CaptionBgParams): string {
  const {
    width,
    height,
    opacity,
    color = '#000000',
    yStart = 0.55,
    yEnd = 0.90,
    cornerRadius = 0
  } = params

  // Skip if opacity is effectively zero
  if (opacity < 0.01) return ''

  const clampedOpacity = Math.max(0, Math.min(1, opacity))
  const y = Math.round(Math.max(0, Math.min(1, yStart)) * height)
  const yBottom = Math.round(Math.max(0, Math.min(1, yEnd)) * height)
  const boxH = Math.max(1, yBottom - y)
  const ffColor = hexToFFmpegColor(color, clampedOpacity)

  // drawbox doesn't natively support corner radius in most FFmpeg versions.
  // When cornerRadius > 0 we note it but still use drawbox (the visual
  // difference is subtle at small radii on a 1080×1920 canvas). A future
  // enhancement could use a PNG mask overlay for true rounded corners.
  void cornerRadius

  return `drawbox=x=0:y=${y}:w=${width}:h=${boxH}:color=${ffColor}:t=fill`
}

// ---------------------------------------------------------------------------
// buildLetterboxBars
// ---------------------------------------------------------------------------

/**
 * Build FFmpeg drawbox filter string(s) for cinematic letterbox bars.
 *
 * Returns:
 *   - '' when mode is 'none'
 *   - A single drawbox filter for 'bottom' mode
 *   - Two drawbox filters separated by a comma for 'both' mode
 *
 * @param params  Letterbox configuration.
 * @returns       FFmpeg drawbox filter string(s), or '' if mode is 'none'.
 */
export function buildLetterboxBars(params: LetterboxParams): string {
  const {
    width,
    height,
    mode,
    opacity = 0.85,
    color = '#000000'
  } = params

  if (mode === 'none') return ''

  const clampedOpacity = Math.max(0, Math.min(1, opacity))
  // Default bar height: ~8% of frame height
  const barH = Math.max(1, Math.round(params.barHeight ?? height * 0.08))
  const ffColor = hexToFFmpegColor(color, clampedOpacity)

  const bottomBar = `drawbox=x=0:y=${height - barH}:w=${width}:h=${barH}:color=${ffColor}:t=fill`

  if (mode === 'bottom') {
    return bottomBar
  }

  // mode === 'both' — top + bottom bars
  const topBar = `drawbox=x=0:y=0:w=${width}:h=${barH}:color=${ffColor}:t=fill`
  return `${topBar},${bottomBar}`
}
