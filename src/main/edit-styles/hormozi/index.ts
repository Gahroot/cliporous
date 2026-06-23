import { createEditStyle } from '../shared/base'
import { T_PRESTYJ } from '../shared/transitions'
import type { LongformArchetype } from '@shared/types'

import type { LongformArchetypeTemplate } from './templates/types'
import { speaker } from './templates/speaker'

// Hormozi signature palette.
/** Phrase emphasis + speaker accent — Hormozi's signature yellow. */
export const HORMOZI_ACCENT = '#FFD600'
/** Phrase / block primary text. */
export const HORMOZI_CARD_FG = '#FFFFFF'

/**
 * HORMOZI long-form edit style.
 *
 * Used exclusively by the `outputProfile === 'longform'` (1920×1080) path.
 * It is NOT slotted into the 9:16 `STYLE_TEMPLATES` map (which is keyed on the
 * `Archetype` union); its per-archetype tuning lives in `hormoziLongformTemplates`
 * below, keyed on `LongformArchetype`.
 */
export const hormoziEditStyle: EditStyle = createEditStyle({
  id: 'hormozi',
  name: 'HORMOZI',
  energy: 'high',
  accentColor: HORMOZI_ACCENT,
  letterbox: 'none',
  defaultZoomStyle: 'snap',
  defaultZoomIntensity: 1.12,
  defaultTransition: 'crossfade',
  flashColor: '#FFFFFF',
  transitionDuration: 0.3,
  targetEditsPerSecond: 0.4,
  captionStyle: {
    // No burned-in word captions in long-form — phrase overlays ARE the
    // caption treatment. These fields only apply if a caller opts back into
    // captions; the long-form pipeline keeps captionsEnabled = false.
    captionMode: 'standard',
    accentColor: HORMOZI_ACCENT,
    fontName: 'Bebas Neue',
    fontSize: 0.045,
    wordsPerLine: 6,
    primaryColor: HORMOZI_CARD_FG,
    highlightColor: HORMOZI_ACCENT,
    emphasisColor: HORMOZI_ACCENT,
    supersizeColor: HORMOZI_ACCENT,
    outlineColor: '#000000',
    outline: 4,
    shadow: 0
  },
  textAnimation: 'scale-up',
  description:
    'Hormozi-style long-form (16:9) — phrase emphasis overlays and skinned ' +
    'content blocks over a punch-in talking head. No burned captions.',
  colorGrade: {
    warmth: 0.0,
    contrast: 1.08,
    saturation: 1.04,
    blackLift: 0.02,
    highlightSoftness: 0.7
  },
  transitionMap: T_PRESTYJ,
  vfxOverlays: []
})

/**
 * Long-form archetype tuning, keyed on `LongformArchetype`. Consumed by the
 * long-form render pipeline — NOT by the 9:16 template resolver.
 */
export const hormoziLongformTemplates: Record<LongformArchetype, LongformArchetypeTemplate> = {
  speaker
}
