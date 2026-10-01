import type { LongformScenePreviewRequest } from '@shared/longform-scenes';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LongformScenePreview } from '@/components/LongformScenePreview';
import { deferred, makeScenePlan, SCENE_WORDS } from './longform-scene-fixture';
import { installApiStub } from './test-utils';

function request(): Omit<LongformScenePreviewRequest, 'requestId'> {
  return {
    sourceVideoPath: '/videos/source.mp4',
    wordTimestamps: SCENE_WORDS,
    plan: makeScenePlan(),
    sceneId: 'scene-statement-0-3',
    paletteId: 'brand',
  };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LongformScenePreview', () => {
  it('renders only on demand with the actual draft request and cleans only its returned path', async () => {
    const renderScene = vi.fn(async () => '/owned/preview-one.mp4');
    const cleanupScene = vi.fn(async () => {});
    installApiStub({
      renderLongformScenePreview: renderScene,
      cleanupLongformScenePreview: cleanupScene,
    });
    const input = request();
    const view = render(<LongformScenePreview request={input} />);
    expect(renderScene).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    expect(screen.getByLabelText('Source playback: Trust explanation')).toHaveAttribute(
      'src',
      expect.stringContaining('/videos/source.mp4'),
    );
    expect(screen.queryByText(/not the complete export/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Render draft preview' }));
    expect(screen.getByText(/not the complete export/)).toBeVisible();
    await waitFor(() =>
      expect(view.container.querySelector('video')).toHaveAttribute(
        'src',
        expect.stringContaining('preview-one.mp4'),
      ),
    );
    expect(renderScene).toHaveBeenCalledWith({ ...input, requestId: expect.any(String) });
    expect(screen.getByRole('button', { name: /Play preview/ })).toBeInTheDocument();
    view.rerender(<LongformScenePreview request={{ ...input, paletteId: 'slate' }} />);
    expect(cleanupScene).toHaveBeenCalledExactlyOnceWith('/owned/preview-one.mp4');
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    expect(screen.getByLabelText('Source playback: Trust explanation')).toHaveAttribute(
      'src',
      expect.stringContaining('/videos/source.mp4'),
    );
    expect(renderScene).toHaveBeenCalledOnce();
    view.unmount();
    expect(cleanupScene).toHaveBeenCalledTimes(1);
  });

  it.each([
    'unmount',
    'replace',
  ] as const)('releases video src before owned-file cleanup on %s', async (reason) => {
    let video: HTMLVideoElement | null = null;
    let releasedAtCleanup = false;
    const clean = vi.fn(async () => {
      releasedAtCleanup = video !== null && !video.hasAttribute('src');
    });
    installApiStub({
      renderLongformScenePreview: vi.fn(async () => '/owned/release.mp4'),
      cleanupLongformScenePreview: clean,
    });
    const input = request();
    const view = render(<LongformScenePreview request={input} />);
    fireEvent.click(screen.getByRole('button', { name: 'Render draft preview' }));
    await waitFor(() =>
      expect(view.container.querySelector('video')).toHaveAttribute(
        'src',
        expect.stringContaining('release.mp4'),
      ),
    );
    video = view.container.querySelector('video');
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    vi.mocked(HTMLMediaElement.prototype.load).mockClear();
    if (reason === 'unmount') view.unmount();
    else
      view.rerender(
        <LongformScenePreview request={{ ...input, sceneId: 'scene-statement-4-6' }} />,
      );
    expect(clean).toHaveBeenCalledExactlyOnceWith('/owned/release.mp4');
    expect(releasedAtCleanup).toBe(true);
    expect(video).not.toHaveAttribute('src');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.invocationCallOrder[0]).toBeLessThan(
      clean.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('keeps one occupied slot through cancellation and discards/cleans late results for another selected scene', async () => {
    const pending = deferred<string>();
    const renderScene = vi.fn(() => pending.promise);
    const cancel = vi.fn(async () => {});
    const clean = vi.fn(async () => {});
    installApiStub({
      renderLongformScenePreview: renderScene,
      cancelLongformScenePreview: cancel,
      cleanupLongformScenePreview: clean,
    });
    const input = request();
    const view = render(<LongformScenePreview request={input} />);
    const start = screen.getByRole('button', { name: 'Render draft preview' });
    fireEvent.click(start);
    fireEvent.click(start);
    expect(renderScene).toHaveBeenCalledOnce();
    view.rerender(<LongformScenePreview request={{ ...input, sceneId: 'scene-statement-4-6' }} />);
    expect(screen.getByText('Cancelling preview…')).toBeVisible();
    expect(cancel).toHaveBeenCalledWith(expect.any(String));
    expect(screen.queryByRole('button', { name: 'Render draft preview' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel preview' }));
    expect(cancel).toHaveBeenCalledOnce();
    await act(async () => pending.resolve('/owned/late.mp4'));
    expect(clean).toHaveBeenCalledExactlyOnceWith('/owned/late.mp4');
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    expect(screen.getByLabelText('Source playback: Evidence explanation')).toHaveAttribute(
      'src',
      expect.stringContaining('/videos/source.mp4'),
    );
    expect(screen.getByRole('button', { name: 'Render draft preview' })).toBeEnabled();
  });

  it('cancels on unmount and cleans a late successful result without publishing it', async () => {
    const pending = deferred<string>();
    const cancel = vi.fn(async () => {});
    const clean = vi.fn(async () => {});
    installApiStub({
      renderLongformScenePreview: vi.fn(() => pending.promise),
      cancelLongformScenePreview: cancel,
      cleanupLongformScenePreview: clean,
    });
    const view = render(<LongformScenePreview request={request()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Render draft preview' }));
    view.unmount();
    expect(cancel).toHaveBeenCalledOnce();
    await act(async () => pending.resolve('/owned/unmounted.mp4'));
    expect(clean).toHaveBeenCalledExactlyOnceWith('/owned/unmounted.mp4');
  });

  it('switches source and draft modes without rendering, releases source before rendering and keeps one media surface', async () => {
    const pending = deferred<string>();
    const renderScene = vi.fn(() => pending.promise);
    const clean = vi.fn(async () => {});
    installApiStub({ renderLongformScenePreview: renderScene, cleanupLongformScenePreview: clean });
    const view = render(<LongformScenePreview request={request()} />);
    const sourceVideo = screen.getByLabelText('Source playback: Trust explanation');
    fireEvent.click(screen.getByRole('button', { name: 'Draft preview' }));
    expect(sourceVideo).not.toHaveAttribute('src');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    expect(view.container.querySelectorAll('video')).toHaveLength(0);
    expect(renderScene).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Source playback' }));
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Render draft preview' }));
    expect(view.container.querySelectorAll('video')).toHaveLength(0);
    expect(screen.getByText('Rendering scene through the export renderer…')).toBeInTheDocument();
    await act(async () => pending.resolve('/owned/draft.mp4'));
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    const draft = view.container.querySelector('video');
    expect(draft).toHaveAttribute('src', expect.stringContaining('/owned/draft.mp4'));
    expect(screen.queryByLabelText('Source playback: Trust explanation')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Source playback' }));
    expect(draft).not.toHaveAttribute('src');
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    expect(screen.getByLabelText('Source playback: Trust explanation')).toBeInTheDocument();
    expect(clean).toHaveBeenCalledExactlyOnceWith('/owned/draft.mp4');
    expect(renderScene).toHaveBeenCalledOnce();
  });

  it('cancels when returning to source and does not publish a late draft even if draft view is selected again', async () => {
    const pending = deferred<string>();
    const renderScene = vi.fn(() => pending.promise);
    const cancel = vi.fn(async () => {});
    const clean = vi.fn(async () => {});
    installApiStub({
      renderLongformScenePreview: renderScene,
      cancelLongformScenePreview: cancel,
      cleanupLongformScenePreview: clean,
    });
    const view = render(<LongformScenePreview request={request()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Render draft preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Source playback' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Draft preview' }));
    expect(screen.queryByRole('button', { name: 'Render draft preview' })).not.toBeInTheDocument();
    await act(async () => pending.resolve('/owned/late-after-source.mp4'));
    expect(clean).toHaveBeenCalledExactlyOnceWith('/owned/late-after-source.mp4');
    expect(view.container.querySelectorAll('video')).toHaveLength(0);
    expect(renderScene).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Render draft preview' })).toBeEnabled();
  });

  it('cleans an unplayable rendered draft and retries only on request', async () => {
    const renderScene = vi.fn(async () => '/owned/unplayable.mp4');
    const clean = vi.fn(async () => {});
    installApiStub({ renderLongformScenePreview: renderScene, cleanupLongformScenePreview: clean });
    const view = render(<LongformScenePreview request={request()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Render draft preview' }));
    await waitFor(() =>
      expect(view.container.querySelector('video')).toHaveAttribute(
        'src',
        expect.stringContaining('unplayable.mp4'),
      ),
    );
    const video = view.container.querySelector('video');
    if (!video) throw new Error('Missing draft video');
    fireEvent.error(video);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be played');
    expect(video).not.toHaveAttribute('src');
    expect(clean).toHaveBeenCalledExactlyOnceWith('/owned/unplayable.mp4');
    expect(view.container.querySelectorAll('video')).toHaveLength(0);
    expect(renderScene).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Retry draft preview' }));
    await waitFor(() => expect(renderScene).toHaveBeenCalledTimes(2));
  });

  it('reports render failures with retry, and blocks stale/omitted previews', async () => {
    const renderScene = vi
      .fn(async () => '/owned/recovered.mp4')
      .mockRejectedValueOnce(new Error('Scene renderer unavailable'));
    const clean = vi.fn(async () => {});
    installApiStub({ renderLongformScenePreview: renderScene, cleanupLongformScenePreview: clean });
    const input = request();
    const view = render(<LongformScenePreview request={input} disabledReason="Stale source" />);
    expect(screen.getByRole('button', { name: 'Render draft preview' })).toBeDisabled();
    view.rerender(<LongformScenePreview request={input} />);
    fireEvent.click(screen.getByRole('button', { name: 'Render draft preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Scene renderer unavailable');
    expect(screen.getByRole('button', { name: 'Retry draft preview' })).toBeEnabled();
    expect(renderScene).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Retry draft preview' }));
    await waitFor(() =>
      expect(view.container.querySelector('video')).toHaveAttribute(
        'src',
        expect.stringContaining('/owned/recovered.mp4'),
      ),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const omitted = request();
    const first = omitted.plan.scenes[0];
    if (first) first.omitted = true;
    view.rerender(<LongformScenePreview request={omitted} />);
    expect(screen.getByRole('button', { name: 'Render draft preview' })).toBeDisabled();
    expect(renderScene).toHaveBeenCalledTimes(2);
    expect(clean).toHaveBeenCalledExactlyOnceWith('/owned/recovered.mp4');
    expect(screen.getByLabelText('Source playback: Trust explanation')).toBeInTheDocument();
  });
});
