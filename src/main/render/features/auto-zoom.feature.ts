// ---------------------------------------------------------------------------
// Auto-Zoom feature — Ken Burns-style zoom/pan via crop+scale filter
// ---------------------------------------------------------------------------

import { generateZoomFilter, generatePiecewiseZoomFilter } from '../../auto-zoom'
import type { ZoomSettings } from '../../auto-zoom'
import type { RenderFeature, PrepareResult, FilterContext } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'

/**
 * Applies subtle Ken Burns-style zoom and pan movements using FFmpeg's crop
 * filter with time-based expressions. The zoom filter is inserted into the
 * base video filter chain AFTER `scale` and BEFORE any subtitle burn-in.
 *
 * Unlike overlay features (which run as separate FFmpeg passes), auto-zoom is
 * part of the base video filter chain via `videoFilter()`.
 */
class AutoZoomFeature implements RenderFeature {
  readonly name = 'auto-zoom'

  /**
   * Effective zoom settings resolved per-clip during prepare().
   * Keyed by clipId so concurrent renders don't clash.
   */
  private clipZoomSettings = new Map<string, ZoomSettings | null>()

  async prepare(
    job: RenderClipJob,
    batchOptions: RenderBatchOptions,
    _onProgress?: (message: string, percent: number) => void
  ): Promise<PrepareResult> {
    const globalSettings = batchOptions.autoZoom

    // No global auto-zoom configured → skip
    if (!globalSettings?.enabled) {
      this.clipZoomSettings.set(job.clipId, null)
      return { tempFiles: [], modified: false }
    }

    // Per-clip override can disable auto-zoom for this clip
    if (job.clipOverrides?.enableAutoZoom === false) {
      this.clipZoomSettings.set(job.clipId, null)
      console.log(`[AutoZoom] Disabled for clip ${job.clipId} (per-clip override)`)
      return { tempFiles: [], modified: false }
    }

    // Store the effective settings for videoFilter() to consume
    this.clipZoomSettings.set(job.clipId, globalSettings)

    const clipDuration = job.endTime - job.startTime

    // For reactive mode, emphasis keyframes should already be populated by the
    // upstream word-emphasis feature. Log availability for diagnostics.
    if (globalSettings.mode === 'reactive') {
      if (job.emphasisKeyframes && job.emphasisKeyframes.length > 0) {
        console.log(
          `[AutoZoom] Reactive mode — using ${job.emphasisKeyframes.length} emphasis keyframes ` +
            `from upstream feature for clip ${job.clipId}`
        )
      } else {
        // Fallback: no emphasis data available (e.g. no word timestamps)
        console.log(
          `[AutoZoom] Reactive mode — no emphasis keyframes available for clip ${job.clipId}, ` +
            `falling back to ken-burns behavior`
        )
      }
    }

    console.log(
      `[AutoZoom] Enabled — mode: ${globalSettings.mode}, intensity: ${globalSettings.intensity}, ` +
        `interval: ${globalSettings.intervalSeconds}s, clip duration: ${clipDuration.toFixed(1)}s`
    )

    return { tempFiles: [], modified: true }
  }

  videoFilter(job: RenderClipJob, context: FilterContext): string | null {
    const settings = this.clipZoomSettings.get(job.clipId)
    if (!settings) return null

    try {
      let filter: string | undefined

      // When per-shot style configs are present with zoom overrides, use piecewise zoom
      if (job.shotStyleConfigs && job.shotStyleConfigs.length > 0) {
        const shotsWithZoom = job.shotStyleConfigs.filter(
          (s) => s.zoom !== null && s.zoom !== undefined
        )
        if (shotsWithZoom.length > 0) {
          filter = generatePiecewiseZoomFilter(
            context.clipDuration,
            settings,
            job.shotStyleConfigs,
            0.38,
            context.targetWidth,
            context.targetHeight,
            job.wordTimestamps,
            job.emphasisKeyframes
          )
        }
      }

      // Fall back to uniform zoom for the entire clip
      if (!filter) {
        filter = generateZoomFilter(
          context.clipDuration,
          settings,
          0.38,
          context.targetWidth,
          context.targetHeight,
          job.wordTimestamps,
          job.emphasisKeyframes
        )
      }

      // Clean up the stored settings now that we've consumed them
      this.clipZoomSettings.delete(job.clipId)

      return filter || null
    } catch (err) {
      console.error(`[AutoZoom] Filter generation failed for clip ${job.clipId}, skipping zoom:`, err)
      this.clipZoomSettings.delete(job.clipId)
      return null
    }
  }
}

export const autoZoomFeature = new AutoZoomFeature()
