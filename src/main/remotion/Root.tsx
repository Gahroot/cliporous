import React from 'react'
import { Composition } from 'remotion'
import { FullscreenQuote, type FullscreenQuoteProps } from './compositions/FullscreenQuote'
import {
  FullscreenQuotePlusBroll,
  type FullscreenQuotePlusBrollProps
} from './compositions/FullscreenQuotePlusBroll'
import { BRAND_ACCENT, BRAND_FG } from '../edit-styles/shared/brand'

// Locked 9:16 vertical canvas — must match OUTPUT_WIDTH/HEIGHT/FPS in src/main/aspect-ratios.ts.
const VERTICAL_WIDTH = 720
const VERTICAL_HEIGHT = 1280
const FPS = 30

const PRESTYJ_DEFAULTS = {
  accentColor: BRAND_ACCENT,
  primaryColor: BRAND_FG,
  bodyFont: 'Geist',
  scriptFont: 'Style Script'
} as const

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FullscreenQuote"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={FullscreenQuote as any}
        durationInFrames={FPS * 5}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          quote: 'You don\u2019t need permission to start. You need a deadline.',
          attribution: 'PRESTYJ',
          ...PRESTYJ_DEFAULTS
        } satisfies FullscreenQuoteProps}
      />

      <Composition
        id="FullscreenQuotePlusBroll"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={FullscreenQuotePlusBroll as any}
        durationInFrames={FPS * 6}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          quote: 'The compounding effect is invisible until it is undeniable.',
          attribution: 'PRESTYJ',
          // Studio sample image; production callers pass an absolute path or
          // a staticFile() URL.
          imagePath: '',
          ...PRESTYJ_DEFAULTS
        } satisfies FullscreenQuotePlusBrollProps}
      />
    </>
  )
}
