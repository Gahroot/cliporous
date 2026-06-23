/**
 * StatHero — one giant number that counts up to its target.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. The
 * delta sits in a shadcn `Badge` with a lucide `TrendingUp`/`TrendingDown`.
 * The count-up is driven by interpolate() over the frame clock.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Badge } from '@/components/ui/badge'
import type { StatHeroProps } from './types'

export const StatHero: React.FC<StatHeroProps> = ({
  skinId,
  kicker,
  heading,
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  label,
  trend,
  delta,
  accentColor
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const skin = SKINS[skinId]
  const accent = accentColor ?? skin.accent
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } })

  // Count up from 0 → value over ~1.2s, starting after the card settles.
  const counted = interpolate(frame, [14, 14 + fps * 1.2], [0, value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  const display = `${prefix}${counted.toFixed(decimals)}${suffix}`
  const deltaIn = spring({ frame: frame - 30, fps, config: { damping: 16, stiffness: 120 } })
  const TrendIcon = trend === 'down' ? TrendingDown : TrendingUp
  const trendColor = trend === 'down' ? '#f87171' : '#4ade80'

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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Kicker accent={accent}>{kicker}</Kicker>
            <Heading size={72}>{heading}</Heading>

            <div
              style={{
                fontFamily: 'Bebas Neue',
                fontSize: 300,
                lineHeight: 0.92,
                color: accent,
                textShadow: `0 0 60px ${accent}55`,
                marginTop: 24
              }}
            >
              {display}
            </div>

            <div
              style={{
                fontFamily: 'Geist',
                fontWeight: 700,
                fontSize: 38,
                color: `${BRAND_FG}cc`,
                marginTop: 8
              }}
            >
              {label}
            </div>

            {delta && (
              <Badge
                className="border-transparent"
                style={{
                  marginTop: 30,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: `${trendColor}1f`,
                  color: trendColor,
                  fontFamily: 'JetBrains Mono',
                  fontSize: 30,
                  padding: '14px 26px',
                  borderRadius: 999,
                  opacity: deltaIn,
                  transform: `translateY(${interpolate(deltaIn, [0, 1], [16, 0])}px)`
                }}
              >
                <TrendIcon size={32} color={trendColor} strokeWidth={2.6} />
                {delta}
              </Badge>
            )}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
