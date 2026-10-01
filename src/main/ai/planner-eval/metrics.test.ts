import { describe, expect, it } from 'vitest';
import type { ExplainerScene } from '../../remotion/compositions/explainer/types';
import { animationSignature } from '../explainer/recent-usage';
import type { PlannedExplainerScene, PlannerEditPlan } from '../explainer-scenes';
import type { CorpusClip } from './corpus';
import {
  type CollectionEntry,
  createRubricTemplate,
  measureCollection,
  measurePlan,
  RUBRIC_ANCHORS,
  type RubricCriterion,
  rubricDisposition,
} from './metrics';

// Synthetic typed fixtures only: no providers, media, files, or private corpus reads.
function clip(overrides: Partial<CorpusClip> = {}): CorpusClip {
  return {
    id: 'synthetic-clip',
    provenance: 'synthetic',
    sourceGroup: 'synthetic-source',
    topicGroup: 'synthetic-topic',
    split: 'discovery',
    bounds: { start: 0, end: 20 },
    words: [{ text: 'battery.', start: 2, end: 2.5 }],
    expectations: {
      animation: 'optional',
      quote: 'allowed',
      takeaway: 'allowed',
      requiredKinds: [],
      forbiddenKinds: [],
      notes: 'Synthetic measurement fixture, not quality evidence.',
    },
    ...overrides,
  };
}
function relay(preset: 'unlock' | 'nurture', start = 2): ExplainerScene {
  return {
    kind: 'relay',
    preset,
    label: 'Synthetic transfer',
    sourceAt: start + 0.3,
    transferAt: start + 0.6,
    receiveAt: start + 1,
    outcomeAt: start + 1.5,
  };
}
function scene(
  startTime: number,
  endTime: number,
  body: ExplainerScene = { kind: 'hero', prop: 'battery', label: 'Battery', at: startTime + 0.3 },
  options: Partial<Pick<PlannedExplainerScene, 'layout' | 'chained'>> = {},
): PlannedExplainerScene {
  return {
    startTime,
    endTime,
    scene: body,
    layout: 'stack',
    chained: false,
    transition: 'fade',
    cues: [],
    ...options,
  };
}
function quote(
  startTime: number,
  endTime: number,
  reason: PlannerEditPlan['quotes'][number]['reason'] = 'central-claim',
): PlannerEditPlan['quotes'][number] {
  return { startTime, endTime, startWord: 0, endWord: 2, text: 'Synthetic source claim', reason };
}
function plan(
  scenes: PlannedExplainerScene[] = [],
  quotes: PlannerEditPlan['quotes'] = [],
): PlannerEditPlan {
  return { scenes, quotes, diagnostics: { events: [], dropped: 0 } };
}
const motif = (body: ExplainerScene): string => JSON.stringify(animationSignature(body));
function entry(clipId: string, value: PlannerEditPlan): CollectionEntry {
  return { clipId, plan: value, clip: clip({ id: clipId }) };
}

