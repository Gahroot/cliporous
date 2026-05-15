import React from 'react'
import { staticFile } from 'remotion'

/**
 * Local @font-face declarations using the bundled TTFs in `resources/fonts/`.
 * `Config.setPublicDir('./resources')` in remotion.config.ts makes
 * `staticFile('fonts/...')` resolve correctly in both Studio and headless
 * render.
 *
 * Mount this once at the top of every composition.
 */
export const PrestyjFonts: React.FC = () => (
  <style>{`
    @font-face {
      font-family: 'Geist';
      src: url('${staticFile('fonts/Geist-Bold.ttf')}') format('truetype');
      font-weight: 700;
      font-display: block;
    }
    @font-face {
      font-family: 'Style Script';
      src: url('${staticFile('fonts/StyleScript-Regular.ttf')}') format('truetype');
      font-weight: 400;
      font-display: block;
    }
    @font-face {
      font-family: 'Bebas Neue';
      src: url('${staticFile('fonts/BebasNeue-Regular.ttf')}') format('truetype');
      font-weight: 400;
      font-display: block;
    }
    @font-face {
      font-family: 'Instrument Serif';
      src: url('${staticFile('fonts/InstrumentSerif-Italic.ttf')}') format('truetype');
      font-weight: 400;
      font-style: italic;
      font-display: block;
    }
  `}</style>
)
