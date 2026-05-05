import type { ClipCandidate } from '../../store'
import type { PipelineContext } from './types'

/** Mark the pipeline as ready and fire the OS notification when unfocused. */
export function notificationStage(ctx: PipelineContext, clips: ClipCandidate[]): void {
  const { setPipeline, getState } = ctx

  setPipeline({ stage: 'ready', message: `Found ${clips.length} clip candidates`, percent: 100 })

  // Intentionally reading latest state at execution time — notification
  // preferences should reflect the current settings.
  const state = getState()
  if (state.settings.enableNotifications && !document.hasFocus()) {
    const maxScore = clips.length > 0 ? Math.max(...clips.map((c) => c.score)) : 0
    window.api.sendNotification({
      title: 'Processing Complete',
      body: `Found ${clips.length} clips with scores up to ${maxScore}`
    })
  }
}
