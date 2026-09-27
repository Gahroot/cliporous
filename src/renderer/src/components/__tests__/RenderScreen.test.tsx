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
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '@/store';
import type { ClipCandidate, SourceVideo } from '@/store/types';
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
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore();
  installRenderApi();

  const store = useStore.getState();
  store.addSource(SOURCE);
  store.setActiveSource(SOURCE.id);
  store.setClips(SOURCE.id, CLIPS);
  // Need an output directory so the Open Folder button can be enabled.
  store.setOutputDirectory('/output');
});

afterEach(() => {
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

    // Three "Done" badges are also visible — one per clip.
    expect(screen.getAllByText('Done')).toHaveLength(CLIPS.length);
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
    const row = screen.getByText('First clip').closest('div')!;
    expect(within(row.parentElement as HTMLElement).getByRole('progressbar')).toBeInTheDocument();
  });
});
