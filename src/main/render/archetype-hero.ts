// ---------------------------------------------------------------------------
// Archetype hero ASS
// ---------------------------------------------------------------------------
//
// Per-archetype ASS subtitle generators modeled on the reference .ass files
// in sample_video/renders/seq/*. Each archetype renders either:
//   - a *hero* overlay alongside regular captions (fullscreen-headline,
//     fullscreen-quote), OR
//   - a custom caption document that replaces the default captions-ai pass
//     (fullscreen-image, split-image), OR
//   - nothing — the default caption pass handles it with just a margin tweak
//     (talking-head, tight-punch, wide-breather, quote-lower).
//
// The returned object tells the segment-render pipeline which case applies.
// ---------------------------------------------------------------------------

import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { formatASSTimestamp } from './helpers'
import type { Archetype } from '../edit-styles/shared/archetypes'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeroBuildInput {
  archetype: Archetype
  /** Full segment duration, seconds. */
  durationSec: number
  /** Target frame size — ASS PlayRes and positions. */
  frameWidth: number
  frameHeight: number
  /**
   * Segment-local word timestamps (0-based). Used by archetypes that render
   * their own captions (center-glow / push-center).
   */
  words?: Array<{ text: string; start: number; end: number; emphasis?: string }>
  /**
   * Hero text for archetypes that carry it separately from the caption words
   * (fullscreen-headline, fullscreen-quote). Phrases are separated by newline
   * or period; each phrase gets its own slide-in dialogue.
   */
  heroText?: string
  /** Accent color for emphasized words / headline color. Hex, e.g. "#7058E3". */
  accentColor: string
  /** Primary (body) text color, hex. */
  primaryColor: string
  /** Body font family (e.g. "Geist"). Used by captions + fallback hero. */
  bodyFont: string
  /** Script font family for the quote archetype (e.g. "Style Script"). */
  scriptFont: string
}

export interface HeroBuildResult {
  /**
   * The ASS document to burn as an *additional* pass on top of regular
   * captions (used when the archetype has a hero on top of captions).
   */
  heroAssContent?: string
  /**
   * The ASS document to burn in place of the default captions-ai pass
   * (used when the archetype's caption presentation is so different it's
   * easier to author directly — fullscreen-image, split-image).
   */
  captionAssContent?: string
  /**
   * When `captionAssContent` is set, the default caption pass should be
   * skipped for this segment.
   */
  skipDefaultCaptions?: boolean
}

// ---------------------------------------------------------------------------
// ASS header helper
// ---------------------------------------------------------------------------

function assHeader(frameWidth: number, frameHeight: number, styles: string[]): string {
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${frameWidth}`,
    `PlayResY: ${frameHeight}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ].join('\n')
}

/**
 * Convert a CSS hex color to ASS &HBBGGRR& format (with optional alpha prefix).
 */
