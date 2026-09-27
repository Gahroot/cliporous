/**
 * Scene-kind spec: everything the planner needs to know about one explainer
 * scene kind, kept in one place so kinds can be added independently.
 *
 *  - `describe`/`schema` feed the Gemini prompt;
 *  - `parse` validates the model's untrusted JSON into a typed scene whose
 *    beat times are ABSOLUTE clip seconds (derived from word indices);
 *  - `layouts` lists the layouts this kind looks good in (first = preferred);
 *  - `cues` emits tasteful sound cues for the scene's beats;
 *  - `focusTimes` (optional) = beats where an emphasis pulse may target an item.
 *
 * Every spec is pure and deterministic.
 */

import {
  EXPLAINER_ICONS,
  type ExplainerIcon,
  type ExplainerLayout,
  type ExplainerSceneBody,
  type ExplainerSceneKind,
  type SceneCue,
} from '../../remotion/compositions/explainer/types';

export interface PlannerWord {
  text: string;
  start: number;
  end: number;
}

export type Rec = Record<string, unknown>;

export interface SceneWindow {
  startWord: number;
  endWord: number;
  /** Absolute seconds. */
  startTime: number;
  endTime: number;
}

/** Beats never land in the first/last this-many seconds of a scene. */
export const BEAT_EDGE_SEC = 0.3;

/** Helpers handed to every `parse` so kinds validate consistently. */
export interface ParseContext {
  words: readonly PlannerWord[];
  win: SceneWindow;
  /** Word index inside the window, else null. */
  inWin: (v: unknown) => number | null;
  /** Word index → absolute beat time, clamped inside the window's safe zone. */
  at: (wordIndex: number) => number;
  /** Trimmed, whitespace-collapsed string of 1..max chars, else null. */
  str: (v: unknown, max: number) => string | null;
  /** Known icon name, else 'Circle'. */
  icon: (v: unknown) => ExplainerIcon;
  /** Latest safe beat time inside the window. */
  lastBeat: number;
}

export interface KindSpec<K extends ExplainerSceneKind = ExplainerSceneKind> {
  kind: K;
  /** One line for the prompt: when to use this kind. */
  describe: string;
  /** JSON example (without startWord/endWord/layout — added by the prompt). */
  schema: string;
  /** Label length rules for the prompt, e.g. "label ≤ 26 chars". */
  limits: string;
  layouts: readonly ExplainerLayout[];
  /** Typical good length in seconds [min, max]. */
  durationSec: readonly [number, number];
  parse: (raw: Rec, ctx: ParseContext) => Extract<ExplainerSceneBody, { kind: K }> | null;
  cues: (scene: Extract<ExplainerSceneBody, { kind: K }>) => SceneCue[];
}

/** A spec for any kind (distributive, so each member keeps its own K). */
export type AnyKindSpec = { [K in ExplainerSceneKind]: KindSpec<K> }[ExplainerSceneKind];

// ---------------------------------------------------------------------------
// Shared validation helpers
// ---------------------------------------------------------------------------

const ICON_SET: ReadonlySet<string> = new Set(EXPLAINER_ICONS);

export function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length > 0 && s.length <= max ? s : null;
}

export function icon(v: unknown): ExplainerIcon {
  return typeof v === 'string' && ICON_SET.has(v) ? (v as ExplainerIcon) : 'Circle';
}

export function idx(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
}

/** Finite number in [lo, hi], else null. */
export function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}

/** Force a list of beat times to be non-decreasing. */
export function monotonic(times: readonly number[]): number[] {
  let prev = Number.NEGATIVE_INFINITY;
  return times.map((t) => {
    prev = Math.max(prev, t);
    return prev;
  });
}

/** Parse an array of `{…, word}` entries into items with absolute beat times. */
export function parseTimedList<T>(
  raw: unknown,
  ctx: ParseContext,
  item: (entry: Rec) => T | null,
  range: readonly [number, number],
): (T & { t: number })[] | null {
  if (!Array.isArray(raw)) return null;
  const items = raw.flatMap((entry) => {
    if (!isRec(entry)) return [];
    const w = ctx.inWin(entry.word);
    const value = item(entry);
    return value !== null && w !== null ? [{ ...value, t: ctx.at(w) }] : [];
  });
  const [min, max] = range;
  if (items.length < min) return null;
  const kept = items.slice(0, max);
  const times = monotonic(kept.map((i) => i.t));
  return kept.map((it, n) => ({ ...it, t: times[n] ?? it.t }));
}

export function makeParseContext(words: readonly PlannerWord[], win: SceneWindow): ParseContext {
  const lo = win.startTime + BEAT_EDGE_SEC;
  const hi = win.endTime - BEAT_EDGE_SEC;
  return {
    words,
    win,
    inWin: (v) => idx(v, win.startWord, win.endWord),
    at: (i) => {
      const w = words[i];
      const t = w ? w.start : win.startTime;
      return Math.min(hi, Math.max(lo, t));
    },
    str,
    icon,
    lastBeat: hi,
  };
}
