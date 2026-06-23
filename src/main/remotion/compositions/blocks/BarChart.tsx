/**
 * BarChart — a row of vertical bars that grow from the baseline.
 *
 * A *content block*: it knows nothing about color or surface. It composes a
 * `BlockSkin` (via `skinId`) for its look so the same block renders in every
 * skin. All motion is driven by the frame clock through spring()/interpolate().
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import type { BarChartProps } from './types'

const CHART_HEIGHT = 380

export const BarChart: React.FC<BarChartProps> = ({
  skinId,
  kicker,
  heading,
  bars,
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

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 28,
              marginTop: 64,
              height: CHART_HEIGHT,
              borderBottom: `2px solid ${accent}3a`,
              paddingBottom: 0
            }}
          >
            {bars.map((bar, i) => {
              const grow = spring({
                frame: frame - 16 - i * 6,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 }
              })
              const value = Math.max(0, Math.min(1, bar.value))
              const barHeight = value * (CHART_HEIGHT - 64) * grow
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    height: '100%'
                  }}
                >
                  {/* Value label */}
                  <div
                    style={{
                      fontFamily: 'Bebas Neue',
                      fontSize: 46,
                      lineHeight: 1,
                      color: BRAND_FG,
                      marginBottom: 14,
                      opacity: grow,
                      transform: `translateY(${interpolate(grow, [0, 1], [12, 0])}px)`
                    }}
                  >
                    {bar.valueLabel}
                  </div>
                  {/* Bar */}
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 132,
                      height: barHeight,
                      borderRadius: '14px 14px 0 0',
                      background: `linear-gradient(180deg, ${accent} 0%, ${accent}aa 100%)`,
                      boxShadow: `0 0 28px ${accent}44, inset 0 1px 0 ${BRAND_FG}33`
                    }}
                  />
                  {/* Category label */}
                  <div
                    style={{
                      fontFamily: 'Geist',
                      fontWeight: 700,
                      fontSize: 26,
                      color: `${BRAND_FG}cc`,
                      marginTop: 20,
                      textAlign: 'center',
                      opacity: grow
                    }}
                  >
                    {bar.label}
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
