import {
  isSceneFirstLongformPlan,
  longformSourceFingerprint,
  type SceneFirstLongformPlan,
} from '@shared/longform-scenes';
import { BUILTIN_PALETTES, type Palette } from '@shared/palettes';
import type { LongformEditPlan } from '@shared/types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { type SourceVideo, useStore } from '@/store';
import { useLongformPipeline } from './useLongformPipeline';

const source: SourceVideo = {
  origin: 'file',
  id: 'source-a',
  name: 'Interview',
  path: '/source.mp4',
  duration: 60,
  width: 1920,
  height: 1080,
  thumbnail: '',
};
const words = [{ text: 'Evidence', start: 1, end: 2 }];
const custom: Palette = {
  ...BUILTIN_PALETTES[0],
  id: 'custom-studio',
  name: 'Studio',
  builtin: false,
};
function plan(style: 'ink' | 'polish' = 'ink'): SceneFirstLongformPlan {
  return {
    schemaVersion: 2,
    mode: 'scene-first',
    parserVersion: 2,
    storyboardStyle: style,
    sourceDuration: 60,
    sourceFingerprint: longformSourceFingerprint(words, 60),
    scenes: [],
    sections: [],
    phrases: [],
    blocks: [],
    cards: [],
    reasoning: '',
    generatedAt: 1,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

beforeEach(() => {
  resetStore();
  useStore.setState((state) => ({
    sources: [source],
    activeSourceId: source.id,
    settings: {
      ...state.settings,
      outputMode: 'longform',
      geminiApiKey: 'test-key',
      longformStoryboardStyle: 'ink',
      longformPaletteId: custom.id,
      customPalettes: [custom],
    },
  }));
  installApiStub({
    transcribeVideo: vi.fn(async () => ({ words, segments: [], language: 'en' })),
    cancelLongformEditPlan: vi.fn(async () => {}),
    cancelPython: vi.fn(async () => {}),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('long-form request ownership and appearance', () => {
  it.each([
    'file',
    'youtube',
    'resumed',
    'batch',
  ] as const)('%s captures style and palette contents before processing, not on completion', async (route) => {
    const selected =
      route === 'youtube'
        ? {
            ...source,
            origin: 'youtube' as const,
            path: '',
            youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
          }
        : source;
    useStore.setState({ sources: [selected] });
    if (route === 'resumed' || route === 'batch') useStore.getState().startProcessingJob(selected);
    const pending = deferred<LongformEditPlan>();
    const generate = vi.fn<typeof window.api.generateLongformEditPlan>(() => pending.promise);
    const transcribe = deferred<Awaited<ReturnType<typeof window.api.transcribeVideo>>>();
    window.api.generateLongformEditPlan = generate;
    window.api.transcribeVideo = vi.fn(() => transcribe.promise);
    const { result } = renderHook(useLongformPipeline);
    let done!: Promise<void>;
    act(() => {
      done = result.current.processLongform(selected);
    });
    await waitFor(() => expect(window.api.transcribeVideo).toHaveBeenCalled());
    act(() =>
      useStore.setState((state) => ({
        settings: {
          ...state.settings,
          longformStoryboardStyle: 'polish',
          longformPaletteId: 'brand',
          customPalettes: [{ ...custom, accent: '#123456' }],
        },
      })),
    );
    await act(async () => {
      transcribe.resolve({ text: 'Evidence', words, segments: [] });
    });
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0]?.[4]).toMatchObject({
      mode: 'scene-first',
      storyboardStyle: 'ink',
    });
    await act(async () => {
      pending.resolve(plan());
      await done;
    });
    const saved = useStore.getState().longformPlans[source.id];
    expect(saved && isSceneFirstLongformPlan(saved.plan) && saved.plan.storyboardStyle).toBe('ink');
    expect(saved?.palette).toEqual(custom);
    expect(saved?.paletteId).toBe(custom.id);
    expect(useStore.getState().pipeline.stage).toBe('ready');
  });

  it.each([
    'cancel',
    'project',
    'source',
    'resume',
    'unmount',
  ] as const)('ignores late generation after %s', async (change) => {
    const pending = deferred<LongformEditPlan>();
    window.api.generateLongformEditPlan = vi.fn(() => pending.promise);
    const { result, unmount } = renderHook(useLongformPipeline);
    let done!: Promise<void>;
    act(() => {
      done = result.current.processLongform(source);
    });
    await waitFor(() => expect(window.api.generateLongformEditPlan).toHaveBeenCalled());
    act(() => {
      if (change === 'cancel') result.current.cancelLongform();
      if (change === 'project')
        useStore.setState((state) => ({
          currentProject: { ...state.currentProject, id: 'other-project' },
        }));
      if (change === 'source') useStore.setState({ activeSourceId: 'other-source' });
      if (change === 'resume') useStore.getState().startProcessingJob(source);
      if (change === 'unmount') unmount();
    });
    await act(async () => {
      pending.resolve(plan());
      await done;
    });
    expect(useStore.getState().longformPlans[source.id]).toBeUndefined();
    expect(window.api.cancelLongformEditPlan).toHaveBeenCalled();
  });

  it('blocks missing palettes before media processing or AI', async () => {
    useStore.setState((state) => ({ settings: { ...state.settings, customPalettes: [] } }));
    const { result } = renderHook(useLongformPipeline);
    await act(async () => {
      await result.current.processLongform(source);
    });
    expect(window.api.transcribeVideo).not.toHaveBeenCalled();
    expect(window.api.generateLongformEditPlan).not.toHaveBeenCalled();
    expect(useStore.getState().pipeline.message).toContain('palette is unavailable');
  });

  it('does not save a parser-2 response with missing style', async () => {
    const invalid = plan();
    delete invalid.storyboardStyle;
    window.api.generateLongformEditPlan = vi.fn(async () => invalid);
    const { result } = renderHook(useLongformPipeline);
    await act(async () => {
      await result.current.processLongform(source);
    });
    expect(useStore.getState().longformPlans[source.id]).toBeUndefined();
    expect(useStore.getState().pipeline.stage).toBe('error');
  });
});
