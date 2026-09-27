/**
 * 3D scene kinds (myth-fact, funnel, hero) as planner specs.
 * Mirrors the structure of kinds-core.ts.
 */

import {
  HERO_PROPS,
  type HeroProp,
  type SceneCue,
} from '../../remotion/compositions/explainer/types';
import { type AnyKindSpec, type KindSpec, parseTimedList } from './kind-spec';

const L = {
  myth: 48,
  fact: 48,
  funnelStage: 14,
  funnelResult: 16,
  heroLabel: 18,
} as const;

/**
 * Animation offsets the cues must line up with. Keep in sync with the
 * compositions (MythFactScene FLIP_LAND_SEC, HeroProps COIN_LAND_SEC /
 * LOCK_CLICK_SEC) — duplicated so this module stays free of React imports.
 */
export const MYTH_FLIP_LAND_SEC = 0.3;
export const COIN_LAND_SEC = 0.75;
export const LOCK_CLICK_SEC = 0.5;

/** Minimum gap between the myth and the flip so the myth can be read. */
const MYTH_MIN_READ_SEC = 1;

const HERO_PROP_SET: ReadonlySet<string> = new Set(HERO_PROPS);

export const mythFactSpec: KindSpec<'myth-fact'> = {
  kind: 'myth-fact',
  describe:
    'they state a common belief and then correct it ("people think X — actually Y"). A 3D card shows the myth, then flips to the fact on the correcting word. 3D.',
  schema: '{"kind":"myth-fact","myth":"...","fact":"...","mythWord":N,"flipWord":N}',
  limits: `myth ≤ ${L.myth}, fact ≤ ${L.fact}`,
  layouts: ['stack', 'takeover', 'pip'],
  durationSec: [3.5, 9],
  parse: (raw, ctx) => {
    const myth = ctx.str(raw.myth, L.myth);
    const fact = ctx.str(raw.fact, L.fact);
    const mythW = ctx.inWin(raw.mythWord);
    const flipW = ctx.inWin(raw.flipWord);
    if (!myth || !fact || mythW === null || flipW === null) return null;
    const mythAt = ctx.at(mythW);
    const flipAt = Math.min(ctx.lastBeat, Math.max(ctx.at(flipW), mythAt + MYTH_MIN_READ_SEC));
    if (flipAt - mythAt < 0.6) return null;
    return { kind: 'myth-fact', myth, fact, mythAt, flipAt };
  },
  cues: (s) => [
    { kind: 'slide', at: Math.max(0, s.mythAt - 0.2), gain: 0.7 },
    { kind: 'flip', at: s.flipAt },
    { kind: 'thump', at: s.flipAt + MYTH_FLIP_LAND_SEC, gain: 0.6 },
  ],
};

export const funnelSpec: KindSpec<'funnel'> = {
  kind: 'funnel',
  describe:
    'a narrowing process where many go in and few come out (leads → calls → deals, visitors → signups → buyers). 2-4 stages top to bottom, optional short result ("12 clients"). 3D.',
  schema:
    '{"kind":"funnel","stages":[{"label":"...","word":N}],"result":"..." or null,"resultWord":N or null}',
  limits: `stage label ≤ ${L.funnelStage}, result ≤ ${L.funnelResult}`,
  layouts: ['takeover', 'stack', 'pip'],
  durationSec: [4, 10],
  parse: (raw, ctx) => {
    const stages = parseTimedList(
      raw.stages,
      ctx,
      (s) => {
        const label = ctx.str(s.label, L.funnelStage);
        return label ? { label } : null;
      },
      [2, 4],
    );
    if (!stages) return null;
    const lastStage = stages[stages.length - 1]?.t ?? ctx.win.startTime;
    const scene = {
      kind: 'funnel' as const,
      stages: stages.map((s) => ({ label: s.label, at: s.t })),
    };
    if (raw.result === null || raw.result === undefined) return scene;
    const result = ctx.str(raw.result, L.funnelResult);
    if (!result) return null;
    const resultW = ctx.inWin(raw.resultWord);
    if (resultW === null) return scene;
    const resultAt = Math.min(ctx.lastBeat, Math.max(ctx.at(resultW), lastStage + 0.5));
    // No room for the result to land after the last stage: drop it.
    if (resultAt - lastStage < 0.3) return scene;
    return { ...scene, result, resultAt };
  },
  cues: (s) => [
    ...s.stages.map((st): SceneCue => ({ kind: 'tick', at: st.at, gain: 0.85 })),
    ...(s.resultAt === undefined ? [] : [{ kind: 'pop' as const, at: s.resultAt, gain: 0.85 }]),
  ],
};

export const heroSpec: KindSpec<'hero'> = {
  kind: 'hero',
  describe:
    'the speaker names a THING, not a process: idea → lightbulb, launch/growth → rocket, money/price → coins, app/call/text → phone, software/work → laptop, security/privacy → lock. One soft 3D prop appears on that word with a short label. 3D.',
  schema: `{"kind":"hero","prop":"${HERO_PROPS.join('|')}","label":"...","word":N}`,
  limits: `hero label ≤ ${L.heroLabel}`,
  layouts: ['takeover', 'stack', 'over'],
  durationSec: [2.5, 6],
  parse: (raw, ctx) => {
    if (typeof raw.prop !== 'string' || !HERO_PROP_SET.has(raw.prop)) return null;
    const label = ctx.str(raw.label, L.heroLabel);
    const w = ctx.inWin(raw.word);
    if (!label || w === null) return null;
    return { kind: 'hero', prop: raw.prop as HeroProp, label, at: ctx.at(w) };
  },
  cues: (s) => [
    { kind: 'whoosh', at: s.at, gain: 0.6 },
    ...(s.prop === 'coins' ? [{ kind: 'pop' as const, at: s.at + COIN_LAND_SEC, gain: 0.8 }] : []),
    ...(s.prop === 'lock'
      ? [{ kind: 'thump' as const, at: s.at + LOCK_CLICK_SEC, gain: 0.5 }]
      : []),
  ],
};

export const THREE_D_KIND_SPECS: readonly AnyKindSpec[] = [mythFactSpec, funnelSpec, heroSpec];
