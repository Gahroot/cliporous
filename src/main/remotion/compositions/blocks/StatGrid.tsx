/**
 * StatGrid — four headline numbers laid out 2×2.
 *
 * A *content block*: it composes a `BlockSkin` (via `skinId`) for its look so
 * the same block renders in every skin. All motion is frame-clock driven.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import type { StatGridProps } from './types'

export const StatGrid: React.FC<StatGridProps> = ({
  skinId,
  kicker,
  heading,
  stats,
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
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 28,
              marginTop: 60
            }}
          >
            {stats.slice(0, 4).map((stat, i) => {
              const e = spring({
                frame: frame - 16 - i * 6,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 }
              })
              return (
                <div
                  key={i}
                  style={{
                    padding: '44px 48px',
                    borderRadius: 24,
                    background: `linear-gradient(160deg, ${accent}1f 0%, ${BRAND_FG}08 100%)`,
                    border: `1px solid ${accent}33`,
                    boxShadow: `inset 0 1px 0 ${BRAND_FG}1a`,
                    opacity: e,
                    transform: `translateY(${interpolate(e, [0, 1], [30, 0])}px) scale(${interpolate(
                      e,
                      [0, 1],
                      [0.94, 1]
                    )})`
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'Bebas Neue',
                      fontSize: 128,
                      lineHeight: 0.9,
                      color: accent,
                      textShadow: `0 0 36px ${accent}40`
                    }}
                  >
                    {stat.value}
                  </div>
                  <div
                    style={{
                      fontFamily: 'Geist',
                      fontWeight: 700,
                      fontSize: 30,
                      lineHeight: 1.15,
                      color: `${BRAND_FG}cc`,
                      marginTop: 14
                    }}
                  >
                    {stat.label}
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
