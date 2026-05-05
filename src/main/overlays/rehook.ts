import { GoogleGenAI } from '@google/genai'
import { escapeDrawtext, resolveHookFont } from '../hook-title'
import { emitUsageFromResponse } from '../ai-usage'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { RehookStyle } from '@shared/types'
export type { RehookStyle }

/**
 * Full configuration for the mid-clip re-hook overlay.
 * This overlay appears at ~40–60% through each clip to reset viewer
 * attention and combat the mid-clip retention dip.
 * All timing values are in seconds.
 */
export interface RehookConfig {
  /** Whether the re-hook overlay is applied during render. */
  enabled: boolean
  /** Visual style. */
  style: RehookStyle
  /** How many seconds the re-hook text is visible (default 1.5). */
  displayDuration: number
  /** Fade-in time in seconds (default 0.2). */
  fadeIn: number
  /** Fade-out time in seconds (default 0.3). */
  fadeOut: number
  /**
   * Fraction through the clip duration to insert the re-hook (0.4–0.6).
   * The actual timestamp may shift to align with a natural word boundary
   * or pivot word. Default: 0.45.
   */
  positionFraction: number
}

/**
 * Shared visual settings inherited from the hook title overlay config.
 * Passed separately to `buildRehookFilter` so both overlays share the
 * same font size, text color, outline color, and outline width.
 */
