// ---------------------------------------------------------------------------
// Captions — three modes, one builder.
//
// V2 caption pipeline. Every other animation/level/box variation from V1 has
// been removed. Captions render in exactly one of three visual modes:
//
//   1. 'standard'           — PRESTYJ sans (Geist), color #f6ecd9 on every
//                             word. No emphasis swap. No accent highlight.
//   2. 'emphasis'            — PRESTYJ sans base. Words flagged as emphasis
//                             swap to the PRESTYJ display font (Style Script).
//                             Color stays at #f6ecd9 across the whole line.
//   3. 'emphasis_highlight'  — Same as 'emphasis' for the font swap, plus the
//                             emphasis words are recolored to the accent
//                             (default #9f75ff).
//
// Visual ground truth: see .ezcoder/examples/standard*.jpg.
//
// ASS tag reference (libass / Aegisub / SubtitleEdit / mpv style snippets):
//   • {\fnFontName}  — switch font family
//   • {\1c&HBBGGRR&} — set primary fill color (note: ASS uses BBGGRR, no '#')
//   • {\b1}          — bold on, {\b0} off
//   • {\r}           — reset all overrides to the Default style
// ---------------------------------------------------------------------------

import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { tmpdir } from 'os'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The three — and only three — caption visual modes supported by V2. */
export type CaptionMode = 'standard' | 'emphasis' | 'emphasis_highlight'

/** Word-level timestamp + emphasis flag. */
export interface WordInput {
  text: string
  /** Seconds, clip-relative. */
  start: number
  /** Seconds, clip-relative. */
  end: number
  /**
   * Emphasis flag. Truthy values ('emphasis', 'supersize', 'box', or `true`)
   * promote the word to the emphasis treatment in 'emphasis' /
   * 'emphasis_highlight' modes. 'normal' / falsy = ordinary word.
   *
   * Accepts the legacy V1 string union so upstream callers don't need to
   * change shape — V2 collapses every non-normal level into a single
   * boolean-grade emphasis state.
   */
  emphasis?: 'normal' | 'emphasis' | 'supersize' | 'box' | boolean
}

/**
 * Caption style input. V2 reads only a small subset of these fields; the rest
 * are tolerated for backwards compatibility with V1 call sites that still
 * hand-construct `CaptionStyleInput` objects elsewhere in the codebase.
 *
 * The fields actually consumed by V2:
 *   • `fontSize`        — fraction of frame height (e.g. 0.065)
 *   • `wordsPerLine`    — max words per dialogue line
 *   • `captionMode`     — which of the three modes to render in
 *   • `accentColor`     — accent for 'emphasis_highlight' mode (defaults to PRESTYJ purple)
 *
 * Optional layout knobs honoured by V2:
 *   • `outline`, `shadow`, `borderStyle`, `backColor`, `outlineColor`
 *   • `shadowDistance`, `shadowAngle`, `shadowSoftness`, `shadowOpacity`, `shadowColor`
 */
export interface CaptionStyleInput {
  /** Which V2 mode to render. Falls back to 'standard' if omitted. */
  captionMode?: CaptionMode
  /** Accent color hex for 'emphasis_highlight' mode. Defaults to '#9f75ff'. */
  accentColor?: string

  /** Fraction of frame height — e.g. 0.065 → 7% of 1280px. */
  fontSize: number
  wordsPerLine: number

  // ── Backwards-compat fields (tolerated, mostly ignored) ─────────────────
  fontName?: string
  primaryColor?: string
  highlightColor?: string
  emphasisColor?: string
  supersizeColor?: string
  outlineColor?: string
  backColor?: string
  outline?: number
  shadow?: number
  borderStyle?: number
  /** V1 animation enum — V2 ignores this. Kept to avoid TS errors at call sites. */
  animation?: string

  // Directional drop shadow knobs (passed through to the Style header).
  shadowDistance?: number
  shadowAngle?: number
  shadowSoftness?: number
  shadowOpacity?: number
  shadowColor?: string

  // Legacy box/emphasis knobs — ignored.
  emphasisScale?: number
  emphasisFontWeight?: number
  supersizeScale?: number
  supersizeFontWeight?: number
  boxColor?: string
  boxOpacity?: number
  boxPadding?: number
  boxTextColor?: string
  boxFontWeight?: number
}

/** Per-shot caption style override for a clip-relative time window. */
export interface ShotCaptionOverride {
  startTime: number
  endTime: number
  style: CaptionStyleInput
}

// ---------------------------------------------------------------------------
// V2 design constants — locked.
// ---------------------------------------------------------------------------

