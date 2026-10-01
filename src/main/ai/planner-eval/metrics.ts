/**
 * Offline measurements of validated, absolute-time plans, NOT semantic scoring.
 * TrialArtifact callers pass result.value only when result.ok; failures are NOT empty plans.
 * No provider, renderer, filesystem, history mutation, or transcript text in the output.
 */
import { HERO_CATALOG } from '../../remotion/compositions/explainer/hero-catalog';
import { type ExplainerScene, HERO_PROPS } from '../../remotion/compositions/explainer/types';
import { ALL_KIND_SPECS, getKindSpec } from '../explainer/kinds';
import { animationSignature } from '../explainer/recent-usage';
import { scoreKind, shortlistText } from '../explainer/shortlist';
import type { PlannedExplainerScene, PlannerEditPlan } from '../explainer-scenes';
import type { CorpusClip } from './corpus';

/** Null, never zero/perfect, when there is no denominator. */
export interface Share {
  numerator: number;
  denominator: number;
  share: number | null;
}
export type FrequencyDimension = 'kind' | 'family' | 'preset' | 'prop' | 'tone' | 'motif';
export interface Frequency {
  key: string;
  count: number;
  durationSec: number;
  countShare: number;
  durationShare: number;
}
/**
 * Denominators include only scenes applicable to this dimension (e.g. hero scenes for tone).
 * Durations are summed clipped scene-seconds, NOT wall-clock unions; overlaps count twice.
 * Preset keys are kind:presetId; motif keys are JSON animationSignature (including variants).
 * Preset/variant IDs use the existing recent-usage hashes, never scene labels.
 */
export interface FrequencyTable {
  countDenominator: number;
  durationDenominatorSec: number;
  entries: Frequency[];
}
export interface DominantShare extends Share {
  /** All tied keys, sorted; empty if unobserved. */
  keys: string[];
}
export interface MotifMeasurements {
  dominantCount: DominantShare;
  dominantDuration: DominantShare;
  /** Immediate chronological scene pairs, even across gaps; never across plan boundaries. */
  adjacentRepeats: Record<'kind' | 'family' | 'motif', Share>;
}
/** Every numerator/denominator here is seconds; overlaps are unioned within each clip. */
export interface TimeMeasurements {
  animation: Share;
  animationTakeover: Share;
  /** plan.quotes only. A scene of kind 'quote' is still an explanatory scene. */
  quote: Share;
  speakerHidden: Share;
  speakerVisibleAnimation: Share;
}
export interface SceneRun {
  sceneCount: number;
  startTime: number | null;
  endTime: number | null;
  durationSec: number;
}
export interface StableSplitScreenRun extends SceneRun {
  layout: 'stack' | 'stack-flipped' | null;
}
export interface ProxyMeasurements {
  label: 'NOT semantic scoring';
  usefulAnimation: {
    definition: string;
    scenes: Share;
    duration: Share;
  };
  eligibleIdeas: {
    definition: string;
    windowCount: number;
    eligibleWindows: number;
    covered: Share;
  };
}
export interface ExpectationCheck {
  expectation:
    | 'animation'
    | 'quote'
    | 'takeaway'
    | 'requiredKind'
    | 'forbiddenKind'
    | 'minConsecutiveScenes';
  target?: string;
  status: 'pass' | 'fail' | 'not-applicable' | 'needs-human-review';
  reason: string;
}
export interface ExpectationMeasurements {
  /** Mechanical passes do not certify relevance, grounding, or the corpus's semantic notes. */
  status: 'pass' | 'fail' | 'needs-human-review';
  checks: ExpectationCheck[];
  failReasons: string[];
}
export interface PlanMeasurements {
  clipDurationSec: number;
  sceneCount: number;
  quoteCount: number;
  frequencies: Record<FrequencyDimension, FrequencyTable>;
  motifs: MotifMeasurements;
  time: TimeMeasurements;
  /** Adjacent scene layout differences / adjacent scene pairs, ignoring gaps and quotes. */
  layoutChanges: Share;
  /** Touching/overlapping windows, no gap allowance; layout-independent. */
  longestConsecutiveSceneRun: SceneRun;
  /** Longest duration (then count): same stack orientation, no gaps/other layout/quote; not a render guarantee. */
  longestStableSplitScreenRun: StableSplitScreenRun;
  proxies: ProxyMeasurements;
  expectations: ExpectationMeasurements;
  rubric: HumanRubric;
}
export interface CollectionEntry {
  /** Stable source clip identity, not trial ID; repeated trials of a clip reuse this ID. */
  clipId: string;
  plan: PlannerEditPlan;
  clip: CorpusClip;
}
export interface CollectionMeasurements {
  entryCount: number;
  distinctClipCount: number;
  plans: { clipId: string; measurements: PlanMeasurements }[];
  frequencies: Record<FrequencyDimension, FrequencyTable>;
  motifs: MotifMeasurements;
  time: TimeMeasurements;
  layoutChanges: Share;
  crossClipRepeats: {
    /** Unordered distinct clip pairs sharing >=1 exact motif / all distinct clip pairs. */
    clipPairs: Share;
    /** Motifs occurring in >=2 distinct clip IDs / all observed motifs. */
    repeatedMotifs: Share;
    motifs: { key: string; clipIds: string[]; clipShare: Share }[];
  };
}