describe('measurePlan', () => {
  it('unions overlapping/nested time windows, clips bounds, and keeps exposure denominators separate', () => {
    const source = clip({
      bounds: { start: 10, end: 30 },
      words: [{ text: 'battery.', start: 12, end: 12.5 }],
    });
    // Deliberately unordered overlaps exercise measurement math, not the planner validator.
    const value = plan(
      [
        scene(20, 24, relay('unlock', 20), { layout: 'takeover' }),
        scene(8, 18),
        scene(17, 19, undefined, { layout: 'over' }),
        scene(16, 23, relay('unlock', 16), { layout: 'takeover' }),
      ],
      [quote(25, 28), quote(22, 26)],
    );
    const before = structuredClone({ source, value });
    const result = measurePlan(value, source);
    expect(result.clipDurationSec).toBe(20);
    expect(result.time).toEqual({
      animation: { numerator: 14, denominator: 20, share: 0.7 },
      animationTakeover: { numerator: 8, denominator: 20, share: 0.4 },
      quote: { numerator: 6, denominator: 20, share: 0.3 },
      speakerHidden: { numerator: 12, denominator: 20, share: 0.6 },
      speakerVisibleAnimation: { numerator: 6, denominator: 20, share: 0.3 },
    });
    expect(result.frequencies.kind).toMatchObject({
      countDenominator: 4,
      durationDenominatorSec: 21,
    });
    expect(result.frequencies.kind.entries).toEqual([
      { key: 'hero', count: 2, durationSec: 10, countShare: 0.5, durationShare: 10 / 21 },
      { key: 'relay', count: 2, durationSec: 11, countShare: 0.5, durationShare: 11 / 21 },
    ]);
    expect(result.frequencies.prop).toMatchObject({
      countDenominator: 2,
      durationDenominatorSec: 10,
    });
    expect(result.sceneCount).toBe(4);
    expect(result.quoteCount).toBe(2);
    expect({ source, value }).toEqual(before);
    expect(measurePlan(value, source)).toEqual(result);
  });

  it('empty output fails required animation/kinds/quotes/run expectations without invented scores', () => {
    const source = clip();
    source.expectations = {
      ...source.expectations,
      animation: 'required',
      quote: 'required',
      takeaway: 'required',
      requiredKinds: ['relay'],
      minConsecutiveScenes: 3,
    };
    const result = measurePlan(plan(), source);
    expect(result.expectations.status).toBe('fail');
    expect(
      result.expectations.checks
        .filter((check) => check.status === 'fail')
        .map((check) => check.expectation),
    ).toEqual(['animation', 'quote', 'requiredKind', 'minConsecutiveScenes']);
    expect(result.expectations.failReasons).toEqual([
      'animation: expected required; observed 0 positive-duration scene windows.',
      'quote: expected required; observed 0 positive-duration full-screen quote windows.',
      'requiredKind: relay absent.',
      'minConsecutiveScenes: expected >=3; observed 0 touching/overlapping scene windows without quotes (any layout).',
    ]);
    expect(result.motifs.dominantCount).toEqual({
      numerator: 0,
      denominator: 0,
      share: null,
      keys: [],
    });
    expect(result.motifs.dominantDuration.share).toBeNull();
    expect(result.motifs.adjacentRepeats.motif.share).toBeNull();
    expect(result.longestStableSplitScreenRun).toEqual({
      sceneCount: 0,
      startTime: null,
      endTime: null,
      durationSec: 0,
      layout: null,
    });
    expect(result.time.animation).toEqual({ numerator: 0, denominator: 20, share: 0 });
    expect(result.proxies.usefulAnimation.scenes.share).toBeNull();
    expect(result.proxies.eligibleIdeas.covered).toEqual({
      numerator: 0,
      denominator: 1,
      share: 0,
    });
    expect(Object.values(result.rubric.scores)).toEqual([null, null, null, null, null]);
    const quoteOnly = measurePlan(plan([], [quote(2, 4)]), source);
    expect(
      quoteOnly.expectations.checks.find((check) => check.expectation === 'animation')?.status,
    ).toBe('fail');
  });

  it('permits intentionally empty output but reports forbidden scene and quote reasons', () => {
    const source = clip();
    source.expectations = {
      ...source.expectations,
      animation: 'none',
      quote: 'forbidden',
      forbiddenKinds: ['hero'],
    };
    expect(measurePlan(plan(), source).expectations.status).toBe('pass');
    const result = measurePlan(plan([scene(2, 5)], [quote(6, 8)]), source);
    expect(
      result.expectations.checks
        .filter((check) => check.status === 'fail')
        .map((check) => check.expectation),
    ).toEqual(['animation', 'quote', 'forbiddenKind']);
  });

  it('does not conflate same-kind distinct presets, count dominance, and duration dominance', () => {
    const first = relay('unlock');
    const second = relay('nurture', 6);
    const result = measurePlan(plan([scene(2, 6, first), scene(6, 14, second)]), clip());
    expect(result.frequencies.kind.entries).toEqual([
      { key: 'relay', count: 2, durationSec: 12, countShare: 1, durationShare: 1 },
    ]);
    expect(result.frequencies.family.entries).toHaveLength(1);
    expect(result.frequencies.preset).toMatchObject({
      countDenominator: 2,
      durationDenominatorSec: 12,
    });
    expect(result.frequencies.preset.entries.map((row) => row.key).sort()).toEqual(
      [
        `relay:${animationSignature(first).presetId}`,
        `relay:${animationSignature(second).presetId}`,
      ].sort(),
    );
    expect(result.frequencies.motif.entries).toHaveLength(2);
    expect(result.motifs.dominantCount).toEqual({
      numerator: 1,
      denominator: 2,
      share: 0.5,
      keys: [motif(first), motif(second)].sort(),
    });
    expect(result.motifs.dominantDuration).toEqual({
      numerator: 8,
      denominator: 12,
      share: 2 / 3,
      keys: [motif(second)],
    });
    expect(result.motifs.adjacentRepeats).toEqual({
      kind: { numerator: 1, denominator: 1, share: 1 },
      family: { numerator: 1, denominator: 1, share: 1 },
      motif: { numerator: 0, denominator: 1, share: 0 },
    });
    expect(result.frequencies.prop).toEqual({
      countDenominator: 0,
      durationDenominatorSec: 0,
      entries: [],
    });
  });

  it('counts hero prop/tone separately and normalizes omitted tone to up without using labels', () => {
    const up: ExplainerScene = { kind: 'hero', prop: 'battery', label: 'First label', at: 2.3 };
    const alsoUp: ExplainerScene = { ...up, label: 'Changed label', at: 4.3, tone: 'up' };
    const down: ExplainerScene = { ...up, at: 6.3, tone: 'down' };
    const result = measurePlan(
      plan([scene(2, 4, up), scene(4, 6, alsoUp), scene(6, 10, down)]),
      clip(),
    );
    expect(result.frequencies.prop.entries).toEqual([
      { key: 'battery', count: 3, durationSec: 8, countShare: 1, durationShare: 1 },
    ]);
    expect(result.frequencies.tone.entries).toEqual([
      { key: 'down', count: 1, durationSec: 4, countShare: 1 / 3, durationShare: 0.5 },
      { key: 'up', count: 2, durationSec: 4, countShare: 2 / 3, durationShare: 0.5 },
    ]);
    expect(result.motifs.adjacentRepeats.motif).toEqual({
      numerator: 1,
      denominator: 2,
      share: 0.5,
    });
  });

  it('measures three chained stack scenes as one stable speaker-visible run without rewarding layout churn', () => {
    const source = clip();
    source.expectations = {
      ...source.expectations,
      animation: 'required',
      minConsecutiveScenes: 3,
    };
    const scenes = [
      scene(2, 6),
      scene(6, 10, relay('unlock', 6), { chained: true }),
      scene(10, 14, relay('nurture', 10), { chained: true }),
    ];
    const result = measurePlan(plan(scenes), source);
    expect(result.longestStableSplitScreenRun).toEqual({
      sceneCount: 3,
      startTime: 2,
      endTime: 14,
      durationSec: 12,
      layout: 'stack',
    });
    expect(result.longestConsecutiveSceneRun.sceneCount).toBe(3);
    expect(result.layoutChanges).toEqual({ numerator: 0, denominator: 2, share: 0 });
    expect(result.time.speakerVisibleAnimation.numerator).toBe(12);
    expect(result.time.speakerHidden.numerator).toBe(0);
    expect(result.expectations.status).toBe('pass');
    const changed = scenes.map((item, index) =>
      index === 1 ? { ...item, layout: 'stack-flipped' as const } : item,
    );
    const alternating = measurePlan(plan(changed), source);
    expect(alternating.layoutChanges.numerator).toBe(2);
    expect(alternating.longestStableSplitScreenRun.sceneCount).toBe(1);
    expect(alternating.longestConsecutiveSceneRun.sceneCount).toBe(3);
    expect(
      measurePlan(plan(scenes, [quote(7, 9)]), source).longestStableSplitScreenRun.sceneCount,
    ).toBe(1);
  });

  it('selects the longest stable duration, while the consecutive proxy selects the largest count', () => {
    const scenes = [
      scene(2, 4),
      scene(4, 6, undefined, { chained: true }),
      scene(6, 8, undefined, { chained: true }),
      scene(10, 14),
      scene(14, 18, undefined, { chained: true }),
    ];
    const result = measurePlan(plan(scenes), clip());
    expect(result.longestStableSplitScreenRun).toEqual({
      sceneCount: 2,
      startTime: 10,
      endTime: 18,
      durationSec: 8,
      layout: 'stack',
    });
    expect(result.longestConsecutiveSceneRun).toEqual({
      sceneCount: 3,
      startTime: 2,
      endTime: 8,
      durationSec: 6,
    });
    // Equal duration prefers more scenes, regardless of chronological encounter order.
    const tied = measurePlan(
      plan([scene(2, 10), scene(12, 16), scene(16, 20, undefined, { chained: true })]),
      clip(),
    );
    expect(tied.longestStableSplitScreenRun).toMatchObject({
      sceneCount: 2,
      startTime: 12,
      durationSec: 8,
    });
  });

  it('labels lexical coverage as proxies, with plan-independent eligible windows and no semantic takeaway pass', () => {
    const source = clip({
      words: [
        { text: 'battery.', start: 2, end: 2.5 },
        { text: 'battery.', start: 7, end: 7.5 },
      ],
    });
    source.expectations.takeaway = 'required';
    const result = measurePlan(plan([scene(2, 5)]), source);
    expect(result.proxies.label).toBe('NOT semantic scoring');
    expect(result.proxies.usefulAnimation.scenes).toEqual({
      numerator: 1,
      denominator: 1,
      share: 1,
    });
    expect(result.proxies.eligibleIdeas).toMatchObject({
      windowCount: 2,
      eligibleWindows: 2,
      covered: { numerator: 1, denominator: 2, share: 0.5 },
    });
    expect(result.expectations.status).toBe('needs-human-review');
    const empty = measurePlan(plan(), source);
    expect(empty.proxies.eligibleIdeas.eligibleWindows).toBe(2);
    expect(empty.proxies.eligibleIdeas.covered.share).toBe(0);
    expect(empty.expectations.failReasons).toEqual([]); // No quote is not evidence of a missing takeaway.
    source.expectations.takeaway = 'forbidden';
    expect(
      measurePlan(plan([], [quote(3, 5, 'takeaway')]), source).expectations.checks,
    ).toContainEqual(expect.objectContaining({ expectation: 'takeaway', status: 'fail' }));
  });
});

