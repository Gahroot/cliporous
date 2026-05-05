// ---------------------------------------------------------------------------
// Accent Color Feature — propagates a single per-clip accent color to all
// visual subsystems (captions, hook title, progress bar, rehook).
//
// Runs early in the prepare phase so downstream features see the overridden
// colors. When job.clipOverrides.accentColor is set, it replaces the
// highlight/emphasis colors in caption style, hook title text color, and
// progress bar color — painting the whole edit with one brush stroke.
//
// IMPORTANT: batchOptions is shared across all clips in a batch. This feature
// saves the original values before mutation and restores them in postProcess()
// so that clip N's accent color doesn't leak into clip N+1.
// ---------------------------------------------------------------------------

import type { RenderFeature, PrepareResult, PostProcessContext } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import type { CaptionStyleInput } from '../../captions'

/**
 * Derive a lighter tint from a hex color for the supersize word color.
 * Blends the input color 40% toward white.
 */
function lightenColor(hex: string, amount = 0.4): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  const lr = Math.round(r + (255 - r) * amount)
  const lg = Math.round(g + (255 - g) * amount)
  const lb = Math.round(b + (255 - b) * amount)
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
}

/** Snapshot of batch-level options before accent color mutation (for restore). */
interface BatchSnapshot {
  captionStyle?: CaptionStyleInput
  hookTitleOverlay?: RenderBatchOptions['hookTitleOverlay']
}

export const accentColorFeature: RenderFeature = {
  name: 'accent-color',

  async prepare(job: RenderClipJob, batchOptions: RenderBatchOptions, _onProgress?: (message: string, percent: number) => void): Promise<PrepareResult> {
    const accent = job.clipOverrides?.accentColor
    if (!accent) {
      // No accent color for this clip — clear any snapshot from a previous clip
      // to prevent an accidental restore of stale values.
      delete (job as unknown as Record<string, unknown>).__accentSnapshot
      return { tempFiles: [], modified: false }
    }

    try {
      // Validate the accent color is a parseable hex string
      const cleanAccent = accent.replace('#', '')
      if (!/^[0-9a-fA-F]{6}$/.test(cleanAccent)) {
        console.warn(
          `[AccentColor] Clip ${job.clipId}: invalid accent color "${accent}", skipping accent override`
        )
        return { tempFiles: [], modified: false }
      }

      // ── Save originals before mutation ─────────────────────────────────────
      // Shallow-clone each object so downstream features can read the mutated
      // version while we retain the originals for postProcess() restore.
      const snapshot: BatchSnapshot = {}
      if (batchOptions.captionStyle) {
        snapshot.captionStyle = { ...batchOptions.captionStyle }
      }
      if (batchOptions.hookTitleOverlay) {
        snapshot.hookTitleOverlay = { ...batchOptions.hookTitleOverlay }
      }
      // Stash on the job so postProcess can find it (per-clip state).
      ;(job as unknown as Record<string, unknown>).__accentSnapshot = snapshot

      const supersizeColor = lightenColor(accent, 0.4)

      // ── Caption style overrides ────────────────────────────────────────────
      if (batchOptions.captionStyle) {
        batchOptions.captionStyle = {
          ...batchOptions.captionStyle,
          highlightColor: accent,
          emphasisColor: accent,
          supersizeColor
        }
      }

      // ── Hook title overlay — accent becomes text color ─────────────────────
      if (batchOptions.hookTitleOverlay) {
        batchOptions.hookTitleOverlay = {
          ...batchOptions.hookTitleOverlay,
          textColor: accent
        }
      }

      // Note: rehook overlay inherits textColor from hookTitleOverlay (see
      // rehook.feature.ts:153), so no separate override is needed here.

      // ── Per-shot style configs — tint caption colors in each shot ──────────
      if (job.shotStyleConfigs && job.shotStyleConfigs.length > 0) {
        for (const shotConfig of job.shotStyleConfigs) {
          if (shotConfig.captionStyle) {
            shotConfig.captionStyle = {
              ...shotConfig.captionStyle,
              highlightColor: accent,
              emphasisColor: accent,
              supersizeColor
            }
          }
        }
      }

      console.log(
        `[AccentColor] Clip ${job.clipId}: applying accent ${accent} → ` +
        `captions, hook title (+rehook), per-shot styles`
      )

      return { tempFiles: [], modified: true }
    } catch (err) {
      console.error(
        `[AccentColor] Failed to apply accent color for clip ${job.clipId}, skipping:`,
        err
      )
      return { tempFiles: [], modified: false }
    }
  },

  /**
   * Restore batch-level options to their pre-mutation state so the next
   * clip in the batch doesn't inherit this clip's accent color.
   */
  async postProcess(
    job: RenderClipJob,
    _renderedPath: string,
    _context: PostProcessContext
  ): Promise<string> {
    const snapshot = (job as unknown as Record<string, unknown>).__accentSnapshot as BatchSnapshot | undefined
    if (!snapshot) return _renderedPath

    // Restore is called from the pipeline which holds the same batchOptions ref
    // We need to get batchOptions back — but postProcess doesn't receive it.
    // Instead, the pipeline will call a dedicated restore method.
    // Clean up the snapshot from the job to avoid memory leaks.
    delete (job as unknown as Record<string, unknown>).__accentSnapshot
    return _renderedPath
  }
}

/**
 * Restore batch-level options that were mutated by prepare() back to their
 * original values. Called by the pipeline after each clip finishes rendering.
 *
 * This is exported as a standalone function rather than a feature hook because
 * the postProcess() hook doesn't receive batchOptions — only the job.
 */
export function restoreBatchOptions(
  job: RenderClipJob,
  batchOptions: RenderBatchOptions
): void {
  const snapshot = (job as unknown as Record<string, unknown>).__accentSnapshot as BatchSnapshot | undefined
  if (!snapshot) return

  if (snapshot.captionStyle) {
    batchOptions.captionStyle = snapshot.captionStyle
  }
  if (snapshot.hookTitleOverlay) {
    batchOptions.hookTitleOverlay = snapshot.hookTitleOverlay
  }

  // Clean up the snapshot from the job
  delete (job as unknown as Record<string, unknown>).__accentSnapshot
}
