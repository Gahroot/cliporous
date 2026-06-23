/**
 * IconStatGrid — a 2×2 grid of shadcn Cards, each combining a lucide icon, a
 * big number, and a label (merges IconRow + StatGrid via Cards).
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; each
 * tile is a shadcn `Card`. Tiles rise in on a staggered spring.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Card, CardContent } from '@/components/ui/card'
import { resolveIcon } from './icon'
import type { IconStatGridProps } from './types'

export const IconStatGrid: React.FC<IconStatGridProps> = ({
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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 28,
              marginTop: 56
            }}
          >
            {items.slice(0, 4).map((item, i) => {
              const e = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 }
              })
              const Icon = resolveIcon(item.icon)
              return (
                <Card
                  key={i}
                  className="border bg-card text-card-foreground"
                  style={{
                    borderColor: `${accent}33`,
                    boxShadow: `0 18px 44px rgba(0,0,0,0.4), inset 0 1px 0 ${BRAND_FG}12`,
                    opacity: e,
                    transform: `translateY(${interpolate(e, [0, 1], [30, 0])}px) scale(${interpolate(
                      e,
                      [0, 1],
                      [0.94, 1]
                    )})`
                  }}
                >
                  <CardContent className="p-9">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                      <div
                        style={{
                          flexShrink: 0,
                          width: 96,
                          height: 96,
                          borderRadius: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: `radial-gradient(120% 120% at 50% 0%, ${accent}30 0%, ${BRAND_FG}0a 70%)`,
                          border: `1px solid ${accent}44`
                        }}
                      >
                        <Icon size={50} color={accent} strokeWidth={2} absoluteStrokeWidth />
                      </div>
                      <div>
                        <div
                          style={{
                            fontFamily: 'Bebas Neue',
                            fontSize: 100,
                            lineHeight: 0.9,
                            color: accent,
                            textShadow: `0 0 32px ${accent}40`
                          }}
                        >
                          {item.value}
                        </div>
                        <div
                          style={{
                            fontFamily: 'Geist',
                            fontWeight: 700,
                            fontSize: 30,
                            lineHeight: 1.15,
                            color: `${BRAND_FG}cc`,
                            marginTop: 8
                          }}
                        >
                          {item.label}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
