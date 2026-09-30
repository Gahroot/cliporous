/**
 * Explainer-scene planner (v2).
 *
 * Reads a clip's timed transcript and asks Gemini for a short list of animated
 * explainer scenes. The model references WORD INDICES, never times; each
 * scene kind's spec (src/main/ai/explainer/kinds-*.ts) converts indices to
 * exact word timestamps so every beat lands on the spoken word.
 *
 * Pipeline: shortlist (code picks which kinds/props this clip's prompt offers)
 * → prompt → parse/validate → second review pass (Gemini critiques and
 * rewrites its own plan, with the validator's rejection reasons fed back so it
 * can repair them; re-validated by the same parser) → variety rules →
 * emphasis reactions + sound cues.
 *
 * Everything the model returns is untrusted: invalid scenes are dropped, never
 * guessed at.
 */

import { GoogleGenAI } from '@google/genai';
import { log } from '../logger';
import { STAMP_CONTACT_SECONDS } from '../remotion/compositions/explainer/editorial/types';
import { isCausalHeroProp } from '../remotion/compositions/explainer/hero-catalog';
import {
  ANNOTATION_KINDS,
  EXPLAINER_ICONS,
  EXPLAINER_LAYOUTS,
  type ExplainerLayout,
  type ExplainerScene,
  type ExplainerSceneBody,
  type ExplainerSceneKind,
  isCausalSceneKind,
  mapSceneTimes,
  type SceneCue,
  type SceneExtras,
  type SceneTransitionKind,
} from '../remotion/compositions/explainer/types';
import {
  editorialPrompt,
  hasEditorialTreatment,
  isEvidenceStamp,
  parseEditorialFields,
  parseStampFinish,
  removeEditorialTreatment,
  stampSupported,
  suppressEditorialExtras,
} from './explainer/editorial-contract';
import {
  isRec,
  type KindFamily,
  makeParseContext,
  type ParseContext,
  type PlannerWord,
  type Rec,
  type SceneWindow,
  idx as wordIdx,
} from './explainer/kind-spec';
import { getKindSpec } from './explainer/kinds';
import { buildShortlist, type Shortlist } from './explainer/shortlist';
import { applyVarietyRules } from './explainer/variety';
import { callGeminiWithRetry, MODELS } from './gemini-client';

export type { PlannerWord } from './explainer/kind-spec';

/**
 * A planned scene. `startTime`/`endTime`, every beat inside `scene` and every
 * cue time are in the SAME (absolute) basis as the input words. Call
 * {@link toSceneRelative} after the window is final to get render props.
 */
export interface PlannedExplainerScene {
  startTime: number;
  endTime: number;
  scene: ExplainerScene;
  layout: ExplainerLayout;
  /** True when this scene continues the previous one on the same stage. */
  chained: boolean;
  /** Transition INTO this scene when chained. */
  transition: SceneTransitionKind;
  cues: SceneCue[];
}

export interface PlanBounds {
  /** Earliest time a scene may start (the speaker owns the opening). */
  minStart: number;
  /** Latest time a scene may end. */
  maxEnd: number;
}

export interface PlanOptions {
  /** 9:16 shorts (default) or 16:9 long-form. */
  aspect?: '9:16' | '16:9';
  /** Absolute times of stressed/emphasised words (for emphasis reactions). */
  emphasisTimes?: readonly number[];
  /** Run the second review pass (default true). */
  review?: boolean;
}

