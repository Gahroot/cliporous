import type { ClipCandidate } from '../../store'
import { createStageReporter } from '../../lib/progress-reporter'
import type { PipelineContext } from './types'

/**
 * MediaPipe face detection + PySceneDetect per-scene crop timelines.
 *
 * Clips with `cropRegionSource === 'manual'` are skipped so user drag-edits
 * aren't clobbered by a re-run.
 */
export async function faceDetectionStage(
  ctx: PipelineContext,
  sourcePath: string,
  clips: ClipCandidate[]
): Promise<void> {
  const { source, check, setPipeline, store } = ctx
  const reporter = createStageReporter(setPipeline, 'detecting-faces')

  reporter.start('Starting face detection…')
  check()

  // Preserve original indexing so we can write back to the right clip.
  const indexed = clips.map((c, i) => ({ clip: c, i }))
  const targets = indexed.filter(({ clip }) => clip.cropRegionSource !== 'manual')

  if (targets.length === 0) {
    reporter.done('All clips have manual crops — skipping detection')
    return
  }

  const segments = targets.map(({ clip }) => ({ start: clip.startTime, end: clip.endTime }))

  const unsubFace = window.api.onFaceDetectionProgress(({ segment, total }) => {
    const percent = total > 0 ? Math.round((segment / total) * 100) : 0
    reporter.update(`Detecting faces… ${segment}/${total}`, percent)
  })

  let results
  try {
    results = await window.api.detectFaceCrops(sourcePath, segments)
  } finally {
    unsubFace()
  }
  check()

  results.forEach((result, detIdx) => {
    const target = targets[detIdx]
    if (!target) return
    store.updateClipCrop(source.id, target.clip.id, result.crop, {
      timeline: result.timeline,
      source: 'auto'
    })
  })
}
