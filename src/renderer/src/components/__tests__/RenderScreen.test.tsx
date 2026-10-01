/**
 * RenderScreen.test.tsx
 *
 * - Per-clip rows render with status badges + progress bars driven by
 *   `state.renderProgress`.
 * - The post-batch "Open Output Folder" Button is only enabled once the
 *   batch has completed (i.e. `batchSummary` is set + `isRendering` is
 *   false). Before that it isn't even rendered.
 *
 * Render bridge events are simulated by capturing the callbacks the
 * component subscribes to in `useEffect` and invoking them directly.
 */

import type { StructuredError } from '@shared/errors';
import type { LongformRenderReconciliation } from '@shared/types';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '@/store';
import type { ClipCandidate, SourceVideo } from '@/store/types';
import { deferred, makeScenePlan, SCENE_WORDS } from './longform-scene-fixture';
import { installApiStub, resetStore } from './test-utils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SOURCE: SourceVideo = {
  id: 'src-1',
  path: '/videos/talk.mp4',
  name: 'talk.mp4',
  duration: 600,
  width: 1920,
  height: 1080,
  origin: 'file',
};

function makeApprovedClip(id: string, hookText: string): ClipCandidate {
  return {
    id,
    sourceId: SOURCE.id,
    startTime: 0,
    endTime: 30,
    duration: 30,
    text: 'sample',
    score: 80,
    hookText,
    reasoning: 'r',
    status: 'approved',
  };
}

const CLIPS: ClipCandidate[] = [
  makeApprovedClip('c1', 'First clip'),
  makeApprovedClip('c2', 'Second clip'),
  makeApprovedClip('c3', 'Third clip'),
];

// ---------------------------------------------------------------------------
// Bridge-callback capture
// ---------------------------------------------------------------------------

interface RenderEventCallbacks {
  onStart?: (data: { clipId: string }) => void;
  onPrepare?: (data: { clipId: string; message: string; percent: number }) => void;
  onProgress?: (data: { clipId: string; percent: number }) => void;
  onDone?: (data: { clipId: string; outputPath: string }) => void;
  onError?: (data: { clipId: string; error: StructuredError }) => void;
  onBatchDone?: (data: { completed: number; failed: number; total: number }) => void;
  onCancelled?: (data: { completed: number; failed: number; total: number }) => void;
}

const callbacks: RenderEventCallbacks = {};

