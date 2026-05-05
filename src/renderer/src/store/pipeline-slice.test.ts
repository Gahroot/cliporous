/**
 * pipeline-slice.test.ts
 *
 * Drives a fake source through the full pipeline lifecycle and asserts
 * the screen-routing selector returns the correct top-level screen at each
 * transition. Also covers the error path: any stage → error must keep the
 * inline error block reachable (errorLog populated) and route to the screen
 * that owns the failed stage.
 *
 * Spec: `.ezcoder/plans/ux.md` §6 — State → Screen Routing.
 */

import { describe, it, expect, beforeEach } from 'vitest'

import { useStore } from './index'
import {
  PROCESSING_STAGES,
  selectActiveScreen,
  selectScreen,
  type ScreenName,
} from './selectors'
import type { PipelineStage, SourceVideo } from './types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_SOURCE: SourceVideo = {
  id: 'src-fixture-1',
  path: '/tmp/fake-source.mp4',
  name: 'fake-source.mp4',
  duration: 600,
  width: 1920,
  height: 1080,
  origin: 'file',
}

/** Reset the store to a clean slate before every test. */
function resetStore(): void {
  useStore.getState().reset()
  useStore.getState().clearPipelineCache()
  useStore.getState().clearErrors()
}

/** Helper — set the pipeline stage with a default message/percent. */
function setStage(stage: PipelineStage, percent = 0, message = ''): void {
  useStore.getState().setPipeline({ stage, message, percent })
}

/** Helper — read the current top-level screen via the routing selector. */
function currentScreen(): ScreenName {
  return selectActiveScreen(useStore.getState())
}

// ---------------------------------------------------------------------------
// Full happy-path lifecycle
// ---------------------------------------------------------------------------

describe('pipeline lifecycle → screen routing', () => {
  beforeEach(() => {
    resetStore()
  })

  it('routes idle → drop before any source is added', () => {
    expect(useStore.getState().pipeline.stage).toBe('idle')
    expect(currentScreen()).toBe('drop')
  })

  it('drives the full happy-path sequence and routes each stage to the right screen', () => {
    // ── 1. idle ────────────────────────────────────────────────────────────
    expect(useStore.getState().pipeline.stage).toBe('idle')
    expect(currentScreen()).toBe('drop')

    // User drops a source — still idle, but the source is now active.
    useStore.getState().addSource(FAKE_SOURCE)
    useStore.getState().setActiveSource(FAKE_SOURCE.id)
    expect(currentScreen()).toBe('drop') // idle still routes to drop

    // ── 2. downloading ─────────────────────────────────────────────────────
    setStage('downloading', 10, 'Fetching source…')
    expect(currentScreen()).toBe('processing')

    // ── 3. transcribing ────────────────────────────────────────────────────
    useStore.getState().markStageCompleted('downloading')
    setStage('transcribing', 30, 'Transcribing audio…')
    expect(currentScreen()).toBe('processing')

    // ── 4. scoring ─────────────────────────────────────────────────────────
    useStore.getState().markStageCompleted('transcribing')
    setStage('scoring', 60, 'Scoring candidates…')
    expect(currentScreen()).toBe('processing')

    // ── 5. ready ───────────────────────────────────────────────────────────
    useStore.getState().markStageCompleted('scoring')
    setStage('ready', 100, 'Pipeline complete')
    expect(currentScreen()).toBe('clips')

    // ── 6. rendering ───────────────────────────────────────────────────────
    setStage('rendering', 20, 'Rendering clips…')
    expect(currentScreen()).toBe('render')

    // ── 7. done ────────────────────────────────────────────────────────────
    setStage('done', 100, 'All renders complete')
    expect(currentScreen()).toBe('render')
  })

  it('routes ready → drop when no source is active (recovery edge case)', () => {
    // No source added — `ready` should NOT route to clips.
    setStage('ready', 100)
    expect(useStore.getState().activeSourceId).toBeNull()
    expect(currentScreen()).toBe('drop')
  })

  it('routes every PROCESSING_STAGES member to the processing screen', () => {
    useStore.getState().addSource(FAKE_SOURCE)
    useStore.getState().setActiveSource(FAKE_SOURCE.id)
    Array.from(PROCESSING_STAGES).forEach((stage) => {
      setStage(stage)
      expect(selectScreen(stage, true)).toBe('processing')
      expect(currentScreen()).toBe('processing')
    })
  })
})

// ---------------------------------------------------------------------------
// Error path — any stage → error
// ---------------------------------------------------------------------------

