import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { HookTitleStyle } from '@shared/types'
export type { HookTitleStyle }

/**
 * Full configuration for the hook title overlay rendered in the first few
 * seconds of each clip. All timing values are in seconds.
 */
export interface HookTitleConfig {
  /** Whether hook title overlay is applied during render. */
  enabled: boolean
  /** Visual style. */
  style: HookTitleStyle
  /** How many seconds the hook text is visible (default 2.5). */
  displayDuration: number
  /** Fade-in time in seconds (default 0.3). */
  fadeIn: number
  /** Fade-out time in seconds (default 0.4). */
  fadeOut: number
  /** Font size in pixels on the locked 1080×1920 canvas (default 72). */
  fontSize: number
  /** Text color in CSS hex format (default '#FFFFFF'). */
  textColor: string
  /** Outline / border color in CSS hex format (default '#000000'). */
  outlineColor: string
  /** Outline width in pixels (default 4). */
  outlineWidth: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Candidate bold font paths tried in order when resolving drawtext fontfile. */
const SYSTEM_FONT_CANDIDATES: string[] = [
  // Liberation Sans (widely available on Linux)
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  // DejaVu Sans (most Linux distros)
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  // Noto Sans (Android-lineage distros)
  '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
  // Ubuntu
  '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
  // FreeSans (Debian/Ubuntu)
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
  // macOS
  '/Library/Fonts/Arial Bold.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  // Windows
  'C:\\Windows\\Fonts\\arialbd.ttf',
  'C:\\Windows\\Fonts\\calibrib.ttf'
]

// ---------------------------------------------------------------------------
// Font resolution
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to a bold sans-serif font usable by FFmpeg's
 * drawtext filter. Resolution order:
 *   1. Any `.ttf` / `.otf` file inside `resources/fonts/` (user-supplied)
 *   2. Common system font locations
 *   3. `null` — caller should fall back to fontconfig font name
 */
export async function resolveHookFont(): Promise<string | null> {
  // 1. Check resources/fonts/ directory (bundled or user-placed)
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
      const fontFile = entries.find((f) =>
        /\.(ttf|otf)$/i.test(f)
      )
      if (fontFile) {
        return join(resourcesPath, fontFile)
      }
    } catch {
      // Ignore readdir errors — fall through to system fonts
    }
  }

  // 2. Common system font locations
  for (const candidate of SYSTEM_FONT_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Text escaping
// ---------------------------------------------------------------------------

/**
 * Escape text for use in FFmpeg's drawtext `text=` option.
 *
 * Within a drawtext option value:
 *   - `\` must be doubled → `\\`
 *   - `:` must be escaped → `\:`
 *   - `'` must be escaped → `\'`
 *   - `%` should be doubled → `%%` (prevents strftime expansion)
 *
 * We also strip newlines because drawtext renders a single line.
 */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\r?\n/g, ' ')         // flatten to one line
    .replace(/\\/g, '\\\\')         // escape backslashes first
    .replace(/:/g, '\\:')            // escape colons
    .replace(/'/g, "\\'")            // escape single quotes
    .replace(/%/g, '%%')             // escape percent signs
}

/**
 * Escape commas in an FFmpeg filter expression value.
 *
 * **WARNING — DEPRECATED**: Some Windows FFmpeg builds misparse even escaped
 * commas (`\,`), causing "Error opening output file: Invalid argument".
 * Prefer rewriting expressions to avoid commas entirely:
 *   - `between(t,a,b)` → `gte(t,a)*lte(t,b)`
 *   - `if(cond,a,b)` → `cond*a+(1-cond)*b` (when cond returns 0/1)
 *   - `min(a,b)` → `(a+b-abs(a-b))/2`
 *   - `max(a,b)` → `(a+b+abs(a-b))/2`
 *
 * This function is kept for callers that cannot avoid commas (e.g.
 * split-screen geq expressions), but new code should avoid it.
 */
export function escapeFilterExpr(expr: string): string {
  return expr.replace(/,/g, '\\,')
}

// ---------------------------------------------------------------------------
// Hex → FFmpeg rgba() color helper
// ---------------------------------------------------------------------------

/**
 * Convert a CSS hex color string to an FFmpeg color expression
 * with the given alpha (0.0–1.0). Accepts '#RRGGBB' and '#AARRGGBB'.
 */
