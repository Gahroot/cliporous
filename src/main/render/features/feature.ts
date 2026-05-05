// ---------------------------------------------------------------------------
// RenderFeature interface — composable pipeline feature system
// ---------------------------------------------------------------------------

import type { RenderClipJob, RenderBatchOptions, OutputAspectRatio } from '../types'

/**
 * A composable render feature that can hook into different phases of the
 * render pipeline. Each feature is self-contained and independently testable.
 *
 * Lifecycle:
 *   1. prepare()     — pre-render setup (generate ASS files, temp assets)
 *   2. videoFilter() — contribute to the base -vf filter chain
 *   3. overlayPass() — post-render overlay pass (separate FFmpeg invocation)
 *   4. postProcess() — final post-processing (B-Roll, concat, etc.)
 */
export interface RenderFeature {
  /** Unique name for logging and debugging */
  readonly name: string

  /**
   * Phase 1: Pre-render setup. Called before FFmpeg runs.
   * Can modify the job (e.g. generate ASS files, set paths).
   * Return temp files to clean up after render completes.
   */
  prepare?(
    job: RenderClipJob,
    batchOptions: RenderBatchOptions,
    onProgress?: (message: string, percent: number) => void
  ): Promise<PrepareResult>

  /**
   * Phase 2: Contribute to the base video filter chain.
   * Return a filter string segment to append to -vf.
   * Called in order: filler-select → crop → scale → zoom.
   * Return null to skip.
   */
  videoFilter?(job: RenderClipJob, context: FilterContext): string | null

  /**
   * Phase 3: Post-render overlay pass.
   * Return an FFmpeg filter config for a separate re-encode pass.
   * Each overlay runs as its own FFmpeg invocation to avoid
   * Windows escaping issues with massive combined filter strings.
   * Return null to skip.
   */
  overlayPass?(job: RenderClipJob, context: OverlayContext): OverlayPassResult | null

  /**
   * Phase 4: Post-processing (after all overlays).
   * For things like B-Roll that need the fully-rendered clip as input.
   * Returns the path to the final output (may be the same as renderedPath).
   */
  postProcess?(
    job: RenderClipJob,
    renderedPath: string,
    context: PostProcessContext
  ): Promise<string>
}

/** Result from the prepare phase */
export interface PrepareResult {
  /** Temp files to clean up after this clip finishes rendering */
  tempFiles: string[]
  /** Whether this feature modified the job (for logging) */
  modified: boolean
}

/** Context passed to videoFilter() */
export interface FilterContext {
  sourceWidth: number
  sourceHeight: number
  targetWidth: number
  targetHeight: number
  clipDuration: number
  outputAspectRatio: OutputAspectRatio
}

/** Context passed to overlayPass() */
export interface OverlayContext {
  clipDuration: number
  targetWidth: number
  targetHeight: number
}

/** Result from the overlayPass phase */
export interface OverlayPassResult {
  /** Display name for logging (e.g. 'captions', 'hook-title') */
  name: string
  /** FFmpeg video filter string to apply */
  filter: string
  /**
   * When true, `filter` is a filter_complex string (must map [0:v] → [outv])
   * instead of a simple -vf chain. Required for filters that need multiple
   * inputs (e.g. color source + overlay for animated progress bar).
   */
  filterComplex?: boolean
}

/** Context passed to postProcess() */
export interface PostProcessContext {
  clipDuration: number
  outputPath: string
}
