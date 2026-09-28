/**
 * v3 3D kinds (iceberg, balance, podium, compound, dominoes, stairs) as
 * planner specs. Mirrors the structure of kinds-core.ts.
 *
 * Animation offsets the cues line up with are exported here and imported by
 * the compositions (this module is React-free, so the reverse is not allowed).
 */

import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { type AnyKindSpec, isRec, type KindSpec, num, parseTimedList } from './kind-spec';
import { after } from './kinds-ideas';

const L = {
  iceTop: 16,
  iceBelow: 16,
  balanceLabel: 14,
  podiumLabel: 12,
  compoundTitle: 20,
  compoundLabel: 5,
  compoundCallout: 9,
  domino: 12,
  stair: 14,
} as const;

/** Seconds after `tipAt` when the balance beam settles (thump). */
export const BALANCE_SETTLE_SEC = 0.55;
/** Seconds between two dominoes hitting each other. */
export const DOMINO_STEP_SEC = 0.28;
/** Seconds a podium block takes to rise before its label lands. */
export const PODIUM_RISE_SEC = 0.45;
/** Seconds each compound tower takes to grow, and the stagger between towers. */
export const COMPOUND_GROW_SEC = 0.55;
export const COMPOUND_STAGGER_SEC = 0.22;
/** When the compound callout pops (after the last tower). Shared with the scene. */
export function compoundCalloutAt(growAt: number, count: number): number {
  return growAt + (count - 1) * COMPOUND_STAGGER_SEC + COMPOUND_GROW_SEC + 0.15;
}