function hexToFFmpegColor(hex: string, alpha: number = 1.0): string {
  const h = hex.replace('#', '')
  let r: number, g: number, b: number

  if (h.length === 8) {
    r = parseInt(h.slice(2, 4), 16)
    g = parseInt(h.slice(4, 6), 16)
    b = parseInt(h.slice(6, 8), 16)
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  } else {
    return `white@${alpha.toFixed(2)}`
  }

  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `0x${toHex(r)}${toHex(g)}${toHex(b)}@${alpha.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Filter builders
// ---------------------------------------------------------------------------

/**
 * Build an FFmpeg drawtext filter string for the hook title.
 *
 * @param text         The hook title text (will be escaped automatically).
 * @param config       Hook title display configuration.
 * @param fontFilePath Absolute path to a TTF/OTF font file, or null to use
 *                     the system fontconfig name "Sans Bold".
 * @returns A comma-separated FFmpeg filter chain string suitable for
 *          appending to the `-vf` filter chain.
 */
export function buildHookTitleFilter(
  text: string,
  config: HookTitleConfig,
  fontFilePath: string | null
): string {
  const safeText = escapeDrawtext(text)

  const {
    style,
    displayDuration,
    fadeIn,
    fadeOut,
    fontSize,
    textColor,
    outlineColor,
    outlineWidth
  } = config

  const fadeOutStart = displayDuration - fadeOut

  // Alpha expression: fade in → hold → fade out
  // Rewritten to avoid commas entirely — some Windows FFmpeg builds misparse
  // escaped commas (\,) inside filter option values, causing
  // "Error opening output file: Invalid argument".
  // Uses infix comparison operators (< > <= >=) which return 0 or 1 and
  // need no commas, unlike the function forms lt() gt() gte() lte().
  const FI  = fadeIn.toFixed(3)
  const FOS = fadeOutStart.toFixed(3)
  const DUR = displayDuration.toFixed(3)
  const FO  = fadeOut.toFixed(3)
  const alphaExpr =
    `(t<${FI})*t/${FI}` +
    `+(t>=${FI})*(t<=${FOS})*1` +
    `+(t>${FOS})*(${DUR}-t)/${FO}`

  // Enable expression: only show during [0, displayDuration]
  // Uses infix operators instead of between(t,a,b) to avoid commas
  const enableExpr = `(t>=0)*(t<=${DUR})`

  // Font spec
  // On Windows, FFmpeg requires colons in paths to be escaped as \:
  // (single backslash + colon). This escapes the colon for FFmpeg's filter parser.
  const fontSpec = fontFilePath
    ? `fontfile='${fontFilePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")}':fontsize=${fontSize}`
    : `font='Sans Bold':fontsize=${fontSize}`

  // Y position: top of the union 9:16 vertical safe zone (~220px @ 1920).
  // No platform-specific branching — a single union safe zone covers all
  // short-form vertical surfaces.
  const yPos = 220

  // Text color (we animate alpha via the alpha= expression)
  const fgColor = hexToFFmpegColor(textColor, 1.0)
  const bgColor = hexToFFmpegColor(outlineColor, 1.0)
  const shadowColor = hexToFFmpegColor(outlineColor, 0.7)

  if (style === 'centered-bold') {
    // White text centered horizontally in top safe zone, no background bar
    const drawtext =
      `drawtext=${fontSpec}` +
      `:text='${safeText}'` +
      `:fontcolor=${fgColor}` +
      `:x=(w-text_w)/2` +
      `:y=${yPos}` +
      `:borderw=${outlineWidth}` +
      `:bordercolor=${bgColor}` +
      `:shadowx=3:shadowy=3:shadowcolor=${shadowColor}` +
      `:alpha=${alphaExpr}` +
      `:enable=${enableExpr}`

    return drawtext

  } else if (style === 'top-bar') {
    // Semi-transparent dark bar behind the text, then the text on top
    const barHeight = fontSize + 40
    const barY = yPos - 20

    const drawbox =
      `drawbox=x=0:y=${barY}:w=iw:h=${barHeight}` +
      `:color=black@0.65:t=fill` +
      `:enable=${enableExpr}`

    const drawtext =
      `drawtext=${fontSpec}` +
      `:text='${safeText}'` +
      `:fontcolor=${fgColor}` +
      `:x=(w-text_w)/2` +
      `:y=${yPos}` +
      `:borderw=2` +
      `:bordercolor=${bgColor}` +
      `:alpha=${alphaExpr}` +
      `:enable=${enableExpr}`

    return `${drawbox},${drawtext}`

  } else {
    // slide-in: text slides in from the left while fading in
    // x expression: during fade-in animate from 50px → centred position
    const centerX = `(w-text_w)/2`
    const slideStartX = `50`
    // Rewritten without commas for Windows FFmpeg compatibility.
    // if(t < FI, startX + (centerX-startX)*t/FI, centerX)
    // → (t<FI) * (startX + (centerX-startX)*t/FI) + (t>=FI) * centerX
    const xExpr =
      `(t<${FI})*(${slideStartX}+(${centerX}-${slideStartX})*t/${FI})` +
      `+(t>=${FI})*${centerX}`

    const drawtext =
      `drawtext=${fontSpec}` +
      `:text='${safeText}'` +
      `:fontcolor=${fgColor}` +
      `:x=${xExpr}` +
      `:y=${yPos}` +
      `:borderw=${outlineWidth}` +
      `:bordercolor=${bgColor}` +
      `:shadowx=3:shadowy=3:shadowcolor=${shadowColor}` +
      `:alpha=${alphaExpr}` +
      `:enable=${enableExpr}`

    return drawtext
  }
}
