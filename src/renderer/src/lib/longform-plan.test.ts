import { MAX_LONGFORM_BLOCK_SECONDS } from '@shared/longform-plan-timing';
import { isSceneFirstPlanEnvelope } from '@shared/longform-scenes';
import type { LongformEditPlan, WordTimestamp } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  makeScenePlan,
  makeStoryboardPlan,
  SCENE_WORDS,
} from '@/components/__tests__/longform-scene-fixture';
import {
  buildLongformPhraseItems,
  buildLongformPlanItems,
  buildLongformSections,
  compareLongformPlans,
  longformItemEditProblem,
  longformPhraseIssues,
  longformSceneReviewProblem,
  longformSceneScheduleIssues,
  mergePreservedLongformItems,
  removeLongformPlanItem,
  snapshotLongformPlanItem,
  storyboardPanelSummary,
  updateLongformPlanItem,
} from './longform-plan';

describe('storyboard review edits', () => {
  it('rejects trimmed windows and speaker layouts without modifying the plan', () => {
    const plan = makeStoryboardPlan();
    const board = buildLongformPlanItems(plan, SCENE_WORDS)[0];
    expect(board).toBeDefined();
    if (!board?.scene) throw new Error('Missing board fixture');
    const trimmed = { startTime: board.startTime + 1, endTime: board.endTime - 1 };
    expect(longformItemEditProblem(board, trimmed)).toContain('complete authored window');
    expect(updateLongformPlanItem(plan, board, trimmed)).toBe(plan);
    expect(longformItemEditProblem(board, { presentation: 'speaker-side' })).toContain(
      'full-screen',
    );
    expect(updateLongformPlanItem(plan, board, { presentation: 'speaker-side' })).toBe(plan);
    expect(storyboardPanelSummary(board.scene, SCENE_WORDS)[0]).toMatchObject({
      title: 'Build trust',
      kind: 'Statement',
      beats: ['Reveal 0:04', 'Camera move 0:05'],
    });
    const omitted = updateLongformPlanItem(plan, board, { omitted: true });
    expect(isSceneFirstPlanEnvelope(omitted) && omitted.scenes[0]?.omitted).toBe(true);
    const ordinary = buildLongformPlanItems(plan, SCENE_WORDS)[1];
    if (!ordinary) throw new Error('Missing ordinary fixture');
    const changed = updateLongformPlanItem(plan, ordinary, { presentation: 'speaker-side' });
    expect(isSceneFirstPlanEnvelope(changed) && changed.scenes[1]?.presentation).toBe(
      'speaker-side',
    );
  });
});

const words: WordTimestamp[] = [
  { text: 'Build', start: 4, end: 4.4 },
  { text: 'trust', start: 4.5, end: 5 },
  { text: 'with', start: 5.1, end: 5.4 },
  { text: 'evidence', start: 5.5, end: 6.2 },
  { text: 'Then', start: 100, end: 100.4 },
  { text: 'show', start: 100.5, end: 100.9 },
  { text: 'the', start: 101, end: 101.2 },
  { text: 'result', start: 101.3, end: 102 },
];

function makePlan(): LongformEditPlan {
  return {
    phrases: [{ text: 'BUILD TRUST', startTime: 4, endTime: 5 }],
    blocks: [
      {
        kind: 'callout',
        startTime: 100,
        endTime: 105,
        kicker: 'THE RESULT',
        heading: 'Evidence wins',
        body: 'Show the result',
      },
    ],
    cards: [
      {
        kind: 'delos-scan-result',
        startTime: 12,
        endTime: 16,
        sourceText: 'Evidence from the source',
      },
    ],
    reasoning: 'Fixture plan',
    generatedAt: 1,
  };
}