describe('measureCollection', () => {
  it('sums per-entry time, deduplicates clip identities/pairs, and never creates cross-plan adjacency', () => {
    const a = entry('a', plan([scene(2, 4, relay('unlock')), scene(4, 6)]));
    const b = entry('b', plan([scene(3, 6, relay('unlock', 3)), scene(6, 9)]));
    const c = entry('c', plan([scene(2, 7, relay('nurture'))]));
    const entries = [a, a, b, c, entry('empty', plan())];
    const before = structuredClone(entries);
    const result = measureCollection(entries);
    expect(result.entryCount).toBe(5);
    expect(result.distinctClipCount).toBe(4);
    expect(result.time.animation).toEqual({ numerator: 19, denominator: 100, share: 0.19 });
    expect(result.frequencies.kind).toMatchObject({
      countDenominator: 7,
      durationDenominatorSec: 19,
    });
    expect(result.crossClipRepeats.clipPairs).toEqual({
      numerator: 1,
      denominator: 6,
      share: 1 / 6,
    });
    expect(result.crossClipRepeats.repeatedMotifs).toEqual({
      numerator: 2,
      denominator: 3,
      share: 2 / 3,
    });
    expect(result.crossClipRepeats.motifs).toHaveLength(2);
    for (const repeated of result.crossClipRepeats.motifs) {
      expect(repeated.clipIds).toEqual(['a', 'b']);
      expect(repeated.clipShare).toEqual({ numerator: 2, denominator: 4, share: 0.5 });
    }
    expect(result.motifs.adjacentRepeats.motif).toEqual({ numerator: 0, denominator: 3, share: 0 });
    expect(result.layoutChanges).toEqual({ numerator: 0, denominator: 3, share: 0 });
    expect(entries).toEqual(before);
    expect(measureCollection([...entries].reverse()).crossClipRepeats).toEqual(
      result.crossClipRepeats,
    );
    const rerunsOnly = measureCollection([a, a]);
    expect(rerunsOnly.crossClipRepeats.clipPairs.share).toBeNull();
    expect(rerunsOnly.crossClipRepeats.repeatedMotifs.numerator).toBe(0);
  });

  it('returns explicit zero denominators and null shares for an empty collection', () => {
    const result = measureCollection([]);
    expect(result.entryCount).toBe(0);
    expect(result.plans).toEqual([]);
    expect(result.time.animation).toEqual({ numerator: 0, denominator: 0, share: null });
    expect(result.motifs.dominantCount.share).toBeNull();
    expect(result.motifs.adjacentRepeats.motif.share).toBeNull();
    expect(result.crossClipRepeats).toEqual({
      clipPairs: { numerator: 0, denominator: 0, share: null },
      repeatedMotifs: { numerator: 0, denominator: 0, share: null },
      motifs: [],
    });
  });
});

