import type { WordTimestamp } from '@shared/types';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatTimecode } from '@/lib/longform-plan';
import { toMediaFileUrl } from '@/lib/media-url';
import { buildSourceCaptionTrack } from '@/lib/source-caption-track';

interface LongformSourcePlaybackProps {
  path: string;
  label: string;
  start: number;
  end: number;
  words: readonly WordTimestamp[];
}

/** Native source playback is bounded to the full scene window, never a generated preview. */
export function LongformSourcePlayback({
  path,
  label,
  start,
  end,
  words,
}: LongformSourcePlaybackProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const src = toMediaFileUrl(path);
  const captionTrack = useMemo(
    () => buildSourceCaptionTrack(words, start, end),
    [words, start, end],
  );
  useLayoutEffect(() => {
    const video = videoRef.current;
    // StrictMode replays setup after cleanup without rebuilding the DOM node.
    if (video && video.getAttribute('src') !== src) video.setAttribute('src', src);
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);
  return (
    <div className="min-w-0 space-y-2">
      <video
        ref={videoRef}
        aria-label={`Source playback: ${label}`}
        src={src}
        controls
        playsInline
        preload="metadata"
        className="aspect-video max-h-[min(38vh,24rem)] w-full min-w-0 rounded-md bg-black object-contain"
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = start;
          setLoading(false);
          setFailed(false);
        }}
        onPlay={(event) => {
          const video = event.currentTarget;
          if (video.currentTime < start || video.currentTime >= end) video.currentTime = start;
        }}
        onSeeking={(event) => {
          const video = event.currentTarget;
          if (video.currentTime < start) video.currentTime = start;
          else if (video.currentTime > end) video.currentTime = end;
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          if (video.currentTime >= end) {
            video.pause();
            if (video.currentTime > end) video.currentTime = end;
          }
        }}
        onError={() => {
          setFailed(true);
          setLoading(false);
        }}
      >
        <track kind="captions" src={captionTrack} srcLang="und" label="Source transcript" default />
      </video>
      <p className="text-xs text-muted-foreground">
        Original source · {formatTimecode(start)}–{formatTimecode(end)}. No generated graphics.
        Playback stops at this scene's end.
      </p>
      {loading && (
        <p role="status" className="text-xs text-muted-foreground">
          Loading source playback…
        </p>
      )}
      {failed && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-warning">
            Source playback is unavailable. Check that the source file is online; the transcript
            remains available.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFailed(false);
              setLoading(true);
              videoRef.current?.load();
            }}
          >
            Retry source playback
          </Button>
        </div>
      )}
    </div>
  );
}
