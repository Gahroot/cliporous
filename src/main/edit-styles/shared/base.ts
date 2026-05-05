/**
 * Baseline caption/headline/energy defaults and the createEditStyle factory.
 * Moved verbatim from the old src/main/edit-styles.ts monolith.
 */

import type { Energy, TMap } from './types'

// Types referenced below (EditStyle, CaptionStyleInput, HeadlineStyleConfig,
// VFXOverlay, ColorGradeParams, TextAnimationStyle, TransitionType) are
// declared globally.

// ---------------------------------------------------------------------------
// Segment variant ids available per energy tier (kept for backwards compat
// on the EditStyle.availableSegmentStyles field — no longer consulted by the
// archetype-based AI styler, but render/pipeline reads still reference it).
// ---------------------------------------------------------------------------

export const LOW_ENERGY_SEGMENTS = [
  'main-video-normal',
  'main-video-wide',
  'main-video-text-lower',
  'fullscreen-text-center'
]

export const MEDIUM_ENERGY_SEGMENTS = [
  'main-video-normal',
  'main-video-tight',
  'main-video-wide',
  'main-video-text-lower',
  'main-video-text-center',
  'fullscreen-text-center'
]

export const HIGH_ENERGY_SEGMENTS = [
  'main-video-normal',
  'main-video-tight',
  'main-video-text-lower',
  'main-video-text-center',
  'fullscreen-text-center',
  'fullscreen-text-headline'
]

export const ENERGY_DEFAULTS: Record<
  Energy,
  {
    availableSegmentStyles: string[]
    segmentDurationTarget: { min: number; max: number; ideal: number }
  }
> = {
  low: {
    availableSegmentStyles: LOW_ENERGY_SEGMENTS,
    segmentDurationTarget: { min: 4, max: 10, ideal: 6 }
  },
  medium: {
    availableSegmentStyles: MEDIUM_ENERGY_SEGMENTS,
    segmentDurationTarget: { min: 3, max: 7, ideal: 5 }
  },
  high: {
    availableSegmentStyles: HIGH_ENERGY_SEGMENTS,
    segmentDurationTarget: { min: 2, max: 5, ideal: 3 }
  }
}

// ---------------------------------------------------------------------------
// Caption + headline baselines (the shape ~14/15 styles share)
// ---------------------------------------------------------------------------

export const CAPTION_BASE: CaptionStyleInput = {
  fontName: 'Montserrat',
  fontSize: 0.055,
  primaryColor: '#FFFFFF',
  highlightColor: '#FFFFFF',
  outlineColor: '#000000',
  backColor: '#00000000',
  outline: 2,
  shadow: 1,
  borderStyle: 1,
  wordsPerLine: 5,
  animation: 'captions-ai',
  emphasisColor: '#FFFFFF',
  supersizeColor: '#FFFFFF'
}

export const HEADLINE_BASE: HeadlineStyleConfig = {
  fontSize: 60,
  textColor: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 3,
  shadowDepth: 2,
  borderStyle: 1,
  bold: true,
  animation: 'fade',
  animationDurationMs: 400,
  fadeOutMs: 400,
  verticalPosition: 0.12
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type EditStyleOverrides = Omit<
  Partial<EditStyle>,
  'captionStyle' | 'headlineStyle'
> & {
  id: string
  name: string
  energy: Energy
  accentColor: string
  defaultZoomStyle: EditStyle['defaultZoomStyle']
  defaultZoomIntensity: number
  defaultTransition: TransitionType
  flashColor: string
  transitionDuration: number
  targetEditsPerSecond: number
  description: string
  textAnimation: TextAnimationStyle
  colorGrade: ColorGradeParams
  transitionMap: TMap
  vfxOverlays: VFXOverlay[]
  captionStyle?: Partial<CaptionStyleInput>
  headlineStyle?: Partial<HeadlineStyleConfig>
}

export function createEditStyle(o: EditStyleOverrides): EditStyle {
  const energyDefaults = ENERGY_DEFAULTS[o.energy]
  const { captionStyle, headlineStyle, ...rest } = o
  return {
    captionBgOpacity: 0,
    letterbox: 'none',
    availableSegmentStyles: energyDefaults.availableSegmentStyles,
    segmentDurationTarget: energyDefaults.segmentDurationTarget,
    ...rest,
    captionStyle: { ...CAPTION_BASE, ...captionStyle },
    headlineStyle: { ...HEADLINE_BASE, ...headlineStyle }
  }
}