/** PRESTYJ sans (used for standard text in every mode). */
export const STANDARD_FONT = 'Geist'
/** PRESTYJ display/fancy (used for emphasis words in 'emphasis' / 'emphasis_highlight'). */
export const FANCY_FONT = 'Style Script'
/** Standard text color across all three modes. */
export const STANDARD_COLOR = '#f6ecd9'
/** Default accent for 'emphasis_highlight' (PRESTYJ purple). */
export const DEFAULT_ACCENT = '#9f75ff'

// 9:16 reference frame.
const DEFAULT_FRAME_WIDTH = 720
const DEFAULT_FRAME_HEIGHT = 1280

// ---------------------------------------------------------------------------
// Color + time helpers
// ---------------------------------------------------------------------------

/**
 * Convert a CSS hex (`#RRGGBB`, `#AARRGGBB`, `#RGB`) to ASS `&HAABBGGRR`.
 * ASS bytes are alpha→blue→green→red and alpha is *inverted*: 00 = opaque.
 */
function hexToASS(hex: string): string {
  const h = hex.replace('#', '')
  let r = 0, g = 0, b = 0, a = 0
  if (h.length === 8) {
    a = parseInt(h.slice(0, 2), 16)
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
    return '&H00FFFFFF'
  }
  const pad = (n: number) => n.toString(16).toUpperCase().padStart(2, '0')
  return `&H${pad(a)}${pad(b)}${pad(g)}${pad(r)}`
}

