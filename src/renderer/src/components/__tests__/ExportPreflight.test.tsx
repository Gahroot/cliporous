import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportPreflight } from '@/components/ExportPreflight';
import { prepareApprovedRender } from '@/services/render-service';
import { useStore } from '@/store';
import type { ClipCandidate, RenderProgress, StitchedClipCandidate } from '@/store/types';
import { deferred } from './longform-scene-fixture';
import { installApiStub, resetStore } from './test-utils';

const source = {
  id: 'source',
  path: '/video.mp4',
  name: 'Video',
  duration: 600,
  width: 3840,
  height: 2160,
  origin: 'file' as const,
};
const clip = (id: string, status: ClipCandidate['status'], duration = 30): ClipCandidate => ({
  id,
  sourceId: source.id,
  status,
  duration,
  startTime: 0,
  endTime: duration,
  hookText: id,
  text: 'Source words',
  reasoning: '',
  score: 90,
});
const clips = [
  clip('approved', 'approved'),
  clip('pending', 'pending', 20),
  clip('rejected', 'rejected', 10),
];
const story: StitchedClipCandidate = {
  id: 'story',
  sourceId: source.id,
  status: 'approved',
  duration: 40,
  hookText: 'Story',
  score: 90,
  reasoning: '',
  text: 'A stitched story',
  sourceRanges: [
    { startTime: 0, endTime: 20, role: 'hook' },
    { startTime: 40, endTime: 60, role: 'main-payoff' },
  ],
};

beforeEach(() => {
  resetStore();
  installApiStub();
  const settings = useStore.getInitialState().settings;
  useStore.setState({
    settings: {
      ...settings,
      outputDirectory: '/exports',
      broll: { ...settings.broll, enabled: false },
      geminiApiKey: '',
      pexelsApiKey: '',
    },
  });
  const state = useStore.getState();
  state.addSource(source);
  state.setActiveSource(source.id);
  state.setClips(source.id, clips);
  state.setStitchedClips(source.id, [story]);
});
afterEach(async () => {
  await act(async () => {});
  cleanup();
});

function show(
  queue: readonly RenderProgress[] = useStore.getState().renderProgress,
  outputMode: 'short' | 'longform' = 'short',
) {
  const onStart = vi.fn();
  const view = render(
    <ExportPreflight
      queue={queue}
      sourceId={source.id}
      sourcePaths={[source.path]}
      outputMode={outputMode}
      onStart={onStart}
    />,
  );
  return { ...view, onStart };
}

async function ready(count: number) {
  const button = await screen.findByRole('button', {
    name: `Start ${count} ${count === 1 ? 'export' : 'exports'}`,
  });
  await screen.findByRole('button', { name: 'Check again' });
  return button;
}