const dimensions: readonly FrequencyDimension[] = [
  'kind',
  'family',
  'preset',
  'prop',
  'tone',
  'motif',
];
const repeatDimensions = ['kind', 'family', 'motif'] as const;
const timeDimensions = [
  'animation',
  'animationTakeover',
  'quote',
  'speakerHidden',
  'speakerVisibleAnimation',
] as const;
const share = (numerator: number, denominator: number): Share => ({
  numerator,
  denominator,
  share: denominator > 0 ? numerator / denominator : null,
});
type Interval = { startTime: number; endTime: number };
type MeasuredScene = PlannedExplainerScene & { keys: Partial<Record<FrequencyDimension, string>> };
const duration = (window: Interval): number => window.endTime - window.startTime;
const overlaps = (a: Interval, b: Interval): boolean =>
  a.startTime < b.endTime && b.startTime < a.endTime;
const chronological = (a: Interval, b: Interval): number =>
  a.startTime - b.startTime || a.endTime - b.endTime;
function clipped<T extends Interval>(windows: readonly T[], clip: CorpusClip): T[] {
  return windows
    .map((window) => ({
      ...window,
      startTime: Math.max(clip.bounds.start, window.startTime),
      endTime: Math.min(clip.bounds.end, window.endTime),
    }))
    .filter((window) => duration(window) > 0)
    .sort(chronological);
}
function unionDuration(windows: readonly Interval[]): number {
  let total = 0;
  let end = -Infinity;
  for (const window of [...windows].sort(chronological)) {
    total += Math.max(0, window.endTime - Math.max(end, window.startTime));
    end = Math.max(end, window.endTime);
  }
  return total;
}
function intersectionDuration(a: readonly Interval[], b: readonly Interval[]): number {
  return unionDuration(
    a.flatMap((left) =>
      b
        .filter((right) => overlaps(left, right))
        .map((right) => ({
          startTime: Math.max(left.startTime, right.startTime),
          endTime: Math.min(left.endTime, right.endTime),
        })),
    ),
  );
}
function sceneKeys(scene: ExplainerScene): MeasuredScene['keys'] {
  const signature = animationSignature(scene);
  return {
    kind: signature.kind,
    family: getKindSpec(signature.kind)?.family ?? 'unknown',
    preset: signature.presetId ? `${signature.kind}:${signature.presetId}` : undefined,
    prop: signature.prop,
    tone: signature.tone,
    motif: JSON.stringify(signature),
  };
}
function frequencies(
  items: readonly { key: string; count: number; durationSec: number }[],
): FrequencyTable {
  const rows = new Map<string, { key: string; count: number; durationSec: number }>();
  for (const item of items) {
    const previous = rows.get(item.key) ?? { key: item.key, count: 0, durationSec: 0 };
    previous.count += item.count;
    previous.durationSec += item.durationSec;
    rows.set(item.key, previous);
  }
  const countDenominator = items.reduce((sum, item) => sum + item.count, 0);
  const durationDenominatorSec = items.reduce((sum, item) => sum + item.durationSec, 0);
  return {
    countDenominator,
    durationDenominatorSec,
    entries: [...rows.keys()].sort().map((key) => {
      const row = rows.get(key) as { key: string; count: number; durationSec: number };
      return {
        ...row,
        countShare: row.count / countDenominator,
        durationShare: row.durationSec / durationDenominatorSec,
      };
    }),
  };
}
function dominant(table: FrequencyTable, field: 'count' | 'durationSec'): DominantShare {
  const maximum = Math.max(0, ...table.entries.map((entry) => entry[field]));
  return {
    ...share(maximum, field === 'count' ? table.countDenominator : table.durationDenominatorSec),
    keys: table.entries.filter((entry) => entry[field] === maximum).map((entry) => entry.key),
  };
}
const emptyRun = (): SceneRun => ({
  sceneCount: 0,
  startTime: null,
  endTime: null,
  durationSec: 0,
});
function runs(
  scenes: readonly MeasuredScene[],
  quotes: readonly Interval[],
): {
  consecutive: SceneRun;
  stable: StableSplitScreenRun;
} {
  let consecutive = emptyRun();
  let stable: StableSplitScreenRun = { ...emptyRun(), layout: null };
  let current = emptyRun();
  let split: StableSplitScreenRun = { ...emptyRun(), layout: null };
  const better = (a: SceneRun, b: SceneRun): boolean =>
    a.sceneCount > b.sceneCount || (a.sceneCount === b.sceneCount && a.durationSec > b.durationSec);
  const extend = (previous: SceneRun, scene: Interval): SceneRun => {
    const connected = previous.endTime !== null && scene.startTime <= previous.endTime;
    const startTime = connected ? (previous.startTime as number) : scene.startTime;
    const endTime = connected ? Math.max(previous.endTime as number, scene.endTime) : scene.endTime;
    return {
      sceneCount: connected ? previous.sceneCount + 1 : 1,
      startTime,
      endTime,
      durationSec: endTime - startTime,
    };
  };
  for (const scene of scenes) {
    const quoted = quotes.some((quote) => overlaps(scene, quote));
    current = quoted ? emptyRun() : extend(current, scene);
    if (better(current, consecutive)) consecutive = current;
    const layout = scene.layout;
    const splitLayout = layout === 'stack' || layout === 'stack-flipped';
    // Conservative for overlapping inputs: do not count partially obscured scenes as stable.
    const interrupted =
      quoted || scenes.some((other) => other.layout !== layout && overlaps(scene, other));
    if (splitLayout && !interrupted) {
      split = { ...extend(split.layout === layout ? split : emptyRun(), scene), layout };
      if (
        split.durationSec > stable.durationSec ||
        (split.durationSec === stable.durationSec && split.sceneCount > stable.sceneCount)
      )
        stable = split;
    } else split = { ...emptyRun(), layout: null };
  }
  return { consecutive, stable };
}
function propMatches(prop: keyof typeof HERO_CATALOG, text: string): boolean {
  const trigger = HERO_CATALOG[prop].triggers;
  return new RegExp(trigger.source, trigger.flags).test(text);
}
function sceneMatches(scene: ExplainerScene, text: string): boolean {
  if (scene.kind === 'hero') return propMatches(scene.prop, text);
  const spec = getKindSpec(scene.kind);
  return !!spec && scoreKind(spec, text) > 0;
}
function proxies(
  scenes: readonly MeasuredScene[],
  clip: CorpusClip,
  animationSec: number,
): ProxyMeasurements {
  const wordsIn = (window: Interval) =>
    clip.words.filter((word) => word.start < window.endTime && word.end > window.startTime);
  const useful = scenes.filter((scene) => sceneMatches(scene.scene, shortlistText(wordsIn(scene))));
  // Plan-independent proxy windows: source sentences or >=1s pauses, after runner's hook floor.
  const words = clip.words.filter(
    (word) => word.start >= clip.bounds.start + Math.max(1.5, clip.hookLeadSec ?? 0),
  );
  const windows: (typeof words)[] = [];
  let pending: typeof words = [];
  words.forEach((word, index) => {
    pending.push(word);
    const next = words[index + 1];
    if (!next || /[.!?]["'”’)]*$/.test(word.text) || next.start - word.end >= 1) {
      windows.push(pending);
      pending = [];
    }
  });
  const eligible = windows.filter((window) => {
    const text = shortlistText(window);
    return (
      ALL_KIND_SPECS.some((spec) => scoreKind(spec, text) > 0) ||
      HERO_PROPS.some((prop) => propMatches(prop, text))
    );
  });
  const covered = eligible.filter((window) =>
    scenes.some((scene) =>
      sceneMatches(
        scene.scene,
        shortlistText(
          window.filter((word) => word.start < scene.endTime && word.end > scene.startTime),
        ),
      ),
    ),
  ).length;
  return {
    label: 'NOT semantic scoring',
    usefulAnimation: {
      definition:
        'Selected kind trigger (hero: selected prop trigger) in overlapping source words; count share and union-duration share of animations. Keyword overlap is NOT usefulness or grounding.',
      scenes: share(useful.length, scenes.length),
      duration: share(unionDuration(useful), animationSec),
    },
    eligibleIdeas: {
      definition:
        'After max(1.5s, hookLeadSec), split at sentence punctuation or >=1s pauses. Eligible = any catalog kind/prop trigger, without shortlist backfill. Covered = a selected scene trigger in overlapping words of that window. NOT semantic ideas, recall, or completeness.',
      windowCount: windows.length,
      eligibleWindows: eligible.length,
      covered: share(covered, eligible.length),
    },
  };
}
function expectations(
  clip: CorpusClip,
  scenes: readonly MeasuredScene[],
  quotes: PlannerEditPlan['quotes'],
  run: SceneRun,
): ExpectationMeasurements {
  const checks: ExpectationCheck[] = [];
  const expected = clip.expectations;
  for (const [expectation, rule, count] of [
    ['animation', expected.animation, scenes.length],
    ['quote', expected.quote, quotes.length],
  ] as const) {
    const required = rule === 'required';
    const forbidden = rule === 'none' || rule === 'forbidden';
    checks.push({
      expectation,
      status: required
        ? count > 0
          ? 'pass'
          : 'fail'
        : forbidden
          ? count === 0
            ? 'pass'
            : 'fail'
          : 'not-applicable',
      reason: `${expectation}: expected ${rule}; observed ${count} positive-duration ${expectation === 'quote' ? 'full-screen quote' : 'scene'} windows.`,
    });
  }
  const takeawayQuotes = quotes.filter((quote) => quote.reason === 'takeaway').length;
  checks.push({
    expectation: 'takeaway',
    status:
      expected.takeaway === 'allowed'
        ? 'not-applicable'
        : expected.takeaway === 'forbidden' && takeawayQuotes > 0
          ? 'fail'
          : 'needs-human-review',
    reason: `takeaway: expected ${expected.takeaway}; observed ${takeawayQuotes} quotes labeled takeaway. A takeaway can be conveyed without a quote; human review of corpus notes/source/render is required, not keyword inference.`,
  });
  for (const [expectation, kinds] of [
    ['requiredKind', expected.requiredKinds],
    ['forbiddenKind', expected.forbiddenKinds],
  ] as const) {
    for (const kind of kinds) {
      const present = scenes.some((scene) => scene.scene.kind === kind);
      checks.push({
        expectation,
        target: kind,
        status: present === (expectation === 'requiredKind') ? 'pass' : 'fail',
        reason: `${expectation}: ${kind} ${present ? 'present' : 'absent'}.`,
      });
    }
  }
  if (expected.minConsecutiveScenes !== undefined)
    checks.push({
      expectation: 'minConsecutiveScenes',
      status: run.sceneCount >= expected.minConsecutiveScenes ? 'pass' : 'fail',
      reason: `minConsecutiveScenes: expected >=${expected.minConsecutiveScenes}; observed ${run.sceneCount} touching/overlapping scene windows without quotes (any layout).`,
    });
  const failReasons = checks
    .filter((check) => check.status === 'fail')
    .map((check) => check.reason);
  return {
    checks,
    failReasons,
    status: failReasons.length
      ? 'fail'
      : checks.some((check) => check.status === 'needs-human-review')
        ? 'needs-human-review'
        : 'pass',
  };
}

/** Positive-duration windows are clipped to the full clip bounds; hook time stays in time denominators. */
export function measurePlan(plan: PlannerEditPlan, clip: CorpusClip): PlanMeasurements {
  const scenes = clipped(plan.scenes, clip).map((scene) => ({
    ...scene,
    keys: sceneKeys(scene.scene),
  }));
  const quotes = clipped(plan.quotes, clip);
  const clipDurationSec = clip.bounds.end - clip.bounds.start;
  const tables = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      frequencies(
        scenes.flatMap((scene) => {
          const key = scene.keys[dimension];
          return key === undefined ? [] : [{ key, count: 1, durationSec: duration(scene) }];
        }),
      ),
    ]),
  ) as Record<FrequencyDimension, FrequencyTable>;
  const pairs = Math.max(0, scenes.length - 1);
  const adjacentRepeats = Object.fromEntries(
    repeatDimensions.map((dimension) => [
      dimension,
      share(
        scenes
          .slice(1)
          .filter((scene, index) => scene.keys[dimension] === scenes[index].keys[dimension]).length,
        pairs,
      ),
    ]),
  ) as MotifMeasurements['adjacentRepeats'];
  const takeover = scenes.filter((scene) => scene.layout === 'takeover');
  const hidden = [...takeover, ...quotes];
  const animationSec = unionDuration(scenes);
  const sceneRuns = runs(scenes, quotes);
  return {
    clipDurationSec,
    sceneCount: scenes.length,
    quoteCount: quotes.length,
    frequencies: tables,
    motifs: {
      dominantCount: dominant(tables.motif, 'count'),
      dominantDuration: dominant(tables.motif, 'durationSec'),
      adjacentRepeats,
    },
    time: {
      animation: share(animationSec, clipDurationSec),
      animationTakeover: share(unionDuration(takeover), clipDurationSec),
      quote: share(unionDuration(quotes), clipDurationSec),
      speakerHidden: share(unionDuration(hidden), clipDurationSec),
      speakerVisibleAnimation: share(
        Math.max(0, animationSec - intersectionDuration(scenes, hidden)),
        clipDurationSec,
      ),
    },
    layoutChanges: share(
      scenes.slice(1).filter((scene, index) => scene.layout !== scenes[index].layout).length,
      pairs,
    ),
    longestConsecutiveSceneRun: sceneRuns.consecutive,
    longestStableSplitScreenRun: sceneRuns.stable,
    proxies: proxies(scenes, clip, animationSec),
    expectations: expectations(clip, scenes, quotes, sceneRuns.consecutive),
    rubric: createRubricTemplate(),
  };
}

