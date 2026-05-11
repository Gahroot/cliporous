import type { EditStyleTemplate } from '../../shared/types'

export const fullscreenQuote: EditStyleTemplate = {
  archetype: 'fullscreen-quote',
  zoomStyle: 'none',
  // Hero captions centered on the frame — nothing else on screen.
  captionPosition: 'center',
  captionMarginV: 960,
  hookTitleY: 220,
  rehookY: 220,
  // Hero archetype: emit one ASS dialogue event per word so each word
  // appears/disappears on its own ASR timestamp for maximum emphasis.
  captionMode: 'word-by-word'
}
