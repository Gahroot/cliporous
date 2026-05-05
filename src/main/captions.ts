import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { tmpdir } from 'os'

// ---------------------------------------------------------------------------
// Types (canonical definitions live in @shared/types)
// ---------------------------------------------------------------------------

import type { CaptionAnimation } from '@shared/types'
export type { CaptionAnimation }

export interface CaptionStyleInput {
  fontName: string
  fontSize: number // fraction of frame height (e.g. 0.07)
  primaryColor: string // hex e.g. '#FFFFFF'
  highlightColor: string // hex e.g. '#00FF00'
  outlineColor: string // hex e.g. '#000000'
  backColor: string // hex with optional alpha e.g. '#80000000'
  outline: number
  shadow: number
  borderStyle: number // 1 = outline+shadow, 3 = opaque box
  wordsPerLine: number
  animation: CaptionAnimation
  /** Color for emphasis-level words (bigger + this color). Defaults to highlightColor. */
  emphasisColor?: string
  /** Color for supersize-level words (huge + bold + this color). Defaults to '#FFD700' gold. */
  supersizeColor?: string

  // ---------------------------------------------------------------------------
  // Style-driven emphasis configuration (from CaptionStyleSchema)
  // When present, these override the hardcoded defaults.
  // ---------------------------------------------------------------------------

  /** Scale factor for emphasis words relative to base font size (e.g. 1.25). Default: 1.25 */
  emphasisScale?: number
  /** Font weight for emphasis words (100–900). Omit to inherit base style. */
  emphasisFontWeight?: number
  /** Scale factor for supersize words relative to base font size (e.g. 1.6). Default: 1.6 */
  supersizeScale?: number
  /** Font weight for supersize words (100–900). Default: 800 (extra-bold). */
  supersizeFontWeight?: number

  /** Box emphasis: opaque rectangle behind the word. */
  boxColor?: string       // box fill color hex. Falls back to highlightColor.
  boxOpacity?: number     // 0–1. Default: 0.85
  boxPadding?: number     // pixels. Default: 10
  boxTextColor?: string   // text color on box words. Falls back to primaryColor.
  boxFontWeight?: number  // font weight for box words. Omit to inherit.

  // ---------------------------------------------------------------------------
  // Directional drop shadow (Photoshop-style).
  //
  // When shadowDistance > 0, a drop shadow is rendered behind every caption
  // line. The shadow is offset by `shadowDistance` pixels at `shadowAngle`
  // degrees (0° = right, 90° = down — same convention as CSS), blurred by
  // `shadowBlur` pixels, and composited with `shadowOpacity` alpha. These
  // take precedence over the legacy scalar `shadow` field when set.
  // ---------------------------------------------------------------------------

  /** Shadow offset distance in pixels. 0 or undefined disables directional shadow. */
  shadowDistance?: number
  /** Shadow angle in degrees. 0 = right, 90 = down. */
  shadowAngle?: number
  /**
   * Shadow softness on a 0–100 slider (matches design tools like Canva/Figma).
   * Internally mapped to ASS `\blur` pixels at a 1:0.25 ratio, so 100 ≈ 25px
   * of Gaussian radius.
   */
  shadowSoftness?: number
  /** 0–1 opacity of the shadow. Default: 1.0 (fully opaque). */
  shadowOpacity?: number
  /** Shadow color hex. Default: '#000000'. */
  shadowColor?: string
}

export interface WordInput {
  text: string
  start: number // seconds (relative to clip start)
  end: number // seconds (relative to clip start)
  /** Emphasis level from word-emphasis analysis. Defaults to 'normal'. */
  emphasis?: 'normal' | 'emphasis' | 'supersize' | 'box'
}

// ---------------------------------------------------------------------------
// Per-shot caption style override
// ---------------------------------------------------------------------------

/**
 * Caption style override for a specific time range within a clip.
 * When building an ASS document with per-shot variation, each ShotCaptionOverride
 * defines a different animation or visual treatment for its time window.
 */
export interface ShotCaptionOverride {
  /** Clip-relative start time in seconds. */
  startTime: number
  /** Clip-relative end time in seconds. */
  endTime: number
  /** Caption style to apply during this time range. */
  style: CaptionStyleInput
}

// ---------------------------------------------------------------------------
// Default canvas constants — 9:16 vertical frame
// ---------------------------------------------------------------------------

const DEFAULT_FRAME_WIDTH = 1080
const DEFAULT_FRAME_HEIGHT = 1920

// ---------------------------------------------------------------------------
// Color conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a CSS hex color (with optional alpha) to ASS &HAABBGGRR format.
 * Accepts: '#RRGGBB', '#AARRGGBB', '#RGB'
 */
