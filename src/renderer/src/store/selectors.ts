import type { AppState, ClipCandidate } from './types'

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
