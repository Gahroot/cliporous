// ---------------------------------------------------------------------------
// Captions — four modes, one stable caption track.
//
// Ordinary subtitle events share one explicit bottom anchor and one visual
// font size for the whole clip, so one-line/two-line groups keep the same
// baseline. fullscreen-quote is the sole exception: the
// transcript becomes centered, full-frame hero typography for that window.
//
// `editorial` is the karaoke-style serif mode: Instrument Serif, a soft
// rounded pill behind the word being spoken, upcoming words dimmed, and
// emphasis words in italic accent. It emits per-word timed events (pill on
// layer 0, text on layer 1) instead of one event per group.
// ---------------------------------------------------------------------------

import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  CAPTION_HORIZONTAL_INSET_FRACTION,
  CAPTION_MAX_WIDTH_FRACTION,
  DEFAULT_SUBTITLE_POSITION,
  resolveSubtitleAnchor,
  type SubtitleAnchor,
  type SubtitlePosition,
} from '@shared/caption-layout';
import { type Archetype, DEFAULT_EDIT_STYLE_ID, resolveTemplate } from './edit-styles';
import { minEmphasisDwellEnd } from './emphasis-dwell';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The four caption visual modes supported by V2. */
export type CaptionMode = 'standard' | 'emphasis' | 'emphasis_highlight' | 'editorial';

/** Word-level timestamp + emphasis flag. */
export interface WordInput {
  text: string;
  /** Seconds, clip-relative. */
  start: number;
  /** Seconds, clip-relative. */
  end: number;
  /** Legacy emphasis values are collapsed into one emphasized treatment. */
  emphasis?: 'normal' | 'emphasis' | 'supersize' | 'box' | boolean;
}

/**
 * Caption style input. V2 consumes `fontSize`, `wordsPerLine`, `captionMode`,
 * and `accentColor`; the remaining fields are tolerated for V1 call sites.
 */
export interface CaptionStyleInput {
  captionMode?: CaptionMode;
  accentColor?: string;
  /** Fraction of frame height, e.g. 0.065 on a 1080×1920 canvas. */
  fontSize: number;
  /** Maximum words in one caption event. */
  wordsPerLine: number;

  fontName?: string;
  primaryColor?: string;
  highlightColor?: string;
  emphasisColor?: string;
  supersizeColor?: string;
  outlineColor?: string;
  backColor?: string;
  outline?: number;
  shadow?: number;
  borderStyle?: number;
  animation?: string;
  shadowDistance?: number;
  shadowAngle?: number;
  shadowSoftness?: number;
  shadowOpacity?: number;
  shadowColor?: string;
  emphasisScale?: number;
  emphasisFontWeight?: number;
  supersizeScale?: number;
  supersizeFontWeight?: number;
  boxColor?: string;
  boxOpacity?: number;
  boxPadding?: number;
  boxTextColor?: string;
  boxFontWeight?: number;
}

/** Per-shot caption style override for a clip-relative time window. */
export interface ShotCaptionOverride {
  startTime: number;
  endTime: number;
  style: CaptionStyleInput;
}

/** Per-archetype caption window in clip-relative seconds. */
export interface ArchetypeWindow {
  startTime: number;
  endTime: number;
  archetype: Archetype;
}

/** Screen layout active over a clip-relative window; moves the caption anchor. */
export type CaptionLayout = 'stack' | 'stack-flipped' | 'takeover' | 'pip' | 'over';

/** Per-layout caption window in clip-relative seconds. */
export interface CaptionLayoutWindow {
  startTime: number;
  endTime: number;
  layout: CaptionLayout;
}

/** Optional layout and presentation inputs shared by preview and export. */
export interface CaptionGenerationOptions {
  frameWidth?: number;
  frameHeight?: number;
  /** Bottom-center anchor of the ordinary subtitle block, in canvas percent. */
  position?: SubtitlePosition;
  shotOverrides?: ShotCaptionOverride[];
  archetypeWindows?: ArchetypeWindow[];
  editStyleId?: string;
  /**
   * Stage/speaker layout windows. `stack` hangs captions just below the frame
   * seam, `stack-flipped` sits them just above it, `takeover`/`pip` anchor at
   * 78% height, and `over` (or no window) keeps the ordinary anchor.
   */
  layoutWindows?: CaptionLayoutWindow[];
}

// ---------------------------------------------------------------------------
// Locked visual constants
// ---------------------------------------------------------------------------

export const STANDARD_FONT = 'Inter';
export const FANCY_FONT = 'Bebas Neue';
export const STANDARD_COLOR = '#ffffff';
export const DEFAULT_ACCENT = '#9f75ff';
export const EDITORIAL_FONT = 'Instrument Serif';

