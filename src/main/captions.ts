// ---------------------------------------------------------------------------
// Captions — three modes, one stable editorial track.
//
// Ordinary subtitle events share one explicit bottom anchor and one visual
// font size for the whole clip, so one-line/two-line groups keep the same
// baseline. fullscreen-quote is the sole exception: the
// transcript becomes centered, full-frame hero typography for that window.
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

/** The three — and only three — caption visual modes supported by V2. */
export type CaptionMode = 'standard' | 'emphasis' | 'emphasis_highlight';

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

/** Optional layout and presentation inputs shared by preview and export. */
export interface CaptionGenerationOptions {
  frameWidth?: number;
  frameHeight?: number;
  /** Bottom-center anchor of the ordinary subtitle block, in canvas percent. */
  position?: SubtitlePosition;
  shotOverrides?: ShotCaptionOverride[];
  archetypeWindows?: ArchetypeWindow[];
  editStyleId?: string;
}

// ---------------------------------------------------------------------------
// Locked visual constants
// ---------------------------------------------------------------------------

export const STANDARD_FONT = 'Inter';
export const FANCY_FONT = 'Bebas Neue';
export const STANDARD_COLOR = '#ffffff';
export const DEFAULT_ACCENT = '#9f75ff';

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

/** Conservative glyph-advance estimate used before ASS tags are inserted. */
function estimateTextWidth(text: string, visualFontSize: number): number {
  let emWidth = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0x200d || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)) {
      continue;
    }
    if (isEmoji(codePoint)) emWidth += 1.15;
    else if (isCjk(codePoint)) emWidth += 1;
    else if (/\s/u.test(character)) emWidth += 0.34;
    else if (/[ilI1|!.,'`:;]/u.test(character)) emWidth += 0.32;
    else if (/[mwMW@%&#]/u.test(character)) emWidth += 0.95;
    else if (/[A-Z0-9]/u.test(character)) emWidth += 0.68;
    else if (/[-–—_+()[\]{}?/\\]/u.test(character)) emWidth += 0.48;
    else emWidth += 0.58;
  }
  return emWidth * visualFontSize;
}

function estimateLineWidth(words: WordInput[], visualFontSize: number): number {
  const wordWidths = words.reduce(
    (total, word) => total + estimateTextWidth(word.text, visualFontSize),
    0,
  );
  const spaces = Math.max(0, words.length - 1) * visualFontSize * 0.34;
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
  visualFontSize: number,
  maxLineWidth: number,
): LineLayout | null {
  if (words.length === 0) return null;

  const oneLineWidth = estimateLineWidth(words, visualFontSize);
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
    const firstWidth = estimateLineWidth(words.slice(0, breakIndex), visualFontSize);
    const secondWidth = estimateLineWidth(words.slice(breakIndex), visualFontSize);
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

interface CaptionPresentation {
  signature: string;
  role: CaptionRole;
  archetype: Archetype | null;
  mode: CaptionMode;
  accent: string;
  maxWords: number;
  anchor: SubtitleAnchor;
  visualFontSize: number;
  encodedFontSize: number;
  visual?: ArchetypeCaptionOverride;
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
    const anchor =
      role === 'hero'
        ? { x: Math.round(context.frameWidth / 2), y: Math.round(context.frameHeight / 2) }
        : context.ordinaryAnchor;
    const visualFontSize =
      role === 'hero'
        ? FULLSCREEN_QUOTE_FONT_SIZE_FRACTION * context.frameHeight
        : context.ordinaryVisualFontSize;
    const encodedFontSize =
      role === 'hero'
        ? Math.round(visualFontSize * LINE_HEIGHT_FACTOR)
        : context.ordinaryEncodedFontSize;

    return {
      signature: [role, archetype ?? 'none', mode, accent.toLowerCase(), maxWords].join('|'),
      role,
      archetype,
      mode,
      accent,
      maxWords,
      anchor,
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
    const lineLayout = chooseLineLayout([word], presentation.visualFontSize, maxLineWidth);
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
        ? chooseLineLayout(candidateWords, presentation.visualFontSize, maxLineWidth)
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
  const alignment = presentation.role === 'hero' ? 5 : 2;
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
  return groups.map((group) => renderCaptionGroup(group, context.ordinaryEncodedFontSize));
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
  const glyphScale = Math.round(100 / LINE_HEIGHT_FACTOR);
  const horizontalMargin = Math.round(context.frameWidth * CAPTION_HORIZONTAL_INSET_FRACTION);
  const styleLine =
    `Style: Default,${STANDARD_FONT},${context.ordinaryEncodedFontSize},${standardASS},${standardASS},` +
    `${shadowASS},${shadowASS},-1,0,0,0,${glyphScale},${glyphScale},0,0,1,${SHADOW_THICKNESS},0,5,${horizontalMargin},${horizontalMargin},0,1`;
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
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const dialogueLines = groups.map((group) =>
    renderCaptionGroup(group, context.ordinaryEncodedFontSize),
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
