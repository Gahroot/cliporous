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
  if (!rq) return { crf: 23, preset: 'veryfast' }
  switch (rq.preset) {
    case 'draft':  return { crf: 30, preset: 'ultrafast' }
    case 'high':   return { crf: 18, preset: 'medium' }
    case 'custom': return { crf: rq.customCrf, preset: rq.encodingPreset }
    case 'normal':
    default:       return { crf: 23, preset: 'veryfast' }
  }
}

/**
 * Output resolution is hard-locked to 720×1280 (9:16 vertical).
 * The string argument is ignored — kept for backward-compat call sites.
 */
export function parseResolution(_res: string): { width: number; height: number } {
  return { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT }
}
