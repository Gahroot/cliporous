/**
 * Explainer-scene planner.
 *
 * Reads a clip's timed transcript and asks Gemini for a short list of animated
 * "explainer" scenes (checklist, versus, stamp, 3D flow, 3D stack) whose text
 * comes from the speaker's own words. The model references WORD INDICES, never
 * times; this module converts indices to exact word timestamps so every beat
 * (a tick, a stamp, a layer drop) lands on the spoken word.
 *
 * Everything the model returns is untrusted: `parseExplainerPlan` validates
 * shapes, lengths, icons, index ranges, durations and spacing, and drops
 * anything that does not fit rather than guessing.
 */

import { GoogleGenAI } from '@google/genai';
import { log } from '../logger';
import {
  EXPLAINER_ICONS,
  type ExplainerIcon,
  type ExplainerScene,
} from '../remotion/compositions/explainer/types';
import { callGeminiWithRetry, MODELS } from './gemini-client';

export interface PlannerWord {
  text: string;
  start: number;
  end: number;
}

/**
 * A planned scene. `startTime`/`endTime` and every beat inside `scene` are in
 * the SAME time basis as the input words (absolute). Call
 * {@link toSceneRelative} after the window is final to get render props.
 */
export interface PlannedExplainerScene {
  startTime: number;
  endTime: number;
  scene: ExplainerScene;
}

export interface PlanBounds {
  /** Earliest time a scene may start (the speaker owns the opening). */
  minStart: number;
  /** Latest time a scene may end. */
  maxEnd: number;
}

