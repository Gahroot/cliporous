// ---------------------------------------------------------------------------
// Captions — three modes, one builder.
//
// V2 caption pipeline. Every other animation/level/box variation from V1 has
// been removed. Captions render in exactly one of three visual modes:
//
//   1. 'standard'           — Inter Bold, white (#ffffff) on every word.
//                             Soft 0-offset black halo behind the text. No
//                             per-word color/font swap.
//   2. 'emphasis'            — Inter Bold base. Words flagged as emphasis
//                             are recolored to the accent (purple #9f75ff).
//                             Same black halo behind every word.
//   3. 'emphasis_highlight'  — Same color treatment as 'emphasis', plus a
//                             font swap on emphasized words to the
//                             condensed display font (Bebas Neue).
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
import { resolveTemplate, DEFAULT_EDIT_STYLE_ID, isSpeakerFullscreen } from './edit-styles'

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

/** Per-archetype caption window — marginV + fontSize override per timestamp. */
export interface ArchetypeWindow {
  /** Clip-relative seconds. */
  startTime: number
  /** Clip-relative seconds. */
  endTime: number
  archetype: Archetype
}

/**
 * Per-archetype caption marginV is now sourced from the resolved
 * per-archetype template (`resolveTemplate(archetype, editStyleId).captionMarginV`).
 * Edits to `src/main/edit-styles/prestyj/templates/*.ts` drive caption
 * placement at render time.
 */

/**
 * Per-archetype caption fontSize as a fraction of frame height. Matches the
 * sizing strategy in the segment-overlap-cleanup plan: speakers stay at the
 * style default; fullscreen-image bumps slightly; fullscreen-quote becomes
 * the hero (no other text on screen).
 */
const ARCHETYPE_FONT_SIZE_FRACTION: Record<Archetype, number> = {
  'talking-head': 0.065,
  'tight-punch': 0.065,
  'wide-breather': 0.065,
  'quote-lower': 0.065,
  'split-image': 0.065,
  'fullscreen-image': 0.075,
  'fullscreen-quote': 0.095,
}

// ---------------------------------------------------------------------------
// V2 design constants — locked.
// ---------------------------------------------------------------------------

/** Standard caption font: clean blocky sans-serif (Inter Bold, weight 700). */
export const STANDARD_FONT = 'Inter'
/** Display font for the 'emphasis_highlight' font-swap variant (condensed all-caps display). */
export const FANCY_FONT = 'Bebas Neue'
/** Standard text color across all three modes — clean white. */
export const STANDARD_COLOR = '#ffffff'
/** Default accent for emphasis (PRESTYJ purple). */
export const DEFAULT_ACCENT = '#9f75ff'

// ── Drop-shadow look (centered black glow behind white text) ───────────────
// Implemented in libass with BorderStyle=1, Shadow=0 (no offset), and a
// thick black Outline that the per-event \blur tag converts into a soft
// 0-offset halo. This produces the requested
// "0 offset, 100% opacity, ~75% blur" drop shadow.
const SHADOW_BLUR = 12        // \blur radius — strong soft halo
const SHADOW_THICKNESS = 6    // outline radius for the black halo
const SHADOW_COLOR = '#000000'

