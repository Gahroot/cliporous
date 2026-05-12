import { v4 as uuidv4 } from 'uuid'
import type {
  ClipCandidate,
  SourceRange,
  StitchedClipCandidate,
  StitchedClipRole,
  WordTimestamp,
} from '../../store'
import { createStageReporter } from '../../lib/progress-reporter'
import type { PipelineContext } from './types'
import type { TranscriptionStageResult } from './transcription-stage'

const STITCH_PROGRESS_PERCENTS: Record<string, number> = {
  sending: 10,
  analyzing: 50,
  validating: 90,
}

const VALID_ROLES: ReadonlySet<StitchedClipRole> = new Set<StitchedClipRole>([
  'hook',
  'rehook',
  'context',
  'why',
  'what',
  'how',
  'mini-payoff',
  'main-payoff',
  'bonus-payoff',
  'bridge',
])

function coerceRole(raw: string): StitchedClipRole {
  const r = raw.trim().toLowerCase()
  if (r === 'payoff') return 'main-payoff'
  if (VALID_ROLES.has(r as StitchedClipRole)) return r as StitchedClipRole
  return 'context'
}

/**
 * Stitched clip generation — additive stage that runs once after scoring.
 *
 * Pulls 2+ non-contiguous source ranges into one coherent short via a single
 * Gemini-flash-lite call. Failures are non-fatal: the regular clip flow keeps
 * running with zero stitched clips. The stitched clip's word-list, segments,
 * and face crops are filled in by subsequent passes (face / segmenting), so
 * the rendering path is identical to a regular clip at job-build time.
 */
export async function stitchingStage(
  ctx: PipelineContext,
  transcription: TranscriptionStageResult,
  regularClips: ClipCandidate[]
): Promise<StitchedClipCandidate[]> {
  const { source, check, setPipeline, shouldSkip, store, getState, processingConfig } = ctx
  let { geminiApiKey } = ctx
  const reporter = createStageReporter(setPipeline, 'stitching')

  const cached = getState().stitchedClips[source.id]
  if (shouldSkip('stitching') && cached && cached.length > 0) {
    reporter.done('Using cached stitched clips')
    ctx.markStageCompleted('stitching')
    return [...cached]
  }

  // Last-chance hydration of the Gemini key.
  if (!geminiApiKey || !geminiApiKey.trim()) {
    try {
      const fromMain = await window.api?.secrets?.get('gemini')
      if (fromMain && fromMain.trim()) geminiApiKey = fromMain
    } catch {
      /* ignore */
    }
  }
  if (!geminiApiKey || !geminiApiKey.trim()) {
    // Scoring already succeeded, so just skip stitching with a logged note —
    // a failure here must not break the pipeline.
    ctx.addError({
      source: 'stitching',
      message: 'Skipping stitched clip generation — no Gemini API key.',
    })
    return []
  }

  reporter.start('Composing stitched clips…')
  check()

  const existingClipsForPrompt = regularClips.map((c) => ({
    startTime: c.startTime,
    endTime: c.endTime,
    score: c.score,
    text: c.text,
  }))

  const unsub = window.api.onStitchProgress(({ stage, message }) => {
    reporter.update(message, STITCH_PROGRESS_PERCENTS[stage] ?? 50)
  })

  let result
  try {
    result = await window.api.generateStitchedClips(
      geminiApiKey,
      transcription.formattedForAI,
      source.duration,
      existingClipsForPrompt,
      processingConfig.targetAudience
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    ctx.addError({
      source: 'stitching',
      message: `Stitched clip generation failed: ${msg}`,
    })
    unsub()
    ctx.markStageCompleted('stitching')
    return []
  } finally {
    unsub()
  }
  check()

  const words = transcription.transcriptionResult.words
  const stitchedClips: StitchedClipCandidate[] = result.clips.map((plan) => {
    const sourceRanges: SourceRange[] = plan.ranges.map((r) => ({
      startTime: r.startTime,
      endTime: r.endTime,
      role: coerceRole(r.role),
    }))
    const duration = sourceRanges.reduce((s, r) => s + (r.endTime - r.startTime), 0)
    const wordTimestamps: WordTimestamp[] = words.filter((w) =>
      sourceRanges.some((r) => w.start >= r.startTime && w.end <= r.endTime)
    )
    return {
      id: uuidv4(),
      sourceId: source.id,
      sourceRanges,
      duration,
      text: plan.text,
      score: plan.score,
      hookText: plan.hookText,
      reasoning: plan.reasoning,
      status: 'pending' as const,
      wordTimestamps,
    }
  })

  store.setStitchedClips(source.id, stitchedClips)
  reporter.done(
    `${stitchedClips.length} stitched ${stitchedClips.length === 1 ? 'clip' : 'clips'}`
  )
  ctx.markStageCompleted('stitching')
  return stitchedClips
}