export type PlanResult =
  | { ok: true; value: PlannedExplainerScene[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const EXPLAINER_LIMITS = {
  minSceneSec: 2.5,
  maxSceneSec: 12,
  /** Talking-head gap kept between scenes. */
  minGapSec: 1.5,
  /** Lead-in before the first spoken word so the entrance plays first. */
  leadInSec: 0.2,
  tailSec: 0.3,
  /** Beats never land in the first/last this-many seconds of a scene. */
  beatEdgeSec: 0.3,
  checklistItems: [2, 5],
  stackLayers: [2, 4],
  text: {
    checklistLabel: 26,
    versusLabel: 18,
    stampWord: 10,
    flowLabel: 10,
    flowText: 16,
    engineLabel: 8,
    stackLabel: 18,
  },
} as const;

const ICON_SET: ReadonlySet<string> = new Set(EXPLAINER_ICONS);

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export function buildExplainerPrompt(words: PlannerWord[], bounds: PlanBounds): string {
  const indexed = words.map((w, i) => `${i}:${w.text}`).join(' ');
  const firstAllowed = words.findIndex((w) => w.start >= bounds.minStart);
  const L = EXPLAINER_LIMITS.text;
  return `You are a motion designer for short-form explainer videos. The top half of the screen is an animated "stage"; the speaker is on the bottom half. Turn what the speaker is SAYING into simple animated diagrams.

Transcript as index:word pairs:
${indexed}

Pick moments where the speaker explains something concrete and choose ONE scene type per moment:
- "checklist": they list steps/tasks/items (2-5 items). Each item ticks off on the word where they say it.
- "versus": they contrast two things (A vs B, AI vs people, before vs after).
- "stamp": a strong verdict or rule ("never", "yes, but", "stop", "always"). A hero icon plus a stamped word; optionally the icon gets crossed out.
- "flow": an input goes through a system/process and comes out as something else (prompt -> AI -> answer, lead -> call -> deal).
- "stack": layers or levels that build on each other (2-4 layers, listed bottom to top).

Return JSON only:
{"scenes":[
 {"kind":"checklist","startWord":N,"endWord":N,"items":[{"label":"...","icon":"Icon","word":N}]},
 {"kind":"versus","startWord":N,"endWord":N,"left":{"label":"...","icon":"Icon","word":N},"right":{"label":"...","icon":"Icon","word":N}},
 {"kind":"stamp","startWord":N,"endWord":N,"icon":"Icon","word":"NEVER","stampWord":N,"strikeWord":N or null},
 {"kind":"flow","startWord":N,"endWord":N,"inputLabel":"Prompt","inputText":"...","engineLabel":"AI","outputLabel":"Answer","outputText":"...","inputWord":N,"outputWord":N},
 {"kind":"stack","startWord":N,"endWord":N,"layers":[{"label":"...","word":N}],"dimWord":N or null}
]}

Rules:
- Every "word"/"...Word" value is the index of the word where that beat should happen, and must lie between the scene's startWord and endWord.
- Use the speaker's own words for labels. Max lengths: checklist label ${L.checklistLabel} chars, versus label ${L.versusLabel}, stamp word ${L.stampWord}, flow labels ${L.flowLabel}, flow texts ${L.flowText}, engine label ${L.engineLabel}, stack label ${L.stackLabel}.
- icon must be one of: ${EXPLAINER_ICONS.join(', ')}.
- A scene lasts 3-10 seconds of speech. Do not start before word ${Math.max(0, firstAllowed)}.
- Leave at least 2 seconds of plain speaker between scenes. Never overlap scenes.
- Only make a scene when a diagram genuinely helps; returning fewer (or zero) scenes is fine. Aim to cover roughly half the clip at most.
- Beats inside a scene must be in chronological order.`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length > 0 && s.length <= max ? s : null;
}

function icon(v: unknown): ExplainerIcon {
  return typeof v === 'string' && ICON_SET.has(v) ? (v as ExplainerIcon) : 'Circle';
}

function idx(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
}

interface Window {
  startWord: number;
  endWord: number;
  startTime: number;
  endTime: number;
}

/** Word index → beat time, clamped inside the window's safe zone. */
function beatTime(words: PlannerWord[], i: number, win: Window): number {
  const w = words[i];
  const t = w ? w.start : win.startTime;
  const lo = win.startTime + EXPLAINER_LIMITS.beatEdgeSec;
  const hi = win.endTime - EXPLAINER_LIMITS.beatEdgeSec;
  return Math.min(hi, Math.max(lo, t));
}

/** Force a list of beat times to be non-decreasing. */
function monotonic(times: number[]): number[] {
  let prev = Number.NEGATIVE_INFINITY;
  return times.map((t) => {
    prev = Math.max(prev, t);
    return prev;
  });
}

function parseWindow(raw: Rec, words: PlannerWord[], bounds: PlanBounds): Window | null {
  const last = words.length - 1;
  const startWord = idx(raw.startWord, 0, last);
  const endWord = idx(raw.endWord, 0, last);
  if (startWord === null || endWord === null || endWord <= startWord) return null;
  const first = words[startWord];
  const final = words[endWord];
  if (!first || !final) return null;
  const startTime = Math.max(bounds.minStart, first.start - EXPLAINER_LIMITS.leadInSec);
  let endTime = Math.min(bounds.maxEnd, final.end + EXPLAINER_LIMITS.tailSec);
  endTime = Math.min(endTime, startTime + EXPLAINER_LIMITS.maxSceneSec);
  if (endTime - startTime < EXPLAINER_LIMITS.minSceneSec) return null;
  return { startWord, endWord, startTime, endTime };
}

function parseScene(raw: Rec, words: PlannerWord[], win: Window): ExplainerScene | null {
  const L = EXPLAINER_LIMITS.text;
  const inWin = (v: unknown): number | null => idx(v, win.startWord, win.endWord);
  const at = (i: number): number => beatTime(words, i, win);

  switch (raw.kind) {
    case 'checklist': {
      if (!Array.isArray(raw.items)) return null;
      const items = raw.items.flatMap((it) => {
        if (!isRec(it)) return [];
        const label = str(it.label, L.checklistLabel);
        const w = inWin(it.word);
        return label && w !== null ? [{ label, icon: icon(it.icon), t: at(w) }] : [];
      });
      const [min, max] = EXPLAINER_LIMITS.checklistItems;
      if (items.length < min) return null;
      const kept = items.slice(0, max);
      const times = monotonic(kept.map((i) => i.t));
      return {
        kind: 'checklist',
        items: kept.map((it, n) => ({ label: it.label, icon: it.icon, doneAt: times[n] ?? it.t })),
      };
    }
    case 'versus': {
      if (!isRec(raw.left) || !isRec(raw.right)) return null;
      const side = (s: Rec): { label: string; icon: ExplainerIcon; at: number } | null => {
        const label = str(s.label, L.versusLabel);
        const w = inWin(s.word);
        return label && w !== null ? { label, icon: icon(s.icon), at: at(w) } : null;
      };
      const left = side(raw.left);
      const right = side(raw.right);
      if (!left || !right) return null;
      return { kind: 'versus', left, right: { ...right, at: Math.max(right.at, left.at) } };
    }
    case 'stamp': {
      const word = str(raw.word, L.stampWord);
      const stampW = inWin(raw.stampWord);
      if (!word || stampW === null) return null;
      const stampAt = at(stampW);
      const strikeW = raw.strikeWord === null ? null : inWin(raw.strikeWord);
      return {
        kind: 'stamp',
        icon: icon(raw.icon),
        word: word.toUpperCase(),
        stampAt,
        ...(strikeW === null ? {} : { strikeAt: Math.max(stampAt, at(strikeW)) }),
      };
    }
    case 'flow': {
      const inputLabel = str(raw.inputLabel, L.flowLabel);
      const inputText = str(raw.inputText, L.flowText);
      const engineLabel = str(raw.engineLabel, L.engineLabel);
      const outputLabel = str(raw.outputLabel, L.flowLabel);
      const outputText = str(raw.outputText, L.flowText);
      const inW = inWin(raw.inputWord);
      const outW = inWin(raw.outputWord);
      if (!inputLabel || !inputText || !engineLabel || !outputLabel || !outputText) return null;
      if (inW === null || outW === null) return null;
      const inputAt = at(inW);
      // The engine needs ~1s between input and output for its spin to read.
      const outputAt = Math.min(
        win.endTime - EXPLAINER_LIMITS.beatEdgeSec,
        Math.max(at(outW), inputAt + 1),
      );
      if (outputAt - inputAt < 0.6) return null;
      return {
        kind: 'flow',
        inputLabel,
        inputText,
        engineLabel,
        outputLabel,
        outputText,
        inputAt,
        outputAt,
      };
    }
    case 'stack': {
      if (!Array.isArray(raw.layers)) return null;
      const layers = raw.layers.flatMap((l) => {
        if (!isRec(l)) return [];
        const label = str(l.label, L.stackLabel);
        const w = inWin(l.word);
        return label && w !== null ? [{ label, at: at(w) }] : [];
      });
      const [min, max] = EXPLAINER_LIMITS.stackLayers;
      if (layers.length < min) return null;
      const kept = layers.slice(0, max);
      const times = monotonic(kept.map((l) => l.at));
      const dimW = raw.dimWord === null ? null : inWin(raw.dimWord);
      const lastLayer = times[times.length - 1] ?? win.startTime;
      return {
        kind: 'stack',
        layers: kept.map((l, n) => ({ label: l.label, at: times[n] ?? l.at })),
        ...(dimW === null ? {} : { dimAt: Math.max(lastLayer + 0.4, at(dimW)) }),
      };
    }
    default:
      return null;
  }
}

/**
 * Validate a raw model response into planned scenes. Pure and deterministic:
 * invalid scenes are dropped, overlapping/too-close scenes are dropped in
 * chronological order, and the count is capped by clip length.
 */
export function parseExplainerPlan(
  raw: unknown,
  words: PlannerWord[],
  bounds: PlanBounds,
): PlannedExplainerScene[] {
  if (!isRec(raw) || !Array.isArray(raw.scenes) || words.length === 0) return [];

  const candidates: PlannedExplainerScene[] = [];
  for (const s of raw.scenes) {
    if (!isRec(s)) continue;
    const win = parseWindow(s, words, bounds);
    if (!win) continue;
    const scene = parseScene(s, words, win);
    if (!scene) continue;
    candidates.push({ startTime: win.startTime, endTime: win.endTime, scene });
  }

  candidates.sort((a, b) => a.startTime - b.startTime);
  const maxScenes = Math.max(1, Math.floor((bounds.maxEnd - bounds.minStart) / 7) + 1);
  const accepted: PlannedExplainerScene[] = [];
  for (const c of candidates) {
    const prev = accepted[accepted.length - 1];
    if (prev && c.startTime < prev.endTime + EXPLAINER_LIMITS.minGapSec) continue;
    accepted.push(c);
    if (accepted.length >= maxScenes) break;
  }
  return accepted;
}

/** Shift every beat so it is relative to the scene window start. */
export function toSceneRelative(scene: ExplainerScene, windowStart: number): ExplainerScene {
  const r = (t: number): number => Math.max(0, Math.round((t - windowStart) * 1000) / 1000);
  switch (scene.kind) {
    case 'checklist':
      return { ...scene, items: scene.items.map((it) => ({ ...it, doneAt: r(it.doneAt) })) };
    case 'versus':
      return {
        ...scene,
        left: { ...scene.left, at: r(scene.left.at) },
        right: { ...scene.right, at: r(scene.right.at) },
      };
    case 'stamp':
      return {
        ...scene,
        stampAt: r(scene.stampAt),
        ...(scene.strikeAt === undefined ? {} : { strikeAt: r(scene.strikeAt) }),
      };
    case 'flow':
      return { ...scene, inputAt: r(scene.inputAt), outputAt: r(scene.outputAt) };
    case 'stack':
      return {
        ...scene,
        layers: scene.layers.map((l) => ({ ...l, at: r(l.at) })),
        ...(scene.dimAt === undefined ? {} : { dimAt: r(scene.dimAt) }),
      };
  }
}

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------

export async function planExplainerScenes(
  apiKey: string,
  words: PlannerWord[],
  bounds: PlanBounds,
): Promise<PlanResult> {
  if (words.length < 8) return { ok: true, value: [] };
  const started = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey });
    const text = await callGeminiWithRetry(
      ai,
      {
        model: MODELS.BALANCED[0],
        fallbacks: MODELS.BALANCED.slice(1),
        config: { responseMimeType: 'application/json', temperature: 0.4 },
      },
      buildExplainerPrompt(words, bounds),
      'explainer-scenes',
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Gemini returned unparseable JSON for explainer scenes' };
    }
    const value = parseExplainerPlan(parsed, words, bounds);
    log(
      'info',
      'explainer',
      `planned ${value.length} scene(s) [${value.map((s) => s.scene.kind).join(', ')}] ` +
        `from ${words.length} words in ${Date.now() - started}ms`,
    );
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
