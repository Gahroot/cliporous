import { longformSourceFingerprint, type SceneFirstLongformPlan } from '@shared/longform-scenes';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { useStore } from '@/store';
import App from './App';

// Keep the real import screen, pipeline and top-level screen routing. Unrelated
// desktop surfaces do not participate in source preparation.
vi.mock('@/components/StudioHeader', () => ({ StudioHeader: () => null }));
vi.mock('@/components/ReleaseSurfaces', () => ({ ReleaseSurfaces: () => null }));
vi.mock('@/components/MissingMediaDialog', () => ({ MissingMediaDialog: () => null }));
vi.mock('@/components/ErrorLog', () => ({ ErrorLog: () => null }));
vi.mock('@/components/CompletionCelebration', () => ({ CompletionCelebration: () => null }));
vi.mock('@/components/RecoveryPrompt', () => ({ RecoveryPrompt: () => null }));
vi.mock('@/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/screens/ProcessingScreen', () => ({
  ProcessingScreen: () => <div>Processing source</div>,
}));
vi.mock('@/components/screens/CutPlanReviewScreen', () => ({
  CutPlanReviewScreen: () => <div>Plan ready to review</div>,
}));
vi.mock('@/hooks/useAiTokenUsage', () => ({ useAiTokenUsage: () => {} }));
vi.mock('@/hooks/useDesktopLifecycle', () => ({ useDesktopLifecycle: () => {} }));
vi.mock('@/hooks/useNativeJobIntegration', () => ({ useNativeJobIntegration: () => {} }));
vi.mock('@/services/project-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/project-service')>()),
  resumeLastProject: vi.fn(async () => false),
}));

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const metadata = {
  duration: 60,
  width: 1920,
  height: 1080,
  codec: 'h264',
  fps: 30,
  audioCodec: 'aac',
} satisfies Awaited<ReturnType<typeof window.api.getMetadata>>;
const words = [{ text: 'Evidence', start: 1, end: 2 }];

beforeEach(() => {
  resetStore();
  installApiStub({
    cancelLongformEditPlan: vi.fn(async () => {}),
    onSettingsOpenRequest: vi.fn(() => () => {}),
    onKeyboardShortcutsRequest: vi.fn(() => () => {}),
    secrets: {
      get: vi.fn(async (name: string) => (name === 'gemini' ? 'test-key' : null)),
    },
    transcribeVideo: vi.fn(async () => ({ text: 'Evidence', words, segments: [] })),
    generateLongformEditPlan: vi.fn(
      async (): Promise<SceneFirstLongformPlan> => ({
        schemaVersion: 2,
        mode: 'scene-first',
        parserVersion: 2,
        storyboardStyle: 'ink',
        sourceDuration: 60,
        sourceFingerprint: longformSourceFingerprint(words, 60),
        scenes: [],
        sections: [],
        phrases: [],
        blocks: [],
        cards: [],
        reasoning: '',
        generatedAt: 1,
      }),
    ),
  });
  useStore.setState((state) => ({
    settings: {
      ...state.settings,
      outputMode: 'longform',
      geminiApiKey: 'test-key',
      longformStoryboardStyle: 'ink',
      longformPaletteId: 'brand',
    },
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('source preparation across screen changes', () => {
  it.each([
    'file',
    'youtube',
  ] as const)('keeps the %s long-form run alive when import switches to processing', async (origin) => {
    const probe = deferred<typeof metadata>();
    // Local files are also probed once by the import dialog. Hold the actual
    // pipeline probe until App has unmounted the import screen.
    const getMetadata = vi.fn(() => probe.promise);
    if (origin === 'file') getMetadata.mockResolvedValueOnce(metadata);
    window.api.getMetadata = getMetadata;
    render(<App />);
    const urlInput = await screen.findByLabelText(/^youtube url$/i);
    if (origin === 'youtube') {
      fireEvent.change(urlInput, {
        target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      });
      fireEvent.keyDown(urlInput, { key: 'Enter', code: 'Enter' });
    } else {
      window.api.openFiles = vi.fn(async () => ['/source.mp4']);
      fireEvent.click(screen.getByRole('button', { name: /choose a video file or drop it here/i }));
    }
    fireEvent.click(await screen.findByRole('button', { name: /add source and process/i }));
    await screen.findByText('Processing source');
    await waitFor(() => expect(screen.queryByText('Project lobby')).not.toBeInTheDocument());
    expect(useStore.getState().sources[0]?.id).toBe(useStore.getState().activeSourceId);
    await act(async () => {
      probe.resolve(metadata);
    });
    expect(window.api.cancelLongformEditPlan).not.toHaveBeenCalled();
    await waitFor(() => expect(window.api.transcribeVideo).toHaveBeenCalledTimes(1));
    await screen.findByText('Plan ready to review');
    expect(useStore.getState().pipeline.stage).toBe('ready');
    expect(window.api.cancelLongformEditPlan).not.toHaveBeenCalled();
  });
});
