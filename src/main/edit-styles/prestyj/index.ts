import { createEditStyle } from '../shared/base'
import type { Archetype } from '../shared/archetypes'
import type { EditStyleTemplate } from '../shared/types'
import { T_PRESTYJ } from '../shared/transitions'
import { BRAND_ACCENT } from '../shared/brand'

import { talkingHead } from './templates/talking-head'
import { tightPunch } from './templates/tight-punch'
import { wideBreather } from './templates/wide-breather'
import { quoteLower } from './templates/quote-lower'
import { splitImage } from './templates/split-image'
import { fullscreenImage } from './templates/fullscreen-image'
import { fullscreenQuote } from './templates/fullscreen-quote'

export const prestyjEditStyle: EditStyle = createEditStyle({
  id: 'prestyj',
  name: 'PRESTYJ',
  energy: 'high',
  accentColor: BRAND_ACCENT,
  letterbox: 'none',
  defaultZoomStyle: 'drift',
  defaultZoomIntensity: 1.10,
  defaultTransition: 'crossfade',
  flashColor: '#FFFFFF',
  transitionDuration: 0.3,
  targetEditsPerSecond: 0.5,
  captionStyle: {
    // V2 captions resolves layout/colour from these fields:
    captionMode: 'emphasis_highlight',
    accentColor: BRAND_ACCENT,
    fontName: 'Inter',
    fontSize: 0.065,
    wordsPerLine: 4,
    // Legacy fields kept for back-compat with the single-clip render path:
    primaryColor: '#FFFFFF',
    highlightColor: BRAND_ACCENT,
    emphasisColor: BRAND_ACCENT,
    supersizeColor: BRAND_ACCENT,
    outlineColor: '#000000',
    outline: 6,
    shadow: 0,
    shadowDistance: 3,
    shadowAngle: 69,
    shadowSoftness: 80,
    shadowOpacity: 0.95,
    shadowColor: '#000000',
    animation: 'captions-ai'
  },
  textAnimation: 'scale-up',
  description:
    'Clean modern energy — Inter Bold captions with soft black halo, purple emphasis, Bebas Neue display swap',
  colorGrade: {
    warmth: 0.0,
    contrast: 1.10,
    saturation: 1.05,
    blackLift: 0.02,
    highlightSoftness: 0.7
  },
  transitionMap: T_PRESTYJ,
  vfxOverlays: [],
  headlineStyle: {
    fontSize: 72,
    textColor: '#FFFFFF',
    outlineColor: '#FFFFFF',
    outlineWidth: 2,
    bold: true,
    animation: 'scale-pop',
    animationDurationMs: 350,
    verticalPosition: 0.15
  }
})

export const prestyjTemplates: Record<Archetype, EditStyleTemplate> = {
  'talking-head': talkingHead,
  'tight-punch': tightPunch,
  'wide-breather': wideBreather,
  'quote-lower': quoteLower,
  'split-image': splitImage,
  'fullscreen-image': fullscreenImage,
  'fullscreen-quote': fullscreenQuote
}
