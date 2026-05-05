// ---------------------------------------------------------------------------
// Word emphasis feature — computes emphasis data for downstream features
// ---------------------------------------------------------------------------

import type { RenderFeature, PrepareResult } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import { analyzeEmphasisHeuristic } from '../../word-emphasis'

/**
 * Computes word emphasis levels and emphasis keyframes during prepare().
 *
 * Runs early in the pipeline so downstream features (captions, auto-zoom)
 * can read `job.wordEmphasis` and `job.emphasisKeyframes` without
 * re-running the analysis.
 *
 * Resolution priority:
 *   1. Pre-computed `job.wordEmphasis` (e.g. from AI edit plan)
 *   2. `job.wordEmphasisOverride` (manual overrides)
 *   3. Heuristic analysis via `analyzeEmphasisHeuristic()`
 */
export const wordEmphasisFeature: RenderFeature = {
  name: 'word-emphasis',

  async prepare(job: RenderClipJob, _batchOptions: RenderBatchOptions, _onProgress?: (message: string, percent: number) => void): Promise<PrepareResult> {
    // Need word timestamps to compute emphasis
    const words = (job.wordTimestamps ?? []).filter(
      (w) => w.start >= job.startTime && w.end <= job.endTime
    )
    if (words.length === 0) {
      return { tempFiles: [], modified: false }
    }

    try {
      // Shift to 0-based clip-relative timestamps
      const localWords = words.map((w) => ({
        text: w.text,
        start: w.start - job.startTime,
        end: w.end - job.startTime
      }))

      // Resolve emphasis: prefer pre-computed > override > heuristic
      if (!job.wordEmphasis || job.wordEmphasis.length === 0) {
        if (job.wordEmphasisOverride && job.wordEmphasisOverride.length > 0) {
          job.wordEmphasis = localWords.map((w) => {
            const override = job.wordEmphasisOverride!.find(
              (ov) => Math.abs(ov.start - w.start) < 0.05
            )
            return {
              ...w,
              emphasis: (override?.emphasis ?? 'normal') as 'normal' | 'emphasis' | 'supersize'
            }
          })
        } else {
          job.wordEmphasis = analyzeEmphasisHeuristic(localWords)
        }
      }

      // Compute emphasis keyframes for reactive zoom (if not already provided)
      if (!job.emphasisKeyframes || job.emphasisKeyframes.length === 0) {
        if (job.emphasisKeyframesInput && job.emphasisKeyframesInput.length > 0) {
          job.emphasisKeyframes = job.emphasisKeyframesInput
        } else {
          job.emphasisKeyframes = job.wordEmphasis
            .filter((w) => w.emphasis === 'emphasis' || w.emphasis === 'supersize' || w.emphasis === 'box')
            .map((w) => ({
              time: w.start,
              end: w.end,
              level: w.emphasis as 'emphasis' | 'supersize' | 'box'
            }))
        }
      }

      const emphCount = job.wordEmphasis.filter((w) => w.emphasis === 'emphasis').length
      const superCount = job.wordEmphasis.filter((w) => w.emphasis === 'supersize').length

      if (emphCount > 0 || superCount > 0) {
        console.log(
          `[WordEmphasis] Clip ${job.clipId}: ${emphCount} emphasis, ${superCount} supersize, ` +
            `${job.emphasisKeyframes.length} keyframes`
        )
      }

      return { tempFiles: [], modified: emphCount > 0 || superCount > 0 }
    } catch (err) {
      console.error(
        `[WordEmphasis] Analysis failed for clip ${job.clipId}, falling back to no emphasis:`,
        err
      )
      // Fall back: all words as "normal" — downstream features still work, just without emphasis
      return { tempFiles: [], modified: false }
    }
  }
}
