import type { EditStyleTemplate } from '../../shared/types'

export const fullscreenImage: EditStyleTemplate = {
  archetype: 'fullscreen-image',
  zoomStyle: 'drift',
  zoomIntensity: 1.10,
  // Centered on the frame so captions sit at the vertical midpoint of the
  // full-screen b-roll video. 960 = 1920 / 2 (half the locked output height).
  captionPosition: 'center',
  captionMarginV: 960,
  hookTitleY: 220,
  rehookY: 220,
  // Hero archetype: emit one ASS dialogue event per word so each word
  // appears/disappears on its own ASR timestamp for maximum emphasis.
  captionMode: 'word-by-word'
}