function hexToASS(hex: string): string {
  let r: number, g: number, b: number, a: number

  const h = hex.replace('#', '')

  if (h.length === 8) {
    // AARRGGBB
    a = parseInt(h.slice(0, 2), 16)
    r = parseInt(h.slice(2, 4), 16)
    g = parseInt(h.slice(4, 6), 16)
    b = parseInt(h.slice(6, 8), 16)
  } else if (h.length === 6) {
    a = 0
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  } else if (h.length === 3) {
    a = 0
    r = parseInt(h[0] + h[0], 16)
    g = parseInt(h[1] + h[1], 16)
    b = parseInt(h[2] + h[2], 16)
  } else {
    return '&H00FFFFFF'
  }

  const pad = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0')
  // ASS format: &HAABBGGRR (alpha, blue, green, red)
  return `&H${pad(a)}${pad(b)}${pad(g)}${pad(r)}`
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/** Format seconds to ASS timestamp: H:MM:SS.CC (centiseconds) */
function formatASSTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.round((s % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Emphasis override helpers
// ---------------------------------------------------------------------------

/** Default scale multipliers — used when style doesn't specify its own. */
const DEFAULT_EMPHASIS_SCALE = 1.25
const DEFAULT_SUPERSIZE_SCALE = 1.6

/** Resolve the effective scale factors from a style, falling back to defaults. */
function resolveEmphasisScale(style: CaptionStyleInput): number {
  return style.emphasisScale ?? DEFAULT_EMPHASIS_SCALE
}
function resolveSupersizeScale(style: CaptionStyleInput): number {
  return style.supersizeScale ?? DEFAULT_SUPERSIZE_SCALE
}

/**
 * Clamp a scaled font size so a single word fits within the frame.
 * ASS WrapStyle=0 breaks on spaces, so a standalone scaled word with no
 * spaces can overflow horizontally. Estimate its rendered width using an
 * average bold-sans glyph ratio, and scale the size down if it would exceed
 * the available width (frame minus MarginL/MarginR defaults of 40px each).
 */
const BOLD_CHAR_WIDTH_RATIO = 0.62
const CAPTION_HORIZONTAL_MARGIN = 40
const CAPTION_SAFETY_PAD = 20

function capFontSizeToFrame(text: string, size: number, frameWidth: number): number {
  const chars = text.length
  if (chars === 0) return size
  const available =
    frameWidth - CAPTION_HORIZONTAL_MARGIN * 2 - CAPTION_SAFETY_PAD
  const estimated = chars * size * BOLD_CHAR_WIDTH_RATIO
  if (estimated <= available) return size
  return Math.max(1, Math.floor(available / (chars * BOLD_CHAR_WIDTH_RATIO)))
}

/**
 * Build ASS inline override tags for a word in one of four visual states:
 *   1. Normal — no overrides (empty prefix/suffix)
 *   2. Emphasis — style-defined scale, highlight color, optional bold
 *   3. Supersize — dramatic scale, accent color, bold
 *   4. Box — opaque colored rectangle behind the word (thick \3c + \bord + \shad0)
 *
 * Returns an empty string for normal words. A \r tag resets overrides after
 * the word (appended by the caller).
 */
function buildEmphasisTags(
  word: WordInput,
  style: CaptionStyleInput,
  baseFontSize: number,
  frameWidth: number = DEFAULT_FRAME_WIDTH
): { prefix: string; suffix: string } {
  const level = word.emphasis ?? 'normal'
  if (level === 'normal') return { prefix: '', suffix: '' }

  if (level === 'supersize') {
    const scale = resolveSupersizeScale(style)
    const size = capFontSizeToFrame(word.text, Math.round(baseFontSize * scale), frameWidth)
    const color = hexToASS(style.supersizeColor ?? '#FFD700')
    const weight = style.supersizeFontWeight ?? 800
    // \b1 for bold; if weight > 400 we always set bold
    const boldTag = weight > 400 ? '\\b1' : ''
    // Outline matches the fill so the border reads as extra weight, not as
    // a contrasting stroke around a coloured glyph.
    return {
      prefix: `\\fs${size}\\1c${color}\\3c${color}${boldTag}`,
      suffix: `\\r`
    }
  }

  if (level === 'box') {
    const boxColor = hexToASS(style.boxColor ?? style.highlightColor)
    const textColor = hexToASS(style.boxTextColor ?? style.primaryColor)
    const padding = style.boxPadding ?? 10
    const opacity = style.boxOpacity ?? 0.85
    // Convert 0–1 opacity to ASS alpha (0=opaque, FF=transparent)
    const alpha = Math.round((1 - opacity) * 255)
    const alphaPad = alpha.toString(16).toUpperCase().padStart(2, '0')
    const boldTag = style.boxFontWeight && style.boxFontWeight > 400 ? '\\b1' : ''
    // Thick outline in box color acts as opaque rectangle behind the word.
    // \3c = outline color (box fill), \bord = padding, \shad0 = no shadow leak.
    // \4a = shadow alpha fully transparent to avoid colored edges.
    return {
      prefix: `\\3c${boxColor}\\3a&H${alphaPad}&\\bord${padding}\\xbord${padding + 4}\\ybord${padding}\\shad0\\4a&HFF&\\1c${textColor}${boldTag}`,
      suffix: `\\r`
    }
  }

  // emphasis
  const scale = resolveEmphasisScale(style)
  const size = capFontSizeToFrame(word.text, Math.round(baseFontSize * scale), frameWidth)
  const color = hexToASS(style.emphasisColor ?? style.highlightColor)
  const weight = style.emphasisFontWeight
  const boldTag = weight && weight > 400 ? '\\b1' : ''
  // Outline matches the fill so the border reads as extra weight, not as
  // a contrasting stroke around a coloured glyph.
  return {
    prefix: `\\fs${size}\\1c${color}\\3c${color}${boldTag}`,
    suffix: `\\r`
  }
}

// ---------------------------------------------------------------------------
// Word grouping
// ---------------------------------------------------------------------------

interface WordGroup {
  words: WordInput[]
  start: number
  end: number
  text: string
}

function groupWords(words: WordInput[], wordsPerLine: number): WordGroup[] {
  const groups: WordGroup[] = []
  for (let i = 0; i < words.length; i += wordsPerLine) {
    const chunk = words.slice(i, i + wordsPerLine)
    groups.push({
      words: chunk,
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map((w) => w.text).join(' ')
    })
  }
  return groups
}

// ---------------------------------------------------------------------------
// ASS dialogue line builders per animation type
// ---------------------------------------------------------------------------

/**
 * Karaoke fill: uses \kf tags so each word fills with the highlight color
 * over its duration. The line starts in primaryColor and each word transitions
 * to highlightColor. Emphasis/supersize words get larger font + distinct color.
 */
function buildKaraokeLine(
  group: WordGroup,
  style: CaptionStyleInput,
  baseFontSize: number
): string {
  const start = formatASSTime(group.start)
  const end = formatASSTime(group.end)

  const highlightASS = hexToASS(style.highlightColor)

  // \kf duration is in centiseconds
  const parts = group.words.map((w) => {
    const dur = Math.round((w.end - w.start) * 100)
    const emp = buildEmphasisTags(w, style, baseFontSize)
    // Emphasis prefix goes inside the override block; suffix (\r) resets after the word
    return `{\\kf${dur}${emp.prefix}}${w.text}${emp.suffix ? `{${emp.suffix}}` : ''}`
  })

  // \1c sets the "post-karaoke" color (highlight), \k fills from primary→highlight
  return `Dialogue: 0,${start},${end},Default,,0,0,0,,{\\1c${highlightASS}}${parts.join(' ')}`
}

/**
 * Word pop: each word appears at its timestamp with a brief scale-up effect.
 * We emit one dialogue event per word-group, using override blocks that
 * make words invisible until their start time, then pop in.
 * Emphasis/supersize words pop in at a larger scale and use distinct colors.
 */
function buildWordPopLines(
  group: WordGroup,
  style: CaptionStyleInput,
  baseFontSize: number
): string[] {
  const lines: string[] = []
  const highlightASS = hexToASS(style.highlightColor)
  const primaryASS = hexToASS(style.primaryColor)

  const start = formatASSTime(group.start)
  const end = formatASSTime(group.end)

  // Build a single line where each word pops in at its timestamp
  // Words before their time are transparent, then become visible with a scale animation
  const parts = group.words.map((w, idx) => {
    const wordStart = Math.round((w.start - group.start) * 100)
    const wordDur = Math.round((w.end - w.start) * 100)
    const isLast = idx === group.words.length - 1

    const emp = buildEmphasisTags(w, style, baseFontSize)
    const level = w.emphasis ?? 'normal'

    // Emphasis/supersize/box words pop in bigger and use their own color instead of highlight
    const popScaleX = level === 'supersize' ? 130 : (level === 'emphasis' || level === 'box') ? 120 : 110
    const popScaleY = popScaleX
    const activeColor = level !== 'normal' ? '' : `\\t(${wordStart},${wordStart + wordDur},\\1c${highlightASS})`
    const resetColor = level !== 'normal' ? '' : `\\t(${wordStart + wordDur},${wordStart + wordDur},\\1c${primaryASS})`

    // Use \t for timed transform: word starts transparent, scales up, then settles
    // \alpha&HFF& = fully transparent, \alpha&H00& = fully visible
    const popDuration = Math.min(8, wordDur) // 80ms pop-in
    const suffix = isLast ? '' : ' '

    return (
      `{${emp.prefix}\\alpha&HFF&\\t(${wordStart},${wordStart + popDuration},\\alpha&H00&\\fscx${popScaleX}\\fscy${popScaleY})` +
      `\\t(${wordStart + popDuration},${wordStart + popDuration + 5},\\fscx100\\fscy100)` +
      `${activeColor}` +
      `${resetColor}}` +
      `${w.text}${emp.suffix ? `{${emp.suffix}}` : ''}${suffix}`
    )
  })

  lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${parts.join('')}`)
  return lines
}

/**
 * Fade-in: each word fades in sequentially at its timestamp.
 * Emphasis/supersize words fade in at a larger size and distinct color.
 */
function buildFadeInLines(
  group: WordGroup,
  style: CaptionStyleInput,
  baseFontSize: number
): string[] {
  const start = formatASSTime(group.start)
  const end = formatASSTime(group.end)

  const parts = group.words.map((w, idx) => {
    const wordStart = Math.round((w.start - group.start) * 100)
    const fadeDur = Math.min(15, Math.round((w.end - w.start) * 100))
    const isLast = idx === group.words.length - 1
    const suffix = isLast ? '' : ' '

    const emp = buildEmphasisTags(w, style, baseFontSize)

    return (
      `{${emp.prefix}\\alpha&HFF&\\t(${wordStart},${wordStart + fadeDur},\\alpha&H00&)}` +
      `${w.text}${emp.suffix ? `{${emp.suffix}}` : ''}${suffix}`
    )
  })

  return [`Dialogue: 0,${start},${end},Default,,0,0,0,,${parts.join('')}`]
}

/**
 * Glow: each word gets a colored glow (border) when it's the active word.
 * Emphasis/supersize words get a larger font and distinct glow color.
 */
function buildGlowLines(
  group: WordGroup,
  style: CaptionStyleInput,
  baseFontSize: number
): string[] {
  const start = formatASSTime(group.start)
  const end = formatASSTime(group.end)

  const highlightASS = hexToASS(style.highlightColor)
  const outlineASS = hexToASS(style.outlineColor)

  const parts = group.words.map((w, idx) => {
    const wordStart = Math.round((w.start - group.start) * 100)
    const wordEnd = Math.round((w.end - group.start) * 100)
    const isLast = idx === group.words.length - 1
    const suffix = isLast ? '' : ' '

    const emp = buildEmphasisTags(w, style, baseFontSize)
    const level = w.emphasis ?? 'normal'

    // Emphasis/supersize/box words get a thicker glow border
    const glowBord = level === 'supersize'
      ? style.outline + 5
      : (level === 'emphasis' || level === 'box')
        ? style.outline + 3
        : style.outline + 2

    // Switch outline/border color to highlight during the word's active time
    return (
      `{${emp.prefix}\\3c${outlineASS}` +
      `\\t(${wordStart},${wordStart},\\3c${highlightASS}\\bord${glowBord})` +
      `\\t(${wordEnd},${wordEnd},\\3c${outlineASS}\\bord${style.outline})}` +
      `${w.text}${emp.suffix ? `{${emp.suffix}}` : ''}${suffix}`
    )
  })

  return [`Dialogue: 0,${start},${end},Default,,0,0,0,,${parts.join('')}`]
}

/**
 * Word box (Clarity): each word gets its own positioned dialogue event with
 * BorderStyle=3 so every word sits on an individual opaque background box.
 * Emphasis/supersize words receive a distinct box color via \3c override.
 * Words pop in at their timestamp with a brief scale-up animation.
 *
 * In BorderStyle=3 mode:
 *   - OutlineColour (\3c) = box fill color
 *   - Outline (\bord)     = box padding around the text
 *   - BackColour (\4c)    = box drop-shadow color (we keep transparent)
 */
function buildWordBoxLines(
  group: WordGroup,
  style: CaptionStyleInput,
  baseFontSize: number,
  frameWidth: number,
  frameHeight: number,
  marginV: number
): string[] {
  const lines: string[] = []
  const primaryASS = hexToASS(style.primaryColor)

  // Box colors: OutlineColour is the box fill in BorderStyle=3
  const normalBoxASS = hexToASS(style.outlineColor)
  const emphasisBoxASS = hexToASS(style.emphasisColor ?? style.highlightColor)
  const supersizeBoxASS = hexToASS(style.supersizeColor ?? '#FFD700')
  const boxEmphasisBoxASS = hexToASS(style.boxColor ?? style.highlightColor)

  const start = formatASSTime(group.start)
  const end = formatASSTime(group.end)

  // --- Estimate word widths for horizontal layout ---
  // Average character width ratio for bold sans-serif at a given font size.
  const AVG_CHAR_WIDTH_RATIO = 0.58
  const boxPadding = Math.max(8, Math.round(baseFontSize * 0.18))
  const wordGap = Math.round(baseFontSize * 0.18)

  interface WordMetric {
    word: WordInput
    level: 'normal' | 'emphasis' | 'supersize' | 'box'
    effectiveSize: number
    textWidth: number
    boxWidth: number
  }

  const empScale = resolveEmphasisScale(style)
  const supScale = resolveSupersizeScale(style)

  const metrics: WordMetric[] = group.words.map((w) => {
    const level = w.emphasis ?? 'normal'
    const scale =
      level === 'supersize'
        ? supScale
        : level === 'emphasis' || level === 'box'
          ? empScale
          : 1
    const effectiveSize = Math.round(baseFontSize * scale)
    const charWidth = effectiveSize * AVG_CHAR_WIDTH_RATIO
    const textWidth = w.text.length * charWidth
    const boxWidth = textWidth + boxPadding * 2
    return { word: w, level, effectiveSize, textWidth, boxWidth }
  })

  // Total width of all boxes + gaps
  const totalRowWidth =
    metrics.reduce((sum, m) => sum + m.boxWidth, 0) +
    Math.max(0, metrics.length - 1) * wordGap

  // Start X so the row is centered horizontally
  let curX = (frameWidth - totalRowWidth) / 2

  // Y position: bottom-up from frame edge (same semantics as ASS marginV)
  const yPos = frameHeight - marginV

  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i]
    const w = m.word
    const centerX = Math.round(curX + m.boxWidth / 2)

    // Per-word box color
    const boxColor =
      m.level === 'supersize'
        ? supersizeBoxASS
        : m.level === 'box'
          ? boxEmphasisBoxASS
          : m.level === 'emphasis'
            ? emphasisBoxASS
            : normalBoxASS

    // Word timing relative to group start (centiseconds)
    const wordStartCs = Math.round((w.start - group.start) * 100)
    const wordDurCs = Math.round((w.end - w.start) * 100)
    const popDur = Math.min(8, wordDurCs) // 80ms pop-in

    const overrides: string[] = [
      `\\an5`,
      `\\pos(${centerX},${yPos})`,
      `\\1c${primaryASS}`,
      `\\3c${boxColor}`,
      `\\4c&H00000000`,
      `\\bord${boxPadding}`,
      `\\shad0`
    ]

    // Font size override for emphasis/supersize/box
    if (m.level === 'emphasis') {
      overrides.push(`\\fs${m.effectiveSize}`)
      if (style.emphasisFontWeight && style.emphasisFontWeight > 400) overrides.push(`\\b1`)
    } else if (m.level === 'supersize') {
      const supWeight = style.supersizeFontWeight ?? 800
      overrides.push(`\\fs${m.effectiveSize}`)
      if (supWeight > 400) overrides.push(`\\b1`)
    } else if (m.level === 'box') {
      overrides.push(`\\fs${m.effectiveSize}`)
      if (style.boxFontWeight && style.boxFontWeight > 400) overrides.push(`\\b1`)
      // Override text color for box words if specified
      if (style.boxTextColor) overrides.push(`\\1c${hexToASS(style.boxTextColor)}`)
    }

    // Pop-in animation: invisible → scale-up → settle
    overrides.push(
      `\\alpha&HFF&`,
      `\\t(${wordStartCs},${wordStartCs + popDur},\\alpha&H00&\\fscx108\\fscy108)`,
      `\\t(${wordStartCs + popDur},${wordStartCs + popDur + 5},\\fscx100\\fscy100)`
    )

    lines.push(
      `Dialogue: 0,${start},${end},WordBox,,0,0,0,,{${overrides.join('')}}${w.text}`
    )

    curX += m.boxWidth + wordGap
  }

  return lines
}

/**
 * Elastic bounce: each word starts invisible and oversized, then snaps in with
 * a playful spring overshoot — like it's tossed onto the screen and bounces
 * into place. Emphasis words bounce harder (bigger initial scale and wider
 * oscillation), supersize words are even more dramatic.
 *
 * The elastic curve is modeled as a series of \t() keyframes:
 *   0 → t1  : invisible + oversized → visible + undershoot (shrink past 100%)
 *   t1 → t2 : undershoot → slight overshoot
 *   t2 → t3 : slight overshoot → settle at 100%
 */
function buildElasticBounceLines(
  group: WordGroup,
  style: CaptionStyleInput,
  baseFontSize: number
): string[] {
  const lines: string[] = []
  const highlightASS = hexToASS(style.highlightColor)
  const primaryASS = hexToASS(style.primaryColor)

  const start = formatASSTime(group.start)
  const end = formatASSTime(group.end)

  const parts = group.words.map((w, idx) => {
    const wordStart = Math.round((w.start - group.start) * 100)
    const wordDur = Math.round((w.end - w.start) * 100)
    const isLast = idx === group.words.length - 1

    const emp = buildEmphasisTags(w, style, baseFontSize)
    const level = w.emphasis ?? 'normal'

    // Elastic parameters per emphasis level
    // initialScale: how big the word starts (oversized, invisible)
    // undershoot:   how small it bounces past 100% on the way down
    // overshoot:    slight bounce back above 100%
    const params =
      level === 'supersize'
        ? { initial: 180, undershoot: 88, overshoot: 108, totalCs: 24 }
        : (level === 'emphasis' || level === 'box')
          ? { initial: 155, undershoot: 91, overshoot: 106, totalCs: 20 }
          : { initial: 135, undershoot: 93, overshoot: 104, totalCs: 16 }

    // Clamp total elastic duration to word duration
    const total = Math.min(params.totalCs, wordDur)

    // Phase timing (fractions of total elastic duration)
    const t1 = Math.round(total * 0.40) // snap-in phase (biggest motion)
    const t2 = Math.round(total * 0.70) // undershoot → overshoot
    const t3 = total                      // overshoot → settle

    // Color animation: highlight while active, reset after (skip for emphasis/supersize)
    const activeColor = level !== 'normal' ? '' : `\\t(${wordStart},${wordStart + wordDur},\\1c${highlightASS})`
    const resetColor = level !== 'normal' ? '' : `\\t(${wordStart + wordDur},${wordStart + wordDur},\\1c${primaryASS})`

    const suffix = isLast ? '' : ' '

    return (
      `{${emp.prefix}` +
      // Initial state: invisible + oversized
      `\\alpha&HFF&\\fscx${params.initial}\\fscy${params.initial}` +
      // Phase 1: snap in — become visible + shrink to undershoot
      `\\t(${wordStart},${wordStart + t1},\\alpha&H00&\\fscx${params.undershoot}\\fscy${params.undershoot})` +
      // Phase 2: bounce up from undershoot to slight overshoot
      `\\t(${wordStart + t1},${wordStart + t2},\\fscx${params.overshoot}\\fscy${params.overshoot})` +
      // Phase 3: settle to 100%
      `\\t(${wordStart + t2},${wordStart + t3},\\fscx100\\fscy100)` +
      `${activeColor}` +
      `${resetColor}}` +
      `${w.text}${emp.suffix ? `{${emp.suffix}}` : ''}${suffix}`
    )
  })

  lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${parts.join('')}`)
  return lines
}

/**
 * Typewriter: characters appear one at a time, left to right, like a subtitle
 * machine printing in real time. Each character's reveal timing is derived from
 * its parent word's duration divided by the word's character count, so fast
 * speech types faster and slow speech types slower.
 *
 * Implementation: every character starts fully transparent (\alpha&HFF&) and
 * becomes visible at its precise centisecond via an instant \t() transform.
 * Emphasis/supersize words keep their enlarged font and color overrides.
 */
function buildTypewriterLines(
  group: WordGroup,
  style: CaptionStyleInput,
  baseFontSize: number
): string[] {
  const start = formatASSTime(group.start)
  const end = formatASSTime(group.end)

  const charBlocks: string[] = []

  for (let wIdx = 0; wIdx < group.words.length; wIdx++) {
    const w = group.words[wIdx]
    const emp = buildEmphasisTags(w, style, baseFontSize)

    const wordStartCs = Math.round((w.start - group.start) * 100)
    const wordDurCs = Math.round((w.end - w.start) * 100)

    const chars = [...w.text] // spread handles multi-byte characters correctly
    const charCount = chars.length
    // Duration per character in centiseconds
    const csPerChar = charCount > 0 ? wordDurCs / charCount : wordDurCs

    for (let cIdx = 0; cIdx < charCount; cIdx++) {
      const revealCs = Math.round(wordStartCs + cIdx * csPerChar)
      // Instant reveal: \t from revealCs to revealCs flips alpha to visible
      const tags = `${emp.prefix}\\alpha&HFF&\\t(${revealCs},${revealCs},\\alpha&H00&)`
      charBlocks.push(`{${tags}}${chars[cIdx]}${emp.suffix ? `{${emp.suffix}}` : ''}`)
    }

    // Add space between words (visible immediately when first char of next word appears)
    if (wIdx < group.words.length - 1) {
      const nextWord = group.words[wIdx + 1]
      const nextStartCs = Math.round((nextWord.start - group.start) * 100)
      charBlocks.push(`{\\alpha&HFF&\\t(${nextStartCs},${nextStartCs},\\alpha&H00&)} `)
    }
  }

  return [`Dialogue: 0,${start},${end},Default,,0,0,0,,${charBlocks.join('')}`]
}

/**
 * Impact Two — two-line layout inspired by captions.ai "Impact II" / "Velocity".
 *
 * For each word group, one KEY word is pulled out and rendered absolutely MASSIVE
 * on its own line below. The remaining context words sit above it, small and
 * unassuming. The visual hierarchy is extreme and unmistakable.
 *
 * Layout (bottom-center aligned):
 *   Line 1:  {\fs<small>} context words          (e.g. 40% of base)
 *   Line 2:  {\fs<huge>}  KEY WORD               (e.g. 280% of base)
 *
 * KEY word selection priority:
 *   1. The first supersize-emphasis word in the group
 *   2. The first emphasis word in the group
 *   3. The last word in the group (natural sentence stress)
 *
 * Animation: context words fade in gently, then the key word SLAMS in with an
 * elastic overshoot (scale 140% → settle to 100%) and uses the supersizeColor.
 */
function buildImpactTwoLines(
  group: WordGroup,
  style: CaptionStyleInput,
  baseFontSize: number
): string[] {
  const primaryASS = hexToASS(style.primaryColor)
  const supersizeASS = hexToASS(style.supersizeColor ?? '#FFD700')
  const emphasisASS = hexToASS(style.emphasisColor ?? style.highlightColor)
  const outlineASS = hexToASS(style.outlineColor)

  const start = formatASSTime(group.start)
  const end = formatASSTime(group.end)

  // --- Pick the KEY word ---
  // Priority: first supersize > first box > first emphasis > last word
  let keyIdx = -1
  for (let i = 0; i < group.words.length; i++) {
    if (group.words[i].emphasis === 'supersize') { keyIdx = i; break }
  }
  if (keyIdx === -1) {
    for (let i = 0; i < group.words.length; i++) {
      if (group.words[i].emphasis === 'box') { keyIdx = i; break }
    }
  }
  if (keyIdx === -1) {
    for (let i = 0; i < group.words.length; i++) {
      if (group.words[i].emphasis === 'emphasis') { keyIdx = i; break }
    }
  }
  if (keyIdx === -1) keyIdx = group.words.length - 1

  const keyWord = group.words[keyIdx]
  const contextWords = group.words.filter((_, i) => i !== keyIdx)

  // Font sizes: context = 40% of base, key = 280% of base
  const contextSize = Math.round(baseFontSize * 0.40)
  const keySize = Math.round(baseFontSize * 2.80)

  // If there's only one word, just render it huge (no context line)
  if (group.words.length === 1) {
    const w = group.words[0]
    const wordStartCs = Math.round((w.start - group.start) * 100)
    const wordDurCs = Math.round((w.end - w.start) * 100)
    const slamDur = Math.min(10, wordDurCs)
    const settleDur = Math.min(8, wordDurCs)

    const line =
      `Dialogue: 0,${start},${end},Default,,0,0,0,,` +
      `{\\fs${keySize}\\b1\\1c${supersizeASS}\\bord${Math.round(style.outline * 1.8)}` +
      `\\alpha&HFF&\\fscx140\\fscy140` +
      `\\t(${wordStartCs},${wordStartCs + slamDur},\\alpha&H00&)` +
      `\\t(${wordStartCs + slamDur},${wordStartCs + slamDur + settleDur},0.4,\\fscx100\\fscy100)}` +
      `${w.text.toUpperCase()}`

    return [line]
  }

  // --- Build the two-line dialogue ---
  // Line 1: small context words with gentle fade-in
  // Line 2: \N + massive KEY word with elastic slam

  const contextParts = contextWords.map((w) => {
    const wordStartCs = Math.round((w.start - group.start) * 100)
    const fadeDur = Math.min(12, Math.round((w.end - w.start) * 100))
    const level = w.emphasis ?? 'normal'
    // Context words that happen to be emphasis/box get a subtle color hint
    const colorTag = (level === 'emphasis' || level === 'box') ? `\\1c${emphasisASS}` : `\\1c${primaryASS}`

    return (
      `{\\fs${contextSize}${colorTag}\\bord${Math.max(1, Math.round(style.outline * 0.5))}` +
      `\\alpha&HFF&\\t(${wordStartCs},${wordStartCs + fadeDur},\\alpha&H00&)}` +
      `${w.text}`
    )
  })

  // KEY word timing + animation
  const keyStartCs = Math.round((keyWord.start - group.start) * 100)
  const keyDurCs = Math.round((keyWord.end - keyWord.start) * 100)
  const slamDur = Math.min(10, keyDurCs)   // 100ms slam-in
  const settleDur = Math.min(8, keyDurCs)  // 80ms settle

  const keyPart =
    `{\\fs${keySize}\\b1\\1c${supersizeASS}\\3c${outlineASS}` +
    `\\bord${Math.round(style.outline * 1.8)}` +
    `\\alpha&HFF&\\fscx140\\fscy140` +
    // Slam in: invisible → visible at 140% overshoot
    `\\t(${keyStartCs},${keyStartCs + slamDur},\\alpha&H00&)` +
    // Settle: 140% → 100% with deceleration
    `\\t(${keyStartCs + slamDur},${keyStartCs + slamDur + settleDur},0.4,\\fscx100\\fscy100)}` +
    `${keyWord.text.toUpperCase()}`

  const line =
    `Dialogue: 0,${start},${end},Default,,0,0,0,,` +
    `${contextParts.join(' ')}\\N${keyPart}`

  return [line]
}

/**
 * Cascade: words flow in with a wave motion — each word starts slightly below
 * its final position and fully transparent, then floats upward and fades in.
 * Each successive word begins its animation slightly after the previous one,
 * creating a smooth ripple effect across the line like text surfacing from water.
 *
 * Uses per-word dialogue events (like word-box) with \move for vertical float
 * and \t(\alpha) for the fade. A stagger delay accumulates so each word's
 * entrance is offset from the previous one, producing the cascade/wave feel.
 *
 * Emphasis words rise from further below with a larger travel distance.
 * Supersize words rise from even further and arrive with a subtle scale settle.
 */
function buildCascadeLines(
  group: WordGroup,
  style: CaptionStyleInput,
  baseFontSize: number,
  frameWidth: number,
  frameHeight: number,
  marginV: number
): string[] {
  const lines: string[] = []
  const primaryASS = hexToASS(style.primaryColor)
  const emphasisASS = hexToASS(style.emphasisColor ?? style.highlightColor)
  const supersizeASS = hexToASS(style.supersizeColor ?? '#FFD700')
  const outlineASS = hexToASS(style.outlineColor)

  const start = formatASSTime(group.start)
  const end = formatASSTime(group.end)

  // --- Estimate word widths for horizontal layout (same approach as word-box) ---
  const AVG_CHAR_WIDTH_RATIO = 0.58
  const wordGap = Math.round(baseFontSize * 0.22)

  interface CascadeMetric {
    word: WordInput
    level: 'normal' | 'emphasis' | 'supersize' | 'box'
    effectiveSize: number
    textWidth: number
  }

  const empScale = resolveEmphasisScale(style)
  const supScale = resolveSupersizeScale(style)

  const metrics: CascadeMetric[] = group.words.map((w) => {
    const level = w.emphasis ?? 'normal'
    const scale =
      level === 'supersize'
        ? supScale
        : level === 'emphasis' || level === 'box'
          ? empScale
          : 1
    const effectiveSize = Math.round(baseFontSize * scale)
    const charWidth = effectiveSize * AVG_CHAR_WIDTH_RATIO
    const textWidth = w.text.length * charWidth
    return { word: w, level, effectiveSize, textWidth }
  })

  // Total width + gaps → center the row
  const totalRowWidth =
    metrics.reduce((sum, m) => sum + m.textWidth, 0) +
    Math.max(0, metrics.length - 1) * wordGap
  let curX = (frameWidth - totalRowWidth) / 2

  // Y position: same as default alignment (bottom with marginV)
  const finalY = frameHeight - marginV

  // Cascade parameters
  const staggerDelayCs = 6     // 60ms stagger between successive words
  const riseDistNormal = Math.round(baseFontSize * 0.35)   // how far below words start
  const riseDistEmphasis = Math.round(baseFontSize * 0.50)
  const riseDistSupersize = Math.round(baseFontSize * 0.65)
  const fadeDurNormal = 18     // 180ms fade-in
  const fadeDurEmphasis = 15   // 150ms (snappier)
  const fadeDurSupersize = 12  // 120ms (snappiest)

  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i]
    const w = m.word
    const centerX = Math.round(curX + m.textWidth / 2)

    // Per-word stagger offset (centiseconds from group start)
    const cascadeOffsetCs = i * staggerDelayCs

    // Rise distance and fade duration based on emphasis
    const riseDist =
      m.level === 'supersize'
        ? riseDistSupersize
        : (m.level === 'emphasis' || m.level === 'box')
          ? riseDistEmphasis
          : riseDistNormal
    const fadeDur =
      m.level === 'supersize'
        ? fadeDurSupersize
        : (m.level === 'emphasis' || m.level === 'box')
          ? fadeDurEmphasis
          : fadeDurNormal

    // Start position (below final) and final position
    const startY = finalY + riseDist

    // \move(x1, y1, x2, y2, t1, t2) — animate position from (x1,y1) to (x2,y2)
    // between t1 and t2 milliseconds from the dialogue start
    const moveStartMs = cascadeOffsetCs * 10
    const moveEndMs = moveStartMs + fadeDur * 10

    const overrides: string[] = [
      `\\an5`,
      `\\move(${centerX},${startY},${centerX},${finalY},${moveStartMs},${moveEndMs})`
    ]

    // Color and size overrides per emphasis level
    if (m.level === 'supersize') {
      const supWeight = style.supersizeFontWeight ?? 800
      overrides.push(
        `\\fs${m.effectiveSize}`,
        `\\1c${supersizeASS}`,
        `\\bord${Math.round(style.outline * 1.5)}`
      )
      if (supWeight > 400) overrides.push(`\\b1`)
    } else if (m.level === 'box') {
      // Box word in cascade: thick outline acts as opaque rectangle
      const boxColorASS = hexToASS(style.boxColor ?? style.highlightColor)
      const textColorASS = hexToASS(style.boxTextColor ?? style.primaryColor)
      const padding = style.boxPadding ?? 10
      overrides.push(
        `\\fs${m.effectiveSize}`,
        `\\1c${textColorASS}`,
        `\\3c${boxColorASS}`,
        `\\bord${padding}`,
        `\\xbord${padding + 4}`,
        `\\ybord${padding}`,
        `\\shad0`
      )
      if (style.boxFontWeight && style.boxFontWeight > 400) overrides.push(`\\b1`)
    } else if (m.level === 'emphasis') {
      overrides.push(
        `\\fs${m.effectiveSize}`,
        `\\1c${emphasisASS}`
      )
      if (style.emphasisFontWeight && style.emphasisFontWeight > 400) overrides.push(`\\b1`)
    } else {
      overrides.push(`\\1c${primaryASS}`)
    }

    // Fade: invisible → visible, timed to match the move
    overrides.push(
      `\\alpha&HFF&`,
      `\\t(${cascadeOffsetCs},${cascadeOffsetCs + fadeDur},\\alpha&H00&)`
    )

    // Supersize words get a subtle scale settle (start at 108%, ease to 100%)
    if (m.level === 'supersize') {
      overrides.push(
        `\\fscx108\\fscy108`,
        `\\t(${cascadeOffsetCs + fadeDur},${cascadeOffsetCs + fadeDur + 8},0.4,\\fscx100\\fscy100)`
      )
    }

    lines.push(
      `Dialogue: 0,${start},${end},Default,,0,0,0,,{${overrides.join('')}}${w.text}`
    )

    curX += m.textWidth + wordGap
  }

  return lines
}

