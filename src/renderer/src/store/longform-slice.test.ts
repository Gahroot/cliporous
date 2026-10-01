import { getPaletteById } from '@shared/palettes';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeScenePlan, SCENE_WORDS } from '@/components/__tests__/longform-scene-fixture';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { snapshotLongformPlanItem, updateLongformPlanItem } from '@/lib/longform-plan';
import { useStore } from '@/store';

const SOURCE_ID = 'source-review';
function record() {
  return useStore.getState().longformPlans[SOURCE_ID];
}

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
    state.activeSourceId = SOURCE_ID;
    state.transcriptions[SOURCE_ID] = {
      text: 'Source',
      formattedForAI: '',
      segments: [],
      words: SCENE_WORDS,
    };
  });
  useStore
    .getState()
    .setLongformPlan(SOURCE_ID, { plan: makeScenePlan(), skin: 'editorial', paletteId: 'brand' });
});

describe('longform review store', () => {
  it('snapshots custom colors across generation, approval and restore instead of drifting with project settings', () => {
    const store = useStore.getState();
    const custom = {
      ...getPaletteById('brand'),
      id: 'custom-test',
      builtin: false,
      name: 'Creator',
      accent: '#123456',
    };
    useStore.setState((state) => {
      state.settings.customPalettes = [custom];
    });
    store.setLongformPlan(SOURCE_ID, {
      plan: makeScenePlan(),
      skin: 'editorial',
      paletteId: custom.id,
    });
    const first = record()?.activeVersionId ?? '';
    expect(record()?.palette).toEqual(custom);
    expect(record()?.versions?.[0]?.palette).toEqual(custom);
    useStore.setState((state) => {
      const palette = state.settings.customPalettes[0];
      if (palette) palette.accent = '#654321';
    });
    store.addLongformPlanVersion(SOURCE_ID, makeScenePlan(), 'regenerated');
    store.acceptLongformPlan(SOURCE_ID, 'editorial', custom.id);
    expect(record()?.palette?.accent).toBe('#123456');
    expect(record()?.versions?.at(-1)?.palette?.accent).toBe('#123456');
    store.setLongformPlanStyle(SOURCE_ID, 'editorial', custom.id);
    expect(record()?.palette?.accent).toBe('#654321');
    expect(record()?.approvedVersionId).toBeNull();
    store.restoreLongformPlanVersion(SOURCE_ID, first);
    expect(record()?.palette).toEqual(custom);
    expect(record()?.versions?.[0]?.palette).toEqual(custom);
  });

  it('keeps immutable drafts, invalidates approval and restores preserved IDs plus version palettes', () => {
    const store = useStore.getState();
    const initial = record();
    if (!initial) throw new Error('missing plan');
    const sceneId = 'scene-statement-0-3';
    const preserved = snapshotLongformPlanItem(initial.plan, { type: 'scene', id: sceneId });
    if (!preserved) throw new Error('missing scene');
    store.setLongformPreservedItems(SOURCE_ID, [preserved]);
    const savedId = record()?.activeVersionId ?? '';
    store.acceptLongformPlan(SOURCE_ID, 'editorial', 'brand');
    expect(record()?.approvedVersionId).toBeTruthy();
    const edited = updateLongformPlanItem(
      initial.plan,
      { type: 'scene', id: sceneId },
      { presentation: 'full-frame' },
    );
    store.addLongformPlanVersion(SOURCE_ID, edited, 'user-edited');
    expect(record()).toMatchObject({ status: 'draft', approvedVersionId: null });
    expect(initial.plan).toEqual(makeScenePlan());
    store.setLongformPlanStyle(SOURCE_ID, 'editorial', 'slate');
    expect(record()).toMatchObject({ paletteId: 'slate', approvedVersionId: null });
    store.setLongformPreservedItems(SOURCE_ID, []);
    store.restoreLongformPlanVersion(SOURCE_ID, savedId);
    expect(record()).toMatchObject({
      paletteId: 'brand',
      preservedItems: [{ key: sceneId }],
      status: 'draft',
      approvedVersionId: null,
    });
  });

  it('blocks invalid approval and clears a stale flag only with valid generation while retaining unsupported raw data', () => {
    const store = useStore.getState();
    const raw = {
      parserVersion: 99,
      scenes: [{ sourceSpec: { unknownFutureGeometry: ['keep'] } }],
    };
    store.setLongformPlan(SOURCE_ID, {
      plan: makeScenePlan(),
      skin: 'editorial',
      paletteId: 'brand',
      validationProblem: 'Unsupported saved parser',
      preservedPlanData: raw,
      status: 'accepted',
      approvedVersionId: 'old',
    });
    store.acceptLongformPlan(SOURCE_ID, 'editorial', 'brand');
    expect(record()).toMatchObject({
      status: 'draft',
      approvedVersionId: null,
      preservedPlanData: raw,
    });
    store.addLongformPlanVersion(SOURCE_ID, makeScenePlan(), 'regenerated');
    expect(record()?.validationProblem).toBeUndefined();
    expect(record()?.preservedPlanData).toEqual(raw);
    store.acceptLongformPlan(SOURCE_ID, 'editorial', 'brand');
    expect(record()?.status).toBe('accepted');
  });

  it.each([
    'empty',
    'all-omitted',
    'legacy-empty',
  ] as const)('allows %s speaker-only approval through both approval actions', (kind) => {
    const store = useStore.getState();
    const scenePlan = makeScenePlan();
    if (kind === 'all-omitted')
      scenePlan.scenes.forEach((scene) => {
        scene.omitted = true;
      });
    else {
      scenePlan.scenes = [];
      scenePlan.sections.forEach((section) => {
        section.status = 'empty';
      });
    }
    const plan =
      kind === 'legacy-empty'
        ? { phrases: [], blocks: [], cards: [], reasoning: 'Speaker-only', generatedAt: 100 }
        : scenePlan;
    for (const action of ['explicit', 'generic']) {
      store.setLongformPlan(SOURCE_ID, { plan, skin: 'editorial', paletteId: 'brand' });
      if (action === 'explicit') store.acceptLongformPlan(SOURCE_ID, 'editorial', 'brand');
      else store.addLongformPlanVersion(SOURCE_ID, plan, 'accepted');
      expect(record()?.status).toBe('accepted');
      expect(record()?.approvedVersionId).toBe(record()?.activeVersionId);
      expect(record()?.plan).toEqual(plan);
    }
  });

  it.each([
    'conflict',
    'all-failed',
    'incomplete-empty',
  ] as const)('blocks %s plans through both approval actions', (kind) => {
    const store = useStore.getState();
    const plan = makeScenePlan();
    if (kind === 'conflict') {
      const second = plan.scenes[1];
      if (!second) throw new Error('missing scene');
      second.startTime = 4;
    } else {
      plan.scenes = [];
      plan.sections.forEach((section, index) => {
        section.status = kind === 'all-failed' || index === 0 ? 'failed' : 'empty';
      });
    }
    for (const action of ['explicit', 'generic']) {
      store.setLongformPlan(SOURCE_ID, { plan, skin: 'editorial', paletteId: 'brand' });
      if (action === 'explicit') store.acceptLongformPlan(SOURCE_ID, 'editorial', 'brand');
      else store.addLongformPlanVersion(SOURCE_ID, plan, 'accepted');
      expect(record()).toMatchObject({ status: 'draft', approvedVersionId: null });
      expect(record()?.plan).toEqual(plan);
    }
  });

  it('blocks approval after a source fingerprint change', () => {
    useStore.setState((state) => {
      const source = state.sources[0];
      if (source) source.duration = 151;
    });
    useStore.getState().acceptLongformPlan(SOURCE_ID, 'editorial', 'brand');
    expect(record()?.validationProblem).toMatch(/stale/);
    expect(record()?.approvedVersionId).toBeNull();
  });
});
