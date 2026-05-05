import type { EditStyleTemplate } from '../../shared/types'
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../shared/brand'

export const fullscreenQuote: EditStyleTemplate = {
  archetype: 'fullscreen-quote',
  variantId: 'fullscreen-text-center',
  zoomStyle: 'none',
  captionPosition: 'lower-third',
  captionMarginV: 420,
  layoutParamOverrides: {
    textColor: BRAND_FG,
    accentColor: BRAND_ACCENT,
    backgroundColor: BRAND_BG,
    fontSize: 230
  }
}