function installRenderApi(): void {
  installApiStub({
    onRenderClipStart: vi.fn((cb: RenderEventCallbacks['onStart']) => {
      callbacks.onStart = cb;
      return () => {};
    }),
    onRenderClipPrepare: vi.fn((cb: RenderEventCallbacks['onPrepare']) => {
      callbacks.onPrepare = cb;
      return () => {};
    }),
    onRenderClipProgress: vi.fn((cb: RenderEventCallbacks['onProgress']) => {
      callbacks.onProgress = cb;
      return () => {};
    }),
    onRenderClipDone: vi.fn((cb: RenderEventCallbacks['onDone']) => {
      callbacks.onDone = cb;
      return () => {};
    }),
    onRenderClipError: vi.fn((cb: RenderEventCallbacks['onError']) => {
      callbacks.onError = cb;
      return () => {};
    }),
    onRenderBatchDone: vi.fn((cb: RenderEventCallbacks['onBatchDone']) => {
      callbacks.onBatchDone = cb;
      return () => {};
    }),
    onRenderCancelled: vi.fn((cb: RenderEventCallbacks['onCancelled']) => {
      callbacks.onCancelled = cb;
      return () => {};
    }),
    showItemInFolder: vi.fn(async () => undefined),
    openPath: vi.fn(async () => ''),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  installRenderApi();

  const store = useStore.getState();
  store.addSource(SOURCE);
  store.setActiveSource(SOURCE.id);
  store.setClips(SOURCE.id, CLIPS);
  // Need an output directory so the Open Folder button can be enabled.
  store.setOutputDirectory('/output');
});

afterEach(async () => {
  await act(async () => {});
  cleanup();
  for (const k of Object.keys(callbacks) as (keyof RenderEventCallbacks)[]) {
    delete callbacks[k];
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RenderScreen', () => {
  it('shows one progress row per approved clip', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);

    // Each approved clip's hook text is visible in its row.
    for (const clip of CLIPS) {
      expect(screen.getByText(clip.hookText)).toBeInTheDocument();
    }

    // Three rows → three status badges. Initially all are "Pending".
    expect(screen.getAllByText('Pending')).toHaveLength(CLIPS.length);
  });

  it('shows compact animation colours for short-form and changes the selected palette', async () => {
    useStore.getState().setLongformPaletteId('brand');
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);

    const group = screen.getByRole('group', { name: 'Animation colours' });
    expect(
      within(group).getByText('Used for animated scenes and caption highlights.'),
    ).toBeInTheDocument();
    // Compact mode hides the long-form skin selector.
    expect(within(group).queryByRole('button', { name: 'Editorial' })).toBeNull();
    expect(
      within(group).getByRole('button', { name: 'Use Brand Default palette' }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(group).getByRole('button', { name: 'Use Midnight Cyan palette' }));

    expect(useStore.getState().settings.longformPaletteId).toBe('midnight-cyan');
    expect(
      within(group).getByRole('button', { name: 'Use Midnight Cyan palette' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not block short-form rendering when the saved palette is missing', async () => {
    useStore.getState().setLongformPaletteId('deleted-palette');
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);

    const group = screen.getByRole('group', { name: 'Animation colours' });
    expect(within(group).getByRole('status')).toHaveTextContent('Brand Default will be used');
    expect(
      within(group).getByRole('button', { name: 'Use Brand Default palette' }),
    ).toHaveAttribute('aria-pressed', 'true');
    // The palette gate only exists on the long-form "Prepare export" button
    // (surfaced via its title); nothing on the short-form screen carries it.
    expect(
      document.querySelector('[title="Restore or select a palette before rendering"]'),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prepare export' })).toBeNull();
  });

  it('updates the row when a render:clipProgress event fires', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);

    expect(callbacks.onStart).toBeDefined();
    expect(callbacks.onProgress).toBeDefined();

    act(() => {
      callbacks.onStart?.({ clipId: 'c1' });
      callbacks.onProgress?.({ clipId: 'c1', percent: 42 });
    });

    // The first clip's row now shows the "Rendering" badge.
    expect(screen.getByText('Rendering')).toBeInTheDocument();

    // The persisted store record carries the percent so the bar reads it.
    const record = useStore.getState().renderProgress.find((r) => r.clipId === 'c1');
    expect(record?.percent).toBe(42);
    expect(record?.status).toBe('rendering');
  });

  it('shows the prepare status + live message on a clipPrepare event (B-Roll prep)', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);

    expect(callbacks.onPrepare).toBeDefined();

    act(() => {
      callbacks.onPrepare?.({
        clipId: 'c1',
        message: 'Downloading stock footage…',
        percent: 20,
      });
    });

    // Row flips to the creator-facing preparation state and translates engine language.
    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.getAllByText('Finding B-roll')).toHaveLength(2);

    const record = useStore.getState().renderProgress.find((r) => r.clipId === 'c1');
    expect(record?.status).toBe('preparing');
    expect(record?.percent).toBe(20);
    expect(record?.prepareMessage).toBe('Finding B-roll');

    // Once the encode starts, the row moves to "Rendering" and drops the live line.
    act(() => {
      callbacks.onStart?.({ clipId: 'c1' });
    });
    expect(screen.getByText('Rendering')).toBeInTheDocument();
    expect(screen.getAllByText('Finding B-roll')).toHaveLength(1);
  });

  it('enables "Open Output Folder" only after the batch completes', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);

    // Pre-completion: the post-batch footer isn't rendered at all.
    expect(screen.queryByRole('button', { name: /open output folder/i })).not.toBeInTheDocument();

    // Drive the bridge: kick a render off, then complete the batch.
    act(() => {
      useStore.getState().setIsRendering(true);
    });

    act(() => {
      callbacks.onStart?.({ clipId: 'c1' });
      callbacks.onProgress?.({ clipId: 'c1', percent: 100 });
      callbacks.onDone?.({ clipId: 'c1', outputPath: '/output/c1.mp4' });
      callbacks.onStart?.({ clipId: 'c2' });
      callbacks.onDone?.({ clipId: 'c2', outputPath: '/output/c2.mp4' });
      callbacks.onStart?.({ clipId: 'c3' });
      callbacks.onDone?.({ clipId: 'c3', outputPath: '/output/c3.mp4' });
      callbacks.onBatchDone?.({ completed: 3, failed: 0, total: 3 });
    });

    const openBtn = await screen.findByRole('button', {
      name: /open output folder/i,
    });
    expect(openBtn).toBeEnabled();

    // Encoded-file success is distinct from the explanation outcome.
    expect(screen.getAllByText('File ready')).toHaveLength(CLIPS.length);
  });

  it('reveals a finished clip in the OS file manager and shows the output path', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);

    act(() => {
      useStore.getState().setIsRendering(true);
    });
    act(() => {
      callbacks.onStart?.({ clipId: 'c1' });
      callbacks.onDone?.({ clipId: 'c1', outputPath: '/output/c1.mp4' });
      callbacks.onStart?.({ clipId: 'c2' });
      callbacks.onDone?.({ clipId: 'c2', outputPath: '/output/c2.mp4' });
      callbacks.onStart?.({ clipId: 'c3' });
      callbacks.onDone?.({ clipId: 'c3', outputPath: '/output/c3.mp4' });
      callbacks.onBatchDone?.({ completed: 3, failed: 0, total: 3 });
    });

    // One "Reveal in Finder" action per finished clip, each showing its file.
    const revealBtns = await screen.findAllByRole('button', {
      name: /reveal in finder/i,
    });
    expect(revealBtns).toHaveLength(CLIPS.length);
    expect(screen.getByText('c1.mp4')).toBeInTheDocument();

    // Clicking the first reveal forwards that clip's outputPath to the bridge.
    fireEvent.click(revealBtns[0] as HTMLElement);
    expect(window.api.showItemInFolder).toHaveBeenCalledWith('/output/c1.mp4');

    // The footer surfaces the resolved output directory.
    expect(screen.getByText('/output')).toBeInTheDocument();
  });

  it('does not show a completion footer when the batch produced no media', async () => {
    act(() => {
      useStore.setState((s) => ({
        settings: { ...s.settings, outputDirectory: null },
      }));
    });

    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);

    act(() => {
      useStore.getState().setIsRendering(true);
    });
    act(() => {
      callbacks.onBatchDone?.({ completed: 0, failed: 0, total: 0 });
    });

    expect(screen.queryByRole('button', { name: /open output folder/i })).not.toBeInTheDocument();
  });

  it('shows Cancelling until the render confirms it stopped', async () => {
    act(() => {
      useStore.getState().setIsRendering(true);
    });
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel now' }));

    const cancelling = screen.getByRole('button', { name: 'Cancelling now' });
    expect(cancelling).toBeDisabled();
    expect(useStore.getState().isRendering).toBe(true);

    act(() => {
      callbacks.onCancelled?.({ completed: 1, failed: 0, total: 3 });
    });

    expect(screen.queryByRole('button', { name: 'Cancelling now' })).not.toBeInTheDocument();
    expect(useStore.getState().isRendering).toBe(false);
  });

  it('keeps rendering visible and allows retry when cancellation fails', async () => {
    installApiStub({
      cancelRender: vi.fn(async () => {
        throw new Error('video process is still running');
      }),
    });
    act(() => {
      useStore.getState().setIsRendering(true);
    });
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel now' }));

    expect(await screen.findByText("BatchClip couldn't stop rendering yet")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Retry cancellation' })).toBeEnabled();
    expect(useStore.getState().isRendering).toBe(true);
  });

  it('keeps the cancellation deadline through progress updates and allows retry on timeout', async () => {
    useStore.getState().setIsRendering(true);
    useStore.getState().setRenderProgress([{ clipId: 'c1', status: 'rendering', percent: 10 }]);
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);
    vi.useFakeTimers();
    try {
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel now' })));
      act(() => {
        callbacks.onProgress?.({ clipId: 'c1', percent: 40 });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(25_000);
      });
      expect(useStore.getState().isRendering).toBe(true);
      expect(useStore.getState().renderCancellation.status).toBe('failed');
      expect(screen.getByRole('button', { name: 'Retry cancel' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Retry cancellation' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not replace confirmed cancellation with a late rejected request', async () => {
    const request = deferred<void>();
    vi.mocked(window.api.cancelRender).mockReturnValue(request.promise);
    useStore.getState().setIsRendering(true);
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel now' }));
    act(() => callbacks.onCancelled?.({ completed: 0, failed: 0, total: 3 }));
    await act(async () => request.reject(new Error('Late request rejection')));
    expect(useStore.getState().isRendering).toBe(false);
    expect(useStore.getState().renderCancellation).toEqual({ status: 'idle', error: null });
    expect(screen.queryByRole('button', { name: 'Retry cancel' })).not.toBeInTheDocument();
  });

  it('row hosts a progress bar while rendering and after completion', async () => {
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    const { container } = render(<RenderScreen />);

    // No rendering yet → no progress bars in the DOM.
    expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(0);

    act(() => {
      callbacks.onStart?.({ clipId: 'c1' });
      callbacks.onProgress?.({ clipId: 'c1', percent: 25 });
    });

    const bars = container.querySelectorAll('[role="progressbar"]');
    expect(bars.length).toBeGreaterThanOrEqual(1);

    // Find c1's row by its hook text and confirm it has its own bar.
    const row = screen.getByText('First clip').closest('div')?.parentElement;
    if (!row) throw new Error('Missing clip row');
    expect(within(row).getByRole('progressbar')).toBeInTheDocument();
  });
});

function seedLongformExport(status: 'failed' | 'omitted' | 'incomplete' = 'failed') {
  const state = useStore.getState();
  state.setClips(SOURCE.id, []);
  useStore.setState((draft) => {
    const source = draft.sources[0];
    if (!source) throw new Error('Missing fixture source');
    source.duration = 150;
    draft.transcriptions[SOURCE.id] = {
      text: 'Source',
      formattedForAI: '',
      segments: [],
      words: SCENE_WORDS,
    };
  });
  const plan = makeScenePlan();
  const [first, second] = plan.scenes;
  if (!first || !second) throw new Error('Expected two fixture scenes');
  if (status === 'omitted') second.omitted = true;
  state.setLongformPlan(SOURCE.id, { plan, skin: 'editorial', paletteId: 'brand' });
  state.acceptLongformPlan(SOURCE.id, 'editorial', 'brand');
  const zero = { planned: 0, eligible: 0, rendered: 0, dropped: 0 };
  const reconciliation: LongformRenderReconciliation = {
    renderedAt: 100,
    outputPath: '/output/full.mp4',
    phrases: zero,
    blocks: zero,
    cards: zero,
    scenes: { planned: 2, eligible: 2, rendered: 1, dropped: status === 'incomplete' ? 0 : 1 },
    sceneResults: [
      {
        id: first.id,
        kind: first.kind,
        startTime: first.startTime,
        endTime: first.endTime,
        status: 'rendered',
      },
      ...(status === 'incomplete'
        ? []
        : [
            {
              id: second.id,
              kind: second.kind,
              startTime: second.startTime,
              endTime: second.endTime,
              status,
              reason:
                status === 'failed'
                  ? 'Source footage retained after the visual failed.'
                  : 'Omitted by creator.',
            },
          ]),
    ],
    fallbacks: [],
  };
  state.setLongformReconciliation(SOURCE.id, reconciliation);
  state.setRenderProgress([
    {
      clipId: SOURCE.id,
      sourceId: SOURCE.id,
      kind: 'longform',
      label: 'Full video',
      status: 'done',
      percent: 100,
      outputPath: reconciliation.outputPath,
      checkpoints: ['output-verified'],
    },
  ]);
  state.setPipeline({ stage: 'done', message: '', percent: 100 });
  return { plan, targetId: second.id, reconciliation };
}

describe('RenderScreen export outcomes and recovery', () => {
  it.each([
    'failed',
    'omitted',
    'incomplete',
  ] as const)('opens the exact %s scene from a focusable button without changing approval, outputs or evidence', async (status) => {
    const { targetId } = seedLongformExport(status);
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    const view = render(<RenderScreen />);
    const button = screen.getByRole('button', { name: /Review Statement at 1:40/ });
    expect(button).toBeEnabled();
    await waitFor(() => expect(window.api.checkMediaPaths).toHaveBeenCalled());
    const before = useStore.getState();
    expect(before.longformPlans[SOURCE.id]?.status).toBe('accepted');
    expect(before.longformPlans[SOURCE.id]?.approvedVersionId).toBeTruthy();
    expect(screen.getAllByText('Completed with changes')).toHaveLength(2);
    expect(screen.getByText(/The video file is usable/)).toBeInTheDocument();
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    const after = useStore.getState();
    expect(after.longformReviewFocus).toEqual({ sourceId: SOURCE.id, sceneId: targetId });
    expect(after.pipeline.stage).toBe('ready');
    expect(after.longformPlans).toEqual(before.longformPlans);
    expect(after.renderProgress).toEqual(before.renderProgress);
    expect(after.renderErrors).toEqual(before.renderErrors);
    expect(window.api.startBatchRender).not.toHaveBeenCalled();
    // Returning to Export must retain both the output links and its saved reconciliation.
    view.unmount();
    render(<RenderScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Open video' }));
    expect(window.api.openPath).toHaveBeenCalledWith('/output/full.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Show file' }));
    expect(window.api.showItemInFolder).toHaveBeenCalledWith('/output/full.mp4');
    expect(screen.getAllByText('Completed with changes')).toHaveLength(2);
  });

  it('retains progress and saved proof when using the general Review plan action', async () => {
    const { targetId } = seedLongformExport();
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);
    await waitFor(() => expect(window.api.checkMediaPaths).toHaveBeenCalled());
    const before = useStore.getState();
    const review = screen.getAllByRole('button', { name: 'Review plan' })[0];
    if (!review) throw new Error('Missing Review plan button');
    fireEvent.click(review);
    expect(useStore.getState().longformReviewFocus?.sceneId).toBe(targetId);
    expect(useStore.getState().renderProgress).toEqual(before.renderProgress);
    expect(useStore.getState().longformPlans).toEqual(before.longformPlans);
  });

  it.each([
    'stale-scene',
    'foreign-scene',
    'missing-source',
    'mixed-route',
  ] as const)('disables unavailable review targets: %s', async (problem) => {
    seedLongformExport();
    useStore.setState((state) => {
      if (problem === 'missing-source') state.sources = [];
      if (problem === 'mixed-route') state.clips[SOURCE.id] = CLIPS;
      if (problem === 'stale-scene' || problem === 'foreign-scene') {
        const result = state.longformPlans[SOURCE.id]?.reconciliation?.sceneResults?.[1];
        if (!result) throw new Error('Missing fixture scene result');
        result.id = 'foreign-target';
      }
      if (problem === 'foreign-scene') {
        state.sources.push({ ...SOURCE, id: 'other' });
        const plan = makeScenePlan();
        const scene = plan.scenes[1];
        if (!scene) throw new Error('Missing fixture scene');
        scene.id = 'foreign-target';
        state.longformPlans.other = { plan, skin: 'editorial', paletteId: 'brand' };
      }
    });
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);
    const buttons = screen.getAllByRole('button', { name: /Review Statement at 1:40/ });
    const button = buttons.find((candidate) => candidate.hasAttribute('disabled'));
    if (!button) throw new Error('Unavailable review target was not disabled');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      'This scene or its source is no longer available for review.',
    );
    fireEvent.click(button);
    expect(useStore.getState().longformReviewFocus).toBeNull();
    expect(useStore.getState().pipeline.stage).toBe('done');
    expect(useStore.getState().renderProgress[0]?.outputPath).toBe('/output/full.mp4');
  });

  it.each([
    'rendering',
    'processing',
    'single',
    'cancelling',
  ] as const)('disables scene review during %s work', async (work) => {
    seedLongformExport();
    useStore.setState((state) => {
      if (work === 'rendering') state.isRendering = true;
      if (work === 'processing') state.pipeline.stage = 'transcribing';
      if (work === 'single') state.singleRenderStatus = 'rendering';
      if (work === 'cancelling') state.renderCancellation.status = 'cancelling';
    });
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);
    const button = screen.getByRole('button', { name: /Review Statement at 1:40/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(useStore.getState().longformReviewFocus).toBeNull();
    expect(useStore.getState().renderProgress[0]?.outputPath).toBe('/output/full.mp4');
  });

  it('unlocks review only after cancellation settles and preserves the previous export', async () => {
    const { targetId } = seedLongformExport();
    useStore.getState().setIsRendering(true);
    useStore.getState().setPipeline({ stage: 'rendering', message: '', percent: 0 });
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);
    await waitFor(() => expect(window.api.checkMediaPaths).toHaveBeenCalled());
    const before = useStore.getState();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel now' }));
    expect(screen.getByRole('button', { name: /Review Statement at 1:40/ })).toBeDisabled();
    act(() => callbacks.onCancelled?.({ completed: 0, failed: 0, total: 1 }));
    const review = screen.getByRole('button', { name: /Review Statement at 1:40/ });
    expect(review).toBeEnabled();
    fireEvent.click(review);
    expect(useStore.getState().longformReviewFocus).toEqual({
      sourceId: SOURCE.id,
      sceneId: targetId,
    });
    expect(useStore.getState().longformPlans).toEqual(before.longformPlans);
    expect(useStore.getState().renderProgress).toEqual(before.renderProgress);
    expect(useStore.getState().renderCancellation.status).toBe('idle');
  });

  it('reports a refused real-store navigation if work starts between paint and activation', async () => {
    seedLongformExport();
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);
    const button = screen.getByRole('button', { name: /Review Statement at 1:40/ });
    act(() => {
      useStore.setState({ singleRenderStatus: 'rendering' });
      fireEvent.click(button);
    });
    expect(useStore.getState().longformReviewFocus).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('work is still running'));
    expect(useStore.getState().longformPlans[SOURCE.id]?.status).toBe('accepted');
    expect(useStore.getState().renderProgress[0]?.outputPath).toBe('/output/full.mp4');
  });

  it('separates ready files, completed-with-changes files, and encoding failures in a mixed batch', async () => {
    useStore.getState().setRenderProgress([
      {
        clipId: 'c1',
        sourceId: SOURCE.id,
        status: 'done',
        percent: 100,
        outputPath: '/output/c1.mp4',
      },
      {
        clipId: 'c2',
        sourceId: SOURCE.id,
        status: 'done',
        percent: 100,
        outputPath: '/output/c2.mp4',
        fallbacks: [
          {
            id: 'f',
            reason: 'No visual asset',
            message: 'Source footage used',
            actionable: true,
            timestamp: 1,
          },
        ],
      },
      { clipId: 'c3', sourceId: SOURCE.id, status: 'error', percent: 0 },
    ]);
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 files ready · 1 with changes · 1 failed',
    );
    expect(screen.getByText('File ready')).toBeInTheDocument();
    expect(screen.getByText('Completed with changes')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /reveal in finder/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('preserves completed short-form outputs when navigating back to clips', async () => {
    useStore.getState().setRenderProgress([
      {
        clipId: 'c1',
        status: 'done',
        percent: 100,
        outputPath: '/output/c1.mp4',
        checkpoints: ['output-verified'],
      },
    ]);
    const { RenderScreen } = await import('@/components/screens/RenderScreen');
    render(<RenderScreen />);
    await waitFor(() => expect(window.api.checkMediaPaths).toHaveBeenCalled());
    const before = useStore.getState().renderProgress;
    fireEvent.click(screen.getByRole('button', { name: 'Back to Clips' }));
    expect(useStore.getState().renderProgress).toEqual(before);
    expect(useStore.getState().pipeline.stage).toBe('ready');
  });
});