export interface OverlayVisualSettings {
  /** Font size in pixels on the 1080×1920 canvas. */
  fontSize: number
  /** Text color in CSS hex format. */
  textColor: string
  /** Outline / border color in CSS hex format. */
  outlineColor: string
  /** Outline width in pixels. */
  outlineWidth: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Words that commonly signal a rhetorical pivot, topic transition, or
 * attention-worthy moment in speech.
 */
const PIVOT_WORDS = new Set([
  'but',
  'however',
  'actually',
  'wait',
  'here',
  'now',
  'except',
  'although',
  'though',
  'yet',
  'still',
  'suddenly',
  'then',
  'anyway',
  'look',
  'listen',
  'watch'
])

/**
 * Curated fallback phrases used when AI generation is skipped or fails.
 * Picked deterministically from `getDefaultRehookPhrase()`.
 *
 * Original generic phrases (kept as reference for AI prompt examples):
 *   "But here's the crazy part...", "Watch what happens next",
 *   "This is where it gets interesting", "Wait for it...",
 *   "Here's what nobody tells you", "The plot twist:",
 *   "But it gets better...", "This changed everything",
 *   "Nobody expected this", "And here's the kicker..."
 */
export const DEFAULT_REHOOK_PHRASES: readonly string[] = [
  "But here's why it matters...",
  "This is the part they skip...",
  "Pay attention to this next part",
  "Here's where most people get it wrong",
  "This detail changes everything...",
  "The part nobody mentions:",
  "But then this happened...",
  "Here's the actual reason:",
  "Most people miss this part",
  "And this is the real problem..."
]

// ---------------------------------------------------------------------------
// identifyRehookPoint
// ---------------------------------------------------------------------------

/**
 * Identify the optimal re-hook insertion point within a clip.
 *
 * Searches the 40–60% window of the clip for natural attention-reset
 * opportunities in this priority order:
 *   1. Rhetorical questions (word text contains '?')
 *   2. Pivot words preceded or followed by a short pause (≥0.15s / ≥0.10s)
 *   3. The longest silence gap in the window (topic transition indicator)
 *   4. Falls back to `positionFraction × clip duration`
 *
 * @param words            Word-level timestamps (absolute source video times).
 * @param clipStart        Clip start time in the source video (seconds).
 * @param clipEnd          Clip end time in the source video (seconds).
 * @param positionFraction Fraction through clip to use as default fallback.
 * @returns Absolute timestamp (seconds in source video) for re-hook insertion.
 */
export function identifyRehookPoint(
  words: { text: string; start: number; end: number }[],
  clipStart: number,
  clipEnd: number,
  positionFraction: number = 0.45
): number {
  const clipDuration = clipEnd - clipStart
  const defaultPoint = clipStart + clipDuration * positionFraction

  if (clipDuration <= 0) return defaultPoint

  const windowStart = clipStart + clipDuration * 0.40
  const windowEnd = clipStart + clipDuration * 0.60

  const windowWords = words.filter(
    (w) => w.start >= windowStart && w.end <= windowEnd
  )

  if (windowWords.length === 0) return defaultPoint

  // 1. Rhetorical questions
  for (const word of windowWords) {
    if (word.text.includes('?')) {
      return word.start
    }
  }

  // 2. Pivot words at sentence boundaries
  for (let i = 0; i < windowWords.length; i++) {
    const word = windowWords[i]
    const normalized = word.text.toLowerCase().replace(/[^a-z']/g, '')

    if (PIVOT_WORDS.has(normalized)) {
      const prevWord = i > 0 ? windowWords[i - 1] : null
      const nextWord = i < windowWords.length - 1 ? windowWords[i + 1] : null
      const pauseBefore = prevWord ? word.start - prevWord.end : 0
      const pauseAfter = nextWord ? nextWord.start - word.end : 0

      if (pauseBefore >= 0.15 || pauseAfter >= 0.10) {
        return word.start
      }
    }
  }

  // 3. Longest silence gap in the window (topic transition)
  let maxGap = 0
  let bestPoint = defaultPoint

  for (let i = 0; i < windowWords.length - 1; i++) {
    const gap = windowWords[i + 1].start - windowWords[i].end
    if (gap > maxGap) {
      maxGap = gap
      bestPoint = windowWords[i + 1].start
    }
  }

  if (maxGap >= 0.20) return bestPoint

  return defaultPoint
}

// ---------------------------------------------------------------------------
// generateRehookText
// ---------------------------------------------------------------------------

/**
 * Generate contextual re-hook / pattern interrupt text using Gemini AI.
 *
 * Returns 3–6 words that create anticipation for what follows in the clip.
 * If the API key is empty or the call fails, falls back to a deterministic
 * phrase chosen from `DEFAULT_REHOOK_PHRASES` via `getDefaultRehookPhrase`.
 *
 * @param apiKey     Gemini API key.
 * @param transcript Full clip transcript text.
 * @param clipStart  Clip start time (seconds) — used in prompt context.
 * @param clipEnd    Clip end time (seconds).
 * @returns Re-hook overlay text string.
 */
export async function generateRehookText(
  apiKey: string,
  transcript: string,
  clipStart: number,
  clipEnd: number,
  videoSummary?: string,
  keyTopics?: string[]
): Promise<string> {
  if (!apiKey) return getDefaultRehookPhrase(transcript)

  try {
    const ai = new GoogleGenAI({ apiKey })

    const clipDuration = Math.round(clipEnd - clipStart)

    let contextBlock = ''
    if (videoSummary || (keyTopics && keyTopics.length > 0)) {
      const parts: string[] = []
      if (videoSummary) parts.push(`Video context: ${videoSummary}`)
      if (keyTopics && keyTopics.length > 0) parts.push(`Key topics: ${keyTopics.join(', ')}`)
      contextBlock = parts.join('\n') + '\n\n'
    }

    const prompt =
      `You are an expert short-form video editor specializing in viewer retention.

Your task: write a "re-hook" text overlay that appears mid-way through a ${clipDuration}-second clip. 80%+ viewers watch with sound off — the re-hook must work silently to add context and make the viewer personally feel why this matters to THEM.

Re-hooks add context and tell viewers WHY they should keep watching. They are NOT generic filler.

GOOD re-hooks (content-specific):
- "But here's why it matters..."
- "This is the part they skip..."
- "Here's where most get it wrong"
- "The part nobody mentions:"
- "But then this happened..."
- "Here's the actual reason:"

GENERIC re-hooks to AVOID (these are the old style — do NOT produce these):
- "But here's the crazy part..."
- "Watch what happens next"
- "Wait for it..."
- "Nobody expected this"

Rules:
- 5 words or LESS — no exceptions
- Add CONTEXT — hint at what's coming or why it matters
- If possible, use a specific word or detail from the second half of the transcript
- Feel organic, not like an advertisement
- No hashtags, no emojis; only punctuation allowed: ellipsis (...) or colon (:)

${contextBlock}Transcript: "${transcript.slice(0, 600)}"

Return ONLY the re-hook text, nothing else.`

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    })
    emitUsageFromResponse('rehook', 'gemini-2.5-flash', result)
    const raw = (result.text ?? '').trim()
    const firstLine = raw.split('\n')[0].replace(/^["']|["']$/g, '').trim()
    return firstLine.length > 0 ? firstLine : getDefaultRehookPhrase(transcript)
  } catch {
    return getDefaultRehookPhrase(transcript)
  }
}

/**
 * Pick a default re-hook phrase deterministically from `DEFAULT_REHOOK_PHRASES`.
 * Uses a simple character-code hash of the seed string to vary the choice.
 */
export function getDefaultRehookPhrase(seed: string): string {
  let hash = 0
  for (let i = 0; i < Math.min(seed.length, 120); i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return DEFAULT_REHOOK_PHRASES[hash % DEFAULT_REHOOK_PHRASES.length]
}

// ---------------------------------------------------------------------------
// Font resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a font path for the re-hook overlay.
 * Delegates to the same resolution logic used by the hook title overlay,
 * so both features use a consistent font face.
 */
export { resolveHookFont as resolveRehookFont }

// ---------------------------------------------------------------------------
// Hex → FFmpeg color helper
// ---------------------------------------------------------------------------

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
// buildRehookFilter
// ---------------------------------------------------------------------------

/**
 * Build an FFmpeg drawtext filter string for the re-hook / pattern interrupt
 * overlay.
 *
 * Unlike the hook title (which appears at t=0), this overlay appears at
 * `appearTime` seconds into the clip to reset viewer attention mid-clip.
 * The overlay is placed in the middle band of the frame (~y=900), well clear
 * of both the hook title zone (top) and caption zone (bottom).
 *
 * @param text          The re-hook text (escaped automatically).
 * @param config        Re-hook display configuration (timing + style).
 * @param visuals       Shared visual settings (fontSize, textColor, outlineColor,
 *                      outlineWidth) — typically inherited from the hook title config.
 * @param appearTime    When to show the overlay (seconds from clip start, 0-based).
 * @param fontFilePath  Absolute path to a TTF/OTF font file, or null to use
 *                      the system fontconfig name "Sans Bold".
 * @param safeZone      Optional placement hint. When provided, centers the text
 *                      vertically within the safe zone's middle band. When
 *                      omitted, defaults to y=900 on the 1080×1920 canvas.
 * @returns A comma-separated FFmpeg filter chain string for appending to -vf.
 */
export function buildRehookFilter(
  text: string,
  config: RehookConfig,
  visuals: OverlayVisualSettings,
  appearTime: number,
  fontFilePath: string | null,
  safeZone?: { y: number; height: number }
): string {
  const safeText = escapeDrawtext(text)

  const {
    style,
    displayDuration,
    fadeIn,
    fadeOut
  } = config

  const { fontSize, textColor, outlineColor, outlineWidth } = visuals

  const appearEnd = appearTime + displayDuration
  const fadeOutStart = appearEnd - fadeOut

  // Enable expression: only show during [appearTime, appearEnd]
  // Uses infix comparison operators to avoid commas — escaped commas (\,)
  // break some Windows FFmpeg builds, causing "Error opening output file".
  const AT  = appearTime.toFixed(3)
  const AE  = appearEnd.toFixed(3)
  const enableExpr = `(t>=${AT})*(t<=${AE})`

  // Alpha: fade in → hold → fade out, all relative to appearTime
  // Piecewise multiplication with infix operators avoids commas.
  const tRel = `(t-${AT})`
  const rFI  = fadeIn.toFixed(3)
  const rFOS = fadeOutStart.toFixed(3)
  const rFO  = fadeOut.toFixed(3)
  const alphaExpr =
    `(${tRel}<${rFI})*${tRel}/${rFI}` +
    `+(${tRel}>=${rFI})*(t<=${rFOS})*1` +
    `+(t>${rFOS})*(${AE}-t)/${rFO}`

  // Font spec — same font file as hook title, different size
  // On Windows, FFmpeg requires colons in paths to be escaped as \:
  // (single backslash + colon). This escapes the colon for FFmpeg's filter parser.
  const fontSpec = fontFilePath
    ? `fontfile='${fontFilePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")}':fontsize=${fontSize}`
    : `font='Sans Bold':fontsize=${fontSize}`

  // Vertical position: middle of the frame, distinct from:
  //   • Hook title: y≈220 (near top)
  //   • Captions:   y≈1600+ (near bottom)
  // When a safeZone is provided, center within its middle band.
  let yPos = 900
  if (safeZone) {
    // Place at the vertical midpoint of the safe zone
    yPos = Math.round(safeZone.y + safeZone.height / 2 - fontSize / 2)
  }

  const fgColor = hexToFFmpegColor(textColor, 1.0)
  const bgColor = hexToFFmpegColor(outlineColor, 1.0)
  const shadowColor = hexToFFmpegColor(outlineColor, 0.7)

  if (style === 'bar') {
    // Semi-transparent dark bar behind centered text (most readable style)
    const barHeight = fontSize + 44
    const barY = yPos - 22

    const drawbox =
      `drawbox=x=0:y=${barY}:w=iw:h=${barHeight}` +
      `:color=black@0.70:t=fill` +
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

  } else if (style === 'slide-up') {
    // Text slides up 30px while fading in, then holds position
    const yStart = yPos + 30
    // Rewritten without commas for Windows FFmpeg compatibility.
    // if(tRel < FI, yStart+(yPos-yStart)*tRel/FI, yPos)
    // → (tRel<FI) * (yStart+delta*tRel/FI) + (tRel>=FI) * yPos
    const yExpr =
      `(${tRel}<${rFI})*(${yStart}+(${yPos}-${yStart})*${tRel}/${rFI})` +
      `+(${tRel}>=${rFI})*${yPos}`

    const drawtext =
      `drawtext=${fontSpec}` +
      `:text='${safeText}'` +
      `:fontcolor=${fgColor}` +
      `:x=(w-text_w)/2` +
      `:y=${yExpr}` +
      `:borderw=${outlineWidth}` +
      `:bordercolor=${bgColor}` +
      `:shadowx=3:shadowy=3:shadowcolor=${shadowColor}` +
      `:alpha=${alphaExpr}` +
      `:enable=${enableExpr}`

    return drawtext

  } else {
    // text-only: centered text with outline + drop shadow, no background bar
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
  }
}
