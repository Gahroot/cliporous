import type { EditStyleTemplate } from '../../shared/types'

export const splitImage: EditStyleTemplate = {
  archetype: 'split-image',
  zoomStyle: 'none',
  // Split layout: b-roll video on top half, speaker on bottom half. Captions
  // ride along the vertical midpoint so they stay clear of both halves.
  captionPosition: 'center',
  captionMarginV: 960,
  hookTitleY: 220,
  rehookY: 220
}