describe('ExportPreflight', () => {
  it.each([
    {
      scope: 'approved',
      ids: undefined,
      count: 2,
      review: '2 approved · 0 unreviewed · 0 rejected · 1 stitched story',
    },
    {
      scope: 'selected',
      ids: ['pending', 'story'],
      count: 2,
      review: '1 approved · 1 unreviewed · 0 rejected · 1 stitched story',
    },
    {
      scope: 'all',
      ids: ['approved', 'pending', 'rejected', 'story'],
      count: 4,
      review: '2 approved · 1 unreviewed · 1 rejected · 1 stitched story',
    },
  ])('shows actual $scope scope from the real prepared queue', async ({ ids, count, review }) => {
    await prepareApprovedRender(ids ? { clipIds: ids } : {});
    const { onStart } = show();
    const button = await ready(count);
    const scope = screen.getByRole('region', { name: 'Export scope' });
    expect(scope).toHaveTextContent(`${count} queued clips · ${count} files`);
    expect(scope).toHaveTextContent(review);
    expect(scope).toHaveTextContent('1080×1920 · 9:16 · 30 fps');
    expect(scope).toHaveTextContent('Destination: /exports');
    expect(button).toBeEnabled();
    await act(async () => fireEvent.click(button));
    expect(onStart).toHaveBeenCalledOnce();
    expect(window.api.startBatchRender).not.toHaveBeenCalled();
  });

  it('does not count done, failed, or cancelled items in the next export or its duration', async () => {
    const queue: RenderProgress[] = [
      { clipId: 'pending', sourceId: source.id, status: 'queued', percent: 0, durationSeconds: 20 },
      ...(['done', 'error', 'cancelled'] as const).map((status) => ({
        clipId: status,
        status,
        percent: 100,
        durationSeconds: 600,
      })),
    ];
    show(queue);
    expect(await ready(1)).toBeEnabled();
    expect(screen.getByRole('region', { name: 'Export scope' })).toHaveTextContent(
      '1 queued clip · 1 file',
    );
    expect(screen.getByText('1 job · 0:20')).toBeInTheDocument();
    expect(screen.getByText('Estimated time')).toBeInTheDocument();
    expect(screen.getByText('Free space')).toBeInTheDocument();
  });

  it('shows one whole-video file, fixed landscape format, and the resolved default destination', async () => {
    useStore.setState((state) => {
      state.settings.outputDirectory = null;
    });
    show(
      [{ clipId: source.id, kind: 'longform', status: 'queued', percent: 0, durationSeconds: 600 }],
      'longform',
    );
    expect(await ready(1)).toBeEnabled();
    const scope = screen.getByRole('region', { name: 'Export scope' });
    expect(scope).toHaveTextContent('1 full-length video · 1 file');
    expect(scope).toHaveTextContent('1920×1080 · 16:9 · 30 fps');
    expect(scope).toHaveTextContent('/default/output/BatchClip');
    expect(within(scope).queryByText(/unreviewed/)).not.toBeInTheDocument();
  });

  it.each([
    'disk',
    'source',
    'destination',
  ] as const)('retains the %s blocking gate', async (gate) => {
    if (gate === 'disk')
      vi.mocked(window.api.getDiskSpace).mockResolvedValue({ free: 0, total: 100 });
    if (gate === 'source')
      vi.mocked(window.api.checkMediaPaths).mockResolvedValue([
        { path: source.path, available: false },
      ]);
    if (gate === 'destination')
      vi.mocked(window.api.getDiskSpace).mockRejectedValue(new Error('Unavailable'));
    await prepareApprovedRender();
    const { onStart } = show();
    expect(await ready(2)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start 2 exports' }));
    expect(onStart).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        gate === 'disk'
          ? 'More free space is required'
          : gate === 'source'
            ? 'Source media is offline'
            : 'Destination is unavailable',
      ),
    ).toBeInTheDocument();
  });

  it('keeps missing-key fallback warnings visible without turning them into new blockers', async () => {
    useStore.setState((state) => {
      state.settings.broll.enabled = true;
    });
    show([{ clipId: 'approved', status: 'queued', percent: 0, requiresVisualAssets: true }]);
    expect(await ready(1)).toBeEnabled();
    expect(screen.getByText('Stock B-roll will be omitted')).toBeInTheDocument();
    expect(screen.getByText('Image moments may use the speaker shot')).toBeInTheDocument();
  });

  it('keeps export disabled without a source or queued files', async () => {
    render(
      <ExportPreflight
        queue={[]}
        sourceId={null}
        sourcePaths={[]}
        outputMode="short"
        onStart={vi.fn()}
      />,
    );
    expect(await ready(0)).toBeDisabled();
    expect(screen.getByText(/Source media is unavailable/)).toBeInTheDocument();
  });

  it('ignores an old successful check after the destination changes and the new check blocks', async () => {
    const stale = deferred<{ free: number; total: number }>();
    vi.mocked(window.api.getDiskSpace)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue({ free: 0, total: 100 });
    show([{ clipId: 'approved', status: 'queued', percent: 0 }]);
    act(() => useStore.getState().setOutputDirectory('/full-disk'));
    expect(await ready(1)).toBeDisabled();
    await act(async () => stale.resolve({ free: 100 * 1024 ** 3, total: 100 * 1024 ** 3 }));
    expect(screen.getByRole('button', { name: 'Start 1 export' })).toBeDisabled();
    expect(screen.getByText('More free space is required')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Export scope' })).toHaveTextContent(
      'Destination: /full-disk',
    );
  });
});
