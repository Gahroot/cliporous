import type { EditStyleTemplate } from '../../shared/types'
import { BRAND_ACCENT } from '../../shared/brand'

export const quoteLower: EditStyleTemplate = {
  archetype: 'quote-lower',
  variantId: 'main-video-text-lower',
  zoomStyle: 'none',
  captionPosition: 'lower-third',
  captionMarginV: 480,
  layoutParamOverrides: {
    textColor: '#FFFFFF',
    accentColor: BRAND_ACCENT
  }
}
