import type { EditStyleTemplate } from '../../shared/types'

export const fullscreenQuote: EditStyleTemplate = {
  archetype: 'fullscreen-quote',
  variantId: 'fullscreen-text-center',
  zoomStyle: 'none',
  captionPosition: 'lower-third',
  captionMarginV: 420,
  layoutParamOverrides: {
    textColor: '#FFFFFF',
    accentColor: '#7058E3',
    fontSize: 230
  }
}
