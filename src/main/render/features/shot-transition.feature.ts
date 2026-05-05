// ---------------------------------------------------------------------------
// Shot Transition render feature — visual transitions at shot boundaries
// ---------------------------------------------------------------------------
//
// Cross-feature integration:
//   prepare()     — emits 'shot-transition' edit events at each shot boundary
//                   so downstream sound-design can sync SFX to transitions
//   videoFilter() — builds FFmpeg fade/swipe/zoom filters at shot boundaries
// ---------------------------------------------------------------------------

import { buildShotTransitionFilters } from '../../shot-transitions'
import type { RenderFeature, PrepareResult, FilterContext } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'

export const shotTransitionFeature: RenderFeature = {
  name: 'shot-transition',

  async prepare(
    job: RenderClipJob,
    _batchOptions: RenderBatchOptions,
    _onProgress?: (message: string, percent: number) => void
  ): Promise<PrepareResult> {
    if (!job.shotStyleConfigs || job.shotStyleConfigs.length < 2) {
      return { tempFiles: [], modified: false }
    }

    try {
      // Find shot boundaries with non-trivial transitions and emit edit events
      // so downstream sound-design can synchronise SFX
      if (!job.editEvents) {
        job.editEvents = []
      }

      let emitted = 0
      const sorted = [...job.shotStyleConfigs].sort((a, b) => a.shotIndex - b.shotIndex)

      for (let i = 0; i < sorted.length - 1; i++) {
        const outgoing = sorted[i]
        const incoming = sorted[i + 1]

        // Pick the effective transition (outgoing's transitionOut wins over incoming's transitionIn)
        const transition = outgoing.transitionOut ?? incoming.transitionIn
        if (!transition || transition.type === 'none') continue

        const boundaryTime = outgoing.endTime - (job.startTime ?? 0)

        // Deduplicate — don't emit if an event already exists at this time
        const alreadyExists = job.editEvents.some(
          (e) => e.type === 'shot-transition' && Math.abs(e.time - boundaryTime) < 0.05
        )
        if (!alreadyExists) {
          job.editEvents.push({
            type: 'shot-transition',
            time: boundaryTime,
            shotTransition: transition.type
          })
          emitted++
        }
      }

      if (emitted > 0) {
        console.log(
          `[ShotTransition] Clip ${job.clipId}: emitted ${emitted} edit event(s) ` +
            `from ${sorted.length} shot(s)`
        )
      }

      return { tempFiles: [], modified: emitted > 0 }
    } catch (err) {
      console.error(`[ShotTransition] Prepare failed for clip ${job.clipId}, skipping:`, err)
      return { tempFiles: [], modified: false }
    }
  },

  videoFilter(job: RenderClipJob, context: FilterContext): string | null {
    if (!job.shotStyleConfigs || job.shotStyleConfigs.length < 2) return null

    const hasTransitions = job.shotStyleConfigs.some(
      (s) =>
        (s.transitionIn && s.transitionIn.type !== 'none') ||
        (s.transitionOut && s.transitionOut.type !== 'none')
    )
    if (!hasTransitions) return null

    try {
      const filter = buildShotTransitionFilters(job.shotStyleConfigs, context.clipDuration)
      return filter || null
    } catch (err) {
      console.error(
        `[ShotTransition] Filter generation failed for clip ${job.clipId}, falling back to hard cut:`,
        err
      )
      return null
    }
  }
}