export type PlanResult =
  | { ok: true; value: PlannedExplainerScene[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const EXPLAINER_LIMITS = {
  minSceneSec: 2,
  maxSceneSec: 14,
  /** Lead-in before the first spoken word so the entrance plays first. */
  leadInSec: 0.25,
  tailSec: 0.35,
  /** A chained scene may start at most this long after the previous ends. */
  chainGapSec: 1,
  maxReactionsPerScene: 3,
} as const;

const LAYOUT_SET: ReadonlySet<string> = new Set(EXPLAINER_LAYOUTS);
const TRANSITIONS: readonly SceneTransitionKind[] = ['grow', 'slide', 'fade'];

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function layoutGuide(aspect: '9:16' | '16:9'): string {
  const lines = [
    '"stack": animation on the top half, speaker below (the default look).',
    aspect === '9:16'
      ? '"stack-flipped": speaker on top, animation below — use occasionally for variety in longer clips.'
      : null,
    '"takeover": the animation fills the whole screen for 1-3.5 s — only for huge statements or big 3D moments.',
    '"pip": the animation fills the frame with the speaker in a small rounded window — for longer processes.',
    '"over": the speaker stays full screen and a compact card floats over them — numbers, questions, chats, short notes.',
  ];
  return lines
    .filter((l): l is string => l !== null)
    .map((l) => `  - ${l}`)
    .join('\n');
}

function kindLines(shortlist: Shortlist): string {
  return shortlist.kinds
    .map((s) => {
      const text = s.prompt ? s.prompt({ heroProps: shortlist.heroProps }) : s;
      const avoid = s.avoid ? `\n    Not for: ${s.avoid}.` : '';
      return `- "${s.kind}": ${text.describe}${avoid}\n    JSON: ${text.schema}\n    Limits: ${s.limits}. Layouts: ${s.layouts.join(', ')}.`;
    })
    .join('\n');
}

export function buildExplainerPrompt(
  words: readonly PlannerWord[],
  bounds: PlanBounds,
  aspect: '9:16' | '16:9' = '9:16',
  shortlist: Shortlist = buildShortlist(words),
): string {
  const indexed = words.map((w, i) => `${i}:${w.text}`).join(' ');
  const firstAllowed = Math.max(
    0,
    words.findIndex((w) => w.start >= bounds.minStart),
  );
  const kinds = kindLines(shortlist);

  return `You are a senior motion designer making PREMIUM explainer edits (calm, confident, Apple-keynote quality — never cheesy). Turn what the speaker is SAYING into simple animated diagrams that appear exactly as they say it.

Transcript as index:word pairs:
${indexed}

Scene types (picked for this transcript — choose the one that matches what is SAID, not just a keyword):
${kinds}
${editorialPrompt(shortlist.kinds.map((kind) => kind.kind))}
Layouts (pick the best one per scene from that scene's allowed list):
${layoutGuide(aspect)}

Every scene object ALSO has these common fields:
  "startWord":N, "endWord":N, "layout":"...",
  "continues": true|false  — true when this scene directly carries on from the previous scene (the next beat of the same story, starting right where it ended); the stage morphs instead of cutting,
  "transition": "grow"|"slide"|"fade" — only for continues:true ("grow" = the previous scene's focus item grows into this one),
  "laterStamp": {"text":"YES, BUT","word":N} or null — a stamp that lands on top of the running scene later (lets one scene keep going across several sentences),
  "dimWord": N or null — the whole scene dims on this word (e.g. "broken", "fails"),
  "annotation": {"kind":"marker"|"underline"|"circle"|"box"|"arrow","word":N} or null — ONLY hero/statement: draw attention to its label/accent word after it appears. ONE annotation OR laterStamp, not both. Use only when the speaker stresses that exact label; no decoration for its own sake.
  "reactions": [{"word":N,"item":index or null,"strength":"pulse"|"shake"}] — when the speaker stresses or repeats a word that matches an element (item = index in that scene's list, null = whole scene). Max 3. "shake" only for negative words ("wrong", "broken").

Return JSON only: {"scenes":[ ... ]}

Rules:
- Every "word"/"...Word" value is the index of the word where that beat happens, inside that scene's startWord..endWord. Beats in chronological order.
- Labels: use the speaker's own words, SHORT and concrete (2-4 words). No filler ("The", "Very"), no full sentences unless the limit allows it. Respect every max length. Never invent evidence, verification, certification, returns or hidden facts; negated/uncertain claims must not become positive stamps.
- icon must be one of: ${EXPLAINER_ICONS.join(', ')}.
- Do not start before word ${firstAllowed}. Never overlap scenes.
- Prefer ONE scene that keeps going (more beats, a laterStamp, a dim) over several short separate ones — like keeping the same object on screen across two sentences.
- Variety: never the same scene type twice in a row; mix 2D and 3D; vary layouts.
- Restraint: annotations are occasional, never on adjacent scenes. Do not combine an annotation with a stamp. At most one reaction in annotated scenes. Use object motion to explain a change, not to fill empty space.
- Leave at least 1.5 s of plain speaker between separate scenes (continues:true scenes are exempt).
- Only make a scene when a diagram genuinely helps. Cover at most about half of the clip. Fewer, better scenes beat many weak ones.`;
}

/** A draft scene the validator dropped, with the reasons (for the review pass). */
export interface RejectedScene {
  raw: Rec;
  problems: string[];
}

function rejectedBlock(rejected: readonly RejectedScene[]): string {
  if (rejected.length === 0) return '';
  const lines = rejected
    .slice(0, 6)
    .map((r) => `- ${JSON.stringify(r.raw)}\n  Problems: ${r.problems.join('; ')}`)
    .join('\n');
  return `\n\nThese draft scenes were REJECTED by the validator and will NOT render. Repair each one (shorten labels to the limits, keep every word index inside its startWord..endWord, use only listed values) or drop it:\n${lines}`;
}

export function buildReviewPrompt(
  words: readonly PlannerWord[],
  plan: readonly Rec[],
  bounds: PlanBounds,
  aspect: '9:16' | '16:9' = '9:16',
  rejected: readonly RejectedScene[] = [],
  shortlist: Shortlist = buildShortlist(words),
  omitted: readonly RejectedScene[] = [],
): string {
  const optionalIssues =
    omitted.length === 0
      ? ''
      : `\n\nThese cores were RETAINED, but optional fields were OMITTED or repaired. Do not discard the valid core; remove the optional request or fix only its supported fields:\n${omitted
          .slice(0, 6)
          .map(
            (r) => `- ${JSON.stringify(r.raw)}\n  Problems: ${r.problems.slice(0, 6).join('; ')}`,
          )
          .join('\n')}`;
  return `${buildExplainerPrompt(words, bounds, aspect, shortlist)}

A first draft plan was produced:
${JSON.stringify({ scenes: plan })}${rejectedBlock(rejected)}${optionalIssues}

Now act as the creative director reviewing this draft before anything renders. Fix it:
- Rewrite weak, vague, wordy or generic labels into short, punchy ones from the speaker's own words.
- Swap a scene to a better-fitting type or layout when it would explain the idea more clearly.
- Remove scenes that do not genuinely help; merge back-to-back scenes that tell one story using "continues".
- Check every word index lands on the word where that beat is actually said.
- Keep all limits and rules above.
Return the FINAL plan as JSON only, same schema: {"scenes":[ ... ]}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function parseWindow(
  raw: Rec,
  words: readonly PlannerWord[],
  bounds: PlanBounds,
): SceneWindow | null {
  const last = words.length - 1;
  const startWord = wordIdx(raw.startWord, 0, last);
  const endWord = wordIdx(raw.endWord, 0, last);
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

/** Number of addressable elements for emphasis `item` targets. */
export function reactionTargetCount(scene: ExplainerSceneBody): number {
  switch (scene.kind) {
    case 'checklist':
      return scene.items.length;
    case 'versus':
      return 2;
    case 'flow':
      return 3;
    case 'stack':
      return scene.layers.length;
    case 'timeline':
      return scene.steps.length;
    case 'notes':
      return scene.lines.length;
    case 'chart':
      return scene.points.length;
    case 'chat':
      return scene.messages.length;
    case 'network':
      return scene.nodes.length;
    case 'loop':
      return scene.stages.length;
    case 'funnel':
      return scene.stages.length;
    case 'equation':
      return scene.terms.length + 1;
    case 'quadrant':
      return scene.items.length;
    case 'venn':
      return 3;
    case 'ranking':
      return scene.items.length;
    case 'receipt':
      return scene.lines.length;
    case 'journey':
      return scene.points.length;
    case 'code':
      return scene.lines.length;
    case 'iceberg':
      return scene.below.length + 1;
    case 'balance':
      return 2;
    case 'podium':
      return scene.places.length;
    case 'compound':
      return scene.points.length;
    case 'dominoes':
      return scene.tiles.length;
    case 'stairs':
      return scene.steps.length;
    default:
      return 0;
  }
}

function parseExtras(raw: Rec, ctx: ParseContext, body: ExplainerSceneBody): SceneExtras {
  const extras: SceneExtras = {};
  if (isCausalSceneKind(body.kind) || (body.kind === 'hero' && isCausalHeroProp(body.prop))) {
    if (
      ['laterStamp', 'annotation', 'dimWord', 'reactions', 'bursts'].some((key) => raw[key] != null)
    ) {
      ctx.issues.push(
        'optional extras omitted: causal mechanisms own their emphasis and do not support global extras',
      );
    }
    return extras;
  }
  if (raw.laterStamp != null && !isRec(raw.laterStamp))
    ctx.issues.push('optional laterStamp omitted: expected an object');
  if (isRec(raw.laterStamp)) {
    const text = ctx.str(raw.laterStamp.text, 12);
    const w = ctx.inWin(raw.laterStamp.word);
    if (Object.keys(raw.laterStamp).some((key) => !['text', 'word', 'finish'].includes(key))) {
      ctx.issues.push('optional laterStamp omitted: unknown fields or replacement/hidden claim');
    } else if (text && w !== null) {
      if (isEvidenceStamp(text) && !stampSupported(text, ctx)) {
        ctx.issues.push(
          'optional laterStamp omitted: unsupported or negated evidence/verification claim',
        );
      } else {
        const finish = parseStampFinish(raw.laterStamp.finish, text, ctx);
        extras.overlayStamp = {
          word: text.toUpperCase(),
          at: ctx.at(w),
          ...(finish ? { finish } : {}),
        };
      }
    } else
      ctx.issues.push(
        'optional laterStamp omitted: text ≤12 chars and a valid scene word required',
      );
  }
  if (
    !extras.overlayStamp &&
    (body.kind === 'hero' || body.kind === 'statement') &&
    isRec(raw.annotation)
  ) {
    const requestedKind = raw.annotation.kind;
    const kind = ANNOTATION_KINDS.find((k) => k === requestedKind);
    const w = ctx.inWin(raw.annotation.word);
    const labelAt =
      body.kind === 'hero'
        ? body.at + 0.3
        : (body.words[body.accentIndex ?? body.words.length - 1]?.at ?? 0);
    if (kind && w !== null && ctx.at(w) >= labelAt) extras.annotation = { kind, at: ctx.at(w) };
  }
  const dimW = raw.dimWord === null || body.kind === 'stack' ? null : ctx.inWin(raw.dimWord);
  if (dimW !== null) extras.dimAt = ctx.at(dimW);
  if (Array.isArray(raw.reactions)) {
    const count = reactionTargetCount(body);
    const pulses = raw.reactions.flatMap((r) => {
      if (!isRec(r)) return [];
      const w = ctx.inWin(r.word);
      if (w === null) return [];
      const item = wordIdx(r.item, 0, Math.max(0, count - 1));
      const strength = r.strength === 'shake' ? ('shake' as const) : ('pulse' as const);
      return [
        {
          at: ctx.at(w),
          strength,
          ...(item !== null && count > 0 ? { target: item } : {}),
        },
      ];
    });
    if (pulses.length > 0) {
      extras.pulses = pulses
        .sort((a, b) => a.at - b.at)
        .slice(0, extras.annotation ? 1 : EXPLAINER_LIMITS.maxReactionsPerScene);
    }
  }
  return extras;
}

interface Candidate extends PlannedExplainerScene {
  kind: ExplainerSceneKind;
  layouts: readonly ExplainerLayout[];
  family: KindFamily;
  raw: Rec;
}

type CandidateResult =
  | { ok: true; value: Candidate; problems: string[] }
  | { ok: false; problems: string[] };

function parseCandidate(
  raw: Rec,
  words: readonly PlannerWord[],
  bounds: PlanBounds,
): CandidateResult {
  const spec = typeof raw.kind === 'string' ? getKindSpec(raw.kind) : undefined;
  if (!spec) return { ok: false, problems: [`unknown scene type ${JSON.stringify(raw.kind)}`] };
  const win = parseWindow(raw, words, bounds);
  if (!win) {
    return {
      ok: false,
      problems: [
        `startWord/endWord must be valid indices, startWord < endWord, lasting ≥ ${EXPLAINER_LIMITS.minSceneSec} s`,
      ],
    };
  }
  const ctx = makeParseContext(words, win);
  // Each spec narrows its own kind; the registry erases K, so call through a
  // widened signature (the spec only ever returns its own kind).
  const parse = spec.parse as (r: Rec, c: ParseContext) => ExplainerSceneBody | null;
  const body = parse(raw, ctx);
  if (!body) {
    const problems =
      ctx.issues.length > 0
        ? ctx.issues
        : [`missing or invalid fields — follow the "${spec.kind}" JSON exactly`];
    return { ok: false, problems };
  }
  // Unsupported evidence is an invalid core claim, not an invalid optional finish.
  if (body.kind === 'stamp' && isEvidenceStamp(body.word) && !stampSupported(body.word, ctx)) {
    return {
      ok: false,
      problems: ['stamp verdict invents or reverses an evidence/verification claim'],
    };
  }
  const editorial = parseEditorialFields(raw, body, ctx);
  const enhanced = { ...body, ...editorial };
  const extras = suppressEditorialExtras(enhanced, parseExtras(raw, ctx, body), ctx);
  const scene = { ...enhanced, ...extras } as ExplainerScene;
  const requested =
    typeof raw.layout === 'string' && LAYOUT_SET.has(raw.layout)
      ? (raw.layout as ExplainerLayout)
      : undefined;
  const layout = requested && spec.layouts.includes(requested) ? requested : spec.layouts[0];
  const transition =
    typeof raw.transition === 'string' &&
    (TRANSITIONS as readonly string[]).includes(raw.transition)
      ? (raw.transition as SceneTransitionKind)
      : 'grow';
  return {
    ok: true,
    problems: [...ctx.issues],
    value: {
      startTime: win.startTime,
      endTime: win.endTime,
      scene,
      layout: layout ?? 'stack',
      chained: raw.continues === true,
      transition,
      cues: [],
      kind: scene.kind,
      layouts: spec.layouts,
      family: spec.family,
      raw,
    },
  };
}

/** Sound cues for a scene: the kind's own cues + extras. Absolute times. */
export function sceneCues(planned: Pick<PlannedExplainerScene, 'scene' | 'chained'>): SceneCue[] {
  const spec = getKindSpec(planned.scene.kind);
  const cuesOf = spec?.cues as ((s: ExplainerSceneBody) => SceneCue[]) | undefined;
  const kindCues =
    planned.scene.kind === 'stamp' && planned.scene.finish
      ? [{ kind: 'thump' as const, at: planned.scene.stampAt + STAMP_CONTACT_SECONDS, gain: 0.65 }]
      : cuesOf
        ? cuesOf(planned.scene)
        : [];
  const extra: SceneCue[] = [];
  if (planned.scene.overlayStamp) {
    extra.push({ kind: 'thump', at: planned.scene.overlayStamp.at + STAMP_CONTACT_SECONDS });
  }
  if (planned.scene.dimAt !== undefined && planned.scene.kind !== 'stack') {
    extra.push({ kind: 'whoosh', at: planned.scene.dimAt, gain: 0.4 });
  }
  return [...kindCues, ...extra].sort((a, b) => a.at - b.at);
}

/**
 * Whole-scene pulses on stressed words (from the word-emphasis pass) that the
 * model did not already react to. Max 2 per scene, never within 0.5 s of any
 * existing beat, so they read as reactions, not noise.
 */
function addEmphasisPulses(
  planned: PlannedExplainerScene,
  emphasisTimes: readonly number[],
): PlannedExplainerScene {
  if (
    isCausalSceneKind(planned.scene.kind) ||
    (planned.scene.kind === 'hero' && isCausalHeroProp(planned.scene.prop)) ||
    hasEditorialTreatment(planned.scene)
  )
    return planned;
  const lo = planned.startTime + 0.6;
  const hi = planned.endTime - 0.4;
  const beats: number[] = [];
  mapSceneTimes(planned.scene, (t) => {
    beats.push(t);
    return t;
  });
  const existing = planned.scene.pulses ?? [];
  const added: { at: number; strength: 'pulse' }[] = [];
  for (const t of emphasisTimes) {
    if (
      added.length >= 2 ||
      existing.length + added.length >=
        (planned.scene.annotation ? 1 : EXPLAINER_LIMITS.maxReactionsPerScene)
    )
      break;
    if (t < lo || t > hi) continue;
    if (beats.some((b) => Math.abs(b - t) < 0.5)) continue;
    if (added.some((a) => Math.abs(a.at - t) < 1.2)) continue;
    added.push({ at: t, strength: 'pulse' });
  }
  if (added.length === 0) return planned;
  const pulses = [...existing, ...added].sort((a, b) => a.at - b.at);
  return { ...planned, scene: { ...planned.scene, pulses } };
}

/**
 * Validate a raw model response into planned scenes. Pure and deterministic:
 * invalid scenes are dropped, chains are snapped together, then the variety
 * rules pick the final set.
 */
export function parseExplainerPlan(
  raw: unknown,
  words: readonly PlannerWord[],
  bounds: PlanBounds,
  options: Pick<PlanOptions, 'emphasisTimes'> = {},
): PlannedExplainerScene[] {
  return parseCandidates(raw, words, bounds, options).accepted.map(stripCandidate);
}

function stripCandidate({
  kind: _k,
  layouts: _l,
  family: _f,
  raw: _r,
  ...p
}: Candidate): PlannedExplainerScene {
  return p;
}

/**
 * Validate a raw plan and also report every scene the validator dropped, with
 * reasons (for the review pass). Pure and deterministic.
 */
export function parsePlanWithRejections(
  raw: unknown,
  words: readonly PlannerWord[],
  bounds: PlanBounds,
): RejectedScene[] {
  return parseCandidates(raw, words, bounds, {}).rejected;
}

/** Full diagnostics distinguish dropped cores from safely omitted optional fields. */
export function parsePlanWithDiagnostics(
  raw: unknown,
  words: readonly PlannerWord[],
  bounds: PlanBounds,
): {
  accepted: PlannedExplainerScene[];
  rejected: RejectedScene[];
  omitted: RejectedScene[];
} {
  const parsed = parseCandidates(raw, words, bounds, {});
  return {
    accepted: parsed.accepted.map(stripCandidate),
    rejected: parsed.rejected,
    omitted: parsed.omitted,
  };
}

/** Only causal chains need this guard; legacy snapping stays unchanged. */
export function chainPreservesFirstAction(scene: ExplainerScene, startTime: number): boolean {
  if (!isCausalSceneKind(scene.kind)) return true;
  let first = Infinity;
  mapSceneTimes(scene, (at) => {
    first = Math.min(first, at);
    return at;
  });
  return startTime <= first;
}

function parseCandidates(
  raw: unknown,
  words: readonly PlannerWord[],
  bounds: PlanBounds,
  options: Pick<PlanOptions, 'emphasisTimes'>,
): { accepted: Candidate[]; rejected: RejectedScene[]; omitted: RejectedScene[] } {
  if (!isRec(raw) || !Array.isArray(raw.scenes) || words.length === 0) {
    return { accepted: [], rejected: [], omitted: [] };
  }
  const rejected: RejectedScene[] = [];
  const omitted: RejectedScene[] = [];
  const candidates = raw.scenes
    .flatMap((s) => {
      if (!isRec(s)) return [];
      const c = parseCandidate(s, words, bounds);
      if (!c.ok) {
        rejected.push({ raw: s, problems: c.problems });
        return [];
      }
      if (c.problems.length > 0) omitted.push({ raw: s, problems: c.problems });
      return [c.value];
    })
    .sort((a, b) => a.startTime - b.startTime);

  // Snap chains: a `continues` scene starting within chainGapSec of the
  // previous scene's end starts exactly where it ends.
  const snapped: Candidate[] = [];
  for (const c of candidates) {
    const prev = snapped[snapped.length - 1];
    if (
      c.chained &&
      prev &&
      c.startTime >= prev.endTime - 0.6 &&
      c.startTime - prev.endTime <= EXPLAINER_LIMITS.chainGapSec &&
      c.endTime - prev.endTime >= EXPLAINER_LIMITS.minSceneSec &&
      chainPreservesFirstAction(c.scene, prev.endTime)
    ) {
      snapped.push({ ...c, startTime: prev.endTime });
    } else {
      snapped.push({ ...c, chained: false });
    }
  }

  const varied = applyVarietyRules(snapped, bounds);
  const emphasis = [...(options.emphasisTimes ?? [])].sort((a, b) => a - b);
  let previousEmphasized = false;
  const accepted = varied.map((candidate) => {
    let c = candidate;
    const wasTreated = hasEditorialTreatment(c.scene);
    if (previousEmphasized && (c.scene.annotation || wasTreated)) {
      const { annotation: _annotation, ...scene } = removeEditorialTreatment(c.scene);
      c = { ...c, scene: scene as ExplainerScene };
      omitted.push({
        raw: c.raw,
        problems: [
          'optional emphasis omitted: editorial treatments/annotations may not occupy adjacent scenes',
        ],
      });
    }
    previousEmphasized = c.scene.annotation !== undefined || hasEditorialTreatment(c.scene);
    const withPulses: Candidate =
      emphasis.length > 0 && !wasTreated ? { ...c, ...addEmphasisPulses(c, emphasis) } : c;
    return { ...withPulses, cues: sceneCues(withPulses) };
  });
  return { accepted, rejected, omitted };
}

/** Shift every beat so it is relative to `windowStart` (ms precision, ≥ 0). */
export function toSceneRelative<T extends ExplainerScene>(scene: T, windowStart: number): T {
  return mapSceneTimes(scene, (t) => Math.max(0, Math.round((t - windowStart) * 1000) / 1000));
}

// ---------------------------------------------------------------------------
// Gemini calls
// ---------------------------------------------------------------------------

async function askForPlan(ai: GoogleGenAI, prompt: string, label: string): Promise<unknown> {
  const text = await callGeminiWithRetry(
    ai,
    {
      model: MODELS.BALANCED[0],
      fallbacks: MODELS.BALANCED.slice(1),
      config: { responseMimeType: 'application/json' },
      thinking: 'high',
    },
    prompt,
    label,
  );
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function planExplainerScenes(
  apiKey: string,
  words: readonly PlannerWord[],
  bounds: PlanBounds,
  options: PlanOptions = {},
): Promise<PlanResult> {
  if (words.length < 8) return { ok: true, value: [] };
  const aspect = options.aspect ?? '9:16';
  const started = Date.now();
  const shortlist = buildShortlist(words);
  log(
    'info',
    'explainer',
    `shortlist: ${shortlist.kinds.length} kinds [${shortlist.kinds
      .map((k) => k.kind)
      .join(', ')}], props [${shortlist.heroProps.join(', ')}]`,
  );
  try {
    const ai = new GoogleGenAI({ apiKey });
    const draftRaw = await askForPlan(
      ai,
      buildExplainerPrompt(words, bounds, aspect, shortlist),
      'explainer-scenes',
    );
    if (draftRaw === null) {
      return { ok: false, error: 'Gemini returned unparseable JSON for explainer scenes' };
    }
    const draft = parseCandidates(draftRaw, words, bounds, options);
    let final = draft.accepted;
    let reviewed = false;
    if (draft.rejected.length > 0) {
      log(
        'info',
        'explainer',
        `draft rejected ${draft.rejected.length} scene(s): ${draft.rejected
          .map((r) => `${String(r.raw.kind)} (${r.problems[0] ?? '?'})`)
          .join('; ')}`,
      );
    }

    if (options.review !== false && (final.length > 0 || draft.rejected.length > 0)) {
      try {
        const reviewRaw = await askForPlan(
          ai,
          buildReviewPrompt(
            words,
            final.map((c) => c.raw),
            bounds,
            aspect,
            draft.rejected,
            shortlist,
            draft.omitted,
          ),
          'explainer-review',
        );
        const revised =
          reviewRaw === null ? [] : parseCandidates(reviewRaw, words, bounds, options).accepted;
        // Keep the review only when it still yields a usable plan.
        if (revised.length > 0) {
          final = revised;
          reviewed = true;
        }
      } catch (err) {
        log(
          'warn',
          'explainer',
          `review pass failed, keeping draft: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const value = final.map(stripCandidate);
    log(
      'info',
      'explainer',
      `planned ${value.length} scene(s) [${value
        .map((s) => `${s.scene.kind}/${s.layout}${s.chained ? '+' : ''}`)
        .join(', ')}] from ${words.length} words in ${Date.now() - started}ms` +
        (reviewed ? ' (reviewed)' : ''),
    );
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
