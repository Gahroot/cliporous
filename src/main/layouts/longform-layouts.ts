/**
 * Long-form (16:9) layout filter builders.
 *
 * Keyed on `LongformArchetype` — kept separate from `segment-layouts.ts`
 * (which is keyed on the 9:16 `Archetype` union) so the short-form layout
 * system is untouched.
 *
 *   - speaker        — face-centered 16:9 crop. Delegates to the proven
 *                      `buildArchetypeLayout('talking-head', …)` builder with
 *                      landscape target dimensions; its aspect-correct
 *                      sub-crop handles 16:9 framing without distortion.
 *   - concept-card   — solid dark background (placeholder; the real card is a
 *                      Remotion render muxed in by the long-form pipeline).
 *   - section-header — solid dark background (same placeholder rationale).
 *
 * All builders produce a `[outv]` label with SAR 1:1 + yuv420p, ready to encode.
 */

import type { LongformArchetype } from '@shared/types'
import {
  buildArchetypeLayout,
  type SegmentLayoutParams,
  type SegmentLayoutResult
} from './segment-layouts'
import { HORMOZI_CARD_BG } from '../edit-styles/hormozi'

/** Convert CSS hex (#RRGGBB or #RGB) to FFmpeg color format (0xRRGGBB). */
function hexToFFmpeg(hex: string): string {
  let clean = hex.replace(/^#/, '')
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
  }
  return '0x' + clean
}

/**
 * Build a solid-color full-frame source. Used as the placeholder background
 * for card / header segments — the Remotion render supplies the real visual,
 * but if a caller ever encodes one of these directly they get a clean fill
 * rather than a black frame.
 */
function buildSolidBackground(
  params: SegmentLayoutParams,
  color: string
): SegmentLayoutResult {
  const dur = params.segmentDuration.toFixed(3)
  const fps = params.fps ?? 30
  const fc =
    `color=c=${hexToFFmpeg(color)}:s=${params.width}x${params.height}:r=${fps}:d=${dur}` +
    `[bg];[bg]setsar=1,format=yuv420p[outv]`
  // inputCount 0 → caller supplies no -i input; the color source is generated.
  return { filterComplex: fc, inputCount: 0 }
}

/**
 * Resolve a long-form archetype into an FFmpeg layout for a single segment.
 */
export function buildLongformLayout(
  archetype: LongformArchetype,
  params: SegmentLayoutParams
): SegmentLayoutResult {
  switch (archetype) {
    case 'speaker':
      // Reuse the tested talking-head crop+scale with landscape dimensions.
      return buildArchetypeLayout('talking-head', params)
    case 'concept-card':
    case 'section-header':
      return buildSolidBackground(params, HORMOZI_CARD_BG)
    default:
      return buildArchetypeLayout('talking-head', params)
  }
}