describe('scene-first review helpers', () => {
  it('uses scene IDs, authored sections, source words and scene item types', () => {
    const plan = makeScenePlan();
    expect(isSceneFirstPlanEnvelope(plan)).toBe(true);
    const items = buildLongformPlanItems(plan, SCENE_WORDS);
    expect(items.map((item) => item.type)).toEqual(['scene', 'scene']);
    expect(items[0]).toMatchObject({
      id: plan.scenes[0]?.id,
      key: plan.scenes[0]?.id,
      sourceText: 'Build trust with evidence',
    });
    expect(buildLongformSections(plan, SCENE_WORDS, 150).map((section) => section.id)).toEqual([
      'section-opening',
      'section-evidence',
    ]);
  });

  it('allows presentation/omit only, never retiming or converting source specs even when indices are wrong', () => {
    const plan = makeScenePlan();
    const original = structuredClone(plan);
    const id = plan.scenes[1]?.id;
    const edited = updateLongformPlanItem(
      plan,
      { type: 'scene', id, index: 0 },
      {
        presentation: 'full-frame',
        title: 'Fabricated',
        detail: 'Never applied',
        startTime: 0,
        endTime: 1,
      },
    );
    expect(isSceneFirstPlanEnvelope(edited)).toBe(true);
    if (!isSceneFirstPlanEnvelope(edited)) throw new Error('invalid fixture');
    expect(edited.scenes[0]).toEqual(plan.scenes[0]);
    expect(edited.scenes[1]).toEqual({ ...plan.scenes[1], presentation: 'full-frame' });
    expect(plan).toEqual(original);
    expect(updateLongformPlanItem(plan, { type: 'scene', index: 1 }, { omitted: true })).toBe(plan);
    const omitted = removeLongformPlanItem(edited, { type: 'scene', id });
    expect(isSceneFirstPlanEnvelope(omitted) && omitted.scenes[1]?.omitted).toBe(true);
    expect(
      updateLongformPlanItem(omitted, { type: 'scene', id }, { omitted: false }),
    ).toMatchObject({ scenes: [{}, { omitted: false, sourceSpec: plan.scenes[1]?.sourceSpec }] });
  });

  it('preserves exact omitted specs and compares presentation changes by ID across reordering', () => {
    const plan = makeScenePlan();
    const id = plan.scenes[0]?.id;
    const edited = updateLongformPlanItem(
      plan,
      { type: 'scene', id },
      { omitted: true, presentation: 'full-frame' },
    );
    const saved = snapshotLongformPlanItem(edited, { type: 'scene', id });
    if (!saved) throw new Error('missing preserved scene');
    const generated = makeScenePlan();
    generated.scenes.reverse();
    const merged = mergePreservedLongformItems(generated, [saved]);
    expect(
      isSceneFirstPlanEnvelope(merged) && merged.scenes.find((scene) => scene.id === id),
    ).toEqual(saved.item);
    expect(compareLongformPlans(plan, merged)).toMatchObject({
      added: 0,
      removed: 0,
      timingChanges: 0,
      contentChanges: 1,
    });
    expect(generated.scenes[1]?.omitted).toBeUndefined();
  });

  it('flags stale/unsupported plans and whole-window conflicts without repairing source timing', () => {
    const plan = makeScenePlan();
    expect(longformSceneReviewProblem(plan, SCENE_WORDS, 151)).toMatch(/stale/);
    const unsupported = { ...plan, parserVersion: 99 } as unknown as LongformEditPlan;
    expect(buildLongformPlanItems(unsupported, SCENE_WORDS)).toEqual([]);
    expect(longformSceneReviewProblem(unsupported, SCENE_WORDS, 150)).toMatch(/Unsupported/);
    const second = plan.scenes[1];
    if (!second) throw new Error('missing scene');
    second.startTime = 4;
    const before = structuredClone(plan);
    expect(longformSceneScheduleIssues(plan).get(second.id)).toMatch(/overlaps/);
    expect(plan).toEqual(before);
  });
});

