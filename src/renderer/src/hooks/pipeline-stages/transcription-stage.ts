import { createStageReporter } from '../../lib/progress-reporter'
import type { PipelineContext } from './types'

export interface TranscriptionStageResult {
  transcriptionResult: {
    text: string
    words: Array<{ text: string; start: number; end: number }>
    segments: Array<{ text: string; start: number; end: number }>
  }
  formattedForAI: string
}

/** Audio extraction + ASR transcription, or use cached data on resume. */
export async function transcriptionStage(
  ctx: PipelineContext,
  sourcePath: string
): Promise<TranscriptionStageResult> {
  const { source, check, setPipeline, shouldSkip, store, getState } = ctx
  const reporter = createStageReporter(setPipeline, 'transcribing')

  if (shouldSkip('transcribing')) {
    reporter.done('Using cached transcription')
  }

  // Intentionally reading latest state at execution time — cached transcription
  // data may have been written by a prior pipeline run.
  const cachedTranscription = getState().transcriptions[source.id]
  if (shouldSkip('transcribing') && cachedTranscription) {
    ctx.markStageCompleted('transcribing')
    return {
      transcriptionResult: {
        text: cachedTranscription.text,
        words: cachedTranscription.words,
        segments: cachedTranscription.segments
      },
      formattedForAI: cachedTranscription.formattedForAI
    }
  }

  reporter.start('Extracting audio…')
  check()

  const stagePercents: Record<string, number> = {
    'extracting-audio': 10,
    'downloading-model': 20,
    'loading-model': 50,
    transcribing: 70
  }

  const unsubTranscribe = window.api.onTranscribeProgress(({ stage, message, percent }) => {
    let resolvedPercent = stagePercents[stage] ?? 50
    if (stage === 'downloading-model' && typeof percent === 'number') {
      resolvedPercent = Math.round(20 + (percent / 100) * 30)
    }
    reporter.update(message, resolvedPercent)
  })

  let transcriptionResult: TranscriptionStageResult['transcriptionResult']
  try {
    transcriptionResult = await window.api.transcribeVideo(sourcePath)
  } finally {
    unsubTranscribe()
  }
  check()

  const formattedForAI = await window.api.formatTranscriptForAI(transcriptionResult)
  check()

  store.setTranscription(source.id, {
    text: transcriptionResult.text,
    words: transcriptionResult.words,
    segments: transcriptionResult.segments,
    formattedForAI
  })

  reporter.done('Transcription complete')
  ctx.markStageCompleted('transcribing')

  return { transcriptionResult, formattedForAI }
}
