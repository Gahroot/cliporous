import type { ClipCandidate } from '../../store'
import { createStageReporter } from '../../lib/progress-reporter'
import type { PipelineContext } from './types'
import { handleStageError } from './types'
import type { TranscriptionStageResult } from './transcription-stage'

/**
 * Clip boundary optimization — completion-first or cliffhanger modes.
 *
 * Note: the standalone `loop-first` mode from batchcontent (which depended on
 * `analyzeLoopPotential` / `scoreLoopQuality` / `optimizeForLoop` IPCs) is not
 * available in batchclip. When `clipEndMode === 'loop-first'` we no-op and
 * leave clip boundaries untouched.
 */
export async function loopOptimizationStage(
  ctx: PipelineContext,
  transcription: TranscriptionStageResult,
  clips: ClipCandidate[]
): Promise<ClipCandidate[]> {
  const { source, check, setPipeline, shouldSkip, addError, store, geminiApiKey, processingConfig } = ctx

  if (!processingConfig.enablePerfectLoop || shouldSkip('optimizing-loops')) {
    return clips
  }

  const clipEndMode = processingConfig.clipEndMode ?? 'loop-first'

  // Loop-first depends on IPCs that aren't wired in batchclip — skip gracefully.
  if (clipEndMode === 'loop-first') {
    return clips
  }

  const reporter = createStageReporter(setPipeline, 'optimizing-loops')
  const modeLabels: Record<string, string> = {
    'completion-first': 'Snapping to sentence boundaries',
    'cliffhanger': 'Finding peak tension cut points'
  }

  reporter.start(`${modeLabels[clipEndMode] ?? 'Optimizing clips'}…`)
  check()

  // For cliffhanger mode, detect curiosity gaps upfront (one AI call)
  let curiosityGaps: Awaited<ReturnType<typeof window.api.detectCuriosityGaps>> = []
  if (clipEndMode === 'cliffhanger') {
    try {
      reporter.update('Detecting curiosity gaps for cliffhanger cuts…', 5)
      curiosityGaps = await window.api.detectCuriosityGaps(
        geminiApiKey,
        transcription.transcriptionResult,
        transcription.formattedForAI,
        source.duration
      )
      check()
    } catch (gapErr) {
      handleStageError(gapErr, 'Curiosity gap detection failed', addError)
    }
  }

  // Make a mutable copy so we can update boundaries in place
  const updatedClips = [...clips]

  for (let i = 0; i < updatedClips.length; i++) {
    const clip = updatedClips[i]
    const percent = Math.round(((i + 1) / updatedClips.length) * 100)
    reporter.update(`${modeLabels[clipEndMode]} — clip ${i + 1}/${updatedClips.length}…`, percent)

    try {
      await optimizeEndpoints(ctx, transcription, updatedClips, i, clipEndMode, curiosityGaps)
    } catch (optErr) {
      handleStageError(optErr, `Clip boundary optimization failed for clip ${i + 1}`, addError)
    }
  }

  reporter.done('Boundary optimization complete')
  return updatedClips
}

async function optimizeEndpoints(
  ctx: PipelineContext,
  transcription: TranscriptionStageResult,
  clips: ClipCandidate[],
  index: number,
  clipEndMode: string,
  curiosityGaps: Awaited<ReturnType<typeof window.api.detectCuriosityGaps>>
): Promise<void> {
  const { source, store } = ctx
  const clip = clips[index]

  let bestGap: (typeof curiosityGaps)[number] | undefined
  if (clipEndMode === 'cliffhanger' && curiosityGaps.length > 0) {
    const overlapping = curiosityGaps.filter(
      (g) => g.openTimestamp < clip.endTime && g.resolveTimestamp > clip.startTime
    )
    if (overlapping.length > 0) {
      bestGap = overlapping.reduce((a, b) => (b.score > a.score ? b : a))
    }
  }

  const adjusted = await window.api.optimizeClipEndpoints(
    clipEndMode,
    clip.startTime,
    clip.endTime,
    transcription.transcriptionResult,
    bestGap
  )

  if (adjusted.start !== clip.startTime || adjusted.end !== clip.endTime) {
    store.updateClipTrim(source.id, clip.id, adjusted.start, adjusted.end)
    clips[index] = {
      ...clip,
      startTime: adjusted.start,
      endTime: adjusted.end,
      duration: adjusted.end - adjusted.start
    }
  }

  store.updateClipLoop(source.id, clip.id, {
    loopScore: 0,
    loopStrategy: clipEndMode,
    loopOptimized: adjusted.start !== clip.startTime || adjusted.end !== clip.endTime
  })
}
