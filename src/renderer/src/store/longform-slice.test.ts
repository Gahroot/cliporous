import type { SceneFirstLongformPlan } from '@shared/longform-scenes';
import { getPaletteById } from '@shared/palettes';
import type { StoryboardStyle } from '@shared/storyboards';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeScenePlan, SCENE_WORDS } from '@/components/__tests__/longform-scene-fixture';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { longformApprovalProblem } from '@/lib/longform-approval';
import { snapshotLongformPlanItem, updateLongformPlanItem } from '@/lib/longform-plan';
import { useStore } from '@/store';

const SOURCE_ID = 'source-review';
function currentParserPlan(style: StoryboardStyle = 'polish'): SceneFirstLongformPlan {
  return { ...makeScenePlan(), parserVersion: 2, storyboardStyle: style };
}
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
      palette: custom,
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

  it('changes only the skin without picking up unrelated edits to the same palette', () => {
    const store = useStore.getState();
    const palette = {
      ...getPaletteById('brand'),
      id: 'custom-skin',
      name: 'Saved',
      builtin: false,
      accent: '#123456',
    };
    useStore.setState((state) => {
      state.settings.customPalettes = [{ ...palette, accent: '#654321' }];
    });
    store.setLongformPlan(SOURCE_ID, {
      plan: makeScenePlan(),
      skin: 'editorial',
      paletteId: palette.id,
      palette,
    });
    store.setLongformPlanStyle(SOURCE_ID, 'aurora-glass', palette.id);
    expect(record()?.palette?.accent).toBe('#123456');
    expect(record()?.skin).toBe('aurora-glass');
    useStore.setState((state) => {
      state.settings.customPalettes = [];
    });
    store.setLongformPlanStyle(SOURCE_ID, 'editorial', palette.id);
    expect(record()?.palette?.accent).toBe('#123456');
    expect(record()?.validationProblem).toBeUndefined();
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

  it('creates immutable style revisions without AI, preserving content, colors and approved history', () => {
    const store = useStore.getState();
    const ai = vi.spyOn(window.api, 'generateLongformEditPlan');
    const palette = { ...getPaletteById('brand'), id: 'custom-captured', builtin: false };
    const plan = currentParserPlan();
    store.setLongformPlan(SOURCE_ID, { plan, skin: 'editorial', paletteId: palette.id, palette });
    store.acceptLongformPlan(SOURCE_ID, 'editorial', palette.id);
    const approved = structuredClone(record());
    const approvedId = record()?.activeVersionId ?? '';
    const updates: number[] = [];
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (state.longformPlans !== previous.longformPlans)
        updates.push(state.longformPlans[SOURCE_ID].versions?.length ?? 0);
    });
    store.setLongformPlanStoryboardStyle(SOURCE_ID, 'ink');
    unsubscribe();
    expect(updates).toHaveLength(1);
    expect(record()?.versions).toHaveLength((approved?.versions?.length ?? 0) + 1);
    expect(record()?.versions?.slice(0, -1)).toEqual(approved?.versions);
    expect(record()?.plan).toEqual({ ...plan, storyboardStyle: 'ink' });
    expect(record()?.palette).toEqual(palette);
    expect(record()).toMatchObject({ status: 'draft', approvedVersionId: null });
    expect(ai).not.toHaveBeenCalled();
    store.setLongformStoryboardStyle('ink');
    store.setLongformPaletteId('slate');
    store.removeCustomPalette(palette.id);
    store.restoreLongformPlanVersion(SOURCE_ID, approvedId);
    expect(record()?.plan).toEqual(plan);
    expect(record()?.palette).toEqual(palette);
    store.acceptLongformPlan(SOURCE_ID, 'editorial', palette.id);
    const restored = record();
    if (!restored) throw new Error('Expected restored record');
    expect(longformApprovalProblem(restored)).toBeNull();
    expect(restored.versions?.slice(0, approved?.versions?.length)).toEqual(approved?.versions);
    const divergent = structuredClone(restored);
    if (divergent.plan.mode === 'scene-first') divergent.plan.storyboardStyle = 'ink';
    expect(longformApprovalProblem(divergent)).toMatch(/differs/);
    ai.mockRestore();
  });

  it('uses captured appearance for generation and regeneration, not globals at completion', () => {
    const store = useStore.getState();
    const captured = {
      ...getPaletteById('brand'),
      id: 'custom-capture',
      builtin: false,
      accent: '#123456',
    };
    store.addCustomPalette({ ...captured, accent: '#654321' });
    store.setLongformPlan(SOURCE_ID, {
      plan: currentParserPlan(),
      skin: 'editorial',
      paletteId: captured.id,
      palette: captured,
    });
    expect(record()?.palette).toEqual(captured);
    store.removeCustomPalette(captured.id);
    store.addLongformPlanVersion(SOURCE_ID, currentParserPlan('ink'), 'regenerated', undefined, {
      skin: 'editorial',
      paletteId: captured.id,
      palette: captured,
    });
    expect(record()?.versions?.at(-1)?.palette).toEqual(captured);
    expect(record()?.palette).toEqual(captured);
    store.acceptLongformPlan(SOURCE_ID, 'editorial', captured.id);
    expect(record()?.status).toBe('accepted');
  });

  it('blocks a custom snapshot that was not captured, even when its library entry exists', () => {
    const store = useStore.getState();
    const palette = { ...getPaletteById('brand'), id: 'custom-no-snapshot', builtin: false };
    store.addCustomPalette(palette);
    store.setLongformPlan(SOURCE_ID, {
      plan: currentParserPlan(),
      skin: 'editorial',
      paletteId: palette.id,
    });
    expect(record()?.palette).toBeUndefined();
    store.acceptLongformPlan(SOURCE_ID, 'editorial', palette.id);
    expect(record()).toMatchObject({ status: 'draft', approvedVersionId: null });
    store.setLongformPlanStyle(SOURCE_ID, 'editorial', palette.id);
    expect(record()?.palette).toEqual(palette);
    store.acceptLongformPlan(SOURCE_ID, 'editorial', palette.id);
    expect(record()?.status).toBe('accepted');
  });

  it('restores historical built-in versions without new appearance metadata', () => {
    useStore.setState((state) => {
      state.longformPlans[SOURCE_ID].versions = [
        { id: 'historical', plan: makeScenePlan(), origin: 'generated', createdAt: 1 },
      ];
      state.settings.longformPaletteId = 'slate-emerald';
    });
    useStore.getState().restoreLongformPlanVersion(SOURCE_ID, 'historical');
    expect(record()?.paletteId).toBe('brand');
    expect(record()?.palette).toEqual(getPaletteById('brand'));
    expect(record()?.validationProblem).toBeUndefined();
    expect(record()?.plan).toEqual(makeScenePlan());
  });

  it('never upgrades parser-1 history or normalizes malformed plan styles into valid ones', () => {
    const store = useStore.getState();
    const historical = structuredClone(record());
    store.setLongformPlanStoryboardStyle(SOURCE_ID, 'ink');
    expect(record()).toEqual(historical);
    store.setLongformPlan(SOURCE_ID, {
      plan: currentParserPlan('future' as StoryboardStyle),
      skin: 'editorial',
      paletteId: 'brand',
    });
    const malformed = structuredClone(record());
    store.setLongformPlanStoryboardStyle(SOURCE_ID, 'ink');
    expect(record()).toEqual(malformed);
    store.acceptLongformPlan(SOURCE_ID, 'editorial', 'brand');
    expect(record()?.approvedVersionId).toBeNull();
  });

  it('makes palette changes drafts and preserves missing IDs instead of falling back', () => {
    const store = useStore.getState();
    store.setLongformPlan(SOURCE_ID, {
      plan: currentParserPlan('ink'),
      skin: 'editorial',
      paletteId: 'brand',
    });
    store.acceptLongformPlan(SOURCE_ID, 'editorial', 'brand');
    const approved = structuredClone(record()?.versions);
    store.setLongformPlanStyle(SOURCE_ID, 'editorial', 'custom-missing');
    expect(record()?.versions?.slice(0, -1)).toEqual(approved);
    expect(record()).toMatchObject({
      paletteId: 'custom-missing',
      status: 'draft',
      approvedVersionId: null,
    });
    expect(record()?.palette).toBeUndefined();
    expect(record()?.plan).toEqual(currentParserPlan('ink'));
    store.addLongformPlanVersion(SOURCE_ID, currentParserPlan('ink'), 'accepted');
    expect(record()?.approvedVersionId).toBeNull();
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
