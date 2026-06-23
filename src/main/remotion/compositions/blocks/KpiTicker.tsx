/**
 * KpiTicker — a row of shadcn Card stat tiles with a Badge delta, lucide trend
 * icon, and a pulsing status dot.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; each
 * tile is a shadcn `Card`. Tiles rise in on a staggered spring; the status dot
 * pulses off the frame clock.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { KpiTickerProps } from './types'

export const KpiTicker: React.FC<KpiTickerProps> = ({
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
  const pulse = interpolate(Math.sin(frame * 0.18), [-1, 1], [0.55, 1])

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

          <div style={{ display: 'flex', gap: 24, marginTop: 56 }}>
            {items.map((item, i) => {
              const e = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 }
              })
              const down = item.trend === 'down'
              const trendColor = down ? '#f87171' : '#4ade80'
              const TrendIcon = down ? TrendingDown : TrendingUp
              return (
                <Card
                  key={i}
                  className="flex-1 border bg-card text-card-foreground"
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: trendColor,
                          boxShadow: `0 0 14px ${trendColor}`,
                          opacity: pulse
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono',
                          fontSize: 24,
                          letterSpacing: 2,
                          color: `${BRAND_FG}99`
                        }}
                      >
                        {item.label}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: 'Bebas Neue',
                        fontSize: 116,
                        lineHeight: 0.92,
                        color: accent,
                        textShadow: `0 0 32px ${accent}40`,
                        marginTop: 18
                      }}
                    >
                      {item.value}
                    </div>
                    {item.delta && (
                      <Badge
                        className="border-transparent"
                        style={{
                          marginTop: 18,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          backgroundColor: `${trendColor}1f`,
                          color: trendColor,
                          fontFamily: 'JetBrains Mono',
                          fontSize: 24,
                          padding: '8px 16px',
                          borderRadius: 999
                        }}
                      >
                        <TrendIcon size={24} color={trendColor} strokeWidth={2.6} />
                        {item.delta}
                      </Badge>
                    )}
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
