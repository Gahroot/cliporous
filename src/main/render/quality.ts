// ---------------------------------------------------------------------------
// Quality resolution — extracted from render-pipeline.ts
// ---------------------------------------------------------------------------

import type { QualityParams } from '../ffmpeg'
import type { RenderBatchOptions } from './types'

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

/** Parse '1080x1920' → { width: 1080, height: 1920 } */
export function parseResolution(res: string): { width: number; height: number } {
  const [w, h] = res.split('x').map(Number)
  return { width: w || 1080, height: h || 1920 }
}