/** Format seconds → ASS H:MM:SS.cc (centiseconds). */
function formatASSTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.round((s % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

/** Coerce the legacy emphasis enum/boolean into a single boolean. */
function isEmphasized(w: WordInput): boolean {
  const e = w.emphasis
  if (e === undefined || e === null) return false
  if (typeof e === 'boolean') return e
  return e === 'emphasis' || e === 'supersize' || e === 'box'
}

// ---------------------------------------------------------------------------
// Word grouping
// ---------------------------------------------------------------------------

interface WordGroup {
  words: WordInput[]
  start: number
  end: number
}

function groupWords(words: WordInput[], wordsPerLine: number): WordGroup[] {
  const n = Math.max(1, wordsPerLine | 0)
  const groups: WordGroup[] = []
  for (let i = 0; i < words.length; i += n) {
    const chunk = words.slice(i, i + n)
    if (chunk.length === 0) continue
    groups.push({
      words: chunk,
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end
    })
  }
  return groups
}

// ---------------------------------------------------------------------------
// The ONE builder — buildAssLines
// ---------------------------------------------------------------------------

/**
 * Build the ASS Dialogue lines for the given word stream in one of the three
 * caption modes. Returns one `Dialogue: ...` line per word group.
 *
 * The Default style (defined in the header) already paints text in
 * `STANDARD_COLOR` using `STANDARD_FONT`, so 'standard' mode emits dialogue
 * lines with no inline overrides at all.
 *
 * @param words   Word-level timestamps, clip-relative.
 * @param mode    Which V2 mode to render.
 * @param accent  Accent color hex for `emphasis_highlight`. Defaults to PRESTYJ purple.
 * @param wordsPerLine  Max words per dialogue line. Defaults to 4.
 */
export function buildAssLines(
  words: WordInput[],
  mode: CaptionMode,
  accent: string = DEFAULT_ACCENT,
  wordsPerLine = 4
): string[] {
  if (words.length === 0) return []

  const accentASS = hexToASS(accent)
  const groups = groupWords(words, wordsPerLine)
  const lines: string[] = []

  for (const group of groups) {
    const start = formatASSTime(group.start)
    const end = formatASSTime(group.end)

    // Render each word with the override block its mode requires, then a `\r`
    // to reset back to the Default style (so the next word inherits cleanly).
    const parts = group.words.map((w, idx) => {
      const isLast = idx === group.words.length - 1
      const sep = isLast ? '' : ' '
      const emphasized = isEmphasized(w)

      // Mode 1: standard — never apply per-word overrides.
      if (mode === 'standard' || !emphasized) {
        return `${w.text}${sep}`
      }

      // Mode 2: emphasis — swap font only.
      if (mode === 'emphasis') {
        return `{\\fn${FANCY_FONT}}${w.text}{\\r}${sep}`
      }

      // Mode 3: emphasis_highlight — swap font AND recolor to accent.
      // \1c sets the primary fill; \3c matches it so the outline reads as
      // additional weight on the coloured glyph rather than a contrasting stroke.
      return `{\\fn${FANCY_FONT}\\1c${accentASS}\\3c${accentASS}}${w.text}{\\r}${sep}`
    })

    lines.push(
      `Dialogue: 0,${start},${end},Default,,0,0,0,,${parts.join('')}`
    )
  }

  return lines
}

// ---------------------------------------------------------------------------
// ASS document assembly
// ---------------------------------------------------------------------------

/** Resolve the effective caption mode from a (possibly partial) style. */
function resolveMode(style: CaptionStyleInput | undefined): CaptionMode {
  return style?.captionMode ?? 'standard'
}

/** Resolve the effective accent color from a (possibly partial) style. */
function resolveAccent(style: CaptionStyleInput | undefined): string {
  return style?.accentColor ?? DEFAULT_ACCENT
}

/**
 * Build the full .ass document: header + per-group dialogue lines.
 *
 * Per-shot overrides change the caption MODE and/or accent color for the
 * groups whose midpoint falls inside the override's time window. The font
 * (Geist), text color (#f6ecd9), and base layout are locked across all shots.
 */
function buildASSDocument(
  words: WordInput[],
  style: CaptionStyleInput,
  frameWidth: number,
  frameHeight: number,
  marginVOverride: number | undefined,
  shotOverrides: ShotCaptionOverride[] | undefined
): string {
  const fontSize = Math.round(style.fontSize * frameHeight)
  const wordsPerLine = Math.max(1, (style.wordsPerLine | 0) || 4)

  const standardASS = hexToASS(STANDARD_COLOR)
  const outlineASS = hexToASS(style.outlineColor ?? '#000000')
  const backASS = hexToASS(style.backColor ?? '#00000000')

  const outline = style.outline ?? 2
  const shadow = style.shadow ?? 0
  const borderStyle = style.borderStyle ?? 1
  const marginV = marginVOverride ?? Math.round(frameHeight * 0.12)

  // ── Style block ────────────────────────────────────────────────────────
  // Default = PRESTYJ sans (Geist), painted in #f6ecd9. Bold on (Geist-Bold).
  const styleLine =
    `Style: Default,${STANDARD_FONT},${fontSize},${standardASS},${standardASS},` +
    `${outlineASS},${backASS},-1,0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},2,40,40,${marginV},1`

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
    styleLine,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]

  // ── Dialogue lines ─────────────────────────────────────────────────────
  // When shot overrides are present, group the words first and pick the
  // mode/accent per group based on the group's midpoint timestamp.
  const dialogueLines: string[] = []

  if (shotOverrides && shotOverrides.length > 0) {
    const groups = groupWords(words, wordsPerLine)
    for (const group of groups) {
      const mid = (group.start + group.end) / 2
      const override = shotOverrides.find((ov) => mid >= ov.startTime && mid <= ov.endTime)
      const mode = resolveMode(override?.style ?? style)
      const accent = resolveAccent(override?.style ?? style)
      dialogueLines.push(...buildAssLines(group.words, mode, accent, wordsPerLine))
    }
  } else {
    dialogueLines.push(
      ...buildAssLines(words, resolveMode(style), resolveAccent(style), wordsPerLine)
    )
  }

  return [...header, ...dialogueLines, ''].join('\n')
}

// ---------------------------------------------------------------------------
// Public API — file writer
// ---------------------------------------------------------------------------

/**
 * Generate an ASS subtitle file from word-level timestamps.
 *
 * @param words            Word timestamps relative to clip start.
 * @param style            Caption style — primarily `captionMode`, `accentColor`,
 *                         `fontSize`, and `wordsPerLine` are consumed.
 * @param outputPath       Optional explicit .ass path. If omitted, a temp file is used.
 * @param frameWidth       Canvas width (default 720).
 * @param frameHeight      Canvas height (default 1280).
 * @param marginVOverride  Override vertical margin in pixels (from the bottom).
 * @param shotOverrides    Per-shot mode/accent overrides for time windows.
 * @returns                Absolute path to the written .ass file.
 */
export async function generateCaptions(
  words: WordInput[],
  style: CaptionStyleInput,
  outputPath?: string,
  frameWidth: number = DEFAULT_FRAME_WIDTH,
  frameHeight: number = DEFAULT_FRAME_HEIGHT,
  marginVOverride?: number,
  shotOverrides?: ShotCaptionOverride[],
  // backgroundOpacity is accepted for V1 call-site compatibility but no longer
  // alters output — V2 modes never render an opaque background box.
  _backgroundOpacity?: number
): Promise<string> {
  if (words.length === 0) {
    throw new Error('No words provided for caption generation')
  }

  const assContent = buildASSDocument(
    words,
    style,
    frameWidth,
    frameHeight,
    marginVOverride,
    shotOverrides
  )

  const filePath = outputPath ?? join(tmpdir(), `batchcontent-captions-${Date.now()}.ass`)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, assContent, 'utf-8')
  return filePath
}
