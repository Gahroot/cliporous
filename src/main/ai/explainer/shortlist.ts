/**
 * Shortlist: pick which scene kinds and hero props the planner prompt offers
 * for ONE clip, from cues in its transcript. Pure + deterministic.
 *
 * Why: with ~40 kinds and ~30 props, listing everything makes the prompt long
 * and look-alike kinds blur, so the model picks worse. Large tool-using agents
 * solve the same problem by ranking the catalog against the request and only
 * showing the top matches (livekit-agents `ToolSearchToolset`, pydantic-ai
 * `ToolSearch`); veedstudio/open-edit picks styles from transcript signals in
 * code. Same idea here: keyword triggers score each kind, general-purpose
 * kinds are always offered, and a small default set backfills quiet clips.
 *
 * The shortlist narrows the MENU, not the law: the parser still accepts any
 * valid kind/prop, so a good off-list pick from the model is never thrown away.
 */

import { HERO_CATALOG } from '../../remotion/compositions/explainer/hero-catalog';
import { HERO_PROPS, type HeroProp } from '../../remotion/compositions/explainer/types';
import type { AnyKindSpec, PlannerWord } from './kind-spec';
import { ALL_KIND_SPECS } from './kinds';

export const SHORTLIST_LIMITS = {
  /** Max kinds listed in the prompt. */
  maxKinds: 16,
  /** Quiet clips are backfilled to at least this many kinds. */
  minKinds: 10,
  /** Max hero props listed. */
  maxProps: 10,
  /** Props backfilled when the transcript names few things. */
  minProps: 5,
  /** One trigger can add at most this much to a kind's score. */
  maxHitsPerTrigger: 3,
} as const;

/** Well-rounded kinds used to backfill a quiet clip (in priority order). */
const BACKFILL_KINDS = [
  'checklist',
  'versus',
  'timeline',
  'number',
  'flow',
  'question',
  'myth-fact',
  'before-after',
  'stack',
  'notes',
] as const;

/** Props used to backfill (the original, most versatile set). */
const BACKFILL_PROPS: readonly HeroProp[] = [
  'lightbulb',
  'rocket',
  'coins',
  'target',
  'key',
  'phone',
  'laptop',
  'lock',
];

export interface Shortlist {
  /** Offered kinds, in registry order (stable prompt). */
  kinds: readonly AnyKindSpec[];
  /** Offered hero props, in catalog order. */
  heroProps: readonly HeroProp[];
  /** Trigger score per kind with score > 0 (for logs/tests). */
  scores: Readonly<Record<string, number>>;
}

/** Lowercased transcript with normalised apostrophes, for trigger matching. */
export function shortlistText(words: readonly PlannerWord[]): string {
  return ` ${words
    .map((w) => w.text)
    .join(' ')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")} `;
}

function countHits(re: RegExp, text: string): number {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  let n = 0;
  while (n < SHORTLIST_LIMITS.maxHitsPerTrigger) {
    const m = global.exec(text);
    if (m === null) break;
    // Guard against zero-length matches looping forever.
    if (m[0].length === 0) global.lastIndex++;
    n++;
  }
  return n;
}

/** Trigger score for one kind against a transcript. */
export function scoreKind(spec: AnyKindSpec, text: string): number {
  return spec.triggers.reduce((sum, re) => sum + countHits(re, text), 0);
}

function byScoreThenOrder<T>(items: readonly T[], score: (t: T) => number): T[] {
  return items
    .map((item, order) => ({ item, order, s: score(item) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.order - b.order)
    .map((x) => x.item);
}

export function buildShortlist(
  words: readonly PlannerWord[],
  specs: readonly AnyKindSpec[] = ALL_KIND_SPECS,
): Shortlist {
  const text = shortlistText(words);
  const scores: Record<string, number> = {};
  for (const spec of specs) {
    const s = scoreKind(spec, text);
    if (s > 0) scores[spec.kind] = s;
  }

  const chosen = new Set<string>(specs.filter((s) => s.general).map((s) => s.kind));
  for (const spec of byScoreThenOrder(specs, (s) => scores[s.kind] ?? 0)) {
    if (chosen.size >= SHORTLIST_LIMITS.maxKinds) break;
    chosen.add(spec.kind);
  }
  for (const kind of BACKFILL_KINDS) {
    if (chosen.size >= SHORTLIST_LIMITS.minKinds) break;
    if (specs.some((s) => s.kind === kind)) chosen.add(kind);
  }

  const propScore = (p: HeroProp): number => countHits(HERO_CATALOG[p].triggers, text);
  const props = new Set<HeroProp>(
    byScoreThenOrder(HERO_PROPS, propScore).slice(0, SHORTLIST_LIMITS.maxProps),
  );
  for (const p of BACKFILL_PROPS) {
    if (props.size >= SHORTLIST_LIMITS.minProps) break;
    props.add(p);
  }

  return {
    kinds: specs.filter((s) => chosen.has(s.kind)),
    heroProps: HERO_PROPS.filter((p) => props.has(p)),
    scores,
  };
}
