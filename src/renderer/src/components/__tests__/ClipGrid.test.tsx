/**
 * ClipGrid.test.tsx
 *
 * - Renders one ClipCard per ClipCandidate from a fixture set seeded into
 *   the store via setActiveSource + setClips.
 * - Clicking a card opens the ClipDetail Sheet — verified by the SheetTitle
 *   showing the clip's hook text.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DISPLAY_PREFERENCES, setDisplayPreferences } from '@/services/display-preferences';
import { useStore } from '@/store';
import type { ClipCandidate, SourceVideo, StitchedClipCandidate } from '@/store/types';
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

const startApprovedRender = vi.fn(async (_options?: { clipIds?: readonly string[] }) => ({
  started: true,
}));
vi.mock('@/services/render-service', () => ({
  prepareApprovedRender: (options?: { clipIds?: readonly string[] }) =>
    startApprovedRender(options),
}));
const processVideo = vi.fn(async (_source: SourceVideo, _resumeFrom?: string) => {});
vi.mock('@/hooks/usePipeline', () => ({
  usePipeline: () => ({ processVideo }),
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

function makeClip(overrides: Partial<ClipCandidate> & { id: string }): ClipCandidate {
  return {
    sourceId: SOURCE.id,
    startTime: 0,
    endTime: 30,
    duration: 30,
    text: 'sample text',
    score: 80,
    hookText: `Hook ${overrides.id}`,
    reasoning: 'because',
    status: 'pending',
    ...overrides,
  };
}

const CLIPS: ClipCandidate[] = [
  makeClip({ id: 'c1', score: 90, hookText: 'First hook line' }),
  makeClip({ id: 'c2', score: 80, hookText: 'Second hook line' }),
  makeClip({ id: 'c3', score: 70, hookText: 'Third hook line' }),
  makeClip({ id: 'c4', score: 60, hookText: 'Fourth hook line' }),
];

function makeStitched(id: string, status: ClipCandidate['status']): StitchedClipCandidate {
  return {
    id,
    sourceId: SOURCE.id,
    sourceRanges: [
      { startTime: 100, endTime: 104, role: 'hook' },
      { startTime: 130, endTime: 136, role: 'main-payoff' },
    ],
    duration: 10,
    text: 'A stitched story with a payoff.',
    score: 86,
    hookText: `Stitched ${id}`,
    reasoning: 'Connects an opening with a later payoff.',
    status,
  };
}

const BUSY_STATES = [
  {
    name: 'processing',
    apply: () => useStore.getState().setPipeline({ stage: 'scoring', percent: 0, message: '' }),
  },
  {
    name: 'export preparation',
    apply: () => useStore.getState().setPipeline({ stage: 'rendering', percent: 0, message: '' }),
  },
  { name: 'rendering', apply: () => useStore.getState().setIsRendering(true) },
  {
    name: 'processing cancellation',
    apply: () =>
      useStore.setState((state) => ({
        processingCancellation: { ...state.processingCancellation, status: 'cancelling' },
      })),
  },
  {
    name: 'render cancellation',
    apply: () =>
      useStore.setState((state) => ({
        renderCancellation: { ...state.renderCancellation, status: 'cancelling' },
      })),
  },
];

function pressKey(target: Window | Element, value: string, init: KeyboardEventInit = {}): void {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'key', { value });
  fireEvent(target, event);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  startApprovedRender.mockReset().mockResolvedValue({ started: true });
  processVideo.mockReset().mockResolvedValue(undefined);
  resetStore();
  installApiStub();
  setDisplayPreferences({ ...DEFAULT_DISPLAY_PREFERENCES });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      media: '(min-width: 1280px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  const store = useStore.getState();
  store.addSource(SOURCE);
  store.setActiveSource(SOURCE.id);
  store.setClips(SOURCE.id, CLIPS);
  store.setTranscription(SOURCE.id, {
    text: 'Great stories start with tension and finish with a useful result.',
    formattedForAI: '[0:10] Great stories start with tension and finish with a useful result.',
    words: [
      { text: 'Great', start: 10, end: 10.4 },
      { text: 'stories', start: 10.5, end: 11 },
      { text: 'start', start: 11.1, end: 11.5 },
      { text: 'with', start: 11.6, end: 11.9 },
      { text: 'tension', start: 12, end: 12.6 },
      { text: 'and', start: 12.7, end: 12.9 },
      { text: 'finish', start: 13, end: 13.4 },
      { text: 'with', start: 13.5, end: 13.8 },
      { text: 'a', start: 13.9, end: 14 },
      { text: 'useful', start: 14.1, end: 14.5 },
      { text: 'result.', start: 14.6, end: 15.2 },
    ],
    segments: [
      {
        text: 'Great stories start with tension and finish with a useful result.',
        start: 10,
        end: 15.2,
      },
    ],
  });
  // Force `pipeline.stage` to 'ready' so the loading skeleton doesn't show.
  store.setPipeline({ stage: 'ready', message: '', percent: 0 });
});

afterEach(() => {
  cleanup();
  startApprovedRender.mockClear();
  vi.mocked(toast).mockClear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClipGrid', () => {
  it('renders one card per clip in the fixture set', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    // Each ClipCard is a role="button" with an aria-label that begins
    // with "Clip:". Score markup ensures they don't collide with footer
    // pills (which have their own aria-labels).
    const cards = screen.getAllByRole('button', { name: /^Clip:/ });
    expect(cards).toHaveLength(CLIPS.length);

    // Hook text from each fixture clip is present on the page.
    for (const clip of CLIPS) {
      expect(screen.getByText(clip.hookText)).toBeInTheDocument();
    }

    // The clip-count label reflects the fixture size.
    expect(screen.getByText(`${CLIPS.length} clips`)).toBeInTheDocument();
  });

  it('confirms rejected clips before Render All and preserves every review decision', async () => {
    useStore.getState().updateClipStatus(SOURCE.id, 'c3', 'rejected');

    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    fireEvent.click(screen.getByRole('button', { name: /^Prepare 4 clips for export$/ }));

    expect(startApprovedRender).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Prepare all 4 clips for export\?/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /3 unreviewed and 1 rejected included.*review decisions will not change/i,
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Prepare 4 clips for export$/ }));
    await waitFor(() => {
      expect(startApprovedRender).toHaveBeenCalledWith({
        clipIds: ['c1', 'c2', 'c3', 'c4'],
      });
      expect(screen.getByRole('button', { name: /^Prepare 4 clips for export$/ })).toBeEnabled();
    });
    expect(useStore.getState().clips[SOURCE.id]?.map((clip) => clip.status)).toEqual([
      'pending',
      'pending',
      'rejected',
      'pending',
    ]);
  });

  it('cancelling the Render All confirmation preserves rejected status and renders nothing', async () => {
    useStore.getState().updateClipStatus(SOURCE.id, 'c3', 'rejected');

    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    fireEvent.click(screen.getByRole('button', { name: /^Prepare 4 clips for export$/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/ }));

    expect(startApprovedRender).not.toHaveBeenCalled();
    const c3 = useStore.getState().clips[SOURCE.id]?.find((c) => c.id === 'c3');
    expect(c3?.status).toBe('rejected');
  });

  it('renders directly without confirmation when no clip is rejected', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    fireEvent.click(screen.getByRole('button', { name: /^Prepare 4 clips for export$/ }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(startApprovedRender).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /^Prepare 4 clips for export$/ })).toBeEnabled();
    });
  });

  it('shows the cold-start empty state when no source has been processed', async () => {
    // Tear down the seeded source/clips: a fresh app with nothing run yet.
    resetStore();
    installApiStub();
    useStore.getState().setPipeline({ stage: 'idle', message: '', percent: 0 });

    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    expect(screen.getByText('No clips yet')).toBeInTheDocument();
    expect(screen.getByText(/Drop a video on the start screen/)).toBeInTheDocument();
  });

  it('shows an actionable empty state when a completed run yields zero clips', async () => {
    // Source processed to completion ('ready') but scoring produced no clips.
    useStore.getState().setClips(SOURCE.id, []);
    useStore.getState().setPipeline({ stage: 'ready', message: '', percent: 100 });

    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    expect(screen.getByText('No clips passed scoring')).toBeInTheDocument();
    expect(screen.getByText(/lowering the minimum score in/i)).toBeInTheDocument();
    // Must NOT show the misleading cold-start prompt.
    expect(screen.queryByText('No clips yet')).not.toBeInTheDocument();
  });

  it.each([
    'all',
    'approved',
    'selected',
  ] as const)('prepares the exact %s export scope across hidden selections and both clip kinds', async (scope) => {
    const service = await vi.importActual<typeof import('@/services/render-service')>(
      '@/services/render-service',
    );
    startApprovedRender.mockImplementation(service.prepareApprovedRender);
    const store = useStore.getState();
    store.updateClipStatus(SOURCE.id, 'c1', 'approved');
    store.updateClipStatus(SOURCE.id, 'c3', 'rejected');
    store.setStitchedClips(SOURCE.id, [
      makeStitched('s1', 'approved'),
      makeStitched('s2', 'rejected'),
      makeStitched('s3', 'pending'),
    ]);
    const before = useStore.getState();
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    expect(screen.getByText('3 left to review')).toBeInTheDocument();
    expect(
      screen.getByText('AI scores are suggestions. You decide what to export.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Prepare 7 clips for export' }),
    ).toHaveAccessibleDescription('All clips · 3 unreviewed · 2 rejected');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Second hook line/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Stitched s2/ }));
    expect(screen.queryByRole('button', { name: 'Compare' })).not.toBeInTheDocument();
    act(() => store.setWorkspaceFilter('approved'));
    expect(
      screen.getByText(/Selection is not approval\. 2 hidden by the current filter/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select visible (2)' })).toBeEnabled();
    expect(Array.from(useStore.getState().selectedClipIds)).toEqual(['c2', 's2']);

    const buttonName =
      scope === 'all'
        ? 'Prepare 7 clips for export'
        : scope === 'approved'
          ? 'Prepare 2 approved clips for export'
          : 'Export selected (2)';
    fireEvent.click(screen.getByRole('button', { name: buttonName }));
    if (scope !== 'approved') {
      const dialog = await screen.findByRole('alertdialog');
      expect(startApprovedRender).not.toHaveBeenCalled();
      expect(
        within(dialog).getByText(
          scope === 'all'
            ? /3 unreviewed and 2 rejected included/
            : /1 unreviewed and 1 rejected included\. 2 hidden by the current filter/,
        ),
      ).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: buttonName }));
    }
    const expectedIds =
      scope === 'all'
        ? ['c1', 'c2', 'c3', 'c4', 's1', 's2', 's3']
        : scope === 'approved'
          ? ['c1', 's1']
          : ['c2', 's2'];
    await waitFor(() =>
      expect(useStore.getState().renderProgress.map((item) => item.clipId)).toEqual(expectedIds),
    );
    expect(startApprovedRender).toHaveBeenCalledTimes(1);
    expect(useStore.getState().clips[SOURCE.id]).toEqual(before.clips[SOURCE.id]);
    expect(useStore.getState().stitchedClips[SOURCE.id]).toEqual(before.stitchedClips[SOURCE.id]);
    expect(window.api.startBatchRender).not.toHaveBeenCalled();
  });

  it('reprocesses zero results only after explicit confirmation without resetting source or transcript', async () => {
    const store = useStore.getState();
    store.setClips(SOURCE.id, []);
    const before = useStore.getState();
    let finish: () => void = () => {};
    processVideo.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    expect(processVideo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Transcript' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(window.api.openSettingsWindow).toHaveBeenCalledTimes(1);
    expect(processVideo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reprocess with current settings' }));
    let dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/uses AI and may incur usage costs/)).toBeInTheDocument();
    expect(processVideo).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(processVideo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reprocess with current settings' }));
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reprocess now' }));
    expect(processVideo).toHaveBeenCalledExactlyOnceWith(SOURCE, 'scoring');
    const retry = screen.getByRole('button', { name: 'Reprocess with current settings' });
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(processVideo).toHaveBeenCalledTimes(1);
    expect(useStore.getState().sources).toEqual(before.sources);
    expect(useStore.getState().transcriptions).toEqual(before.transcriptions);
    expect(useStore.getState().clips[SOURCE.id]).toEqual([]);
    await act(async () => finish());
    expect(retry).toBeEnabled();
  });

  it.each(BUSY_STATES)('refuses a pending retry confirmation during $name', async ({ apply }) => {
    useStore.getState().setClips(SOURCE.id, []);
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);
    fireEvent.click(screen.getByRole('button', { name: 'Reprocess with current settings' }));
    const dialog = await screen.findByRole('alertdialog');
    act(apply);
    const confirm = within(dialog).getByRole('button', { name: 'Reprocess now' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(processVideo).not.toHaveBeenCalled();
  });

  it.each(BUSY_STATES)('guards export buttons, confirmation and R during $name', async ({
    apply,
  }) => {
    useStore.getState().updateClipStatus(SOURCE.id, 'c1', 'approved');
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Second hook line/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Export selected (1)' }));
    const dialog = await screen.findByRole('alertdialog');
    act(apply);
    const confirm = within(dialog).getByRole('button', { name: 'Export selected (1)' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(startApprovedRender).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    for (const name of [
      'Prepare 4 clips for export',
      'Prepare 1 approved clip for export',
      'Export selected (1)',
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    pressKey(window, 'r');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(startApprovedRender).not.toHaveBeenCalled();
  });

  it('suppresses triage, selection, export and undo while the display menu owns the keyboard', async () => {
    setDisplayPreferences({ reviewAutoAdvance: false });
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);
    pressKey(window, 'ArrowRight');
    pressKey(window, 'a');
    expect(useStore.getState().clips[SOURCE.id]?.[0]?.status).toBe('approved');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select First hook line/ }));
    const trigger = screen.getByRole('button', { name: 'View options' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const option = await screen.findByRole('menuitemradio', { name: 'Source time' });
    for (const key of ['a', 'x', 'u', 's', 'r', 'ArrowRight']) pressKey(option, key);
    pressKey(option, 'a', { ctrlKey: true });
    pressKey(option, 'z', { ctrlKey: true });
    pressKey(window, 'r');
    expect(useStore.getState().clips[SOURCE.id]?.[0]?.status).toBe('approved');
    expect(useStore.getState().workspace.selectedClipId).toBe('c1');
    expect(Array.from(useStore.getState().selectedClipIds)).toEqual(['c1']);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(startApprovedRender).not.toHaveBeenCalled();
    fireEvent.click(option);
    expect(useStore.getState().workspace.clipSort).toBe('source-time');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    pressKey(window, 'z', { ctrlKey: true });
    expect(useStore.getState().clips[SOURCE.id]?.[0]?.status).toBe('pending');
  });

  it('opens the ClipDetail Sheet when a card is clicked', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    // Clicking the first card opens the Sheet for that clip. Cards are
    // sorted by score desc, so c1 (score 90) is first.
    const firstCard = screen.getByRole('button', { name: /First hook line/ });
    fireEvent.click(firstCard);

    // Sheet renders a dialog whose title is the clip's hookText.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // The hook text appears multiple times inside the dialog now (the
    // SheetTitle plus the framing-overlay hook pill), so assert presence via
    // getAllByText rather than the uniqueness-enforcing getByText.
    expect(within(dialog).getAllByText('First hook line').length).toBeGreaterThanOrEqual(1);
  });

  it('filters clips, announces the active count, and distinguishes no results', async () => {
    const store = useStore.getState();
    store.updateClipStatus(SOURCE.id, 'c1', 'approved');
    store.updateClipStatus(SOURCE.id, 'c3', 'rejected');
    store.setWorkspaceFilter('rejected');

    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    expect(screen.getAllByRole('button', { name: /^Clip:/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Third hook line/ })).toBeInTheDocument();
    expect(screen.getByText('1 result · 4 total')).toBeInTheDocument();

    act(() => useStore.getState().setWorkspaceFilter('stitched'));
    expect(screen.getByText('No clips match this filter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all clips' })).toBeInTheDocument();
  });

  it('sorts by source time and status with deterministic review order', async () => {
    const sourceOrdered = [
      makeClip({ id: 'c1', startTime: 90, endTime: 100, duration: 10, status: 'approved' }),
      makeClip({ id: 'c2', startTime: 10, endTime: 50, duration: 40, status: 'pending' }),
      makeClip({ id: 'c3', startTime: 60, endTime: 80, duration: 20, status: 'rejected' }),
      makeClip({ id: 'c4', startTime: 30, endTime: 45, duration: 15, status: 'pending' }),
    ];
    useStore.getState().setClips(SOURCE.id, sourceOrdered);
    useStore.getState().setWorkspaceSort('source-time');

    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    expect(screen.getAllByRole('button', { name: /^Clip:/ })[0]).toHaveAccessibleName(/Hook c2/);
    expect(screen.getAllByRole('button', { name: /^Clip:/ })[3]).toHaveAccessibleName(/Hook c1/);

    act(() => useStore.getState().setWorkspaceSort('status'));
    const statusSorted = screen.getAllByRole('button', { name: /^Clip:/ });
    expect(statusSorted[0]).toHaveAccessibleName(/Hook c2/);
    expect(statusSorted[1]).toHaveAccessibleName(/Hook c4/);
    expect(statusSorted[2]).toHaveAccessibleName(/Hook c1/);
    expect(statusSorted[3]).toHaveAccessibleName(/Hook c3/);
  });

  it('triages with the keyboard, auto-advances, and offers one-click undo', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    pressKey(window, 'ArrowRight');
    expect(useStore.getState().workspace.selectedClipId).toBe('c1');

    pressKey(window, 'a');
    expect(useStore.getState().clips[SOURCE.id]?.find((clip) => clip.id === 'c1')?.status).toBe(
      'approved',
    );
    expect(useStore.getState().workspace.selectedClipId).toBe('c2');

    const feedback = vi
      .mocked(toast)
      .mock.calls.find(([message]) => String(message).startsWith('Clip approved'));
    expect(feedback?.[1]).toMatchObject({
      id: 'review-decision',
      action: { label: 'Undo' },
    });
    const action = feedback?.[1]?.action as { onClick: (event: unknown) => void };
    act(() => action.onClick({}));
    expect(useStore.getState().clips[SOURCE.id]?.find((clip) => clip.id === 'c1')?.status).toBe(
      'pending',
    );

    pressKey(window, 'x');
    expect(useStore.getState().clips[SOURCE.id]?.find((clip) => clip.id === 'c1')?.status).toBe(
      'rejected',
    );
    pressKey(window, 'z', { ctrlKey: true });
    expect(useStore.getState().clips[SOURCE.id]?.find((clip) => clip.id === 'c1')?.status).toBe(
      'pending',
    );
  });

  it('keeps shortcuts out of text editing and confirms keyboard rendering explicitly', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    const filter = screen.getByRole('combobox', { name: 'Filter clips' });
    filter.focus();
    pressKey(filter, 'ArrowRight');
    expect(useStore.getState().workspace.selectedClipId).toBeNull();
    filter.blur();

    pressKey(window, 'ArrowRight');
    pressKey(window, 'Enter');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('1 of 4')).toBeInTheDocument();

    const loopButton = within(dialog).getByRole('button', { name: 'Loop selection' });
    const hookInput = within(dialog).getByLabelText('Hook text');
    hookInput.focus();
    pressKey(hookInput, 'l');
    expect(loopButton).toHaveAttribute('aria-pressed', 'false');
    pressKey(hookInput, 'x');
    expect(useStore.getState().clips[SOURCE.id]?.find((clip) => clip.id === 'c1')?.status).toBe(
      'pending',
    );

    hookInput.blur();
    pressKey(window, 'l');
    expect(loopButton).toHaveAttribute('aria-pressed', 'true');
    pressKey(dialog, 'ArrowRight');
    expect(useStore.getState().workspace.selectedClipId).toBe('c2');
    expect(within(dialog).getByText('2 of 4')).toBeInTheDocument();

    pressKey(window, 'r');
    const renderDialog = await screen.findByRole('alertdialog');
    expect(
      within(renderDialog).getByText('Prepare 1 selected clip for export?'),
    ).toBeInTheDocument();
    expect(startApprovedRender).not.toHaveBeenCalled();

    pressKey(renderDialog, 'a');
    expect(useStore.getState().clips[SOURCE.id]?.find((clip) => clip.id === 'c2')?.status).toBe(
      'pending',
    );
    fireEvent.click(within(renderDialog).getByRole('button', { name: 'Export selected (1)' }));
    await waitFor(() => expect(startApprovedRender).toHaveBeenCalledWith({ clipIds: ['c2'] }));
  });

  it('routes keyboard undo to the latest inspector edit', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    pressKey(window, 'ArrowRight');
    pressKey(window, 'Enter');
    const dialog = await screen.findByRole('dialog');
    const hookInput = within(dialog).getByLabelText('Hook text');
    fireEvent.change(hookInput, { target: { value: 'Edited from the inspector' } });
    fireEvent.blur(hookInput);
    expect(useStore.getState().clips[SOURCE.id]?.[0]?.hookText).toBe('Edited from the inspector');

    pressKey(window, 'z', { ctrlKey: true });
    expect(useStore.getState().clips[SOURCE.id]?.[0]?.hookText).toBe('First hook line');
  });

  it('lets creators turn auto-advance off', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    fireEvent.click(screen.getByRole('button', { name: 'Auto-advance on' }));
    expect(screen.getByRole('button', { name: 'Auto-advance off' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    pressKey(window, 'ArrowRight');
    pressKey(window, 'a');

    expect(useStore.getState().workspace.selectedClipId).toBe('c1');
    expect(useStore.getState().clips[SOURCE.id]?.find((clip) => clip.id === 'c1')?.status).toBe(
      'approved',
    );
  });

  it('recomposes wide review into a persistent master-detail inspector', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: true,
        media: '(min-width: 1280px)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    const inspector = await screen.findByRole('complementary');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(inspector).getAllByText('First hook line').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Clip:/ })).toHaveLength(4);

    fireEvent.click(within(inspector).getByRole('button', { name: 'Next clip' }));
    expect(within(inspector).getAllByText('Second hook line').length).toBeGreaterThan(0);
    expect(within(inspector).getByText('2 of 4')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Clip:/ })).toHaveLength(4);
  });

  it('searches the full transcript, jumps source time, and creates an unscored candidate', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }));
    const dialog = await screen.findByRole('dialog', { name: 'Search source transcript' });
    fireEvent.change(within(dialog).getByLabelText('Words or phrase'), {
      target: { value: 'stories start' },
    });

    expect(within(dialog).getByText('1 match')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Jump' }));
    expect(within(dialog).getByText('Source player moved to 0:10.5.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use result' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create candidate' }));

    const created = useStore
      .getState()
      .clips[SOURCE.id]?.find((clip) => clip.id.startsWith('transcript-'));
    expect(created).toMatchObject({
      startTime: 10.5,
      endTime: 11.5,
      score: 0,
      scoreSource: 'manual',
      status: 'pending',
      text: 'stories start',
    });
    expect((await screen.findAllByText('Not scored')).length).toBeGreaterThan(0);
  });

  it('bulk-selects with card checkboxes, applies one undoable decision, and renders the count', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    const firstCheckbox = screen.getByRole('checkbox', { name: /Select First hook line/ });
    fireEvent.click(firstCheckbox.closest('label') as HTMLElement);
    expect(Array.from(useStore.getState().selectedClipIds)).toEqual(['c1']);
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Second hook line/ }));
    expect(screen.getByText('2 clips selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve (2)' }));
    expect(
      useStore
        .getState()
        .clips[SOURCE.id]?.slice(0, 2)
        .map((clip) => clip.status),
    ).toEqual(['approved', 'approved']);
    const feedback = vi
      .mocked(toast)
      .mock.calls.find(([message]) => String(message) === '2 clips approved');
    expect(feedback?.[1]).toMatchObject({ action: { label: 'Undo' } });
    const undoAction = feedback?.[1]?.action as { onClick: (event: unknown) => void };
    act(() => undoAction.onClick({}));
    expect(
      useStore
        .getState()
        .clips[SOURCE.id]?.slice(0, 2)
        .map((clip) => clip.status),
    ).toEqual(['pending', 'pending']);

    fireEvent.click(screen.getByRole('button', { name: 'Export selected (2)' }));
    const renderDialog = await screen.findByRole('alertdialog');
    expect(
      within(renderDialog).getByText('Prepare 2 selected clips for export?'),
    ).toBeInTheDocument();
    fireEvent.click(within(renderDialog).getByRole('button', { name: 'Export selected (2)' }));
    await waitFor(() =>
      expect(startApprovedRender).toHaveBeenCalledWith({ clipIds: ['c1', 'c2'] }),
    );
  });

  it('compares exactly two selected clips with synchronized controls and full rationale', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select First hook line/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Second hook line/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));

    const dialog = await screen.findByRole('dialog', { name: 'Compare two candidates' });
    expect(within(dialog).getByText('Candidate A')).toBeInTheDocument();
    expect(within(dialog).getByText('Candidate B')).toBeInTheDocument();
    expect(within(dialog).getAllByText('because')).toHaveLength(2);
    expect(
      within(dialog).getByRole('button', { name: 'Play both candidates' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Synchronized comparison position')).toBeInTheDocument();
  });

  it('persists comfortable and compact density without hiding source time or action targets', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    expect(screen.queryByRole('combobox', { name: 'Grid density' })).not.toBeInTheDocument();
    const viewOptions = screen.getByRole('button', { name: 'View options' });
    fireEvent.keyDown(viewOptions, { key: 'ArrowDown' });
    expect(await screen.findByRole('menuitemradio', { name: 'Comfortable' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.getAllByRole('button', { name: /^Clip:/ })[0]).toHaveAttribute(
      'data-density',
      'comfortable',
    );
    expect(screen.getAllByRole('button', { name: /^Clip:/ })[0]).toHaveAccessibleName(
      /source 0:00.0/,
    );

    fireEvent.keyDown(viewOptions, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Compact' }));
    expect(screen.getAllByRole('button', { name: /^Clip:/ })[0]).toHaveAttribute(
      'data-density',
      'compact',
    );
    expect(screen.getAllByRole('button', { name: 'Approve clip' })[0]).toHaveClass('h-8');
  });

  it('applies one bulk decision across regular and stitched candidates', async () => {
    const stitched: StitchedClipCandidate = {
      id: 'stitched-1',
      sourceId: SOURCE.id,
      sourceRanges: [
        { startTime: 100, endTime: 104, role: 'hook' },
        { startTime: 130, endTime: 136, role: 'main-payoff' },
      ],
      duration: 10,
      text: 'A stitched story with a payoff.',
      score: 86,
      hookText: 'Stitched story',
      reasoning: 'Connects an opening with a later payoff.',
      status: 'pending',
    };
    useStore.getState().setStitchedClips(SOURCE.id, [stitched]);
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select First hook line/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Stitched story/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve (2)' }));

    expect(useStore.getState().clips[SOURCE.id]?.find((clip) => clip.id === 'c1')?.status).toBe(
      'approved',
    );
    expect(useStore.getState().stitchedClips[SOURCE.id]?.[0]?.status).toBe('approved');
    act(() => useStore.getState().undo());
    expect(useStore.getState().clips[SOURCE.id]?.find((clip) => clip.id === 'c1')?.status).toBe(
      'pending',
    );
    expect(useStore.getState().stitchedClips[SOURCE.id]?.[0]?.status).toBe('pending');
  });

  it('extends a bulk selection with Shift+Arrow and applies bulk shortcuts', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid');
    render(<ClipGrid />);

    pressKey(window, 'ArrowRight');
    pressKey(window, 's');
    pressKey(window, 'ArrowRight', { shiftKey: true });
    expect(Array.from(useStore.getState().selectedClipIds)).toEqual(['c1', 'c2']);

    pressKey(window, 'x');
    expect(
      useStore
        .getState()
        .clips[SOURCE.id]?.slice(0, 2)
        .map((clip) => clip.status),
    ).toEqual(['rejected', 'rejected']);
  });
});