export const icebergSpec: KindSpec<'iceberg'> = {
  kind: 'iceberg',
  describe:
    'they contrast what people SEE with the hidden work/reason underneath ("people see the success, not the 5 years of failure"). A 3D iceberg: the tip label, then the camera dips below the waterline and 1-3 hidden layers appear.',
  schema:
    '{"kind":"iceberg","top":{"label":"...","word":N},"below":[{"label":"...","word":N}],"diveWord":N}',
  limits: `top ≤ ${L.iceTop}, each below ≤ ${L.iceBelow} (1-3 below)`,
  layouts: ['takeover', 'stack', 'pip'],
  durationSec: [4, 10],
  family: 'framework',
  triggers: [
    /\b(iceberg|surface|underneath|beneath|behind the scenes|people (only )?see|what you don'?t see|hidden|below)\b/,
  ],
  avoid: 'a belief that is simply wrong (myth-fact)',
  parse: (raw, ctx) => {
    if (!isRec(raw.top)) return null;
    const topLabel = ctx.str(raw.top.label, L.iceTop);
    const topW = ctx.inWin(raw.top.word);
    const diveW = ctx.inWin(raw.diveWord);
    if (!topLabel || topW === null || diveW === null) return null;
    const topAt = ctx.at(topW);
    const diveAt = after(ctx, ctx.at(diveW), topAt, 0.8);
    const below = parseTimedList(
      raw.below,
      ctx,
      (b) => {
        const label = ctx.str(b.label, L.iceBelow);
        return label ? { label } : null;
      },
      [1, 3],
    );
    if (!below || diveAt - topAt < 0.5) return null;
    // Hidden layers can only appear once the camera is under water.
    let prev = diveAt + 0.35;
    const layers = below.map((b) => {
      const at = Math.min(ctx.lastBeat, Math.max(b.t, prev));
      prev = at + 0.3;
      return { label: b.label, at };
    });
    return { kind: 'iceberg', top: { label: topLabel, at: topAt }, below: layers, diveAt };
  },
  cues: (s) => [
    { kind: 'slide', at: s.top.at, gain: 0.6 },
    { kind: 'whoosh', at: s.diveAt, gain: 0.7 },
    ...s.below.map((b): SceneCue => ({ kind: 'tick', at: b.at, gain: 0.8 })),
  ],
};

export const balanceSpec: KindSpec<'balance'> = {
  kind: 'balance',
  describe:
    'they weigh two things against each other ("the risk is small but the reward is huge", "work vs life balance"). A 3D balance scale: a block lands on each pan, then the beam tips toward the heavier side (or stays even).',
  schema:
    '{"kind":"balance","left":{"label":"...","word":N},"right":{"label":"...","word":N},"heavier":"left|right|even","tipWord":N}',
  limits: `each label ≤ ${L.balanceLabel}`,
  layouts: ['stack', 'takeover', 'pip'],
  durationSec: [3.5, 8],
  family: 'compare',
  triggers: [
    /\b(balance|weigh|weighs|outweigh\w*|trade-?off|risk (vs|versus|and) reward|worth it|pros and cons|cost (vs|versus|and) benefit)\b/,
  ],
  avoid: 'two alternatives to pick between (versus)',
  parse: (raw, ctx) => {
    if (!isRec(raw.left) || !isRec(raw.right)) return null;
    const l = ctx.str(raw.left.label, L.balanceLabel);
    const r = ctx.str(raw.right.label, L.balanceLabel);
    const lw = ctx.inWin(raw.left.word);
    const rw = ctx.inWin(raw.right.word);
    const tipW = ctx.inWin(raw.tipWord);
    if (!l || !r || lw === null || rw === null || tipW === null) return null;
    const leftAt = ctx.at(lw);
    const rightAt = after(ctx, ctx.at(rw), leftAt, 0.35);
    const tipAt = after(ctx, ctx.at(tipW), rightAt, 0.5);
    const heavier = raw.heavier === 'left' || raw.heavier === 'right' ? raw.heavier : 'even';
    return {
      kind: 'balance',
      left: { label: l, at: leftAt },
      right: { label: r, at: rightAt },
      heavier,
      tipAt,
    };
  },
  cues: (s) => [
    { kind: 'tick', at: s.left.at + 0.3, gain: 0.8 },
    { kind: 'tick', at: s.right.at + 0.3, gain: 0.8 },
    ...(s.heavier === 'even'
      ? [{ kind: 'pop' as const, at: s.tipAt + BALANCE_SETTLE_SEC, gain: 0.6 }]
      : [{ kind: 'thump' as const, at: s.tipAt + BALANCE_SETTLE_SEC, gain: 0.5 }]),
  ],
};

export const podiumSpec: KindSpec<'podium'> = {
  kind: 'podium',
  describe:
    'they name winners/places ("third place…, second…, and the winner is…", "gold, silver, bronze"). A 3D podium: each block rises with its label as named; 1st rises last and tallest.',
  schema: '{"kind":"podium","places":[{"label":"...","rank":1|2|3,"word":N}]}',
  limits: `label ≤ ${L.podiumLabel} (2-3 places, unique ranks)`,
  layouts: ['takeover', 'stack', 'pip'],
  durationSec: [3.5, 9],
  family: 'object',
  triggers: [
    /\b(first place|second place|third place|winner|podium|gold|silver|bronze|runner.up|medal)\b/,
  ],
  avoid: 'a longer ranked list (ranking)',
  parse: (raw, ctx) => {
    const ranks = new Set<number>();
    const places = parseTimedList(
      raw.places,
      ctx,
      (p) => {
        const label = ctx.str(p.label, L.podiumLabel);
        const rank = num(p.rank, 1, 3);
        if (!label || rank === null || !Number.isInteger(rank) || ranks.has(rank)) return null;
        ranks.add(rank);
        return { label, rank };
      },
      [2, 3],
    );
    if (!places) return null;
    return {
      kind: 'podium',
      places: places.map((p) => ({ label: p.label, rank: p.rank, at: p.t })),
    };
  },
  cues: (s) =>
    s.places.map(
      (p): SceneCue =>
        p.rank === 1
          ? { kind: 'pop', at: p.at + PODIUM_RISE_SEC, gain: 0.9 }
          : { kind: 'tick', at: p.at + PODIUM_RISE_SEC, gain: 0.8 },
    ),
};

export const compoundSpec: KindSpec<'compound'> = {
  kind: 'compound',
  describe:
    'they talk about compounding / investing / small things adding up over years ("$500 a month becomes a million", "1% better every day"). 3D coin towers grow column by column into an upward curve; optional callout on the last tower.',
  schema:
    '{"kind":"compound","title":"...","points":[{"label":"Y1","value":1}],"callout":"$1.2M" or null,"growWord":N}',
  limits: `title ≤ ${L.compoundTitle}, point label ≤ ${L.compoundLabel} (3-6 points, values ≥ 0), callout ≤ ${L.compoundCallout}`,
  layouts: ['stack', 'takeover', 'pip'],
  durationSec: [3.5, 8],
  family: 'data',
  triggers: [
    /\b(compound\w*|interest|invest\w*|over time|adds up|snowball|exponential|1% better|retire\w*|years from now)\b/,
  ],
  avoid: 'a general trend line or decline (chart)',
  parse: (raw, ctx) => {
    const title = ctx.str(raw.title, L.compoundTitle);
    const growW = ctx.inWin(raw.growWord);
    if (!title || growW === null || !Array.isArray(raw.points)) return null;
    const points: { label: string; value: number }[] = [];
    for (const p of raw.points) {
      if (!isRec(p)) return null;
      const label = ctx.str(p.label, L.compoundLabel);
      const value = num(p.value, 0, 1e12);
      if (label === null || value === null) return null;
      points.push({ label, value });
    }
    if (points.length < 3) return null;
    const kept = points.slice(0, 6);
    if (!kept.some((p) => p.value > 0)) return null;
    const callout =
      raw.callout === null || raw.callout === undefined
        ? null
        : ctx.str(raw.callout, L.compoundCallout);
    return {
      kind: 'compound',
      title,
      points: kept,
      ...(callout ? { callout } : {}),
      growAt: ctx.at(growW),
    };
  },
  cues: (s) => [
    { kind: 'rise', at: s.growAt, gain: 0.55 },
    ...(s.callout
      ? [{ kind: 'pop' as const, at: compoundCalloutAt(s.growAt, s.points.length), gain: 0.85 }]
      : []),
  ],
};

export const dominoesSpec: KindSpec<'dominoes'> = {
  kind: 'dominoes',
  describe:
    'they describe a chain reaction where one thing causes the next ("one small habit leads to…, which leads to…", "domino effect"). 3-6 labelled 3D dominoes stand up as named, then topple in a chain from the push word.',
  schema: '{"kind":"dominoes","tiles":[{"label":"...","word":N}],"fallWord":N}',
  limits: `tile label ≤ ${L.domino} (3-6 tiles)`,
  layouts: ['stack', 'takeover', 'pip'],
  durationSec: [4, 10],
  family: 'process',
  triggers: [
    /\b(domino\w*|chain reaction|leads to|which leads|knock.on|ripple|snowball|one thing leads|cascade|triggers?)\b/,
  ],
  avoid: 'a cycle that repeats (loop) or a neutral input→output (flow)',
  parse: (raw, ctx) => {
    const tiles = parseTimedList(
      raw.tiles,
      ctx,
      (t) => {
        const label = ctx.str(t.label, L.domino);
        return label ? { label } : null;
      },
      [3, 6],
    );
    const fallW = ctx.inWin(raw.fallWord);
    if (!tiles || fallW === null) return null;
    const lastTile = tiles[tiles.length - 1]?.t ?? ctx.win.startTime;
    // The whole chain must finish falling before the scene ends.
    const chainSec = (tiles.length - 1) * DOMINO_STEP_SEC + 0.5;
    const latest = ctx.win.endTime - chainSec;
    const fallAt = Math.min(latest, Math.max(ctx.at(fallW), lastTile + 0.35));
    if (fallAt < lastTile + 0.2) {
      ctx.issues.push(`needs ${chainSec.toFixed(1)} s after the push word for the chain to fall`);
      return null;
    }
    return { kind: 'dominoes', tiles: tiles.map((t) => ({ label: t.label, at: t.t })), fallAt };
  },
  cues: (s) => [
    ...s.tiles.map((t): SceneCue => ({ kind: 'tick', at: t.at, gain: 0.6 })),
    ...s.tiles.map(
      (_, i): SceneCue => ({ kind: 'tick', at: s.fallAt + i * DOMINO_STEP_SEC + 0.2, gain: 0.9 }),
    ),
  ],
};

export const stairsSpec: KindSpec<'stairs'> = {
  kind: 'stairs',
  describe:
    'they describe levelling up step by step toward a goal ("level 1…, level 2…, then you reach…", "the path from beginner to expert"). 3D stairs: a ball hops up one step per beat; the top step glows.',
  schema: '{"kind":"stairs","steps":[{"label":"...","word":N}]}',
  limits: `step label ≤ ${L.stair} (2-5 steps, bottom → top)`,
  layouts: ['stack', 'takeover', 'pip'],
  durationSec: [3.5, 10],
  family: 'process',
  triggers: [
    /\b(level up|levels?|step by step|next level|climb\w*|progress\w*|beginner|intermediate|advanced|expert|stages?)\b/,
  ],
  avoid: 'neutral events in time order (timeline)',
  parse: (raw, ctx) => {
    const steps = parseTimedList(
      raw.steps,
      ctx,
      (s) => {
        const label = ctx.str(s.label, L.stair);
        return label ? { label } : null;
      },
      [2, 5],
    );
    if (!steps) return null;
    return { kind: 'stairs', steps: steps.map((s) => ({ label: s.label, at: s.t })) };
  },
  cues: (s) =>
    s.steps.map(
      (st, i): SceneCue =>
        i === s.steps.length - 1
          ? { kind: 'pop', at: st.at + 0.3, gain: 0.85 }
          : { kind: 'tick', at: st.at + 0.3, gain: 0.8 },
    ),
};

export const OBJECT_KIND_SPECS: readonly AnyKindSpec[] = [
  icebergSpec,
  balanceSpec,
  podiumSpec,
  compoundSpec,
  dominoesSpec,
  stairsSpec,
];
