import type { EditStyleTemplate } from '../../shared/types'

export const splitImage: EditStyleTemplate = {
  archetype: 'split-image',
  zoomStyle: 'none',
  // Split layout: b-roll video on top half, speaker on bottom half. Captions
  // sit slightly below the vertical midpoint (~7.5% of frame height) so they
  // bias toward the speaker half rather than splitting the seam exactly.
  captionPosition: 'center',
  captionMarginV: 864,
  hookTitleY: 220,
  rehookY: 220
}