/**
 * Captions.AI — the signature animation style.
 *
 * The contrast between word types is what defines this look:
 *   • Normal words: gentle fade-in (alpha ramp over ~150ms), stay at 100% scale.
 *   • Emphasis words: POP — snap to visible at 130% scale, fast settle to 100%.
 *     Uses the emphasisColor, bold weight, and a slight blur-to-sharp transition.
 *   • Supersize words: MASSIVE — appear instantly at 220% scale, settle to 200%
 *     and HOLD there. Standout color (supersizeColor), extra-bold, thick outline.
 *
 * The quiet gentleness of normal words makes the emphasis pops feel explosive.
 */
function buildCaptionsAILines(
  group: WordGroup,
  style: CaptionStyleInput,
  baseFontSize: number,
  frameWidth: number = DEFAULT_FRAME_WIDTH
): string[] {
  const primaryASS = hexToASS(style.primaryColor)
  const emphasisASS = hexToASS(style.emphasisColor ?? style.highlightColor)
  const supersizeASS = hexToASS(style.supersizeColor ?? '#FFD700')

  const start = formatASSTime(group.start)
  const end = formatASSTime(group.end)

  const parts = group.words.map((w, idx) => {
    const wordStartCs = Math.round((w.start - group.start) * 100)
    const wordDurCs = Math.round((w.end - w.start) * 100)
    const isLast = idx === group.words.length - 1
    const suffix = isLast ? '' : ' '
    const level = w.emphasis ?? 'normal'

    if (level === 'supersize') {
      // SUPERSIZE: larger + standout color, pop-in then settle to rest size.
      // The scaled font size already provides the upscale — we don't also
      // hold \fscx at 200% (that stacked to 3.2× base and pushed long words
      // off-screen). The snap overshoots briefly, then settles to 100%.
      const supScale = resolveSupersizeScale(style)
      const bigSize = capFontSizeToFrame(
        w.text,
        Math.round(baseFontSize * supScale),
        frameWidth
      )
      const snapScale = 130
      const holdScale = 100
      const snapDur = Math.min(6, wordDurCs) // 60ms snap-in
      const settleDur = Math.min(10, wordDurCs) // 100ms settle
      const supWeight = style.supersizeFontWeight ?? 800
      const supBold = supWeight > 400 ? '\\b1' : ''

      return (
        // \3c matches the fill so the outline reads as extra weight on the
        // coloured glyph rather than a contrasting white stroke.
        `{\\fs${bigSize}${supBold}\\1c${supersizeASS}\\3c${supersizeASS}\\bord${Math.round(style.outline * 1.5)}` +
        `\\alpha&HFF&\\fscx${snapScale}\\fscy${snapScale}` +
        // Snap to visible at overshoot scale
        `\\t(${wordStartCs},${wordStartCs + snapDur},\\alpha&H00&)` +
        // Settle from 130% → 100% with deceleration
        `\\t(${wordStartCs + snapDur},${wordStartCs + snapDur + settleDur},0.4,\\fscx${holdScale}\\fscy${holdScale})}` +
        `${w.text}{\\r}${suffix}`
      )
    }

    if (level === 'emphasis') {
      // EMPHASIS: pop — snap to visible at 130%, fast settle to 100%.
      const empSize = capFontSizeToFrame(
        w.text,
        Math.round(baseFontSize * resolveEmphasisScale(style)),
        frameWidth
      )
      const popScale = 130
      const snapDur = Math.min(4, wordDurCs) // 40ms instant snap
      const settleDur = Math.min(10, wordDurCs) // 100ms spring settle
      const empBold = style.emphasisFontWeight && style.emphasisFontWeight > 400 ? '\\b1' : '\\b1'

      return (
        // \3c matches the fill (see supersize comment above).
        `{\\fs${empSize}\\1c${emphasisASS}\\3c${emphasisASS}${empBold}` +
        `\\alpha&HFF&\\fscx${popScale}\\fscy${popScale}` +
        // Instant snap to visible
        `\\t(${wordStartCs},${wordStartCs + snapDur},\\alpha&H00&)` +
        // Spring settle: overshoot → 95% → 100%
        `\\t(${wordStartCs + snapDur},${wordStartCs + snapDur + Math.round(settleDur * 0.6)},\\fscx95\\fscy95)` +
        `\\t(${wordStartCs + snapDur + Math.round(settleDur * 0.6)},${wordStartCs + snapDur + settleDur},\\fscx100\\fscy100)}` +
        `${w.text}{\\r}${suffix}`
      )
    }

    if (level === 'box') {
      // BOX: word on opaque colored rectangle — pop in like emphasis.
      const emp = buildEmphasisTags(w, style, baseFontSize, frameWidth)
      const snapDur = Math.min(4, wordDurCs)
      const settleDur = Math.min(10, wordDurCs)
      const popScale = 115

      return (
        `{${emp.prefix}` +
        `\\alpha&HFF&\\fscx${popScale}\\fscy${popScale}` +
        `\\t(${wordStartCs},${wordStartCs + snapDur},\\alpha&H00&)` +
        `\\t(${wordStartCs + snapDur},${wordStartCs + snapDur + settleDur},\\fscx100\\fscy100)}` +
        `${w.text}{${emp.suffix}}${suffix}`
      )
    }

    // NORMAL: gentle fade-in. Quiet, unobtrusive.
    const fadeDur = Math.min(15, wordDurCs) // 150ms gentle fade

    return (
      `{\\1c${primaryASS}\\alpha&HFF&` +
      `\\t(${wordStartCs},${wordStartCs + fadeDur},\\alpha&H00&)}` +
      `${w.text}${suffix}`
    )
  })

  return [`Dialogue: 0,${start},${end},Default,,0,0,0,,${parts.join('')}`]
}

