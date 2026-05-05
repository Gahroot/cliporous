/**
 * Types for the edit-styles / templates system.
 *
 * EditStyleTemplate — authored per (edit-style × archetype). Binds an
 * archetype to one of the 13 existing SegmentStyleVariants and tunes knobs.
 *
 * ResolvedTemplate — what the render pipeline consumes after merging a
 * template with its parent variant and edit style defaults.
 */

import type { Archetype } from './archetypes'

// Types referenced here (EditStyle, SegmentStyleVariant, TransitionType,
// SegmentStyleCategory, CaptionStyleInput, ColorGradeParams, VFXOverlay,
// TextAnimationStyle, HeadlineStyleConfig) are declared globally in
// src/preload/index.d.ts or in the monolith — we consume the ambient
// declarations.

export type Energy = 'low' | 'medium' | 'high'

export type TMap = Record<string, TransitionType>

export interface EditStyleTemplate {
  archetype: Archetype
  /** Picks ONE of the 13 variants from segment-styles.ts. */
  variantId: string
  /** Knob overrides merged into the variant's SegmentLayoutParams. */
  layoutParamOverrides?: {
    overlayText?: string
    textColor?: string
    accentColor?: string
    /**
     * Solid background color for layouts that paint a backdrop (e.g.
     * fullscreen-quote, fullscreen-headline — "no-broll" archetypes).
     */
    backgroundColor?: string
    captionBgOpacity?: number
    fontSize?: number
  }
  /** Overrides the variant/editStyle default zoom when set. */
  zoomStyle?: EditStyle['defaultZoomStyle']
  zoomIntensity?: number
  captionPosition?: SegmentStyleVariant['captionPosition']
  imageLayout?: SegmentStyleVariant['imageLayout']
  imagePlacement?: SegmentStyleVariant['imagePlacement']
  /**
   * Per-archetype vertical margin (pixels) for the caption pass. Overrides
   * the captionPosition-derived default. Matches the MarginV seen in each
   * PRESTYJ reference .ass (e.g. 280 for tight-punch, 420 for headline/quote
   * so captions fit under the hero, 250 for floating-broll).
   */
  captionMarginV?: number
}

/** Fully resolved template — what render consumes. */
export interface ResolvedTemplate {
  archetype: Archetype
  editStyleId: string
  variant: SegmentStyleVariant
  zoomStyle: EditStyle['defaultZoomStyle']
  zoomIntensity: number
  captionPosition: SegmentStyleVariant['captionPosition']
  layoutParamOverrides: NonNullable<EditStyleTemplate['layoutParamOverrides']>
  /** Archetype-defined caption vertical margin in pixels, if any. */
  captionMarginV?: number
}

/** Picker-facing projection (includes display metadata). */
export interface EditStyleTemplateView {
  archetype: Archetype
  editStyleId: string
  name: string
  description: string
  category: SegmentStyleCategory
  variantId: string
  zoomStyle: EditStyle['defaultZoomStyle']
  zoomIntensity: number
  captionPosition: SegmentStyleVariant['captionPosition']
  imageLayout?: SegmentStyleVariant['imageLayout']
  imagePlacement?: SegmentStyleVariant['imagePlacement']
}