function hexToAssBGR(hex: string, alpha = 0x00): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const aHex = alpha.toString(16).toUpperCase().padStart(2, '0')
  return `&H${aHex}${b.toString(16).toUpperCase().padStart(2, '0')}${g.toString(16).toUpperCase().padStart(2, '0')}${r.toString(16).toUpperCase().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Text splitting for hero overlays
// ---------------------------------------------------------------------------

/**
 * Split hero text into 1–3 short phrases for stagger animation.
 * Newlines and periods act as primary separators; fall back to splitting on
 * the first space when the phrase is long.
 */
function splitHeroPhrases(text: string, maxPhrases = 3): string[] {
  const byNewline = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (byNewline.length > 1) return byNewline.slice(0, maxPhrases)

  const bySentence = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
  if (bySentence.length > 1) return bySentence.slice(0, maxPhrases)

  // Single phrase — split on first comma if long, else return whole
  if (text.length > 22 && text.includes(',')) {
    const [head, ...rest] = text.split(',')
    return [head.trim() + ',', rest.join(',').trim()].filter(Boolean)
  }

  return [text]
}

// ---------------------------------------------------------------------------
// Archetype: fullscreen-headline (01_headline.ass)
// ---------------------------------------------------------------------------

function buildHeadlineHero(input: HeroBuildInput): HeroBuildResult {
  const { durationSec, frameWidth, frameHeight, heroText, bodyFont } = input
  if (!heroText || !heroText.trim()) return {}

  const phrases = splitHeroPhrases(heroText, 2)
  const cx = Math.round(frameWidth / 2)
  // Headline baseline Y positions — distributed near the top 15–25% band.
  const firstY = Math.round(frameHeight * 0.15)
  const lineGap = Math.round(frameHeight * 0.0625) // ≈120 @ 1920

  const fontSize = 110
  const startSec = 0.1
  const endSec = Math.max(startSec + 1.5, durationSec)
  const startAss = formatASSTimestamp(startSec)
  const endAss = formatASSTimestamp(endSec)

  const styles = [
    `Style: Headline,${bodyFont},${fontSize},&H00FFFFFF,&H000000FF,&H00FFFFFF,&H00000000,1,0,0,0,100,100,6,0,1,2,0,5,80,80,0,1`,
    `Style: HeadGlow,${bodyFont},${fontSize},&H40FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,6,0,1,0,0,5,80,80,0,1`
  ]

  const dialogues: string[] = []
  phrases.forEach((phrase, idx) => {
    const y = firstY + idx * lineGap
    const phraseStart = formatASSTimestamp(startSec + idx * 0.25)
    // Glow: dual-pass blur underlay.
    dialogues.push(
      `Dialogue: 1,${phraseStart},${endAss},HeadGlow,,0,0,0,,` +
      `{\\an5\\move(${cx},-120,${cx},${y},0,400)` +
      `\\blur20\\bord0\\shad0\\fscx75\\fscy75\\t(0,350,\\fscx100\\fscy100)` +
      `\\fad(150,250)}${phrase}`
    )
    // Main text: soft directional shadow with pop-overshoot then settle.
    dialogues.push(
      `Dialogue: 2,${phraseStart},${endAss},Headline,,0,0,0,,` +
      `{\\an5\\move(${cx},-120,${cx},${y},0,400)` +
      `\\xshad1\\yshad3\\be5\\fscx75\\fscy75` +
      `\\t(0,300,\\fscx108\\fscy108)\\t(300,450,\\fscx100\\fscy100)` +
      `\\fad(150,250)}${phrase}`
    )
  })

  return {
    heroAssContent: [assHeader(frameWidth, frameHeight, styles), ...dialogues, ''].join('\n')
  }
}

// ---------------------------------------------------------------------------
// Archetype: fullscreen-quote (03_quote.ass)
// ---------------------------------------------------------------------------

function buildQuoteHero(input: HeroBuildInput): HeroBuildResult {
  const { durationSec, frameWidth, frameHeight, heroText, scriptFont } = input
  if (!heroText || !heroText.trim()) return {}

  const phrases = splitHeroPhrases(heroText, 2)
  const cx = Math.round(frameWidth / 2)
  // Quote baseline Y positions — centered band, lifted off the bottom captions.
  const firstY = Math.round(frameHeight * 0.365)  // ≈ 700 @ 1920
  const lineGap = Math.round(frameHeight * 0.11)  // ≈ 210 @ 1920

  const fontSize = 230
  const startSec = 0.25
  const endSec = Math.max(startSec + 1.8, durationSec)
  const endAss = formatASSTimestamp(endSec)

  const styles = [
    `Style: BigQuote,${scriptFont},${fontSize},&H00FFFFFF,&H000000FF,&H00FFFFFF,&H00000000,0,0,0,0,100,100,2,0,1,2,0,5,80,80,0,1`,
    `Style: BigGlow,${scriptFont},${fontSize},&H40FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,0,0,5,80,80,0,1`
  ]

  const dialogues: string[] = []
  phrases.forEach((phrase, idx) => {
    const y = firstY + idx * lineGap
    const offStart = startSec + idx * 0.25
    const phraseStart = formatASSTimestamp(offStart)
    const rz = idx === 0 ? -5 : 5
    dialogues.push(
      `Dialogue: 1,${phraseStart},${endAss},BigGlow,,0,0,0,,` +
      `{\\an5\\move(${cx},${frameHeight + 100},${cx},${y},0,400)` +
      `\\fscx65\\fscy65\\t(0,350,\\fscx100\\fscy100)` +
      `\\fad(150,250)\\blur25\\bord0\\shad0}${phrase}`
    )
    dialogues.push(
      `Dialogue: 2,${phraseStart},${endAss},BigQuote,,0,0,0,,` +
      `{\\an5\\move(${cx},${frameHeight + 100},${cx},${y},0,400)` +
      `\\fscx65\\fscy65` +
      `\\t(0,300,\\fscx112\\fscy112)\\t(300,480,\\fscx100\\fscy100)` +
      `\\fad(150,250)\\xshad2\\yshad5\\be8\\frz${rz}\\t(0,400,\\frz0)}${phrase}`
    )
  })

  return {
    heroAssContent: [assHeader(frameWidth, frameHeight, styles), ...dialogues, ''].join('\n')
  }
}

// ---------------------------------------------------------------------------
// Archetype: fullscreen-image (08_fsbroll.ass)
//
// Replaces the default captions: center-aligned Geist 90 with dual-layer
// glow, scale-pop per word group, and pink emphasis on 'emphasis'/'supersize'
// flagged words.
// ---------------------------------------------------------------------------

function buildCenterGlowCaptions(input: HeroBuildInput): HeroBuildResult {
  const { frameWidth, frameHeight, words, accentColor, bodyFont } = input
  if (!words || words.length === 0) return { skipDefaultCaptions: true }

  const cx = Math.round(frameWidth / 2)
  const cy = Math.round(frameHeight / 2)
  const fontSize = 90
  const accentAss = hexToAssBGR(accentColor)

  const styles = [
    `Style: Default,${bodyFont},${fontSize},&H00FFFFFF,&H000000FF,&H00FFFFFF,&H00000000,1,0,0,0,100,100,2,0,1,2,0,5,60,60,0,1`,
    `Style: Glow,${bodyFont},${fontSize},&H40FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,2,0,1,0,0,5,60,60,0,1`
  ]

  // Group words into 2–3-word lines by cadence (simple: ~0.8s buckets).
  type Group = { text: string; start: number; end: number; emphasisWords: Set<number> }
  const groups: Group[] = []
  let current: Group | null = null
  const MAX_GROUP_SEC = 1.8
  const MAX_WORDS = 3

  words.forEach((w, i) => {
    if (!current || w.start - current.start > MAX_GROUP_SEC || current.text.split(' ').length >= MAX_WORDS) {
      current = { text: w.text, start: w.start, end: w.end, emphasisWords: new Set() }
      if (w.emphasis && w.emphasis !== 'normal') current.emphasisWords.add(0)
      groups.push(current)
    } else {
      const idx = current.text.split(' ').length
      current.text += ' ' + w.text
      current.end = w.end
      if (w.emphasis && w.emphasis !== 'normal') current.emphasisWords.add(idx)
    }
    void i
  })

  const dialogues: string[] = []
  for (const g of groups) {
    const start = formatASSTimestamp(g.start)
    const end = formatASSTimestamp(g.end)
    // Split by word so we can colour emphasis words inline.
    const tokens = g.text.split(' ')
    const renderedText = tokens
      .map((tok, idx) => {
        if (g.emphasisWords.has(idx)) {
          // Scale-pop + accent color on the emphasis word.
          return `{\\c${accentAss}\\3c${accentAss}\\fs110\\fscx80\\fscy80\\t(0,250,\\fscx105\\fscy105)\\t(250,400,\\fscx100\\fscy100)}${tok}{\\r}`
        }
        return tok
      })
      .join(' ')

    const animBase =
      `{\\an5\\pos(${cx},${cy})\\fscx85\\fscy85\\t(0,200,\\fscx100\\fscy100)\\fad(150,0)}`

    dialogues.push(
      `Dialogue: 0,${start},${end},Glow,,0,0,0,,` +
      animBase.replace('{', '{\\blur15\\bord0\\shad0') +
      renderedText
    )
    dialogues.push(
      `Dialogue: 1,${start},${end},Default,,0,0,0,,` +
      animBase.replace('{', '{\\xshad1\\yshad3\\be5') +
      renderedText
    )
  }

  return {
    captionAssContent: [assHeader(frameWidth, frameHeight, styles), ...dialogues, ''].join('\n'),
    skipDefaultCaptions: true
  }
}

// ---------------------------------------------------------------------------
// Archetype: split-image (06_split.ass)
//
// First word group at lower-third, subsequent groups at vertical centre —
// visually mirrors the "push" from caption position to centre as the segment
// progresses.
// ---------------------------------------------------------------------------

function buildPushCenterCaptions(input: HeroBuildInput): HeroBuildResult {
  const { frameWidth, frameHeight, words, bodyFont } = input
  if (!words || words.length === 0) return {}

  const cx = Math.round(frameWidth / 2)
  const centerY = Math.round(frameHeight / 2)
  const lowerY = Math.round(frameHeight - frameHeight * 0.125)  // 1680 @ 1920
  const fontSize = 85

  const styles = [
    `Style: Default,${bodyFont},${fontSize},&H00FFFFFF,&H000000FF,&H00FFFFFF,&H00000000,1,0,0,0,100,100,2,0,1,2,0,5,50,50,0,1`
  ]

  // Group words into lines of up to 4 words OR 1.2s.
  type Group = { text: string; start: number; end: number }
  const groups: Group[] = []
  let current: Group | null = null
  const MAX_GROUP_SEC = 1.2
  const MAX_WORDS = 4
  for (const w of words) {
    if (!current || w.start - current.start > MAX_GROUP_SEC || current.text.split(' ').length >= MAX_WORDS) {
      current = { text: w.text, start: w.start, end: w.end }
      groups.push(current)
    } else {
      current.text += ' ' + w.text
      current.end = w.end
    }
  }

  const dialogues: string[] = []
  groups.forEach((g, idx) => {
    const start = formatASSTimestamp(g.start)
    const end = formatASSTimestamp(g.end)
    const y = idx === 0 ? lowerY : centerY
    const an = idx === 0 ? 2 : 5
    dialogues.push(
      `Dialogue: 0,${start},${end},Default,,0,0,0,,` +
      `{\\an${an}\\pos(${cx},${y})\\xshad1\\yshad3\\be5\\fad(100,0)}${g.text}`
    )
  })

  return {
    captionAssContent: [assHeader(frameWidth, frameHeight, styles), ...dialogues, ''].join('\n'),
    skipDefaultCaptions: true
  }
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

/**
 * Build the hero / custom-caption ASS for a segment's archetype. Returns
 * empty object for archetypes whose default caption pass is sufficient (with
 * just a margin tweak).
 */
export function buildArchetypeHero(input: HeroBuildInput): HeroBuildResult {
  switch (input.archetype) {
    case 'fullscreen-headline':
      return buildHeadlineHero(input)
    case 'fullscreen-quote':
      return buildQuoteHero(input)
    case 'fullscreen-image':
      return buildCenterGlowCaptions(input)
    case 'split-image':
      return buildPushCenterCaptions(input)
    case 'talking-head':
    case 'tight-punch':
    case 'wide-breather':
    case 'quote-lower':
    default:
      return {}
  }
}

/**
 * Write an ASS document to a fresh temp file and return its path.
 */
export function writeHeroAssFile(content: string, tag: string): string {
  const path = join(tmpdir(), `batchcontent-hero-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ass`)
  writeFileSync(path, content, 'utf-8')
  return path
}
