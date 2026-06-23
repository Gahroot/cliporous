/**
 * NumberedList — vertical numbered rows with a shadcn Separator between each.
 *
 * A *content block*: it composes a `BlockSkin` (via `skinId`) for its look so
 * the same block renders in every skin. Inner rows are built from shadcn
 * primitives (`Separator`) + a lucide `ArrowRight`; all motion is frame-clock
 * driven via spring()/interpolate().
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { ArrowRight } from 'lucide-react'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Separator } from '@/components/ui/separator'
import type { NumberedListProps } from './types'

export const NumberedList: React.FC<NumberedListProps> = ({
  skinId,
  kicker,
  heading,
  items,
  accentColor
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const skin = SKINS[skinId]
  const accent = accentColor ?? skin.accent
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } })

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND_BG, justifyContent: 'center', alignItems: 'center' }}>
      <PrestyjFonts />
      <skin.Background accent={accent} />
      <div
        style={{
          opacity: cardIn,
          transform: `translateY(${interpolate(cardIn, [0, 1], [50, 0])}px)`
        }}
      >
        <skin.Surface accent={accent}>
          <Kicker accent={accent}>{kicker}</Kicker>
          <Heading>{heading}</Heading>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 52 }}>
            {items.map((item, i) => {
              const e = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 18, stiffness: 120 }
              })
              return (
                <div key={i}>
                  {i > 0 && (
                    <Separator
                      className="bg-border"
                      style={{ opacity: 0.5 * e, backgroundColor: `${accent}33` }}
                    />
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 32,
                      padding: '26px 4px',
                      opacity: e,
                      transform: `translateX(${interpolate(e, [0, 1], [-34, 0])}px)`
                    }}
                  >
                    <skin.Chip accent={accent} index={i + 1} size={62} />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: 'Geist',
                          fontWeight: 700,
                          fontSize: 50,
                          color: BRAND_FG,
                          lineHeight: 1.05
                        }}
                      >
                        {item.text}
                      </div>
                      {item.detail && (
                        <div
                          style={{
                            fontFamily: 'Geist',
                            fontWeight: 400,
                            fontSize: 28,
                            color: `${BRAND_FG}99`,
                            marginTop: 6,
                            lineHeight: 1.3
                          }}
                        >
                          {item.detail}
                        </div>
                      )}
                    </div>
                    <ArrowRight
                      size={40}
                      color={accent}
                      strokeWidth={2.4}
                      style={{ opacity: e, flexShrink: 0 }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
