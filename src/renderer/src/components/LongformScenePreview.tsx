import type { LongformScenePreviewRequest } from '@shared/longform-scenes';
import { Loader2, Play, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorialPlayer } from '@/components/EditorialPlayer';
import { LongformSourcePlayback } from '@/components/LongformSourcePlayback';
import { Button } from '@/components/ui/button';
import { toMediaFileUrl } from '@/lib/media-url';

export interface LongformScenePreviewProps {
  request: Omit<LongformScenePreviewRequest, 'requestId'>;
  disabledReason?: string | undefined;
}

interface PreviewJob {
  id: string;
  invalidated: boolean;
}

/** One explicit render at a time. Only paths returned to this instance are ever cleaned. */
export function LongformScenePreview({
  request,
  disabledReason,
}: LongformScenePreviewProps): React.JSX.Element {
  const scene = request.plan.scenes.find((candidate) => candidate.id === request.sceneId);
  // Include the full plan/style and palette CONTENT, not just scene/palette IDs.
  // An appearance revision must invalidate media even when every scene ID is retained.
  const signature = JSON.stringify(request);
  const previousInputs = useRef({ signature, disabledReason });
  const currentSignature = useRef(signature);
  currentSignature.current = signature;
  const mounted = useRef(false);
  const activeJob = useRef<PreviewJob | null>(null);
  const ownedPath = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [result, setResult] = useState<{ path: string; signature: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'source' | 'draft'>('source');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const cleanupPath = useCallback((path: string): void => {
    void window.api.cleanupLongformScenePreview(path).catch(() => {
      // The main process owns this temporary directory; never fall back to deleting arbitrary files.
    });
  }, []);

  const releasePreview = useCallback((): void => {
    if (!ownedPath.current) return;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    const path = ownedPath.current;
    ownedPath.current = null;
    cleanupPath(path);
  }, [cleanupPath]);

  const cancel = useCallback((): void => {
    const job = activeJob.current;
    if (!job || job.invalidated) return;
    job.invalidated = true;
    if (mounted.current) setMessage('Cancelling preview…');
    void window.api.cancelLongformScenePreview(job.id).catch(() => {
      if (mounted.current && activeJob.current === job) {
        setError(true);
        setMessage(
          'Cancellation could not be confirmed. Waiting for the current preview to finish.',
        );
      }
    });
    // Keep the slot occupied until the render promise settles, even if cancellation returns first.
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
      releasePreview();
    };
  }, [cancel, releasePreview]);

  useEffect(() => {
    if (
      previousInputs.current.signature === signature &&
      previousInputs.current.disabledReason === disabledReason
    )
      return;
    previousInputs.current = { signature, disabledReason };
    cancel();
    releasePreview();
    setResult(null);
    setMode('source');
    setError(false);
    setMessage(activeJob.current ? 'Cancelling preview…' : '');
  }, [signature, disabledReason, cancel, releasePreview]);

  const renderPreview = async (): Promise<void> => {
    if (activeJob.current || disabledReason || !scene || scene.omitted) return;
    setMode('draft');
    releasePreview();
    setResult(null);
    const job: PreviewJob = { id: crypto.randomUUID(), invalidated: false };
    activeJob.current = job;
    setBusy(true);
    setError(false);
    setMessage('Rendering scene through the export renderer…');
    try {
      const path = await window.api.renderLongformScenePreview({ ...request, requestId: job.id });
      if (!mounted.current || job.invalidated || currentSignature.current !== signature) {
        cleanupPath(path);
        return;
      }
      ownedPath.current = path;
      setResult({ path, signature });
      setMessage('Rendered draft preview · uses the scene export path.');
    } catch (caught) {
      if (mounted.current && !job.invalidated && currentSignature.current === signature) {
        setError(true);
        setMessage(
          `${caught instanceof Error ? caught.message : 'Scene preview failed'}. Retry the preview or send scene feedback.`,
        );
      }
    } finally {
      if (activeJob.current === job) activeJob.current = null;
      if (mounted.current) {
        setBusy(false);
        if (job.invalidated) setMessage('Preview cancelled. Render the selected scene when ready.');
      }
    }
  };

  const visibleResult = mode === 'draft' && result?.signature === signature ? result : null;
  useLayoutEffect(() => {
    const video = visibleResult ? videoRef.current : null;
    // Release the media handle before refs detach and passive owned-file cleanup runs (Windows).
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [visibleResult]);
  const blocked =
    disabledReason ||
    (scene?.omitted
      ? 'Include this scene before rendering its draft preview.'
      : !scene
        ? 'Select a scene to preview.'
        : undefined);
  const sourceRangeValid =
    scene &&
    Number.isFinite(scene.startTime) &&
    Number.isFinite(scene.endTime) &&
    scene.startTime >= 0 &&
    scene.endTime > scene.startTime &&
    scene.endTime <= request.plan.sourceDuration;
  return (
    <section
      className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4"
      aria-label="Source and draft preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="sr-only">{mode === 'source' ? 'Source playback' : 'Draft scene preview'}</h3>
        <fieldset aria-label="Playback view" className="flex min-w-0 flex-wrap gap-1">
          <Button
            size="sm"
            variant={mode === 'source' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'source'}
            onClick={() => {
              setMode('source');
              cancel();
              releasePreview();
              setResult(null);
            }}
          >
            Source playback
          </Button>
          <Button
            size="sm"
            variant={mode === 'draft' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'draft'}
            onClick={() => setMode('draft')}
          >
            Draft preview
          </Button>
        </fieldset>
        {busy ? (
          <Button size="sm" variant="outline" onClick={cancel}>
            <X /> Cancel preview
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(blocked)}
            onClick={() => void renderPreview()}
          >
            <Play />{' '}
            {error
              ? 'Retry draft preview'
              : visibleResult
                ? 'Render draft again'
                : 'Render draft preview'}
          </Button>
        )}
      </div>
      {mode === 'draft' && (
        <p className="text-xs text-muted-foreground">
          Draft of this scene only, not the complete export. Rendering starts when you choose it.
        </p>
      )}
      {mode === 'source' &&
        scene &&
        (sourceRangeValid ? (
          <LongformSourcePlayback
            key={`${request.sourceVideoPath}:${scene.id}:${scene.startTime}:${scene.endTime}`}
            path={request.sourceVideoPath}
            label={scene.label}
            start={scene.startTime}
            end={scene.endTime}
            words={request.wordTimestamps.slice(scene.startWord, scene.endWord + 1)}
          />
        ) : (
          <p className="text-xs text-warning">
            Source playback requires a valid scene window. The saved timing has not been changed.
          </p>
        ))}
      {visibleResult && scene && !blocked && (
        <EditorialPlayer
          key={visibleResult.path}
          src={toMediaFileUrl(visibleResult.path)}
          label={`Draft scene preview: ${scene.label}`}
          selectionStart={0}
          selectionEnd={scene.endTime - scene.startTime}
          videoRef={videoRef}
          layout="stacked"
          className="[&>div:first-child]:aspect-video [&>div:first-child]:max-h-[min(38vh,24rem)] [&>div:first-child]:max-w-none"
          onMediaError={() => {
            releasePreview();
            setResult(null);
            setError(true);
            setMessage('The rendered draft scene could not be played. Retry draft preview.');
          }}
        />
      )}
      {(blocked || (message && (busy || error || mode === 'draft'))) && (
        <p
          className="flex items-start gap-2 text-xs text-muted-foreground"
          role={error ? 'alert' : 'status'}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />}
          {blocked || message}
        </p>
      )}
    </section>
  );
}