/**
 * Caller groups comparable trials (profile/split/repetition) before calling. Every entry contributes
 * exposure, including repeat trials. Cross-clip repeats deduplicate clipId, never count another trial
 * of the SAME clip as another clip. Time denominators SUM per-entry clip lengths; no cross-clip union.
 */
export function measureCollection(entries: readonly CollectionEntry[]): CollectionMeasurements {
  const plans = entries.map(({ clipId, plan, clip }) => ({
    clipId,
    measurements: measurePlan(plan, clip),
  }));
  const tables = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      frequencies(plans.flatMap(({ measurements }) => measurements.frequencies[dimension].entries)),
    ]),
  ) as Record<FrequencyDimension, FrequencyTable>;
  const sumShares = (values: readonly Share[]): Share =>
    share(
      values.reduce((sum, value) => sum + value.numerator, 0),
      values.reduce((sum, value) => sum + value.denominator, 0),
    );
  const clips = [...new Set(entries.map((entry) => entry.clipId))].sort();
  const motifClips = new Map<string, Set<string>>();
  for (const { clipId, measurements } of plans)
    for (const motif of measurements.frequencies.motif.entries) {
      const ids = motifClips.get(motif.key) ?? new Set<string>();
      ids.add(clipId);
      motifClips.set(motif.key, ids);
    }
  const repeated = [...motifClips.keys()].sort().flatMap((key) => {
    const clipIds = [...(motifClips.get(key) ?? [])].sort();
    return clipIds.length < 2
      ? []
      : [{ key, clipIds, clipShare: share(clipIds.length, clips.length) }];
  });
  const sharedPairs = new Set<string>();
  for (const { clipIds } of repeated)
    clipIds.forEach((left, index) => {
      for (const right of clipIds.slice(index + 1)) sharedPairs.add(JSON.stringify([left, right]));
    });
  return {
    entryCount: entries.length,
    distinctClipCount: clips.length,
    plans,
    frequencies: tables,
    motifs: {
      dominantCount: dominant(tables.motif, 'count'),
      dominantDuration: dominant(tables.motif, 'durationSec'),
      adjacentRepeats: Object.fromEntries(
        repeatDimensions.map((dimension) => [
          dimension,
          sumShares(
            plans.map(({ measurements }) => measurements.motifs.adjacentRepeats[dimension]),
          ),
        ]),
      ) as MotifMeasurements['adjacentRepeats'],
    },
    time: Object.fromEntries(
      timeDimensions.map((dimension) => [
        dimension,
        sumShares(plans.map(({ measurements }) => measurements.time[dimension])),
      ]),
    ) as unknown as TimeMeasurements,
    layoutChanges: sumShares(plans.map(({ measurements }) => measurements.layoutChanges)),
    crossClipRepeats: {
      clipPairs: share(sharedPairs.size, (clips.length * Math.max(0, clips.length - 1)) / 2),
      repeatedMotifs: share(repeated.length, motifClips.size),
      motifs: repeated,
    },
  };
}