describe('pipeline error path → error screen / error log reachable', () => {
  beforeEach(() => {
    resetStore()
  })

  /**
   * Per ux.md §6, `error` is not a separate screen — it stays on the screen
   * that owns the failed stage and shows an inline error block. With an
   * active source that is ProcessingScreen for pipeline failures (the
   * routing selector resolves error → 'processing'). Without an active
   * source the user is bounced back to drop.
   *
   * Either way, the global ErrorLog (driven by `state.errorLog`) must be
   * populated so the user can inspect what went wrong.
   */
  const PIPELINE_STAGES: PipelineStage[] = [
    'downloading',
    'transcribing',
    'scoring',
    'optimizing-loops',
    'detecting-faces',
    'ai-editing',
    'segmenting',
    'ready',
    'rendering',
  ]

  it.each(PIPELINE_STAGES)(
    'transitions %s → error and keeps the inline error block reachable on processing',
    (failedStage) => {
      // Active source is required for "stay on the failed stage's screen".
      useStore.getState().addSource(FAKE_SOURCE)
      useStore.getState().setActiveSource(FAKE_SOURCE.id)

      // Walk the pipeline up to the stage that fails.
      setStage(failedStage, 50, `Working on ${failedStage}`)
      expect(currentScreen()).toBe(
        failedStage === 'ready'
          ? 'clips'
          : failedStage === 'rendering'
            ? 'render'
            : 'processing',
      )

      // ── Stage fails ───────────────────────────────────────────────────
      useStore.getState().setFailedPipelineStage(
        // setFailedPipelineStage only accepts the long-running pipeline
        // stages — for terminal stages (ready/rendering) we just record
        // the most recent processing stage as failed for retry UI.
        failedStage === 'ready' || failedStage === 'rendering'
          ? 'scoring'
          : failedStage,
      )
      setStage('error', 0, `${failedStage} failed`)
      useStore.getState().addError({
        source: 'pipeline',
        message: `${failedStage} failed: simulated test error`,
        details: `stage=${failedStage}`,
      })

      // Routing — error with an active source resolves to 'processing'
      // (the screen that owns the inline error block).
      expect(currentScreen()).toBe('processing')

      // Error log is reachable — the global ErrorLog component reads this.
      const log = useStore.getState().errorLog
      expect(log.length).toBeGreaterThan(0)
      expect(log[log.length - 1].message).toContain(failedStage)
      expect(log[log.length - 1].source).toBe('pipeline')

      // failedPipelineStage is set — drives the "Retry from stage" UI.
      expect(useStore.getState().failedPipelineStage).not.toBeNull()

      // Clean up between iterations.
      resetStore()
    },
  )

  it('routes error → drop when there is no active source (cold-start failure)', () => {
    expect(useStore.getState().activeSourceId).toBeNull()
    setStage('error', 0, 'Crashed before a source was loaded')
    useStore.getState().addError({
      source: 'pipeline',
      message: 'Initial download failed before source was registered',
    })

    expect(currentScreen()).toBe('drop')
    expect(useStore.getState().errorLog.length).toBe(1)
  })

  it('clears error state on retry — error log + failed stage can be reset', () => {
    useStore.getState().addSource(FAKE_SOURCE)
    useStore.getState().setActiveSource(FAKE_SOURCE.id)

    setStage('scoring', 80)
    useStore.getState().setFailedPipelineStage('scoring')
    setStage('error')
    useStore.getState().addError({ source: 'pipeline', message: 'boom' })

    expect(currentScreen()).toBe('processing')
    expect(useStore.getState().errorLog.length).toBe(1)
    expect(useStore.getState().failedPipelineStage).toBe('scoring')

    // User retries.
    useStore.getState().clearErrors()
    useStore.getState().clearPipelineCache()
    setStage('scoring', 0)

    expect(currentScreen()).toBe('processing')
    expect(useStore.getState().errorLog).toEqual([])
    expect(useStore.getState().failedPipelineStage).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Pure selector unit tests — no store coupling
// ---------------------------------------------------------------------------

describe('selectScreen — pure mapping', () => {
  it.each<[PipelineStage, boolean, ScreenName]>([
    ['idle', false, 'drop'],
    ['idle', true, 'drop'],
    ['downloading', true, 'processing'],
    ['transcribing', true, 'processing'],
    ['scoring', true, 'processing'],
    ['optimizing-loops', true, 'processing'],
    ['detecting-faces', true, 'processing'],
    ['ai-editing', true, 'processing'],
    ['segmenting', true, 'processing'],
    ['ready', true, 'clips'],
    ['ready', false, 'drop'],
    ['rendering', true, 'render'],
    ['rendering', false, 'render'],
    ['done', true, 'render'],
    ['done', false, 'render'],
    ['error', true, 'processing'],
    ['error', false, 'drop'],
  ])('selectScreen(%s, hasSource=%s) → %s', (stage, hasSource, expected) => {
    expect(selectScreen(stage, hasSource)).toBe(expected)
  })
})
