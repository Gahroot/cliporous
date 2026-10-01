import { longformSourceFingerprint, type SceneFirstLongformPlan } from '@shared/longform-scenes';
import type { LongformEditPlan } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { useStore } from '@/store';
import { prepareLongformRender, startLongformRender } from './longform-render-service';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}));

const PLAN: LongformEditPlan = {
  phrases: [],
  blocks: [],
  cards: [],
  reasoning: 'Keep the accepted editorial timing.',
  generatedAt: 100,
};

function acceptScenePlan(): void {
  const words = [
    { text: 'Local', start: 0.1, end: 0.4 },
    { text: 'source', start: 0.5, end: 0.9 },
  ];
  const plan: SceneFirstLongformPlan = {
    schemaVersion: 2,
    mode: 'scene-first',
    parserVersion: 1,
    sourceDuration: 60,
    sourceFingerprint: longformSourceFingerprint(words, 60),
    generatedAt: 100,
    blocks: [],
    phrases: [],
    cards: [],
    scenes: [],
    reasoning: 'Keep the speaker.',
    sections: [
      {
        id: 'section-0',
        startWord: 0,
        endWord: 1,
        startTime: 0,
        endTime: 60,
        status: 'empty',
        diagnostics: [],
      },
    ],
  };
  useStore.getState().setTranscription('source-1', {
    words,
    text: 'Local source',
    segments: [],
    formattedForAI: '',
  });
  useStore
    .getState()
    .setLongformPlan('source-1', { plan, skin: 'editorial', paletteId: 'brand', status: 'draft' });
  useStore.getState().acceptLongformPlan('source-1', 'editorial', 'brand');
  expect(useStore.getState().getLongformPlan('source-1')?.status).toBe('accepted');
}

describe('longform render readiness', () => {
  beforeEach(() => {
    resetStore();
    installApiStub();
    useStore.setState((state) => {
      state.sources = [
        {
          id: 'source-1',
          path: '/videos/source.mp4',
          name: 'source.mp4',
          duration: 60,
          width: 1920,
          height: 1080,
          origin: 'file',
          mediaStatus: 'online',
        },
      ];
      state.activeSourceId = 'source-1';
      state.settings.outputDirectory = '/exports';
      state.settings.longformPaletteId = 'missing-palette';
      state.settings.customPalettes = [];
    });
    useStore.getState().setLongformPlan('source-1', {
      plan: PLAN,
      skin: 'editorial',
      paletteId: 'missing-palette',
      status: 'accepted',
    });
  });

  it('exports exactly the approved speaker-only snapshot without AI credentials or regeneration', async () => {
    acceptScenePlan();
    const approved = useStore.getState().getLongformPlan('source-1');
    useStore.setState((state) => {
      state.settings.geminiApiKey = 'offline-test-value-not-a-credential';
      state.settings.customPalettes = [
        {
          id: 'brand',
          name: 'Changed current palette',
          builtin: false,
          background: '#ffffff',
          foreground: '#000000',
          accent: '#ff0000',
        },
      ];
    });
    expect(await startLongformRender()).toEqual({ started: true });
    const payload = vi.mocked(window.api.startBatchRender).mock.calls[0]?.[0];
    expect(payload?.longformEditPlan).toEqual(approved?.plan);
    expect(payload?.customPalettes).toEqual([approved?.palette]);
    expect(payload).not.toHaveProperty('geminiApiKey');
    expect(window.api.generateLongformEditPlan).not.toHaveBeenCalled();
  });

  it('blocks stale or divergent approved snapshots before invoking export', async () => {
    acceptScenePlan();
    useStore.setState((state) => {
      const record = state.longformPlans['source-1'];
      if (record) record.versions = [];
    });
    expect(await startLongformRender()).toEqual({ started: false, reason: 'plan-invalid' });
    expect(window.api.startBatchRender).not.toHaveBeenCalled();
  });

  it('rechecks the approved version after asynchronous preflight', async () => {
    acceptScenePlan();
    let release: (value: { free: number; total: number }) => void = () => undefined;
    vi.mocked(window.api.getDiskSpace).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = startLongformRender();
    await vi.waitFor(() => expect(window.api.getDiskSpace).toHaveBeenCalled());
    useStore.setState((state) => {
      const record = state.longformPlans['source-1'];
      if (record) record.plan.reasoning = 'Changed after approval';
    });
    release({ free: 20 * 1024 ** 3, total: 100 * 1024 ** 3 });
    expect(await pending).toEqual({ started: false, reason: 'plan-invalid' });
    expect(window.api.startBatchRender).not.toHaveBeenCalled();
  });

  it('does not export an outdated source path after asynchronous preflight', async () => {
    acceptScenePlan();
    let release: (value: { free: number; total: number }) => void = () => undefined;
    vi.mocked(window.api.getDiskSpace).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = startLongformRender();
    await vi.waitFor(() => expect(window.api.getDiskSpace).toHaveBeenCalled());
    useStore.getState().updateSource('source-1', { path: '/videos/relinked-source.mp4' });
    release({ free: 20 * 1024 ** 3, total: 100 * 1024 ** 3 });
    expect(await pending).toEqual({ started: false, reason: 'plan-invalid' });
    expect(window.api.startBatchRender).not.toHaveBeenCalled();
  });

  it('forwards the existing disabled-explanations setting', async () => {
    acceptScenePlan();
    useStore.setState((state) => {
      state.settings.explainerScenesEnabled = false;
    });
    expect(await startLongformRender()).toEqual({ started: true });
    expect(vi.mocked(window.api.startBatchRender).mock.calls[0]?.[0]).toMatchObject({
      longformEditsEnabled: false,
      explainerScenesEnabled: false,
    });
  });

  it('blocks export preparation until a missing saved palette is repaired', async () => {
    const result = await prepareLongformRender();

    expect(result).toEqual({ started: false, reason: 'palette-unavailable' });
    expect(useStore.getState().renderProgress).toEqual([]);
  });

  it('distinguishes a pending media check from an offline source', async () => {
    useStore.setState((state) => {
      const source = state.sources[0];
      if (source) source.mediaStatus = 'checking';
      state.settings.longformPaletteId = 'brand';
    });

    const result = await prepareLongformRender();

    expect(result).toEqual({ started: false, reason: 'source-checking' });
    expect(useStore.getState().renderProgress).toEqual([]);
  });
});
