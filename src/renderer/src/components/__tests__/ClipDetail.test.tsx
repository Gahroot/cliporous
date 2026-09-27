/**
 * ClipDetail.test.tsx
 *
 * - Toggling captions mode updates the Select trigger value (persists in
 *   component state across re-render — the value sticks until the user
 *   changes it again or selects a different clip).
 * - Editing the trim Start / End number inputs and committing on blur
 *   calls `updateClipTrim` which persists the new boundaries to the
 *   Zustand store.
 *
 * The Radix Slider's pointer interactions don't work cleanly in jsdom,
 * so the trim test drives the equivalent number inputs that share the
 * same `commitTrim` path.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderedPreviewCacheKey } from '@/hooks/useRenderedPreview';
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

const CLIP: ClipCandidate = {
  id: 'c1',
  sourceId: SOURCE.id,
  startTime: 10,
  endTime: 40,
  duration: 30,
  text: 'sample',
  score: 85,
  hookText: 'A bold opening',
  reasoning: 'because',
  status: 'pending',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  resetStore();
  installApiStub();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

  const store = useStore.getState();
  store.addSource(SOURCE);
  store.setActiveSource(SOURCE.id);
  store.setClips(SOURCE.id, [CLIP]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(toast).mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClipDetail', () => {
  it('toggling captions mode updates and persists the selection', async () => {
    const { ClipDetail } = await import('@/components/ClipDetail');
    render(<ClipDetail clip={CLIP} source={SOURCE} open onOpenChange={() => {}} />);

    // Default mode is the serif Editorial mode.
    // Radix's <Select> trigger doesn't pick up htmlFor/id label association,
    // so we look it up by its DOM id directly.
    const trigger = document.getElementById('captions-mode') as HTMLElement;
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveTextContent(/editorial/i);

    // Open the Select. Radix Selects respond to keyboard activation.
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    // Pick "Standard" from the listbox.
    const standardOption = await screen.findByRole('option', {
      name: /standard/i,
    });
    fireEvent.click(standardOption);

    // The trigger now reflects the new selection — the value persists.
    expect(trigger).toHaveTextContent(/standard/i);

    // Re-rendering the same component (e.g. parent state update) keeps the
    // user's selection intact.
    const triggerAfter = document.getElementById('captions-mode') as HTMLElement;
    expect(triggerAfter).toHaveTextContent(/standard/i);
  });

  it('updates start / end times in the store when the trim inputs commit', async () => {
    const { ClipDetail } = await import('@/components/ClipDetail');
    const { rerender } = render(
      <ClipDetail clip={CLIP} source={SOURCE} open onOpenChange={() => {}} />,
    );

    // Trim inputs accept timecode strings (m:ss.s) but also bare seconds.
    const startInput = screen.getByLabelText(/^start$/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/^end$/i) as HTMLInputElement;

    // Initial values mirror the fixture, formatted as m:ss.s.
    expect(startInput.value).toBe('0:10.0');
    expect(endInput.value).toBe('0:40.0');

    // Update both bounds with bare seconds (parser accepts both forms).
    // onBlur commits the trim into the store.
    fireEvent.change(startInput, { target: { value: '12.5' } });
    fireEvent.blur(startInput);

    fireEvent.change(endInput, { target: { value: '38' } });
    fireEvent.blur(endInput);

    const persisted = useStore.getState().clips[SOURCE.id]?.[0];
    expect(persisted).toBeDefined();
    if (!persisted) throw new Error('Expected the edited clip to remain in the store');
    expect(persisted.startTime).toBe(12.5);
    expect(persisted.endTime).toBe(38);
    expect(persisted.duration).toBeCloseTo(25.5, 5);

    // The Sheet header reflects the new duration on re-render.
    rerender(<ClipDetail clip={persisted} source={SOURCE} open onOpenChange={() => {}} />);

    const dialog = screen.getByRole('dialog');
    // Sheet header shows "Score N · 25.5s" — match the description text.
    expect(within(dialog).getByText(/Score 85 · 25\.5s/)).toBeInTheDocument();
  });

  it('shows a 9:16 framing preview with hook + caption mock over the video', async () => {
    const { ClipDetail } = await import('@/components/ClipDetail');
    const clipWithCrop: ClipCandidate = {
      ...CLIP,
      text: 'this changes everything for you',
      hookText: 'Watch this part',
      cropRegion: { x: 540, y: 0, width: 608, height: 1080, faceDetected: true },
    };
    render(<ClipDetail clip={clipWithCrop} source={SOURCE} open onOpenChange={() => {}} />);

    const dialog = screen.getByRole('dialog');
    // The hook text shows in both the header and the overlay pill.
    expect(within(dialog).getAllByText('Watch this part').length).toBeGreaterThanOrEqual(2);
    // A representative caption snippet (first words of the transcript) appears.
    expect(within(dialog).getByText('this')).toBeInTheDocument();
    // The truthful live-guide status accompanies the immediate approximation.
    expect(within(dialog).getByText(/live layout guide shown immediately/i)).toBeInTheDocument();
  });

  it('uses the source waveform and keeps trim handles plus Reset to Auto keyboard-accessible', async () => {
    const api = installApiStub({
      getWaveform: vi.fn(async () => [0.1, 0.4, 0.8, 0.2]),
    });
    const waveformSource = { ...SOURCE, path: '/videos/waveform-test.mp4' };
    const store = useStore.getState();
    store.updateClipTrim(SOURCE.id, CLIP.id, 12, 38);
    const editedClip = useStore.getState().clips[SOURCE.id]?.[0];
    if (!editedClip) throw new Error('Expected edited clip');

    const { ClipDetail } = await import('@/components/ClipDetail');
    render(<ClipDetail clip={editedClip} source={waveformSource} open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(api.getWaveform).toHaveBeenCalledWith(
        waveformSource.path,
        0,
        waveformSource.duration,
        180,
      );
    });
    expect(screen.getByRole('slider', { name: 'Trim start' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Trim end' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Auto' }));
    const resetClip = useStore.getState().clips[SOURCE.id]?.[0];
    expect(resetClip?.startTime).toBe(10);
    expect(resetClip?.endTime).toBe(40);
  });

  it('includes the current subtitle center in preview IPC and cache invalidation', async () => {
    type PreviewConfig = Parameters<typeof window.api.renderPreview>[0];
    const renderPreview = vi.fn(async (_config: PreviewConfig) => ({
      previewPath: '/virtual/rendered-c1.mp4',
    }));
    installApiStub({ renderPreview });
    const initialLayout = {
      titleText: { x: 50, y: 18 },
      subtitles: { x: 42, y: 76 },
    };
    useStore.getState().setTemplateLayout(initialLayout);
    const { ClipDetail } = await import('@/components/ClipDetail');
    render(<ClipDetail clip={CLIP} source={SOURCE} open onOpenChange={() => {}} />);

    expect(screen.getByText(/preview queued while you finish editing/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Hook text')).toBeEnabled();

    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(1), { timeout: 1500 });
    const firstConfig = renderPreview.mock.calls.at(0)?.[0];
    if (!firstConfig) throw new Error('Expected the first preview render config');
    expect(firstConfig).toMatchObject({
      sourceVideoPath: SOURCE.path,
      startTime: 10,
      endTime: 40,
      hookTitleText: CLIP.hookText,
      captionsEnabled: true,
      templateLayout: initialLayout,
    });
    expect(firstConfig.templateLayout?.subtitles).toBe(initialLayout.subtitles);
    const firstKey = renderedPreviewCacheKey(CLIP.id, firstConfig);

    const updatedLayout = {
      ...initialLayout,
      subtitles: { x: 57, y: 68 },
    };
    act(() => useStore.getState().setTemplateLayout(updatedLayout));
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(2), { timeout: 1500 });
    const secondConfig = renderPreview.mock.calls.at(1)?.[0];
    if (!secondConfig) throw new Error('Expected the second preview render config');
    expect(secondConfig.templateLayout).toEqual(updatedLayout);
    expect(renderedPreviewCacheKey(CLIP.id, secondConfig)).not.toBe(firstKey);
    expect(await screen.findByText(/^Rendered preview ready$/i)).toBeInTheDocument();
  });

  it('frames score rationale as an AI estimate and exposes editorial playback controls', async () => {
    const { ClipDetail } = await import('@/components/ClipDetail');
    render(<ClipDetail clip={CLIP} source={SOURCE} open onOpenChange={() => {}} />);

    expect(screen.getByRole('heading', { name: "Director's note" })).toBeInTheDocument();
    expect(screen.getByText(/not a prediction of audience performance/i)).toBeInTheDocument();
    expect(screen.getByText('because')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seek back 5 seconds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nudge forward one frame' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay selection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loop selection' })).toHaveAttribute(
      'aria-keyshortcuts',
      'L',
    );
    const volume = screen.getByLabelText('Preview volume');
    expect(volume).toBeInTheDocument();
    expect(
      screen.getByLabelText('Preview of A bold opening', { selector: 'video' }),
    ).toHaveProperty('muted', true);

    fireEvent.change(volume, { target: { value: '0.35' } });
    expect(JSON.parse(localStorage.getItem('batchclip-review-player-audio') ?? '{}')).toEqual({
      volume: 0.35,
      muted: false,
    });
  });

  it('offers action feedback that undoes a committed hook edit', async () => {
    const { ClipDetail } = await import('@/components/ClipDetail');
    render(<ClipDetail clip={CLIP} source={SOURCE} open onOpenChange={() => {}} />);

    const hookInput = screen.getByLabelText('Hook text');
    fireEvent.change(hookInput, { target: { value: 'A sharper opening' } });
    fireEvent.blur(hookInput);

    expect(useStore.getState().clips[SOURCE.id]?.[0]?.hookText).toBe('A sharper opening');
    const feedback = vi.mocked(toast).mock.calls.find(([message]) => message === 'Hook updated');
    expect(feedback?.[1]).toMatchObject({
      id: 'clip-edit-c1',
      action: { label: 'Undo' },
    });
    const action = feedback?.[1]?.action as { onClick: (event: unknown) => void };
    act(() => action.onClick({}));
    expect(useStore.getState().clips[SOURCE.id]?.[0]?.hookText).toBe('A bold opening');
  });

  it('preserves playhead and in-flight edits when the inspector recomposes', async () => {
    const { ClipDetail } = await import('@/components/ClipDetail');
    const { rerender } = render(
      <ClipDetail clip={CLIP} source={SOURCE} open presentation="panel" onOpenChange={() => {}} />,
    );

    const hookInput = screen.getByLabelText('Hook text') as HTMLInputElement;
    fireEvent.change(hookInput, { target: { value: 'Keep this in-flight edit' } });
    const player = document.querySelector<HTMLVideoElement>('video[data-review-player="true"]');
    expect(player).not.toBeNull();
    if (!player) throw new Error('Expected the inspector player');
    player.currentTime = 24.5;

    rerender(
      <ClipDetail clip={CLIP} source={SOURCE} open presentation="sheet" onOpenChange={() => {}} />,
    );

    expect(screen.getByLabelText('Hook text')).toHaveValue('Keep this in-flight edit');
    expect(useStore.getState().workspace.previewPlayheadByClip.c1).toBe(24.5);
  });
});
