// ---------------------------------------------------------------------------
// Quality resolution — extracted from render-pipeline.ts
// ---------------------------------------------------------------------------

import type { QualityParams } from '../ffmpeg'
import type { RenderBatchOptions } from './types'
import { OUTPUT_WIDTH, OUTPUT_HEIGHT } from '../aspect-ratios'

/**
 * Resolve the effective CRF and preset from a renderQuality block.
 * Named presets override the custom fields; 'custom' uses them directly.
 */
export function resolveQualityParams(rq?: RenderBatchOptions['renderQuality']): QualityParams {
  if (!rq) return { crf: 20, preset: 'medium' }
  switch (rq.preset) {
    case 'draft':  return { crf: 28, preset: 'veryfast' }
    case 'high':   return { crf: 17, preset: 'slow' }
    case 'custom': return { crf: rq.customCrf, preset: rq.encodingPreset }
    case 'normal':
    default:       return { crf: 20, preset: 'medium' }
  }
}

/**
 * Output resolution is hard-locked to 1080×1920 (9:16 vertical).
 * The string argument is ignored — kept for backward-compat call sites.
 */
export function parseResolution(_res: string): { width: number; height: number } {
  return { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT }
}

/**
 * Quality params for *intermediate* encodes (per-segment, xfade-concat).
 *
 * The segmented render path produces several transient mp4s before the final
 * overlay pass burns captions / hook titles and writes the deliverable. Each
 * of those intermediate files is decoded and re-encoded by the next stage,
 * so encoding them at the user-selected CRF (20 / 17 / 28) bakes a
 * generational H.264 loss into every stage — three back-to-back libx264
 * passes visibly soften faces and high-frequency detail.
 *
 * Intermediates should instead be encoded near-losslessly. CRF 12 with the
 * `veryfast` preset is the libx264 sweet spot: visually transparent on
 * realistic content (faces, gradients, text) while encoding ~2× faster than
 * `medium`. Only the final overlay pass should bake in the user's quality
 * preset, because that's the file the user actually keeps.
 *
 * NVENC mirrors this via the relaxed CQ floor in `getEncoder()` — at CRF 12
 * the hardware path requests CQ 10, which is the closest NVENC analogue to
 * libx264's near-transparent region.
 */
export function getIntermediateQuality(): QualityParams {
  return { crf: 12, preset: 'veryfast' }
}
