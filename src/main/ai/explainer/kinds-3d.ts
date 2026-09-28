/**
 * 3D scene kinds (myth-fact, funnel, hero) as planner specs.
 * Mirrors the structure of kinds-core.ts.
 */

import {
  HERO_CATALOG,
  heroHasDownTone,
  heroImpactSec,
} from '../../remotion/compositions/explainer/hero-catalog';
import {
  HERO_PROPS,
  type HeroProp,
  type SceneCue,
} from '../../remotion/compositions/explainer/types';
import { type AnyKindSpec, type KindSpec, type PromptOffer, parseTimedList } from './kind-spec';

const L = {
  myth: 48,
  fact: 48,
  funnelStage: 14,
  funnelResult: 16,
  heroLabel: 18,
} as const;

/**
 * Animation offsets the cues must line up with. Keep in sync with the
 * compositions (MythFactScene FLIP_LAND_SEC) — duplicated so this module stays
 * free of React imports. Hero impact timings live in hero-catalog.ts.
 */
export const MYTH_FLIP_LAND_SEC = 0.3;
export const COIN_LAND_SEC = HERO_CATALOG.coins.impactSec;
export const LOCK_CLICK_SEC = HERO_CATALOG.lock.impactSec;

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
  family: 'compare',
  triggers: [
    /\b(myth|people think|most people|actually|the truth is|reality|misconception|believe|lie)\b/,
  ],
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
  family: 'process',
  triggers: [/\b(funnel|leads|conversions?|convert|pipeline|narrow|filter|out of)\b/],
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

function heroPrompt(props: readonly HeroProp[]): { describe: string; schema: string } {
  const list = props.map((p) => `${p} (${HERO_CATALOG[p].hint})`).join('; ');
  const downs = props.filter(heroHasDownTone);
  const tone =
    downs.length > 0
      ? ` Optional "tone":"down" plays the reversed action for ${downs
          .map((p) => `${p} = ${HERO_CATALOG[p].downHint}`)
          .join(', ')}.`
      : '';
  return {
    describe: `the speaker names a THING, not a process. One soft 3D prop appears on that word with a short label and plays its signature motion. Props: ${list}.${tone} 3D.`,
    schema: `{"kind":"hero","prop":"${props.join('|')}","label":"...","word":N${downs.length > 0 ? ',"tone":"up"|"down"' : ''}}`,
  };
}

const ALL_HERO_PROMPT = heroPrompt(HERO_PROPS);

export const heroSpec: KindSpec<'hero'> = {
  kind: 'hero',
  describe: ALL_HERO_PROMPT.describe,
  schema: ALL_HERO_PROMPT.schema,
  prompt: (offer: PromptOffer) => heroPrompt(offer.heroProps),
  limits: `hero label ≤ ${L.heroLabel}`,
  layouts: ['takeover', 'stack', 'over'],
  durationSec: [2.5, 6],
  family: 'object',
  general: true,
  triggers: [],
  parse: (raw, ctx) => {
    if (typeof raw.prop !== 'string' || !HERO_PROP_SET.has(raw.prop)) {
      ctx.issues.push(`prop must be one of the listed props (got ${JSON.stringify(raw.prop)})`);
      return null;
    }
    const prop = raw.prop as HeroProp;
    const label = ctx.str(raw.label, L.heroLabel);
    const w = ctx.inWin(raw.word);
    if (!label || w === null) return null;
    const scene = { kind: 'hero' as const, prop, label, at: ctx.at(w) };
    return raw.tone === 'down' && heroHasDownTone(prop) ? { ...scene, tone: 'down' } : scene;
  },
  cues: (s) => {
    const impact = HERO_CATALOG[s.prop].impactCue;
    return [
      { kind: 'whoosh', at: s.at, gain: 0.6 },
      ...(impact
        ? [{ kind: impact.kind, at: s.at + heroImpactSec(s.prop, s.tone), gain: impact.gain }]
        : []),
    ];
  },
};

export const THREE_D_KIND_SPECS: readonly AnyKindSpec[] = [mythFactSpec, funnelSpec, heroSpec];
