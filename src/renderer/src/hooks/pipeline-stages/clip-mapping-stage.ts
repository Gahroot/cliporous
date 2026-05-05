import { v4 as uuidv4 } from 'uuid'
import type { ClipCandidate } from '../../store'
import { createStageReporter } from '../../lib/progress-reporter'
import type { PipelineContext } from './types'
import type { TranscriptionStageResult } from './transcription-stage'

/** Score transcript and map results to clip candidates (or use cached clips). */
export async function clipMappingStage(
  ctx: PipelineContext,
  transcription: TranscriptionStageResult
): Promise<ClipCandidate[]> {
  const { source, check, setPipeline, shouldSkip, store, getState, geminiApiKey, processingConfig } = ctx
  const reporter = createStageReporter(setPipeline, 'scoring')

  // Intentionally reading latest state at execution time — cached clips
  // may have been written by a prior pipeline run.
  const cachedClips = getState().clips[source.id]
  if (shouldSkip('scoring') && cachedClips && cachedClips.length > 0) {
    reporter.done('Using cached scores')
    ctx.markStageCompleted('scoring')
    return [...cachedClips]
  }

  reporter.start('Sending to Gemini…')
  check()

  const scoringStagePercents: Record<string, number> = {
    sending: 10,
    analyzing: 50,
    validating: 90
  }

  const unsubScoring = window.api.onScoringProgress(({ stage, message }) => {
    reporter.update(message, scoringStagePercents[stage] ?? 50)
  })

  let scoringResult
  try {
    scoringResult = await window.api.scoreTranscript(
      geminiApiKey,
      transcription.formattedForAI,
      source.duration,
      processingConfig.targetDuration,
      processingConfig.targetAudience
    )
  } finally {
    unsubScoring()
  }
  check()

  const clips: ClipCandidate[] = scoringResult.segments.map((seg) => ({
    id: uuidv4(),
    sourceId: source.id,
    startTime: seg.startTime,
    endTime: seg.endTime,
    duration: seg.endTime - seg.startTime,
    text: seg.text,
    score: seg.score,
    hookText: seg.hookText,
    reasoning: seg.reasoning,
    status: 'pending' as const,
    wordTimestamps: transcription.transcriptionResult.words.filter(
      (w: { start: number; end: number }) => w.start >= seg.startTime && w.end <= seg.endTime
    )
  }))

  store.setClips(source.id, clips)
  reporter.done('Scoring complete')
  ctx.markStageCompleted('scoring')

  return clips
}