describe('scene-first phrase overlays in review', () => {
  function withPhrases(): ReturnType<typeof makeScenePlan> {
    const plan = makeScenePlan();
    plan.phrases = [
      { text: 'ON CAMERA', startTime: 20, endTime: 21.5 },
      { text: 'INSIDE SCENE', startTime: 4, endTime: 5 },
    ];
    return plan;
  }

  it('loads saved scene plans with and without phrase overlays', () => {
    const legacySaved = makeScenePlan();
    expect(legacySaved.phrases).toEqual([]);
    expect(isSceneFirstPlanEnvelope(legacySaved)).toBe(true);
    expect(buildLongformPhraseItems(legacySaved, SCENE_WORDS)).toEqual([]);
    expect(isSceneFirstPlanEnvelope(withPhrases())).toBe(true);
    const bad = { ...withPhrases(), phrases: [{ text: '', startTime: 1, endTime: 2 }] };
    expect(isSceneFirstPlanEnvelope(bad)).toBe(false);
  });

  it('lists phrases apart from scenes and flags the ones export will hide', () => {
    const plan = withPhrases();
    expect(buildLongformPlanItems(plan, SCENE_WORDS).map((item) => item.type)).toEqual([
      'scene',
      'scene',
    ]);
    const phrases = buildLongformPhraseItems(plan, SCENE_WORDS);
    expect(phrases.map((item) => item.title)).toEqual(['INSIDE SCENE', 'ON CAMERA']);
    const issues = longformPhraseIssues(plan);
    expect(issues.size).toBe(1);
    expect(issues.get(phrases[0]?.key ?? '')).toMatch(/full-screen speaker/);
  });

  it('edits and removes phrases, refusing moves into a scene', () => {
    const plan = withPhrases();
    const item = buildLongformPhraseItems(plan, SCENE_WORDS).find((p) => p.title === 'ON CAMERA');
    if (!item) throw new Error('missing phrase');
    const intoScene = { title: 'ON CAMERA', startTime: 4, endTime: 5 };
    expect(longformItemEditProblem(item, intoScene, plan)).toMatch(/full-screen speaker/);
    expect(updateLongformPlanItem(plan, item, intoScene)).toBe(plan);

    const update = { title: 'PROVE IT', startTime: 30, endTime: 31 };
    expect(longformItemEditProblem(item, update, plan)).toBeNull();
    const edited = updateLongformPlanItem(plan, item, update);
    expect(edited.phrases[0]).toEqual({ text: 'PROVE IT', startTime: 30, endTime: 31 });
    expect(plan.phrases[0]?.text).toBe('ON CAMERA');

    const removed = removeLongformPlanItem(edited, item);
    expect(removed.phrases.map((phrase) => phrase.text)).toEqual(['INSIDE SCENE']);
  });

  it('keeps preserved phrases across scene-first regeneration', () => {
    const plan = withPhrases();
    const item = buildLongformPhraseItems(plan, SCENE_WORDS).find((p) => p.title === 'ON CAMERA');
    if (!item) throw new Error('missing phrase');
    const saved = snapshotLongformPlanItem(plan, item);
    if (!saved) throw new Error('missing snapshot');
    const generated = makeScenePlan();
    generated.phrases = [{ text: 'REPLACEMENT', startTime: 20.5, endTime: 21 }];
    const merged = mergePreservedLongformItems(generated, [saved]);
    expect(merged.phrases).toEqual([{ text: 'ON CAMERA', startTime: 20, endTime: 21.5 }]);
  });
});

describe('long-form Cut Plan helpers', () => {
  it('builds chronological evidence beats with transcript sources and editorial sections', () => {
    const plan = makePlan();
    const items = buildLongformPlanItems(plan, words);
    const sections = buildLongformSections(plan, words, 120);

    expect(items.map((item) => item.type)).toEqual(['phrase', 'card', 'block']);
    expect(items[0]?.sourceText).toContain('Build trust');
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toBe('Opening');
    expect(sections[1]?.title).toBe('Evidence wins');
  });

  it('creates edited and removed plan snapshots without mutating the source version', () => {
    const plan = makePlan();
    const edited = updateLongformPlanItem(
      plan,
      { type: 'phrase', index: 0 },
      { title: 'PROVE IT', startTime: 6, endTime: 7 },
    );
    const removed = removeLongformPlanItem(edited, { type: 'card', index: 0 });

    expect(plan.phrases[0]?.text).toBe('BUILD TRUST');
    expect(edited.phrases[0]).toMatchObject({ text: 'PROVE IT', startTime: 6, endTime: 7 });
    expect(removed.cards).toEqual([]);
  });

  it('keeps safe phrase/card stacking while clamping manual block timing', () => {
    const plan = makePlan();
    const editedPhrase = updateLongformPlanItem(
      plan,
      { type: 'phrase', index: 0 },
      { title: 'PROVE IT', startTime: 12, endTime: 14 },
    );
    const editedBlock = updateLongformPlanItem(
      plan,
      { type: 'block', index: 0 },
      { title: 'Evidence wins', startTime: 100, endTime: 300 },
    );

    expect(editedPhrase.cards).toEqual(plan.cards);
    expect(editedPhrase.phrases[0]).toMatchObject({ startTime: 12, endTime: 14 });
    expect(editedBlock.blocks[0]?.endTime).toBe(100 + MAX_LONGFORM_BLOCK_SECONDS);
  });

  it('preserves creator-locked beats across regeneration and reports version differences', () => {
    const plan = makePlan();
    const regenerated: LongformEditPlan = {
      ...makePlan(),
      phrases: [{ text: 'NEW WORDING', startTime: 5, endTime: 6 }],
      cards: [],
      generatedAt: 2,
    };
    const merged = mergePreservedLongformItems(regenerated, [
      {
        key: 'phrase-lock',
        type: 'phrase',
        item: plan.phrases[0] as NonNullable<(typeof plan.phrases)[0]>,
      },
    ]);
    const diff = compareLongformPlans(plan, merged);

    expect(merged.phrases).toEqual(plan.phrases);
    expect(diff.removed).toBe(1);
    expect(diff.unchanged).toBeGreaterThanOrEqual(2);
  });
});