// 9:16 reference frame.
const DEFAULT_FRAME_WIDTH = 1080
const DEFAULT_FRAME_HEIGHT = 1920

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
  wordsPerLine = 4,
  /**
   * When set, each Dialogue line emits a per-line MarginV (slot 8) and a
   * `\fs<px>` override prepended to the text so a single Style block can
   * carry archetype-specific position + size.
   */
  perGroupOverride?: (groupMid: number) => { marginV?: number; fontSize?: number }
): string[] {
  if (words.length === 0) return []

  const accentASS = hexToASS(accent)
  const groups = groupWords(words, wordsPerLine)
  const lines: string[] = []

  for (const group of groups) {
    const start = formatASSTime(group.start)
    const end = formatASSTime(group.end)
    const mid = (group.start + group.end) / 2
    const override = perGroupOverride ? perGroupOverride(mid) : undefined

    // Every line opens with a \blur override so the black outline reads as a
    // soft 0-offset halo rather than a hard stroke. Outline colour stays
    // black via the Style header. When an archetype window applies a
    // fontSize override, prepend a `\fs<px>` tag so the per-line size beats
    // the Default style's size.
    const linePrefix =
      `{\\blur${SHADOW_BLUR}` +
      (override?.fontSize ? `\\fs${override.fontSize}` : '') +
      `}`
    // Re-apply \fs after every \r so per-word resets don't snap back to the
    // Default style's font size.
    const fsRe = override?.fontSize ? `\\fs${override.fontSize}` : ''

    // Render each word with the override block its mode requires, then a `\r`
    // to reset back to the Default style — followed by a `\blur` re-apply,
    // because `\r` resets transient overrides too.
    const parts = group.words.map((w, idx) => {
      const isLast = idx === group.words.length - 1
      const sep = isLast ? '' : ' '
      const emphasized = isEmphasized(w)

      // Mode 1: standard — never apply per-word overrides.
      if (mode === 'standard' || !emphasized) {
        return `${w.text}${sep}`
      }

      // Mode 2: emphasis — recolor to purple accent. Outline stays black so
      // the same halo reads behind the coloured word. Halo blur is
      // re-applied after \r so the override doesn't drop it.
      if (mode === 'emphasis') {
        return `{\\1c${accentASS}}${w.text}{\\r\\blur${SHADOW_BLUR}${fsRe}}${sep}`
      }

      // Mode 3: emphasis_highlight — swap font AND recolor to accent.
      return `{\\fn${FANCY_FONT}\\1c${accentASS}}${w.text}{\\r\\blur${SHADOW_BLUR}${fsRe}}${sep}`
    })

    // Per-line MarginV goes in slot 8 of the Dialogue Format. 0 = use Style
    // default. Anything else overrides per-line.
    const lineMarginV = override?.marginV ?? 0
    lines.push(
      `Dialogue: 0,${start},${end},Default,,0,0,${lineMarginV},,${linePrefix}${parts.join('')}`
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
 * (Inter Bold), text color (#ffffff), and the soft black halo are locked
 * across all shots.
 */
function buildASSDocument(
  words: WordInput[],
  style: CaptionStyleInput,
  frameWidth: number,
  frameHeight: number,
  marginVOverride: number | undefined,
  shotOverrides: ShotCaptionOverride[] | undefined,
  archetypeWindows: ArchetypeWindow[] | undefined,
  editStyleId: string
): string {
  // ASS has no native line-spacing tag, so to tighten the gap between
  // wrapped lines we shrink the font's reported size and rescale the glyphs
  // back up via ScaleX/ScaleY. Line box ≈ fontSize * 1.2, so a 0.85x font
  // with 118% scale keeps glyph size identical while cutting the line gap
  // by ~15%. Tweak LINE_HEIGHT_FACTOR to taste (1.0 = libass default).
  const LINE_HEIGHT_FACTOR = 0.85
  const visualSize = style.fontSize * frameHeight
  const fontSize = Math.round(visualSize * LINE_HEIGHT_FACTOR)
  const glyphScale = Math.round(100 / LINE_HEIGHT_FACTOR)
  const wordsPerLine = Math.max(1, (style.wordsPerLine | 0) || 4)

  const standardASS = hexToASS(STANDARD_COLOR)
  // Outline / back colours are forced to fully-opaque black so the per-event
  // \blur tag converts the outline into a centered soft halo behind the glyph.
  const shadowASS = hexToASS(SHADOW_COLOR)

  // V2 lock: 0-offset black halo. Per-style outline/shadow knobs from the
  // input are intentionally ignored so every clip gets the same treatment.
  const outline = SHADOW_THICKNESS
  const shadow = 0
  const borderStyle = 1
  const marginV = marginVOverride ?? Math.round(frameHeight * 0.12)

  // ── Style block ────────────────────────────────────────────────────────
  // Default = clean white Inter Bold with a soft black halo (outline + blur).
  const styleLine =
    `Style: Default,${STANDARD_FONT},${fontSize},${standardASS},${standardASS},` +
    `${shadowASS},${shadowASS},-1,0,0,0,${glyphScale},${glyphScale},0,0,${borderStyle},${outline},${shadow},2,40,40,${marginV},1`

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

  // Per-group archetype lookup: returns the per-line marginV + fontSize
  // overrides for the archetype window whose time range covers `mid`. Returns
  // undefined when no window covers the timestamp — dialogue then falls back
  // to the Default style's marginV / fontSize.
  // Per-line override rules:
  //   • Speaker-fullscreen archetypes (talking-head / tight-punch /
  //     wide-breather): the user's global template editor position
  //     (`marginVOverride`) wins; otherwise the per-archetype template
  //     value drives the marginV.
  //   • All other archetypes (split-image, fullscreen-image,
  //     fullscreen-quote, quote-lower): the per-archetype template's
  //     `captionMarginV` always wins. `marginVOverride` is ignored —
  //     those layouts have purpose-built caption positions.
  const perGroupOverride = archetypeWindows && archetypeWindows.length > 0
    ? (mid: number) => {
        const win = archetypeWindows.find((w) => mid >= w.startTime && mid <= w.endTime)
        if (!win) return {}
        const fontFraction = ARCHETYPE_FONT_SIZE_FRACTION[win.archetype]
        const visual = fontFraction * frameHeight
        const archetypeMarginV = resolveTemplate(win.archetype, editStyleId).captionMarginV
        const speakerOverride =
          isSpeakerFullscreen(win.archetype) && marginVOverride !== undefined
            ? marginVOverride
            : undefined
        return {
          marginV: speakerOverride ?? archetypeMarginV,
          fontSize: Math.round(visual * LINE_HEIGHT_FACTOR),
        }
      }
    : undefined

  // Partition words by archetype window so each window can choose its own
  // grouping (multi-word vs word-by-word) based on its resolved template's
  // `captionMode`. When no windows are supplied, treat the whole word stream
  // as one chunk that uses the style's `wordsPerLine`.
  interface WordChunk {
    words: WordInput[]
    wordsPerLine: number
  }
  const chunks: WordChunk[] = []
  if (archetypeWindows && archetypeWindows.length > 0) {
    // Group consecutive words that share the same archetype window into a
    // single chunk. Words outside every window fall back to the default
    // grouping in their own chunk.
    let current: { archetype: Archetype | null; words: WordInput[] } | null = null
    const flush = () => {
      if (!current || current.words.length === 0) return
      const wpl = current.archetype !== null
        && resolveTemplate(current.archetype, editStyleId).captionMode === 'word-by-word'
        ? 1
        : wordsPerLine
      chunks.push({ words: current.words, wordsPerLine: wpl })
    }
    for (const w of words) {
      const mid = (w.start + w.end) / 2
      const win = archetypeWindows.find((aw) => mid >= aw.startTime && mid <= aw.endTime)
      const archetype = win?.archetype ?? null
      if (!current || current.archetype !== archetype) {
        flush()
        current = { archetype, words: [] }
      }
      current.words.push(w)
    }
    flush()
  } else {
    chunks.push({ words, wordsPerLine })
  }

  for (const chunk of chunks) {
    if (chunk.words.length === 0) continue
    if (shotOverrides && shotOverrides.length > 0) {
      const groups = groupWords(chunk.words, chunk.wordsPerLine)
      for (const group of groups) {
        const mid = (group.start + group.end) / 2
        const override = shotOverrides.find((ov) => mid >= ov.startTime && mid <= ov.endTime)
        const mode = resolveMode(override?.style ?? style)
        const accent = resolveAccent(override?.style ?? style)
        dialogueLines.push(
          ...buildAssLines(group.words, mode, accent, chunk.wordsPerLine, perGroupOverride)
        )
      }
    } else {
      dialogueLines.push(
        ...buildAssLines(
          chunk.words,
          resolveMode(style),
          resolveAccent(style),
          chunk.wordsPerLine,
          perGroupOverride
        )
      )
    }
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
 * @param frameWidth       Canvas width (default 1080).
 * @param frameHeight      Canvas height (default 1920).
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
  archetypeWindows?: ArchetypeWindow[],
  // backgroundOpacity is accepted for V1 call-site compatibility but no longer
  // alters output — V2 modes never render an opaque background box.
  _backgroundOpacity?: number,
  /** Active edit-style id — controls per-archetype marginV lookup. */
  editStyleId: string = DEFAULT_EDIT_STYLE_ID
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
    shotOverrides,
    archetypeWindows,
    editStyleId
  )

  const filePath = outputPath ?? join(tmpdir(), `batchcontent-captions-${Date.now()}.ass`)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, assContent, 'utf-8')
  return filePath
}
