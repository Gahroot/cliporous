import { isSceneFirstLongformPlan } from '@shared/longform-scenes';
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { MISSING_GEMINI_KEY_MESSAGE, resolveGeminiKey } from '../lib/gemini-key';
import { LONGFORM_RENDER_DEFAULTS } from '../services/render-defaults';
import type { SourceVideo } from '../store';
import { useStore } from '../store';
import { cancelActiveProcessingAndWait, trackActiveProcessingRun } from './usePipeline';

/**
 * useLongformPipeline — drives the Hormozi long-form (16:9) flow end-to-end:
 *
 *   1. resolve source path (local pass-through / YouTube download)
 *   2. transcribe (Python ASR sidecar)
 *   3. generate the AI long-form edit plan (Gemini)
 *   4. stop on the Cut Plan review screen before any render work begins
 *
 * Progress uses the shared pipeline stages. Reaching `ready` routes long-form
 * projects to editorial review, where the creator must explicitly approve the
 * active version before the render service can start.
 */
export function useLongformPipeline(): {
  processLongform: (source: SourceVideo) => Promise<void>;
  cancelLongform: () => Promise<void>;
} {
  const setPipeline = useStore((s) => s.setPipeline);
  const setTranscription = useStore((s) => s.setTranscription);
  const setLongformPlan = useStore((s) => s.setLongformPlan);
  const addError = useStore((s) => s.addError);
  const startProcessingJob = useStore((s) => s.startProcessingJob);
  const markStageCompleted = useStore((s) => s.markStageCompleted);

  const cancelledRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);

  const cancelLongform = useCallback(async (): Promise<void> => {
    cancelledRef.current = true;
    try {
      await window.api.cancelLongformEditPlan?.(requestIdRef.current ?? undefined);
    } finally {
      await cancelActiveProcessingAndWait();
    }
  }, []);

  const processLongform = useCallback(
    async (source: SourceVideo): Promise<void> => {
      cancelledRef.current = false;
      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;
      startProcessingJob(source);
      const processingJobId = useStore.getState().currentProcessingJobId;
      const isCurrent = (): boolean =>
        !cancelledRef.current &&
        requestIdRef.current === requestId &&
        useStore.getState().currentProcessingJobId === processingJobId &&
        useStore.getState().sources.some((candidate) => candidate.id === source.id);
      const finishTrackedRun = trackActiveProcessingRun(() => {
        cancelledRef.current = true;
        void window.api.cancelLongformEditPlan?.(requestId).catch(() => {
          addError({
            source: 'pipeline',
            message: 'Could not confirm cancellation of long-form planning.',
          });
        });
      });

      const check = (): void => {
        if (!isCurrent()) throw new Error('Processing cancelled');
      };

      try {
        if (!navigator.onLine) {
          const msg = 'No internet connection. Long-form editing requires Gemini access.';
          setPipeline({ stage: 'error', message: msg, percent: 0 });
          addError({ source: 'pipeline', message: msg });
          return;
        }

        const state = useStore.getState();
        const geminiApiKey = await resolveGeminiKey(state.settings.geminiApiKey);

        if (!geminiApiKey) {
          const msg = MISSING_GEMINI_KEY_MESSAGE;
          setPipeline({ stage: 'error', message: msg, percent: 0 });
          addError({ source: 'pipeline', message: msg });
          toast.error(msg);
          return;
        }

        // ── Step 1: Resolve source path ─────────────────────────────────
        setPipeline({ stage: 'downloading', message: 'Preparing source…', percent: 0 });
        let sourcePath = source.path;
        let duration = source.duration;
        let resolvedName = source.name;
        if (source.origin === 'youtube' && source.youtubeUrl && !sourcePath) {
          const unsub = window.api.onYouTubeProgress(({ percent }) => {
            setPipeline({
              stage: 'downloading',
              message: `Downloading… ${Math.round(percent)}%`,
              percent: Math.round(percent),
            });
          });
          try {
            const result = await window.api.downloadYouTube(source.youtubeUrl);
            sourcePath = result.path;
            if (typeof result.duration === 'number' && result.duration > 0) {
              duration = result.duration;
            }
            if (result.title?.trim()) resolvedName = result.title.trim();
          } finally {
            unsub();
          }
        }
        check();
        markStageCompleted('downloading');

        // Probe the resolved file for real dimensions (and duration if the
        // downloader didn't report one). Non-fatal: duration is backfilled from
        // the transcript below if the probe fails.
        let width = source.width;
        let height = source.height;
        try {
          const meta = await window.api.getMetadata(sourcePath);
          if (meta?.width > 0 && meta?.height > 0) {
            width = meta.width;
            height = meta.height;
          }
          if (meta?.duration > 0) duration = meta.duration;
        } catch {
          /* duration backfilled from transcript below */
        }

        check();
        // Write the resolved file back to the store. Without this a YouTube
        // source keeps path '' / duration 0 / 0×0, so the review screen shows
        // 0:00 and the render service later receives an empty source path.
        // (updateSource re-reads state; `source` is a frozen snapshot.)
        useStore.getState().updateSource(source.id, {
          path: sourcePath,
          name: resolvedName,
          duration,
          width,
          height,
        });
        useStore.getState().setCachedSourcePath(sourcePath);

        // ── Step 2: Transcribe ──────────────────────────────────────────
        setPipeline({ stage: 'transcribing', message: 'Extracting audio…', percent: 5 });
        const stagePercents: Record<string, number> = {
          'extracting-audio': 10,
          'downloading-model': 20,
          'loading-model': 50,
          transcribing: 70,
        };
        const unsubT = window.api.onTranscribeProgress(({ stage, message, percent }) => {
          let p = stagePercents[stage] ?? 50;
          if (stage === 'downloading-model' && typeof percent === 'number') {
            p = Math.round(20 + (percent / 100) * 30);
          }
          if (stage === 'transcribing') {
            const m = message.match(/chunk\s+(\d+)\s*\/\s*(\d+)/i);
            if (m && Number(m[2]) > 0) {
              p = Math.round(70 + (Number(m[1]) / Number(m[2])) * 27);
            }
          }
          setPipeline({ stage: 'transcribing', message, percent: p });
        });
        let transcription: {
          text: string;
          words: Array<{ text: string; start: number; end: number }>;
          segments: Array<{ text: string; start: number; end: number }>;
        };
        try {
          transcription = await window.api.transcribeVideo(sourcePath);
        } finally {
          unsubT();
        }
        check();

        const formattedForAI = await window.api.formatTranscriptForAI(transcription);
        check();
        setTranscription(source.id, {
          text: transcription.text,
          words: transcription.words,
          segments: transcription.segments,
          formattedForAI,
        });
        markStageCompleted('transcribing');

        if (!duration || duration <= 0) {
          const lastWord = transcription.words[transcription.words.length - 1];
          duration = lastWord?.end ?? 0;
          if (duration > 0) useStore.getState().updateSource(source.id, { duration });
        }

        // ── Step 3: AI long-form edit plan ──────────────────────────────
        setPipeline({ stage: 'ai-editing', message: 'Designing the edit…', percent: 30 });
        const unsubE = window.api.onLongformEditProgress(
          ({ window: w, total, requestId: progressId }) => {
            if (!isCurrent() || (progressId && progressId !== requestId)) return;
            const p = total > 0 ? Math.round(30 + (w / total) * 30) : 30;
            setPipeline({
              stage: 'ai-editing',
              message: `Planning explanations… (section ${w}/${total})`,
              percent: p,
            });
          },
        );
        let plan: Awaited<ReturnType<typeof window.api.generateLongformEditPlan>>;
        try {
          plan = await window.api.generateLongformEditPlan(
            geminiApiKey,
            transcription.words,
            duration,
            undefined,
            { requestId, mode: 'scene-first' },
          );
        } finally {
          unsubE();
        }
        check();

        // Persist the (expensive) plan keyed by source so a save/recovery can
        // re-render without re-calling Gemini. Store the same skin + palette
        // axes the render below uses so a restored project renders identically.
        const longformSkin = state.settings.longformSkin ?? LONGFORM_RENDER_DEFAULTS.longformSkinId;
        const longformPaletteId =
          state.settings.longformPaletteId ?? LONGFORM_RENDER_DEFAULTS.longformPaletteId;
        setLongformPlan(source.id, {
          plan,
          skin: longformSkin,
          paletteId: longformPaletteId,
        });
        markStageCompleted('ai-editing');
        if (isSceneFirstLongformPlan(plan)) {
          const failed = plan.sections.filter((section) => section.status === 'failed').length;
          if (failed > 0)
            toast.warning(
              `${plan.scenes.length} explanations planned. ${failed} sections need retry.`,
            );
          else if (plan.scenes.length === 0)
            toast.message(
              'No supported explanation moments found. This plan keeps the speaker on screen.',
            );
          else toast.message(`${plan.scenes.length} explanations ready for review.`);
        } else if (plan.blocks.length === 0 && plan.phrases.length === 0) {
          // Degenerate plan: Gemini found no structured moments. The render
          // below still proceeds (a plain speaker cut), but make that explicit
          // and distinct from a normal plan so the user doesn't think the
          // feature silently failed.
          const cardCount = plan.cards?.length ?? 0;
          const cardNote = cardCount > 0 ? ` (${cardCount} card${cardCount === 1 ? '' : 's'})` : '';
          toast.warning(`AI found no structured moments. The plan uses speaker video${cardNote}`);
        } else {
          toast.message(
            `Edit plan: ${plan.phrases.length} phrase${plan.phrases.length === 1 ? '' : 's'}, ` +
              `${plan.blocks.length} block${plan.blocks.length === 1 ? '' : 's'}`,
          );
        }

        // Stop before render. The persisted plan now belongs to the creator until
        // they accept, revise, regenerate, restore, or reject it.
        setPipeline({
          stage: 'ready',
          message: 'Cut Plan ready for review',
          percent: 100,
        });
      } catch (err) {
        if (!isCurrent()) return;
        const message = err instanceof Error ? err.message : String(err);
        setPipeline({ stage: 'error', message, percent: 0 });
        const structured = addError({
          source: 'pipeline',
          message: `Long-form: ${message}`,
          failedStage: useStore.getState().pipeline.stage,
        });
        toast.error(structured.headline);
      } finally {
        if (requestIdRef.current === requestId) requestIdRef.current = null;
        finishTrackedRun();
      }
    },
    [
      setPipeline,
      setTranscription,
      setLongformPlan,
      addError,
      startProcessingJob,
      markStageCompleted,
    ],
  );

  return { processLongform, cancelLongform };
}
