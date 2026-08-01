import { stabilizeShortFormClipBoundary } from '@shared/clip-boundaries';
import { v4 as uuidv4 } from 'uuid';
import { MISSING_GEMINI_KEY_MESSAGE, resolveGeminiKey } from '../../lib/gemini-key';
import { createStageReporter } from '../../lib/progress-reporter';
import type { ClipCandidate, ScoringResult } from '../../store';
import type { TranscriptionStageResult } from './transcription-stage';
import type { PipelineContext } from './types';

/** Score transcript and map results to clip candidates (or use cached clips). */
export async function clipMappingStage(
  ctx: PipelineContext,
  transcription: TranscriptionStageResult,
): Promise<ClipCandidate[]> {
  const { source, check, setPipeline, shouldSkip, store, getState, processingConfig } = ctx;
  let { geminiApiKey } = ctx;
  const reporter = createStageReporter(setPipeline, 'scoring');

  // Intentionally reading latest state at execution time — cached clips
  // may have been written by a prior pipeline run.
  const cachedClips = getState().clips[source.id];
  if (shouldSkip('scoring') && cachedClips && cachedClips.length > 0) {
    reporter.done('Using cached scores');
    ctx.markStageCompleted('scoring');
    return [...cachedClips];
  }

  // Promo Mode ("Media Master demo mode") — the recording is one longform take
  // with spoken markers ("clip one … clip two …"). Bypass AI scoring entirely
  // and build one candidate per spoken segment. No Gemini key required.
  if (processingConfig.promoMode) {
    reporter.start('Splitting on spoken markers…');
    check();

    const promoClips = await window.api.promoSplit(transcription.transcriptionResult.words);
    check();

    const clips: ClipCandidate[] = promoClips.map((seg) => ({
      id: uuidv4(),
      sourceId: source.id,
      startTime: seg.startTime,
      endTime: seg.endTime,
      duration: seg.endTime - seg.startTime,
      text: seg.text,
      score: 100,
      hookText: '',
      reasoning: `Promo Mode: ${seg.label}`,
      status: 'pending' as const,
      wordTimestamps: seg.wordTimestamps,
    }));

    store.setClips(source.id, clips);
    reporter.done(`Found ${clips.length} promo clip${clips.length === 1 ? '' : 's'}`);
    ctx.markStageCompleted('scoring');

    return clips;
  }

  // Last-chance hydration — if the key isn't in store yet, pull directly
  // from main-process safeStorage. Guards against a race where the user
  // saved a key in the Settings window seconds before clicking Run.
  geminiApiKey = await resolveGeminiKey(geminiApiKey);

  if (!geminiApiKey) {
    throw new Error(MISSING_GEMINI_KEY_MESSAGE);
  }

  reporter.start('Sending to Gemini…');
  check();

  const scoringStagePercents: Record<string, number> = {
    sending: 10,
    analyzing: 50,
    validating: 90,
  };

  const unsubScoring = window.api.onScoringProgress(({ stage, message }) => {
    reporter.update(message, scoringStagePercents[stage] ?? 50);
  });

  let scoringResult: ScoringResult;
  try {
    scoringResult = await window.api.scoreTranscript(
      geminiApiKey,
      transcription.formattedForAI,
      source.duration,
      processingConfig.targetDuration,
      processingConfig.targetAudience,
    );
  } finally {
    unsubScoring();
  }
  check();

  const transcriptWords = transcription.transcriptionResult.words;
  const clips: ClipCandidate[] = scoringResult.segments
    .filter((segment) => segment.score >= processingConfig.minScore)
    .map((seg) => {
      const boundary = stabilizeShortFormClipBoundary(
        seg.startTime,
        seg.endTime,
        transcriptWords,
        source.duration,
      );
      return {
        id: uuidv4(),
        sourceId: source.id,
        startTime: boundary.startTime,
        endTime: boundary.endTime,
        duration: boundary.endTime - boundary.startTime,
        text: seg.text,
        score: seg.score,
        hookText: seg.hookText,
        reasoning: seg.reasoning,
        status: 'pending' as const,
        wordTimestamps: transcriptWords.filter(
          (word) => word.start >= boundary.startTime && word.end <= boundary.endTime,
        ),
      };
    });

  store.setClips(source.id, clips);
  reporter.done(
    `${clips.length} clip${clips.length === 1 ? '' : 's'} passed ${processingConfig.minScore}+`,
  );
  ctx.markStageCompleted('scoring');

  return clips;
}
