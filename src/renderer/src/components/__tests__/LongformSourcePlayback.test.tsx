import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LongformSourcePlayback } from '@/components/LongformSourcePlayback';

const props = {
  path: 'C:\\Source clips\\talk#1.mp4',
  label: 'Trust explanation',
  start: 3.75,
  end: 6.55,
  words: [
    { text: 'Trust', start: 3.5, end: 4.2 },
    { text: 'evidence', start: 6, end: 7 },
  ],
};

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sourceVideo(): HTMLVideoElement {
  return screen.getByLabelText('Source playback: Trust explanation') as HTMLVideoElement;
}

describe('LongformSourcePlayback', () => {
  it('uses native controls, seeks to the complete source window and bounds seeks/end without autoplay', () => {
    render(<LongformSourcePlayback {...props} />);
    const video = sourceVideo();
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveClass('aspect-video', 'max-h-[min(38vh,24rem)]', 'object-contain');
    expect(video).not.toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('src', 'file:///C:/Source%20clips/talk%231.mp4');
    expect(screen.getByRole('status')).toHaveTextContent('Loading source playback');
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(3.75);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    video.currentTime = 1;
    fireEvent.seeking(video);
    expect(video.currentTime).toBe(3.75);
    video.currentTime = 90;
    fireEvent.seeking(video);
    expect(video.currentTime).toBe(6.55);
    fireEvent.play(video);
    expect(video.currentTime).toBe(3.75);
    video.currentTime = 5;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(5);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    video.currentTime = 6.6;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(6.55);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    video.currentTime = 6.55;
    fireEvent.timeUpdate(video);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(2);
  });

  it('provides default native transcript captions at absolute source times and updates them with the selected passage', () => {
    const view = render(<LongformSourcePlayback {...props} />);
    const video = sourceVideo();
    const track = video.querySelector('track');
    expect(track).toHaveAttribute('kind', 'captions');
    expect(track).toHaveAttribute('srclang', 'und');
    expect(track).toHaveAttribute('label', 'Source transcript');
    expect(track).toHaveAttribute('default');
    const decodeTrack = (): string =>
      decodeURIComponent(video.querySelector('track')?.getAttribute('src')?.split(',')[1] ?? '');
    expect(decodeTrack()).toBe(
      'WEBVTT\n\n00:00:03.750 --> 00:00:04.200\nTrust\n\n00:00:06.000 --> 00:00:06.550\nevidence\n\n',
    );
    view.rerender(
      <LongformSourcePlayback {...props} words={[{ text: '<source> & word', start: 4, end: 5 }]} />,
    );
    expect(decodeTrack()).toBe(
      'WEBVTT\n\n00:00:04.000 --> 00:00:05.000\n&lt;source&gt; &amp; word\n\n',
    );
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    expect(video.querySelectorAll('track')).toHaveLength(1);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('reports a missing source and reloads only on explicit retry, leaving draft rendering uninvolved', () => {
    render(<LongformSourcePlayback {...props} />);
    const video = sourceVideo();
    fireEvent.error(video);
    expect(screen.getByRole('alert')).toHaveTextContent('Source playback is unavailable');
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry source playback' }));
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading source playback');
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(props.start);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('pauses and releases the old source on scene replacement and unmount', () => {
    const view = render(<LongformSourcePlayback key="first" {...props} />);
    const first = sourceVideo();
    view.rerender(<LongformSourcePlayback key="second" {...props} start={99.75} end={101.85} />);
    const second = sourceVideo();
    expect(first).not.toBe(second);
    expect(first).not.toHaveAttribute('src');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledOnce();
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    fireEvent.loadedMetadata(second);
    expect(second.currentTime).toBe(99.75);
    view.unmount();
    expect(second).not.toHaveAttribute('src');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(2);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(2);
  });

  it('retains a playable src after StrictMode teardown/setup replay', () => {
    const view = render(
      <StrictMode>
        <LongformSourcePlayback {...props} />
      </StrictMode>,
    );
    const video = sourceVideo();
    expect(video).toHaveAttribute('src', 'file:///C:/Source%20clips/talk%231.mp4');
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(3.75);
    view.unmount();
    expect(video).not.toHaveAttribute('src');
  });
});
