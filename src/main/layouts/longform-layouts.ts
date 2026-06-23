/**
 * Long-form (16:9) layout filter builder.
 *
 * Keyed on `LongformArchetype` — kept separate from `segment-layouts.ts`
 * (which is keyed on the 9:16 `Archetype` union) so the short-form layout
 * system is untouched. The only archetype is `speaker`: a face-centered 16:9
 * crop that delegates to the proven `buildArchetypeLayout('talking-head', …)`
 * builder with landscape target dimensions; its aspect-correct sub-crop
 * handles 16:9 framing without distortion. Content blocks are Remotion renders
 * muxed in by the long-form pipeline, not FFmpeg layouts.
 *
 * Produces a `[outv]` label with SAR 1:1 + yuv420p, ready to encode.
 */

import type { LongformArchetype } from '@shared/types'
import {
  buildArchetypeLayout,
  type SegmentLayoutParams,
  type SegmentLayoutResult
} from './segment-layouts'

/**
 * Resolve a long-form archetype into an FFmpeg layout for a single segment.
 */
export function buildLongformLayout(
  _archetype: LongformArchetype,
  params: SegmentLayoutParams
): SegmentLayoutResult {
  // Reuse the tested talking-head crop+scale with landscape dimensions.
  return buildArchetypeLayout('talking-head', params)
}
