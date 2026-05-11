/**
 * Types for the edit-styles / templates system.
 *
 * EditStyleTemplate — authored per (edit-style × archetype). Carries only
 * the per-archetype tuning the render engine needs (zoom, caption margin).
 * Archetypes are self-contained layouts; there are no style variants.
 *
 * ResolvedTemplate — what the render pipeline consumes after merging a
 * template with its edit-style defaults.
 */

import type { Archetype } from './archetypes'

// Types referenced here (EditStyle, TransitionType, SegmentStyleCategory,
// CaptionStyleInput, ColorGradeParams, VFXOverlay, TextAnimationStyle,
// HeadlineStyleConfig) are declared globally in src/main/global.d.ts — we
// consume the ambient declarations.

export type Energy = 'low' | 'medium' | 'high'

export type TMap = Record<string, TransitionType>

export type CaptionPosition = 'lower-third' | 'center' | 'top'

/**
 * Per-template caption rendering mode override.
 *
 *   • 'word-by-word' — emit ONE ASS dialogue event per word, using each
 *     word's own start/end timestamp. Used by hero archetypes
 *     (fullscreen-quote, fullscreen-image) to maximize emphasis when the
 *     caption is the only on-screen element.
 *
 * When omitted, captions use the default multi-word grouping driven by
 * `CaptionStyleInput.wordsPerLine`.
 */
export type TemplateCaptionMode = 'word-by-word'

export interface EditStyleTemplate {
  archetype: Archetype
  /** Overrides the editStyle default zoom when set. */
  zoomStyle?: EditStyle['defaultZoomStyle']
  zoomIntensity?: number
  captionPosition?: CaptionPosition
  /**
   * Per-archetype vertical margin (pixels) for the caption pass. Overrides
   * the captionPosition-derived default.
   */
  captionMarginV?: number
  /**
   * Optional per-archetype caption rendering mode. Currently only
   * 'word-by-word' is supported; omit for the default multi-word grouping.
   */
  captionMode?: TemplateCaptionMode
  /**
   * Per-archetype Y position (pixels from top, on the locked 1280px canvas)
   * for the hook title pill. The global `templateLayout.titleText.y` still
   * wins when provided by the user.
   */
  hookTitleY?: number
  /**
   * Per-archetype Y position (pixels from top, on the locked 1280px canvas)
   * for the rehook pill. The global `templateLayout.rehookText.y` still wins
   * when provided by the user.
   */
  rehookY?: number
}

/** Fully resolved template — what render consumes. */
export interface ResolvedTemplate {
  archetype: Archetype
  editStyleId: string
  zoomStyle: EditStyle['defaultZoomStyle']
  zoomIntensity: number
  captionPosition: CaptionPosition
  /** Archetype-defined caption vertical margin in pixels. */
  captionMarginV: number
  /** Hook title pill Y position in pixels (from top, 1280px canvas). */
  hookTitleY: number
  /** Rehook pill Y position in pixels (from top, 1280px canvas). */
  rehookY: number
  /**
   * Caption rendering mode for this archetype. `undefined` = default
   * multi-word grouping; `'word-by-word'` = one ASS event per word.
   */
  captionMode?: TemplateCaptionMode
}

/** Picker-facing projection (includes display metadata). */
export interface EditStyleTemplateView {
  archetype: Archetype
  editStyleId: string
  name: string
  description: string
  category: SegmentStyleCategory
  zoomStyle: EditStyle['defaultZoomStyle']
  zoomIntensity: number
  captionPosition: CaptionPosition
}
