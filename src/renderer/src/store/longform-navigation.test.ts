import { beforeEach, describe, expect, it } from 'vitest';
import { makeScenePlan, SCENE_WORDS } from '@/components/__tests__/longform-scene-fixture';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { useStore } from '@/store';
import type { AppState } from './types';

const SOURCE_ID = 'source-review';
const SCENE_ID = 'scene-statement-4-6';

beforeEach(() => {
  installApiStub();
  resetStore();
  useStore.setState((state) => {
    state.sources = [
      {
        id: SOURCE_ID,
        name: 'Source',
        path: '/source.mp4',
        duration: 150,
        width: 1920,
        height: 1080,
        origin: 'file',
      },
    ];
    state.transcriptions[SOURCE_ID] = {
      text: 'Source',
      formattedForAI: '',
      segments: [],
      words: SCENE_WORDS,
    };
  });
  useStore.getState().setLongformPlan(SOURCE_ID, {
    plan: makeScenePlan(),
    skin: 'editorial',
    paletteId: 'brand',
  });
});

describe('long-form review navigation', () => {
  it('opens the specific scene without changing approval, versions, feedback or completed output', () => {
    const store = useStore.getState();
    store.acceptLongformPlan(SOURCE_ID, 'editorial', 'brand');
    store.addLongformPlanFeedback(SOURCE_ID, {
      targetKey: SCENE_ID,
      targetLabel: 'Evidence',
      message: 'Keep this explanation grounded.',
    });
    const count = { planned: 0, eligible: 0, rendered: 0, dropped: 0 };
    store.setLongformReconciliation(SOURCE_ID, {
      renderedAt: 123,
      outputPath: '/output.mp4',
      phrases: { ...count },
      blocks: { ...count },
      cards: { ...count },
      fallbacks: [],
    });
    useStore.setState({
      pipeline: { stage: 'done', message: 'Complete', percent: 100 },
      renderProgress: [
        { clipId: SOURCE_ID, status: 'done', percent: 100, outputPath: '/output.mp4' },
      ],
      renderCompletedAt: 123,
    });
    const before = useStore.getState();

    expect(before.focusLongformScene(SOURCE_ID, SCENE_ID)).toBe(true);

    const after = useStore.getState();
    expect(after.longformReviewFocus).toEqual({ sourceId: SOURCE_ID, sceneId: SCENE_ID });
    expect(after.activeSourceId).toBe(SOURCE_ID);
    expect(after.workspace).toMatchObject({ activeSourceId: SOURCE_ID, stage: 'ready' });
    expect(after.pipeline.stage).toBe('ready');
    expect(after.longformPlans).toBe(before.longformPlans);
    expect(after.longformPlans[SOURCE_ID]?.approvedVersionId).toBeTruthy();
    expect(after.renderProgress).toBe(before.renderProgress);
    expect(after.renderCompletedAt).toBe(123);
  });

  it.each([
    ['batch export', { isRendering: true }],
    ['single export', { singleRenderStatus: 'rendering' }],
    ['processing', { pipeline: { stage: 'scoring', message: 'Scoring', percent: 50 } }],
    ['export stage', { pipeline: { stage: 'rendering', message: 'Exporting', percent: 50 } }],
    ['processing cancellation', { processingCancellation: { status: 'cancelling', error: null } }],
    ['export cancellation', { renderCancellation: { status: 'cancelling', error: null } }],
  ] satisfies Array<
    [string, Partial<AppState>]
  >)('refuses navigation during %s without changing state', (_label, patch) => {
    useStore.setState(patch);
    const before = useStore.getState();
    expect(before.focusLongformScene(SOURCE_ID, SCENE_ID)).toBe(false);
    expect(useStore.getState()).toBe(before);
  });

  it('rejects stale or foreign scene targets and selects without navigating', () => {
    const store = useStore.getState();
    expect(store.focusLongformScene('other-source', SCENE_ID)).toBe(false);
    expect(store.focusLongformScene(SOURCE_ID, 'removed-scene')).toBe(false);
    store.setLongformReviewFocus({ sourceId: SOURCE_ID, sceneId: SCENE_ID });
    expect(useStore.getState().pipeline.stage).toBe('idle');
    store.setLongformReviewFocus({ sourceId: 'other-source', sceneId: SCENE_ID });
    expect(useStore.getState().longformReviewFocus).toEqual({
      sourceId: SOURCE_ID,
      sceneId: SCENE_ID,
    });
    store.setLongformReviewFocus(null);
    expect(useStore.getState().longformReviewFocus).toBeNull();
  });

  it.each([
    'reset',
    'remove-source',
    'clear-plan',
  ] as const)('clears transient focus on %s', (action) => {
    const store = useStore.getState();
    store.setLongformReviewFocus({ sourceId: SOURCE_ID, sceneId: SCENE_ID });
    if (action === 'reset') store.reset();
    else if (action === 'remove-source') store.removeSource(SOURCE_ID);
    else store.clearLongformPlan(SOURCE_ID);
    expect(useStore.getState().longformReviewFocus).toBeNull();
  });
});
