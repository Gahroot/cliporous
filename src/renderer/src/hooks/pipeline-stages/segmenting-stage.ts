import type { ClipCandidate } from '../../store'
import { createStageReporter } from '../../lib/progress-reporter'
import type { PipelineContext } from './types'
import { handleStageError } from './types'
import { splitIntoSegments, assignArchetypesDeterministic } from '@shared/segments'

const TARGET_SEGMENT_DURATION_SECONDS = 3

/**
 * Per-clip segmenting + deterministic archetype assignment.
 *
 * Runs entirely in-process — no IPC, no Gemini, no image generation. Image
 * generation for image-archetype segments happens at render time inside the
 * main-process render pipeline, only for clips the user actually approves.
 *
 * For each clip we:
 *   1. Split its words into ~3s segments at natural sentence/pause boundaries.
 *   2. Stamp each segment with an archetype using a deterministic rotation
 *      (tight-punch hook → varied middle → talking-head close).
 *   3. Persist the result to `clip.segments` so render-service can hand it
 *      to the segmented render path via `job.segmentedSegments`.
 */
export async function segmentingStage(
  ctx: PipelineContext,
  clips: ClipCandidate[]
): Promise<void> {
  const { source, check, setPipeline, addError, store, shouldSkip, getState } = ctx
  if (shouldSkip('segmenting')) return
  if (clips.length === 0) return

  const reporter = createStageReporter(setPipeline, 'segmenting')
  reporter.start('Planning segment styles…')

  // Whether media archetypes (split-image / fullscreen-image) are eligible.
  // Without a Pexels key the render pipeline cannot fetch b-roll videos,
  // so we drop those archetypes from rotation rather than letting them
  // degrade to talking-head at render time.
  const settings = getState().settings
  const hasMediaKey = Boolean(settings.pexelsApiKey)

  for (let i = 0; i < clips.length; i++) {
    check()
    const clip = clips[i]
    const percent = Math.round(((i + 1) / clips.length) * 100)
    reporter.update(`Styling segments — clip ${i + 1}/${clips.length}…`, percent)

    const clipWords = (clip.wordTimestamps ?? []).filter(
      (w) => w.start >= clip.startTime && w.end <= clip.endTime
    )
    if (clipWords.length === 0) continue

    try {
      const rawSegments = splitIntoSegments(clip.id, clipWords, TARGET_SEGMENT_DURATION_SECONDS)
      const segments = assignArchetypesDeterministic(rawSegments, hasMediaKey)
      store.setClipSegments(source.id, clip.id, segments)
    } catch (err) {
      handleStageError(err, `Segment styling failed for clip ${i + 1}`, addError)
    }
  }

  reporter.done('Segment styles assigned')
}