describe('human rubric', () => {
  it('starts unscored and supplies every 1–5 anchor, without sharing mutable template state', () => {
    const rubric = createRubricTemplate();
    expect(Object.values(rubric.scores)).toEqual([null, null, null, null, null]);
    expect(Object.values(rubric.evidence)).toEqual([null, null, null, null, null]);
    expect(rubric.unsupportedClaims.present).toBeNull();
    expect(rubricDisposition(rubric)).toBe('unscored');
    expect(Object.keys(RUBRIC_ANCHORS).sort()).toEqual([
      'clarity',
      'pacing',
      'readability',
      'relevance',
      'restraint',
    ]);
    for (const anchors of Object.values(RUBRIC_ANCHORS))
      expect(Object.keys(anchors)).toEqual(['1', '2', '3', '4', '5']);
    rubric.scores.clarity = 5;
    rubric.unsupportedClaims.evidence.push('Synthetic unsupported assertion.');
    expect(createRubricTemplate().scores.clarity).toBeNull();
    expect(createRubricTemplate().unsupportedClaims.evidence).toEqual([]);
  });

  it('requires human evidence/claim review and disqualifies unsupported claims even with all fives', () => {
    const rubric = createRubricTemplate();
    for (const criterion of Object.keys(RUBRIC_ANCHORS) as RubricCriterion[]) {
      rubric.scores[criterion] = 5;
      rubric.evidence[criterion] = 'Synthetic human review evidence.';
    }
    expect(rubricDisposition(rubric)).toBe('incomplete');
    rubric.unsupportedClaims.present = false;
    expect(rubricDisposition(rubric)).toBe('reviewed');
    rubric.evidence.pacing = ' ';
    expect(rubricDisposition(rubric)).toBe('incomplete');
    rubric.evidence.pacing = 'Synthetic timing observation.';
    rubric.unsupportedClaims.present = true;
    expect(rubricDisposition(rubric)).toBe('disqualified');
    rubric.unsupportedClaims.present = false;
    rubric.unsupportedClaims.evidence.push('Unsupported result, despite the contradictory flag.');
    expect(rubricDisposition(rubric)).toBe('disqualified');
  });
});