const DEFAULT_FRAME_WIDTH = 1080;
const DEFAULT_FRAME_HEIGHT = 1920;
const FULLSCREEN_QUOTE_FONT_SIZE_FRACTION = 0.095;
const LINE_HEIGHT_FACTOR = 0.85;
const SHADOW_BLUR = 12;
const SHADOW_THICKNESS = 6;
const SHADOW_COLOR = '#000000';
const CAPTION_LEAD_IN_SECONDS = 0.08;
const CAPTION_LEAD_OUT_SECONDS = 0.2;
const MIN_OVERSIZED_TOKEN_SCALE_PERCENT = 20;
/** Style ScaleX/ScaleY that restores the visual size after LINE_HEIGHT_FACTOR. */
const GLYPH_SCALE_PERCENT = Math.round(100 / LINE_HEIGHT_FACTOR);
/** Gap between the stage/speaker seam and a stacked caption block. */
const LAYOUT_SEAM_GAP_FRACTION = 0.015;
/** Bottom anchor used while a takeover or picture-in-picture layout is on screen. */
const LAYOUT_LOWER_ANCHOR_FRACTION = 0.78;
/** Caption baseline for `pip`: above the bottom-right speaker window. */
const LAYOUT_PIP_ANCHOR_FRACTION = 0.68;

// Editorial mode ----------------------------------------------------------

const EDITORIAL_STYLE_NAME = 'Editorial';
/** The serif has a smaller x-height than Inter, so it renders a little larger. */
const EDITORIAL_SIZE_SCALE = 1.12;
/** Upcoming words: fill alpha 0x8C ≈ 45% opacity. */
const EDITORIAL_DIM_ALPHA = '&H8C&';
/** Soft legibility halo (outline + shadow), mostly transparent black. */
const EDITORIAL_GLOW_ALPHA = 'B4';
const EDITORIAL_DIM_GLOW_ALPHA = 'E6';
const EDITORIAL_OUTLINE = 3;
const EDITORIAL_SHADOW = 2;
const EDITORIAL_BLUR = 8;
/** Pill: white at 20% opacity (ASS alpha 0xCC), softly blurred. */
const EDITORIAL_PILL_ALPHA = '&HCC&';
const EDITORIAL_PILL_BLUR = 1.5;
const EDITORIAL_PILL_FADE_MS = 60;
const EDITORIAL_PILL_RADIUS_EM = 0.28;
const EDITORIAL_PILL_PAD_X_EM = 0.16;
const EDITORIAL_PILL_PAD_Y_EM = 0.08;
/** Pill band spans cap height to just below the baseline, before padding. */
const EDITORIAL_PILL_TOP_EM = 0.74;
const EDITORIAL_PILL_BOTTOM_EM = 0.2;

// Instrument Serif metrics (upm 1000, usWinAscent 990, usWinDescent 310).
// libass sizes a face so winAscent + winDescent equals the rendered line
// height, so one em is 1000/1300 of the line and the ascent is 990/1300.
const SERIF_EM_PER_LINE = 1000 / 1300;
const SERIF_ASCENT_PER_LINE = 990 / 1300;

/** Advance widths in 1/1000 em for U+0020..U+007E, Instrument Serif Regular. */
const SERIF_REGULAR_ADVANCES = [
  170, 237, 371, 635, 417, 590, 579, 233, 340, 340, 444, 531, 217, 430, 213, 258, 460, 249, 404,
  371, 393, 382, 404, 364, 433, 402, 213, 217, 531, 531, 531, 317, 660, 457, 478, 480, 530, 453,
  408, 521, 546, 249, 249, 496, 413, 665, 540, 540, 466, 540, 513, 407, 461, 536, 457, 651, 546,
  477, 427, 325, 258, 325, 433, 376, 354, 399, 443, 339, 457, 355, 288, 402, 470, 223, 215, 451,
  220, 704, 470, 408, 444, 442, 318, 308, 259, 454, 393, 597, 385, 401, 353, 318, 252, 318, 531,
];

/** Advance widths in 1/1000 em for U+0020..U+007E, Instrument Serif Italic. */
const SERIF_ITALIC_ADVANCES = [
  170, 275, 374, 629, 424, 591, 525, 235, 346, 346, 449, 531, 219, 426, 219, 258, 461, 248, 404,
  373, 394, 387, 411, 365, 437, 414, 299, 301, 531, 531, 531, 358, 665, 457, 479, 475, 536, 454,
  411, 514, 545, 250, 251, 499, 414, 665, 542, 540, 469, 541, 525, 424, 461, 537, 458, 653, 545,
  478, 427, 326, 256, 326, 431, 372, 355, 474, 431, 351, 474, 348, 273, 401, 476, 288, 266, 447,
  240, 745, 521, 414, 450, 425, 368, 302, 272, 508, 412, 609, 450, 418, 385, 320, 252, 320, 531,
];

interface ArchetypeCaptionOverride {
  font: string;
  color: string;
  italic?: boolean;
  killHalo?: boolean;
}

const FULLSCREEN_QUOTE_VISUAL: ArchetypeCaptionOverride = {
  font: 'Instrument Serif',
  color: '#23100c',
  italic: true,
  killHalo: true,
};

// ---------------------------------------------------------------------------
// Color, time, and text measurement helpers
// ---------------------------------------------------------------------------