export type RubricScore = 1 | 2 | 3 | 4 | 5;
export type RubricCriterion = 'relevance' | 'clarity' | 'readability' | 'pacing' | 'restraint';
/** Human-only anchors. No summed quality score, automatic judge, or novelty reward. */
export const RUBRIC_ANCHORS: Record<RubricCriterion, Readonly<Record<RubricScore, string>>> = {
  relevance: {
    1: 'Visuals miss or contradict the spoken idea.',
    2: 'Mostly generic; weak connection to the specific idea.',
    3: 'Main idea is represented with some irrelevant choices.',
    4: 'Specific, source-grounded choices explain almost every idea shown.',
    5: 'Every visual choice directly explains the source; no misleading implication.',
  },
  clarity: {
    1: 'Cannot identify the intended explanation.',
    2: 'Relationships require substantial guessing.',
    3: 'Main relationship is understandable with some ambiguity.',
    4: 'Relationships and sequence are clear with minor friction.',
    5: 'Explanation is immediately understandable and preserves source uncertainty.',
  },
  readability: {
    1: 'Essential text or objects are unreadable/occluded.',
    2: 'Frequent crowding or insufficient reading time.',
    3: 'Mostly legible, with occasional crowding or rushed labels.',
    4: 'Legible at delivery size with minor issues.',
    5: 'All essential labels/objects remain readable at delivery size with captions and speaker.',
  },
  pacing: {
    1: 'Beats conflict with speech or cannot be followed.',
    2: 'Frequent rushed beats, stalls, or unnecessary cuts.',
    3: 'Generally follows speech; some mistimed holds or changes.',
    4: 'Good speech alignment and holds with minor timing issues.',
    5: 'Every beat supports comprehension; stable runs and holds last as long as needed.',
  },
  restraint: {
    1: 'Distracting decoration or missing required explanation.',
    2: 'Frequent unnecessary motion, quotes, or speaker hiding.',
    3: 'Some unnecessary emphasis, but essential explanation is present.',
    4: 'Mostly purposeful motion and speaker visibility; little excess.',
    5: 'Only earned emphasis; complete needed explanation with no needless layout churn. Empty is not best when animation is required.',
  },
};
export interface HumanRubric {
  scores: Record<RubricCriterion, RubricScore | null>;
  evidence: Record<RubricCriterion, string | null>;
  unsupportedClaims: { present: boolean | null; evidence: string[] };
  disqualificationRule: string;
}
export function createRubricTemplate(): HumanRubric {
  return {
    scores: { relevance: null, clarity: null, readability: null, pacing: null, restraint: null },
    evidence: { relevance: null, clarity: null, readability: null, pacing: null, restraint: null },
    unsupportedClaims: { present: null, evidence: [] },
    disqualificationRule:
      'Any unsupported claim disqualifies, regardless of scores. Review source, corpus notes, and rendered output; null means unscored, never a pass.',
  };
}
/** Classifies a human-filled rubric, never judges its evidence or computes quality. */
export function rubricDisposition(
  rubric: HumanRubric,
): 'unscored' | 'incomplete' | 'reviewed' | 'disqualified' {
  if (rubric.unsupportedClaims.present === true || rubric.unsupportedClaims.evidence.length > 0)
    return 'disqualified';
  const criteria = Object.keys(RUBRIC_ANCHORS) as RubricCriterion[];
  if (
    criteria.every((key) => rubric.scores[key] === null) &&
    rubric.unsupportedClaims.present === null
  )
    return 'unscored';
  if (
    rubric.unsupportedClaims.present === null ||
    criteria.some((key) => rubric.scores[key] === null || !rubric.evidence[key]?.trim())
  )
    return 'incomplete';
  return 'reviewed';
}
