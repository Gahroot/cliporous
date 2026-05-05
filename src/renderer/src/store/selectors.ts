import type { AppState, ClipCandidate, PipelineStage } from './types'

// ---------------------------------------------------------------------------
// Memoized selector: selectActiveClips
// ---------------------------------------------------------------------------
// Hand-rolled memoization that caches the sorted result and only re-computes
// when the underlying source clips array reference changes.
// Usage:  useStore(selectActiveClips)  — returns a stable array ref.
// ---------------------------------------------------------------------------

let _cachedInput: ClipCandidate[] | null = null
let _cachedResult: ClipCandidate[] = []

export function selectActiveClips(state: AppState): ClipCandidate[] {
  const { clips, activeSourceId } = state
  if (!activeSourceId) return _cachedResult.length === 0 ? _cachedResult : (_cachedResult = [])
  const sourceClips = clips[activeSourceId]
  if (!sourceClips || sourceClips.length === 0)
    return _cachedResult.length === 0 ? _cachedResult : (_cachedResult = [])

  if (sourceClips === _cachedInput) return _cachedResult

  _cachedInput = sourceClips
  _cachedResult = [...sourceClips].sort((a, b) => b.score - a.score)
  return _cachedResult
}

// ---------------------------------------------------------------------------
// Screen routing — pipeline.stage → top-level screen identifier.
// Single source of truth. Mirrors `.ezcoder/plans/ux.md §6`.
// ---------------------------------------------------------------------------

export type ScreenName = 'drop' | 'processing' | 'clips' | 'render'

/** Stages that map to ProcessingScreen — the long-running pipeline phases. */
export const PROCESSING_STAGES: ReadonlySet<PipelineStage> = new Set<PipelineStage>([
  'downloading',
  'transcribing',
  'scoring',
  'optimizing-loops',
  'detecting-faces',
  'ai-editing',
  'segmenting',
])

/**
 * Map a pipeline stage to the top-level screen the app should render.
 *
 * Rules (from ux.md §6):
 *   - idle                                    → drop
 *   - downloading…segmenting (PROCESSING)     → processing
 *   - ready                                   → clips (or drop if no source)
 *   - rendering | done                        → render
 *   - error                                   → stays on the screen that owns
 *     the failed stage. With an active source this is processing;
 *     without one it falls back to drop.
 */
export function selectScreen(stage: PipelineStage, hasActiveSource: boolean): ScreenName {
  if (PROCESSING_STAGES.has(stage)) return 'processing'
  if (stage === 'ready') return hasActiveSource ? 'clips' : 'drop'
  if (stage === 'rendering' || stage === 'done') return 'render'
  if (stage === 'error' && hasActiveSource) return 'processing'
  return 'drop'
}

/** Convenience selector — derives the active screen from full app state. */
export function selectActiveScreen(state: AppState): ScreenName {
  return selectScreen(state.pipeline.stage, state.activeSourceId !== null)
}