/** Convert CSS hex to ASS `&HAABBGGRR` (ASS alpha is inverted). */
function hexToASS(hex: string): string {
  const h = hex.replace('#', '');
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  if (h.length === 8) {
    a = Number.parseInt(h.slice(0, 2), 16);
    r = Number.parseInt(h.slice(2, 4), 16);
    g = Number.parseInt(h.slice(4, 6), 16);
    b = Number.parseInt(h.slice(6, 8), 16);
  } else if (h.length === 6) {
    r = Number.parseInt(h.slice(0, 2), 16);
    g = Number.parseInt(h.slice(2, 4), 16);
    b = Number.parseInt(h.slice(4, 6), 16);
  } else if (h.length === 3) {
    r = Number.parseInt(h[0] + h[0], 16);
    g = Number.parseInt(h[1] + h[1], 16);
    b = Number.parseInt(h[2] + h[2], 16);
  } else {
    return '&H00FFFFFF';
  }
  const pad = (value: number): string => value.toString(16).toUpperCase().padStart(2, '0');
  return `&H${pad(a)}${pad(b)}${pad(g)}${pad(r)}`;
}

/** Format seconds as ASS H:MM:SS.cc without producing an invalid `.100`. */
function formatASSTime(seconds: number): string {
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(totalCentiseconds / 360_000);
  const minutes = Math.floor((totalCentiseconds % 360_000) / 6_000);
  const wholeSeconds = Math.floor((totalCentiseconds % 6_000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function isEmphasized(word: WordInput): boolean {
  const emphasis = word.emphasis;
  if (typeof emphasis === 'boolean') return emphasis;
  return emphasis === 'emphasis' || emphasis === 'supersize' || emphasis === 'box';
}

function isCjk(codePoint: number): boolean {
  return (
    (codePoint >= 0x2e80 && codePoint <= 0x9fff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff)
  );
}

function isEmoji(codePoint: number): boolean {
  return (
    (codePoint >= 0x1f000 && codePoint <= 0x1faff) || (codePoint >= 0x2600 && codePoint <= 0x27bf)
  );
}

/**
 * Which width table the estimator uses. `sans` is the conservative Inter-bold
 * class estimate in units of the visual font size; `serif` uses Instrument
 * Serif's real ASCII advances in units of the rendered libass line height.
 */
type CaptionFontMetrics = 'sans' | 'serif';

/** Conservative per-character advance for Inter bold, in visual font sizes. */
function sansCharacterWidth(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint === 0x200d || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)) return 0;
  if (isEmoji(codePoint)) return 1.15;
  if (isCjk(codePoint)) return 1;
  if (/\s/u.test(character)) return 0.34;
  if (/[ilI1|!.,'`:;]/u.test(character)) return 0.32;
  if (/[mwMW@%&#]/u.test(character)) return 0.95;
  if (/[A-Z0-9]/u.test(character)) return 0.68;
  if (/[-–—_+()[\]{}?/\\]/u.test(character)) return 0.48;
  return 0.58;
}

/** Instrument Serif advance in em; non-ASCII falls back to the sans class. */
function serifCharacterWidthEm(character: string, italic: boolean): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint >= 0x20 && codePoint <= 0x7e) {
    return (italic ? SERIF_ITALIC_ADVANCES : SERIF_REGULAR_ADVANCES)[codePoint - 0x20] / 1000;
  }
  if (/\s/u.test(character)) return SERIF_REGULAR_ADVANCES[0] / 1000;
  return sansCharacterWidth(character);
}

/** Glyph-advance estimate used before ASS tags are inserted. */
function estimateTextWidth(
  text: string,
  visualFontSize: number,
  metrics: CaptionFontMetrics = 'sans',
  italic = false,
): number {
  let emWidth = 0;
  if (metrics === 'serif') {
    for (const character of text) emWidth += serifCharacterWidthEm(character, italic);
    return emWidth * visualFontSize * SERIF_EM_PER_LINE;
  }
  for (const character of text) emWidth += sansCharacterWidth(character);
  return emWidth * visualFontSize;
}

/** Font-aware measurement context shared by wrapping and pill placement. */
interface TextMeasure {
  metrics: CaptionFontMetrics;
  visualFontSize: number;
}

function measureWord(word: WordInput, measure: TextMeasure): number {
  // Serif is only used by editorial mode, where emphasis words are italic.
  const italic = measure.metrics === 'serif' && isEmphasized(word);
  return estimateTextWidth(word.text, measure.visualFontSize, measure.metrics, italic);
}

function measureSpace(measure: TextMeasure): number {
  return estimateTextWidth(' ', measure.visualFontSize, measure.metrics);
}

function estimateLineWidth(words: WordInput[], measure: TextMeasure): number {
  const wordWidths = words.reduce((total, word) => total + measureWord(word, measure), 0);
  const spaces = Math.max(0, words.length - 1) * measureSpace(measure);
  return wordWidths + spaces;
}

interface LineLayout {
  /** Word index where the second line begins; undefined means one line. */
  breakIndex?: number;
  horizontalScalePercent: number;
}

/** Choose one line, or the most balanced valid two-line hard break. */
function chooseLineLayout(
  words: WordInput[],
  measure: TextMeasure,
  maxLineWidth: number,
): LineLayout | null {
  if (words.length === 0) return null;

  const oneLineWidth = estimateLineWidth(words, measure);
  if (oneLineWidth <= maxLineWidth) {
    return { horizontalScalePercent: 100 };
  }

  let best:
    | {
        breakIndex: number;
        imbalance: number;
        widestLine: number;
      }
    | undefined;
  for (let breakIndex = 1; breakIndex < words.length; breakIndex++) {
    const firstWidth = estimateLineWidth(words.slice(0, breakIndex), measure);
    const secondWidth = estimateLineWidth(words.slice(breakIndex), measure);
    if (firstWidth > maxLineWidth || secondWidth > maxLineWidth) continue;
    const candidate = {
      breakIndex,
      imbalance: Math.abs(firstWidth - secondWidth),
      widestLine: Math.max(firstWidth, secondWidth),
    };
    if (
      !best ||
      candidate.imbalance < best.imbalance ||
      (candidate.imbalance === best.imbalance && candidate.widestLine < best.widestLine)
    ) {
      best = candidate;
    }
  }
  if (best) {
    return { breakIndex: best.breakIndex, horizontalScalePercent: 100 };
  }

  // One unbreakable token gets its own event and a bounded horizontal scale.
  if (words.length === 1) {
    const requiredScale = Math.floor((maxLineWidth / Math.max(1, oneLineWidth)) * 100);
    return {
      horizontalScalePercent: Math.max(
        MIN_OVERSIZED_TOKEN_SCALE_PERCENT,
        Math.min(100, requiredScale),
      ),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Presentation resolution and single-pass grouping
// ---------------------------------------------------------------------------

type CaptionRole = 'ordinary' | 'hero';

/** ASS numpad alignment: bottom-center, middle-center, or top-center. */
type CaptionAlignment = 2 | 5 | 8;

interface CaptionPresentation {
  signature: string;
  role: CaptionRole;
  archetype: Archetype | null;
  mode: CaptionMode;
  accent: string;
  maxWords: number;
  anchor: SubtitleAnchor;
  alignment: CaptionAlignment;
  layout: CaptionLayout;
  metrics: CaptionFontMetrics;
  visualFontSize: number;
  encodedFontSize: number;
  visual?: ArchetypeCaptionOverride;
}

function presentationMeasure(presentation: CaptionPresentation): TextMeasure {
  return { metrics: presentation.metrics, visualFontSize: presentation.visualFontSize };
}

/** Editorial mode renders ordinary (non-hero) groups with the serif track. */
function isEditorial(presentation: CaptionPresentation): boolean {
  return presentation.mode === 'editorial' && presentation.role === 'ordinary';
}

interface CaptionGroup {
  words: WordInput[];
  rawStart: number;
  rawEnd: number;
  start: number;
  end: number;
  presentation: CaptionPresentation;
  lineLayout: LineLayout;
}

interface IndexedWindow<T> {
  value: T;
  startTime: number;
  endTime: number;
  sourceIndex: number;
}

function prepareWindows<T extends { startTime: number; endTime: number }>(
  windows: T[] | undefined,
): IndexedWindow<T>[] {
  return (windows ?? [])
    .map((value, sourceIndex) => ({
      value,
      startTime: value.startTime,
      endTime: value.endTime,
      sourceIndex,
    }))
    .filter(
      (window) =>
        Number.isFinite(window.startTime) &&
        Number.isFinite(window.endTime) &&
        window.endTime > window.startTime,
    )
    .sort((left, right) =>
      left.startTime === right.startTime
        ? left.sourceIndex - right.sourceIndex
        : left.startTime - right.startTime,
    );
}

/** Half-open lookup; in overlaps, the most recently started window wins. */
function findActiveWindow<T>(windows: IndexedWindow<T>[], time: number): T | undefined {
  let active: IndexedWindow<T> | undefined;
  for (const window of windows) {
    if (window.startTime > time) break;
    if (time >= window.startTime && time < window.endTime) active = window;
  }
  return active?.value;
}

/** Editorial encoded Style size: same visual fraction, ~1.12× for the serif. */
function editorialEncodedFontSize(ordinaryVisualFontSize: number): number {
  return Math.round(ordinaryVisualFontSize * EDITORIAL_SIZE_SCALE * LINE_HEIGHT_FACTOR);
}

function resolveMode(
  style: CaptionStyleInput | undefined,
  fallback?: CaptionStyleInput,
): CaptionMode {
  return style?.captionMode ?? fallback?.captionMode ?? 'standard';
}

function resolveAccent(style: CaptionStyleInput | undefined, fallback?: CaptionStyleInput): string {
  return style?.accentColor ?? fallback?.accentColor ?? DEFAULT_ACCENT;
}

interface BuildContext {
  frameWidth: number;
  frameHeight: number;
  ordinaryAnchor: SubtitleAnchor;
  ordinaryVisualFontSize: number;
  ordinaryEncodedFontSize: number;
  maxLineWidth: number;
  wordsPerLine: number;
  editStyleId: string;
  archetypeWindows: IndexedWindow<ArchetypeWindow>[];
  shotOverrides: IndexedWindow<ShotCaptionOverride>[];
  layoutWindows: IndexedWindow<CaptionLayoutWindow>[];
}

/** Anchor + alignment for an ordinary caption block under a screen layout. */
function resolveLayoutPlacement(
  layout: CaptionLayout,
  context: BuildContext,
): { anchor: SubtitleAnchor; alignment: CaptionAlignment } {
  const seam = context.frameHeight / 2;
  const gap = context.frameHeight * LAYOUT_SEAM_GAP_FRACTION;
  const x = context.ordinaryAnchor.x;
  switch (layout) {
    case 'stack':
      // Stage on top, speaker below: hang the block from just under the seam.
      return { anchor: { x, y: Math.round(seam + gap) }, alignment: 8 };
    case 'stack-flipped':
      // Speaker on top, stage below: sit the block just above the seam.
      return { anchor: { x, y: Math.round(seam - gap) }, alignment: 2 };
    case 'takeover':
      return {
        anchor: { x, y: Math.round(context.frameHeight * LAYOUT_LOWER_ANCHOR_FRACTION) },
        alignment: 2,
      };
    case 'pip':
      // The speaker window owns the bottom-right corner (≈ y 70–97%); sit the
      // block just above it, below the stage's safe box.
      return {
        anchor: { x, y: Math.round(context.frameHeight * LAYOUT_PIP_ANCHOR_FRACTION) },
        alignment: 2,
      };
    default:
      return { anchor: context.ordinaryAnchor, alignment: 2 };
  }
}

function createPresentationResolver(
  style: CaptionStyleInput,
  context: BuildContext,
): (word: WordInput) => CaptionPresentation {
  return (word) => {
    const midpoint = (word.start + word.end) / 2;
    const archetypeWindow = findActiveWindow(context.archetypeWindows, midpoint);
    const shotOverride = findActiveWindow(context.shotOverrides, midpoint);
    const archetype = archetypeWindow?.archetype ?? null;
    const role: CaptionRole = archetype === 'fullscreen-quote' ? 'hero' : 'ordinary';
    const mode = resolveMode(shotOverride?.style, style);
    const accent = resolveAccent(shotOverride?.style, style);
    const template = archetype ? resolveTemplate(archetype, context.editStyleId) : undefined;
    const maxWords =
      role === 'hero' || template?.captionMode === 'word-by-word' ? 1 : context.wordsPerLine;
    const layout =
      role === 'hero'
        ? 'over'
        : (findActiveWindow(context.layoutWindows, midpoint)?.layout ?? 'over');
    const editorial = role === 'ordinary' && mode === 'editorial';
    const placement =
      role === 'hero'
        ? {
            anchor: {
              x: Math.round(context.frameWidth / 2),
              y: Math.round(context.frameHeight / 2),
            },
            alignment: 5 as const,
          }
        : resolveLayoutPlacement(layout, context);
    let visualFontSize = context.ordinaryVisualFontSize;
    let encodedFontSize = context.ordinaryEncodedFontSize;
    if (role === 'hero') {
      visualFontSize = FULLSCREEN_QUOTE_FONT_SIZE_FRACTION * context.frameHeight;
      encodedFontSize = Math.round(visualFontSize * LINE_HEIGHT_FACTOR);
    } else if (editorial) {
      encodedFontSize = editorialEncodedFontSize(context.ordinaryVisualFontSize);
      // Serif metrics are expressed against the real rendered line height.
      visualFontSize = (encodedFontSize * GLYPH_SCALE_PERCENT) / 100;
    }

    return {
      signature: [role, archetype ?? 'none', mode, accent.toLowerCase(), maxWords, layout].join(
        '|',
      ),
      role,
      archetype,
      mode,
      accent,
      maxWords,
      anchor: placement.anchor,
      alignment: placement.alignment,
      layout,
      metrics: editorial ? 'serif' : 'sans',
      visualFontSize,
      encodedFontSize,
      visual: role === 'hero' ? FULLSCREEN_QUOTE_VISUAL : undefined,
    };
  };
}

function groupCaptionWords(
  words: WordInput[],
  resolvePresentation: (word: WordInput) => CaptionPresentation,
  maxLineWidth: number,
): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  let current: CaptionGroup | undefined;

  const startGroup = (word: WordInput, presentation: CaptionPresentation): CaptionGroup => {
    const lineLayout = chooseLineLayout([word], presentationMeasure(presentation), maxLineWidth);
    if (!lineLayout) {
      throw new Error(`Unable to lay out caption word: ${word.text}`);
    }
    return {
      words: [word],
      rawStart: word.start,
      rawEnd: word.end,
      start: word.start,
      end: word.end,
      presentation,
      lineLayout,
    };
  };

  const flush = (): void => {
    if (current) groups.push(current);
    current = undefined;
  };

  for (const word of words) {
    const presentation = resolvePresentation(word);
    if (!current) {
      current = startGroup(word, presentation);
      continue;
    }

    const candidateWords = [...current.words, word];
    const samePresentation = current.presentation.signature === presentation.signature;
    const withinWordLimit = candidateWords.length <= presentation.maxWords;
    const candidateLayout =
      samePresentation && withinWordLimit
        ? chooseLineLayout(candidateWords, presentationMeasure(presentation), maxLineWidth)
        : null;

    if (!candidateLayout) {
      flush();
      current = startGroup(word, presentation);
      continue;
    }

    current.words = candidateWords;
    current.rawEnd = word.end;
    current.end = word.end;
    current.lineLayout = candidateLayout;
  }
  flush();
  return groups;
}

/** Apply padding and emphasis dwell once, against the complete group list. */
function finalizeGroupTiming(groups: CaptionGroup[]): void {
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const previous = index > 0 ? groups[index - 1] : undefined;
    const next = index + 1 < groups.length ? groups[index + 1] : undefined;

    group.start = Math.max(
      previous?.end ?? 0,
      Math.max(0, group.rawStart - CAPTION_LEAD_IN_SECONDS),
    );

    let desiredEnd = group.rawEnd + CAPTION_LEAD_OUT_SECONDS;
    if (group.presentation.mode !== 'standard') {
      for (const word of group.words) {
        if (isEmphasized(word)) {
          desiredEnd = Math.max(desiredEnd, minEmphasisDwellEnd(word.start));
        }
      }
    }

    const nextBoundary = next ? next.rawStart : Number.POSITIVE_INFINITY;
    group.end = Math.max(group.start, Math.min(nextBoundary, desiredEnd));
  }
}

function buildCaptionGroups(
  words: WordInput[],
  style: CaptionStyleInput,
  options: CaptionGenerationOptions,
): { groups: CaptionGroup[]; context: BuildContext } {
  const frameWidth =
    Number.isFinite(options.frameWidth) && (options.frameWidth ?? 0) > 0
      ? Math.round(options.frameWidth as number)
      : DEFAULT_FRAME_WIDTH;
  const frameHeight =
    Number.isFinite(options.frameHeight) && (options.frameHeight ?? 0) > 0
      ? Math.round(options.frameHeight as number)
      : DEFAULT_FRAME_HEIGHT;
  const ordinaryAnchor = resolveSubtitleAnchor(
    options.position ?? DEFAULT_SUBTITLE_POSITION,
    frameWidth,
    frameHeight,
  );
  const ordinaryVisualFontSize = style.fontSize * frameHeight;
  const ordinaryEncodedFontSize = Math.round(ordinaryVisualFontSize * LINE_HEIGHT_FACTOR);
  const wordsPerLine = Math.max(1, style.wordsPerLine | 0 || 4);
  const context: BuildContext = {
    frameWidth,
    frameHeight,
    ordinaryAnchor,
    ordinaryVisualFontSize,
    ordinaryEncodedFontSize,
    maxLineWidth: frameWidth * CAPTION_MAX_WIDTH_FRACTION,
    wordsPerLine,
    editStyleId: options.editStyleId ?? DEFAULT_EDIT_STYLE_ID,
    archetypeWindows: prepareWindows(options.archetypeWindows),
    shotOverrides: prepareWindows(options.shotOverrides),
    layoutWindows: prepareWindows(options.layoutWindows),
  };
  const groups = groupCaptionWords(
    words,
    createPresentationResolver(style, context),
    context.maxLineWidth,
  );
  finalizeGroupTiming(groups);
  return { groups, context };
}

// ---------------------------------------------------------------------------
// ASS event and document rendering
// ---------------------------------------------------------------------------

function renderWord(
  word: WordInput,
  presentation: CaptionPresentation,
  standardASS: string,
): string {
  if (presentation.mode === 'standard' || !isEmphasized(word) || presentation.visual) {
    return word.text;
  }
  const accentASS = hexToASS(presentation.accent);
  if (presentation.mode === 'emphasis') {
    return `{\\1c${accentASS}}${word.text}{\\1c${standardASS}}`;
  }
  return `{\\fn${FANCY_FONT}\\1c${accentASS}}${word.text}{\\fn${STANDARD_FONT}\\1c${standardASS}}`;
}

function renderCaptionGroup(group: CaptionGroup, ordinaryEncodedFontSize: number): string {
  const { presentation, lineLayout } = group;
  const start = formatASSTime(group.start);
  const end = formatASSTime(group.end);
  const standardASS = hexToASS(STANDARD_COLOR);
  const visual = presentation.visual;
  const blurValue = visual?.killHalo ? 0 : SHADOW_BLUR;
  const alignment = presentation.alignment;
  const positionTags = `\\an${alignment}\\pos(${presentation.anchor.x},${presentation.anchor.y})\\q2`;
  const visualTags = [
    visual?.font ? `\\fn${visual.font}` : '',
    visual?.italic ? '\\i1' : '',
    visual?.color ? `\\1c${hexToASS(visual.color)}` : '',
    visual?.killHalo ? '\\bord0' : '',
  ].join('');
  const sizeTag =
    presentation.encodedFontSize !== ordinaryEncodedFontSize
      ? `\\fs${presentation.encodedFontSize}`
      : '';
  const horizontalScaleTag =
    lineLayout.horizontalScalePercent < 100
      ? `\\fscx${Math.round(lineLayout.horizontalScalePercent / LINE_HEIGHT_FACTOR)}`
      : '';
  const prefix = `{${positionTags}\\blur${blurValue}${sizeTag}${horizontalScaleTag}${visualTags}}`;

  const text = group.words
    .map((word, index) => {
      const rendered = renderWord(word, presentation, standardASS);
      if (index === group.words.length - 1) return rendered;
      return `${rendered}${lineLayout.breakIndex === index + 1 ? '\\N' : ' '}`;
    })
    .join('');

  return `Dialogue: 0,${start},${end},Default,,0,0,0,,${prefix}${text}`;
}

// Editorial mode ----------------------------------------------------------

function formatDrawingNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** Closed rounded rectangle from (0,0) to (width,height) as ASS `\p1` commands. */
function roundedRectDrawing(width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  // Cubic-bezier circle approximation constant.
  const k = r * (1 - 0.5523);
  const w = width;
  const h = height;
  const n = formatDrawingNumber;
  return [
    `m ${n(r)} 0`,
    `l ${n(w - r)} 0`,
    `b ${n(w - k)} 0 ${n(w)} ${n(k)} ${n(w)} ${n(r)}`,
    `l ${n(w)} ${n(h - r)}`,
    `b ${n(w)} ${n(h - k)} ${n(w - k)} ${n(h)} ${n(w - r)} ${n(h)}`,
    `l ${n(r)} ${n(h)}`,
    `b ${n(k)} ${n(h)} 0 ${n(h - k)} 0 ${n(h - r)}`,
    `l 0 ${n(r)}`,
    `b 0 ${n(k)} ${n(k)} 0 ${n(r)} 0`,
  ].join(' ');
}

interface WordBox {
  /** Left edge of the word's advance box, in canvas pixels. */
  left: number;
  width: number;
  baseline: number;
}

/**
 * Predict where libass places each word of an editorial group: every line is
 * centered on the anchor x (advance-width bbox), lines stack at the rendered
 * line height, and the block is aligned to the anchor per `\an2`/`\an8`.
 */
function layoutEditorialWords(group: CaptionGroup): WordBox[] {
  const { presentation, lineLayout, words } = group;
  const measure = presentationMeasure(presentation);
  const lineHeight = presentation.visualFontSize;
  const ascent = lineHeight * SERIF_ASCENT_PER_LINE;
  const xScale = horizontalScaleRatio(lineLayout);
  const breakIndex = lineLayout.breakIndex ?? words.length;
  const lines = [words.slice(0, breakIndex), words.slice(breakIndex)].filter(
    (line) => line.length > 0,
  );
  const blockTop =
    presentation.alignment === 8
      ? presentation.anchor.y
      : presentation.anchor.y - lines.length * lineHeight;
  const space = measureSpace(measure) * xScale;

  const boxes: WordBox[] = [];
  lines.forEach((line, lineIndex) => {
    const widths = line.map((word) => measureWord(word, measure) * xScale);
    const lineWidth = widths.reduce((sum, width) => sum + width, 0) + space * (line.length - 1);
    const baseline = blockTop + lineIndex * lineHeight + ascent;
    let cursor = presentation.anchor.x - lineWidth / 2;
    for (const width of widths) {
      boxes.push({ left: cursor, width, baseline });
      cursor += width + space;
    }
  });
  return boxes;
}

/** Effective horizontal scale relative to the Style's ScaleX. */
function horizontalScaleRatio(lineLayout: LineLayout): number {
  if (lineLayout.horizontalScalePercent >= 100) return 1;
  return Math.round(lineLayout.horizontalScalePercent / LINE_HEIGHT_FACTOR) / GLYPH_SCALE_PERCENT;
}

function renderEditorialPill(box: WordBox, emSize: number, start: string, end: string): string {
  const padX = emSize * EDITORIAL_PILL_PAD_X_EM;
  const padY = emSize * EDITORIAL_PILL_PAD_Y_EM;
  const x = box.left - padX;
  const y = box.baseline - emSize * EDITORIAL_PILL_TOP_EM - padY;
  const width = box.width + padX * 2;
  const height = emSize * (EDITORIAL_PILL_TOP_EM + EDITORIAL_PILL_BOTTOM_EM) + padY * 2;
  const drawing = roundedRectDrawing(width, height, emSize * EDITORIAL_PILL_RADIUS_EM);
  const tags =
    // \fscx/\fscy 100 cancel the Style's glyph scale so drawing units are pixels.
    `\\an7\\pos(${Math.round(x)},${Math.round(y)})\\fscx100\\fscy100\\bord0\\shad0\\blur${EDITORIAL_PILL_BLUR}` +
    `\\1c${hexToASS(STANDARD_COLOR)}\\1a${EDITORIAL_PILL_ALPHA}\\fad(${EDITORIAL_PILL_FADE_MS},0)\\p1`;
  return `Dialogue: 0,${start},${end},${EDITORIAL_STYLE_NAME},,0,0,0,,{${tags}}${drawing}{\\p0}`;
}

function renderEditorialText(group: CaptionGroup, activeIndex: number): string {
  const { presentation, lineLayout } = group;
  const standardASS = hexToASS(STANDARD_COLOR);
  const accentASS = hexToASS(presentation.accent);
  const horizontalScaleTag =
    lineLayout.horizontalScalePercent < 100
      ? `\\fscx${Math.round(lineLayout.horizontalScalePercent / LINE_HEIGHT_FACTOR)}`
      : '';
  const prefix =
    `{\\an${presentation.alignment}\\pos(${presentation.anchor.x},${presentation.anchor.y})\\q2` +
    `\\blur${EDITORIAL_BLUR}${horizontalScaleTag}}`;
  const dimTags = `\\alpha${EDITORIAL_DIM_ALPHA}\\3a&H${EDITORIAL_DIM_GLOW_ALPHA}&\\4a&H${EDITORIAL_DIM_GLOW_ALPHA}&`;

  return (
    prefix +
    group.words
      .map((word, index) => {
        // Spoken and active words keep the Style's full-opacity alphas; the
        // first upcoming word switches the rest of the event to the dim state.
        const stateTag = index === activeIndex + 1 ? `{${dimTags}}` : '';
        const rendered = isEmphasized(word)
          ? `{\\i1\\1c${accentASS}}${word.text}{\\i0\\1c${standardASS}}`
          : word.text;
        const separator =
          index === group.words.length - 1 ? '' : lineLayout.breakIndex === index + 1 ? '\\N' : ' ';
        return `${stateTag}${rendered}${separator}`;
      })
      .join('')
  );
}

/**
 * One pill (layer 0) + one text event (layer 1) per word time slice. Slices
 * run from each word's start to the next word's start; the first begins at
 * the group start and the last ends at the group end (lead-in/out, dwell).
 */
function renderEditorialGroup(group: CaptionGroup): string[] {
  const boxes = layoutEditorialWords(group);
  const emSize = group.presentation.visualFontSize * SERIF_EM_PER_LINE;
  const lines: string[] = [];
  let sliceStart = group.start;
  for (let index = 0; index < group.words.length; index++) {
    const nextWord = group.words[index + 1];
    const sliceEnd = nextWord
      ? Math.min(group.end, Math.max(sliceStart, nextWord.start))
      : group.end;
    const start = formatASSTime(sliceStart);
    const end = formatASSTime(sliceEnd);
    sliceStart = sliceEnd;
    if (start === end) continue;
    lines.push(renderEditorialPill(boxes[index], emSize, start, end));
    lines.push(
      `Dialogue: 1,${start},${end},${EDITORIAL_STYLE_NAME},,0,0,0,,${renderEditorialText(group, index)}`,
    );
  }
  return lines;
}

function renderGroupEvents(group: CaptionGroup, ordinaryEncodedFontSize: number): string[] {
  if (isEditorial(group.presentation)) return renderEditorialGroup(group);
  return [renderCaptionGroup(group, ordinaryEncodedFontSize)];
}

/**
 * Public pure dialogue-line entry point used by focused caption tests.
 * It routes through the same grouping, wrapping, timing, and rendering pass as
 * full document generation with a constant ordinary presentation.
 */
export function buildAssLines(
  words: WordInput[],
  mode: CaptionMode,
  accent: string = DEFAULT_ACCENT,
  wordsPerLine = 4,
): string[] {
  if (words.length === 0) return [];
  const style: CaptionStyleInput = {
    captionMode: mode,
    accentColor: accent,
    fontSize: 0.065,
    wordsPerLine,
  };
  const { groups, context } = buildCaptionGroups(words, style, {});
  return groups.flatMap((group) => renderGroupEvents(group, context.ordinaryEncodedFontSize));
}

/** Build a complete ASS document without filesystem I/O. */
export function buildCaptionASSDocument(
  words: WordInput[],
  style: CaptionStyleInput,
  options: CaptionGenerationOptions = {},
): string {
  const { groups, context } = buildCaptionGroups(words, style, options);
  const standardASS = hexToASS(STANDARD_COLOR);
  const shadowASS = hexToASS(SHADOW_COLOR);
  const glyphScale = GLYPH_SCALE_PERCENT;
  const horizontalMargin = Math.round(context.frameWidth * CAPTION_HORIZONTAL_INSET_FRACTION);
  const styleLine =
    `Style: Default,${STANDARD_FONT},${context.ordinaryEncodedFontSize},${standardASS},${standardASS},` +
    `${shadowASS},${shadowASS},-1,0,0,0,${glyphScale},${glyphScale},0,0,1,${SHADOW_THICKNESS},0,5,${horizontalMargin},${horizontalMargin},0,1`;
  // The serif style is only declared when an editorial group exists, so other
  // modes' documents stay byte-identical.
  const editorialGlowASS = `&H${EDITORIAL_GLOW_ALPHA}000000`;
  const editorialStyleLine = groups.some((group) => isEditorial(group.presentation))
    ? [
        `Style: ${EDITORIAL_STYLE_NAME},${EDITORIAL_FONT},${editorialEncodedFontSize(context.ordinaryVisualFontSize)},` +
          `${standardASS},${standardASS},${editorialGlowASS},${editorialGlowASS},0,0,0,0,${glyphScale},${glyphScale},0,0,1,` +
          `${EDITORIAL_OUTLINE},${EDITORIAL_SHADOW},2,${horizontalMargin},${horizontalMargin},0,1`,
      ]
    : [];
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${context.frameWidth}`,
    `PlayResY: ${context.frameHeight}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    styleLine,
    ...editorialStyleLine,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const dialogueLines = groups.flatMap((group) =>
    renderGroupEvents(group, context.ordinaryEncodedFontSize),
  );
  return [...header, ...dialogueLines, ''].join('\n');
}

// ---------------------------------------------------------------------------
// Public file writer
// ---------------------------------------------------------------------------

/**
 * Generate an ASS subtitle file from word-level timestamps.
 * The three-argument IPC call remains valid; layout options are optional.
 */
export async function generateCaptions(
  words: WordInput[],
  style: CaptionStyleInput,
  outputPath?: string,
  options: CaptionGenerationOptions = {},
): Promise<string> {
  if (words.length === 0) {
    throw new Error('No words provided for caption generation');
  }

  const assContent = buildCaptionASSDocument(words, style, options);
  const filePath = outputPath ?? join(tmpdir(), `batchcontent-captions-${Date.now()}.ass`);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, assContent, 'utf-8');
  return filePath;
}