// ---------------------------------------------------------------------------
// ASS document generator
// ---------------------------------------------------------------------------

function buildASSDocument(
  words: WordInput[],
  style: CaptionStyleInput,
  frameWidth: number = DEFAULT_FRAME_WIDTH,
  frameHeight: number = DEFAULT_FRAME_HEIGHT,
  marginVOverride?: number,
  shotOverrides?: ShotCaptionOverride[],
  backgroundOpacity?: number
): string {
  const fontSize = Math.round(style.fontSize * frameHeight)
  const primaryASS = hexToASS(style.primaryColor)
  const outlineASS = hexToASS(style.outlineColor)

  // When backgroundOpacity > 0, switch to BorderStyle=3 (opaque box) and
  // compute BackColour with the appropriate alpha. ASS alpha is inverted:
  // 0x00 = fully opaque, 0xFF = fully transparent.
  const useBgBox = backgroundOpacity !== undefined && backgroundOpacity > 0.01
  const effectiveBorderStyle = useBgBox ? 3 : style.borderStyle
  // When a directional shadow is configured, the Style's scalar Shadow field
  // is disabled so it doesn't compound with the per-line \xshad/\yshad offset.
  const useDirectionalShadow =
    !useBgBox && style.shadowDistance !== undefined && style.shadowDistance > 0
  const effectiveShadow = useBgBox
    ? 0
    : useDirectionalShadow
      ? 0
      : style.shadow

  let backASS: string
  if (useBgBox) {
    // Parse the base back color for its RGB, then apply backgroundOpacity as alpha
    const baseHex = style.backColor.replace('#', '')
    let br = 0, bg = 0, bb = 0
    if (baseHex.length === 8) {
      br = parseInt(baseHex.slice(2, 4), 16)
      bg = parseInt(baseHex.slice(4, 6), 16)
      bb = parseInt(baseHex.slice(6, 8), 16)
    } else if (baseHex.length === 6) {
      br = parseInt(baseHex.slice(0, 2), 16)
      bg = parseInt(baseHex.slice(2, 4), 16)
      bb = parseInt(baseHex.slice(4, 6), 16)
    }
    // ASS alpha: 0x00 = fully opaque, 0xFF = fully transparent
    const alpha = Math.round((1 - Math.max(0, Math.min(1, backgroundOpacity!))) * 255)
    const pad = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0')
    backASS = `&H${pad(alpha)}${pad(bb)}${pad(bg)}${pad(br)}`
  } else {
    backASS = hexToASS(style.backColor)
  }

  // Vertical alignment: bottom-center (AN2) with a comfortable margin
  const marginV = marginVOverride ?? Math.round(frameHeight * 0.12) // ~12% from bottom

  // Collect all unique animations used (base + overrides) for ASS Style header
  const animationsInUse = new Set<CaptionAnimation>()
  animationsInUse.add(style.animation)
  const wordBoxNeeded = style.animation === 'word-box'

  if (shotOverrides && shotOverrides.length > 0) {
    for (const ov of shotOverrides) {
      animationsInUse.add(ov.style.animation)
    }
  }

  // Build per-animation style entries: each animation that differs from Default
  // gets its own named style in the ASS header so dialogue events can reference it.
  const extraStyleLines: string[] = []
  // Map from animation name to the ASS style name to use in Dialogue events
  const animationToStyleName = new Map<CaptionAnimation, string>()
  animationToStyleName.set(style.animation, 'Default')

  for (const anim of animationsInUse) {
    if (anim === style.animation) continue

    // Find the shot override that uses this animation to get its visual params
    const matchingOverride = shotOverrides!.find((ov) => ov.style.animation === anim)
    const ovStyle = matchingOverride?.style ?? style
    const ovFontSize = Math.round(ovStyle.fontSize * frameHeight)
    const ovPrimary = hexToASS(ovStyle.primaryColor)
    const ovOutline = hexToASS(ovStyle.outlineColor)
    const ovBack = hexToASS(ovStyle.backColor)
    const styleName = `Shot_${anim}`

    extraStyleLines.push(
      `Style: ${styleName},${ovStyle.fontName},${ovFontSize},${ovPrimary},${ovPrimary},${ovOutline},${ovBack},-1,0,0,0,100,100,0,0,${ovStyle.borderStyle},${ovStyle.outline},${ovStyle.shadow},2,40,40,${marginV},1`
    )
    animationToStyleName.set(anim, styleName)

    // WordBox variant for this animation
    if (anim === 'word-box') {
      extraStyleLines.push(
        `Style: WordBox_${anim},${ovStyle.fontName},${ovFontSize},${ovPrimary},${ovPrimary},${ovOutline},&H00000000,-1,0,0,0,100,100,0,0,3,${Math.max(8, Math.round(ovFontSize * 0.18))},0,5,0,0,0,1`
      )
    }
  }

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${frameWidth}`,
    `PlayResY: ${frameHeight}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${style.fontName},${fontSize},${primaryASS},${primaryASS},${outlineASS},${backASS},-1,0,0,0,100,100,0,0,${effectiveBorderStyle},${style.outline},${effectiveShadow},2,40,40,${marginV},1`,
    // WordBox style: BorderStyle=3 for per-word opaque boxes; padding via Outline field
    ...(wordBoxNeeded
      ? [
          `Style: WordBox,${style.fontName},${fontSize},${primaryASS},${primaryASS},${outlineASS},&H00000000,-1,0,0,0,100,100,0,0,3,${Math.max(8, Math.round(fontSize * 0.18))},0,5,0,0,0,1`
        ]
      : []),
    ...extraStyleLines,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]

  // ── Group words and build dialogue lines ──────────────────────────────────
  //
  // When shot overrides are present, each word group's effective style is
  // determined by finding the shot override whose time range contains the
  // group's midpoint. Groups not covered by any override fall back to the
  // global style.

  const groups = groupWords(words, style.wordsPerLine)
  const dialogueLines: string[] = []

  for (const group of groups) {
    if (group.words.length === 0) continue

    // Determine effective style for this group
    let effectiveStyle = style
    let effectiveFontSize = fontSize
    let effectiveStyleName: string | undefined // undefined = 'Default' (ASS default)

    if (shotOverrides && shotOverrides.length > 0) {
      const groupMid = (group.start + group.end) / 2
      const matchingOverride = shotOverrides.find(
        (ov) => groupMid >= ov.startTime && groupMid <= ov.endTime
      )
      if (matchingOverride) {
        effectiveStyle = matchingOverride.style
        effectiveFontSize = Math.round(matchingOverride.style.fontSize * frameHeight)
        effectiveStyleName = animationToStyleName.get(matchingOverride.style.animation)
      }
    }

    // Build dialogue lines using the effective style
    const lines = buildDialogueLinesForGroup(
      group,
      effectiveStyle,
      effectiveFontSize,
      frameWidth,
      frameHeight,
      marginV,
      effectiveStyleName
    )
    dialogueLines.push(...lines)
  }

  // ── Two-layer directional shadow rendering ──────────────────────────────
  //
  // `\blur` in libass blurs the whole glyph (fill + outline + shadow) in one
  // pass, so applying it to the main text produces a glow instead of a drop
  // shadow. To get a genuinely *behind-the-text* blurred shadow we render
  // each Dialogue twice:
  //   • Layer 0 (below): same glyph with fill and outline fully transparent
  //     so only the shadow renders. `\shad` is forced on to activate shadow
  //     compositing, offset via `\xshad`/`\yshad`, blurred via `\blur`.
  //   • Layer 1 (above): the original event, bumped one layer up so it sits
  //     on top of the shadow layer. Untouched — stays crisp.
  if (useDirectionalShadow) {
    const distance = Math.max(0, style.shadowDistance ?? 0)
    const angleRad = ((style.shadowAngle ?? 90) * Math.PI) / 180
    const xShad = +(distance * Math.cos(angleRad)).toFixed(3)
    const yShad = +(distance * Math.sin(angleRad)).toFixed(3)
    // Softness slider 0–100 → ASS `\blur` pixels (roughly 0–25). This mirrors
    // the behaviour of design-tool shadow-softness sliders at ~1080p.
    const softness = Math.max(0, Math.min(100, style.shadowSoftness ?? 0))
    const blur = +(softness * 0.25).toFixed(2)
    const opacity = Math.max(0, Math.min(1, style.shadowOpacity ?? 1))
    const shadowAlphaHex = Math.round((1 - opacity) * 255)
      .toString(16).toUpperCase().padStart(2, '0')
    const shadowColorASS = hexToASS(style.shadowColor ?? '#000000')

    // Override applied at the head of the shadow-layer copy. Hides fill
    // (`\1a&HFF&`) and outline (`\3a&HFF&\bord0`) so only the offset shadow
    // remains. `\shad1` activates shadow compositing; \xshad/\yshad place it.
    const shadowOverride =
      `{\\1a&HFF&\\3a&HFF&\\bord0\\shad1` +
      `\\xshad${xShad}\\yshad${yShad}\\blur${blur}` +
      `\\4c${shadowColorASS}\\4a&H${shadowAlphaHex}&}`

    // Split "Dialogue: <layer>,<start>,<end>,<style>,<name>,<ml>,<mr>,<mv>,<effect>,<text>"
    // into its layer + the rest so we can adjust layer numbers. Text begins
    // after the 9th comma.
    const dialogueRE = /^Dialogue:\s*\d+,((?:[^,]*,){8})(.*)$/
    const shadowLines: string[] = []
    for (let i = 0; i < dialogueLines.length; i++) {
      const m = dialogueRE.exec(dialogueLines[i])
      if (!m) continue
      const [, meta, text] = m
      shadowLines.push(`Dialogue: 0,${meta}${shadowOverride}${text}`)
      dialogueLines[i] = `Dialogue: 1,${meta}${text}`
    }
    // Shadow events must come before their main-layer twins so that within a
    // single render pass libass draws the blurred shadow underneath the
    // crisp glyph above.
    dialogueLines.unshift(...shadowLines)
  }

  return [...header, ...dialogueLines, ''].join('\n')
}

/**
 * Build dialogue lines for a single word group using a specific animation style.
 * Extracted from the main buildASSDocument loop to support per-shot style switching.
 */
function buildDialogueLinesForGroup(
  group: WordGroup,
  effectiveStyle: CaptionStyleInput,
  effectiveFontSize: number,
  frameWidth: number,
  frameHeight: number,
  marginV: number,
  styleName?: string
): string[] {
  // Inject the style name into dialogue lines by replacing the Default style reference.
  // All dialogue builders emit "Dialogue: 0,...,Default,..." — we swap 'Default' if needed.
  const rawLines: string[] = []

  switch (effectiveStyle.animation) {
    case 'captions-ai':
      rawLines.push(...buildCaptionsAILines(group, effectiveStyle, effectiveFontSize, frameWidth))
      break
    case 'karaoke-fill':
      rawLines.push(buildKaraokeLine(group, effectiveStyle, effectiveFontSize))
      break
    case 'word-pop':
      rawLines.push(...buildWordPopLines(group, effectiveStyle, effectiveFontSize))
      break
    case 'fade-in':
      rawLines.push(...buildFadeInLines(group, effectiveStyle, effectiveFontSize))
      break
    case 'glow':
      rawLines.push(...buildGlowLines(group, effectiveStyle, effectiveFontSize))
      break
    case 'word-box':
      rawLines.push(
        ...buildWordBoxLines(group, effectiveStyle, effectiveFontSize, frameWidth, frameHeight, marginV)
      )
      break
    case 'elastic-bounce':
      rawLines.push(...buildElasticBounceLines(group, effectiveStyle, effectiveFontSize))
      break
    case 'typewriter':
      rawLines.push(...buildTypewriterLines(group, effectiveStyle, effectiveFontSize))
      break
    case 'impact-two':
      rawLines.push(...buildImpactTwoLines(group, effectiveStyle, effectiveFontSize))
      break
    case 'cascade':
      rawLines.push(
        ...buildCascadeLines(group, effectiveStyle, effectiveFontSize, frameWidth, frameHeight, marginV)
      )
      break
  }

  // Swap the style name in dialogue lines if using a per-shot style
  if (styleName && styleName !== 'Default') {
    // Dialogue format: "Dialogue: Layer,Start,End,Style,..."
    // The 4th comma-delimited field is the Style name
    return rawLines.map((line) => {
      // Find the 4th field (Style) and replace it
      let commaCount = 0
      for (let i = 0; i < line.length; i++) {
        if (line[i] === ',') {
          commaCount++
          if (commaCount === 3) {
            // We're right after the 3rd comma — find the next comma to get the style field
            const styleStart = i + 1
            const styleEnd = line.indexOf(',', styleStart)
            if (styleEnd !== -1) {
              const originalStyle = line.substring(styleStart, styleEnd)
              if (originalStyle === 'Default') {
                return line.substring(0, styleStart) + styleName + line.substring(styleEnd)
              }
              // Also handle WordBox style rename
              if (originalStyle === 'WordBox') {
                return line.substring(0, styleStart) + `WordBox_${effectiveStyle.animation}` + line.substring(styleEnd)
              }
            }
            break
          }
        }
      }
      return line
    })
  }

  return rawLines
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an ASS subtitle file from word-level timestamps and a caption style.
 *
 * @param words       Word-level timestamps (relative to clip start, i.e. first word near 0)
 * @param style       Caption style configuration
 * @param outputPath  Where to write the .ass file. If omitted, writes to a temp file.
 * @param frameWidth  Canvas width in pixels (default: 1080). Must match the output video width.
 * @param frameHeight Canvas height in pixels (default: 1920). Must match the output video height.
 * @param marginVOverride  Optional override for vertical margin in pixels.
 * @param shotOverrides    Optional per-shot caption style overrides.
 * @param backgroundOpacity  Optional 0–1 opacity for an opaque box behind each subtitle line.
 *                           When > 0, the Default ASS style switches to BorderStyle=3 (opaque box)
 *                           and sets BackColour alpha accordingly. This provides word-level
 *                           background boxes as an alternative to the full-width FFmpeg drawbox.
 * @returns The absolute path to the written .ass file.
 */
export async function generateCaptions(
  words: WordInput[],
  style: CaptionStyleInput,
  outputPath?: string,
  frameWidth: number = DEFAULT_FRAME_WIDTH,
  frameHeight: number = DEFAULT_FRAME_HEIGHT,
  marginVOverride?: number,
  shotOverrides?: ShotCaptionOverride[],
  backgroundOpacity?: number
): Promise<string> {
  if (words.length === 0) {
    throw new Error('No words provided for caption generation')
  }

  const assContent = buildASSDocument(words, style, frameWidth, frameHeight, marginVOverride, shotOverrides, backgroundOpacity)

  const filePath =
    outputPath ?? join(tmpdir(), `batchcontent-captions-${Date.now()}.ass`)

  // Ensure parent directory exists
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, assContent, 'utf-8')

  return filePath
}
