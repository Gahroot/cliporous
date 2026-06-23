/**
 * ComparisonTable — two shadcn Card columns with Badge headers and lucide
 * Check / X rows (a shadcn-flavored upgrade of the Comparison block).
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; the
 * two columns are shadcn `Card`s. Columns slide in from opposite sides; rows
 * stagger. All motion is frame-clock driven.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { Check, X } from 'lucide-react'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ComparisonTableProps } from './types'

const POSITIVE = '#4ade80'
const NEGATIVE = '#f87171'

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  skinId,
  kicker,
  heading,
  leftTitle,
  rightTitle,
  leftItems,
  rightItems,
  accentColor
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const skin = SKINS[skinId]
  const accent = accentColor ?? skin.accent
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } })

  const column = (
    title: string,
    items: string[],
    positive: boolean,
    fromX: number
  ): React.ReactNode => {
    const colIn = spring({
      frame: frame - 14,
      fps,
      config: { damping: 20, stiffness: 100, mass: 0.9 }
    })
    const tint = positive ? POSITIVE : NEGATIVE
    const Mark = positive ? Check : X
    return (
      <Card
        className="flex-1 border bg-card text-card-foreground"
        style={{
          borderColor: `${tint}33`,
          boxShadow: `0 22px 60px rgba(0,0,0,0.45), inset 0 1px 0 ${BRAND_FG}12`,
          opacity: colIn,
          transform: `translateX(${interpolate(colIn, [0, 1], [fromX, 0])}px)`
        }}
      >
        <CardContent className="p-10">
          <Badge
            className="border-transparent"
            style={{
              backgroundColor: `${tint}22`,
              color: tint,
              fontFamily: 'JetBrains Mono',
              fontSize: 28,
              letterSpacing: 4,
              padding: '12px 24px',
              borderRadius: 12
            }}
          >
            {title}
          </Badge>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 36 }}>
            {items.map((item, i) => {
              const e = spring({
                frame: frame - 24 - i * 6,
                fps,
                config: { damping: 18, stiffness: 120, mass: 0.8 }
              })
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20,
                    opacity: e,
                    transform: `translateY(${interpolate(e, [0, 1], [18, 0])}px)`
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `${tint}1f`,
                      border: `1px solid ${tint}44`
                    }}
                  >
                    <Mark size={28} color={tint} strokeWidth={3} />
                  </div>
                  <span
                    style={{
                      fontFamily: 'Geist',
                      fontWeight: 600,
                      fontSize: 32,
                      lineHeight: 1.2,
                      color: `${BRAND_FG}e6`
                    }}
                  >
                    {item}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    )
  }

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
          <div style={{ display: 'flex', gap: 32, marginTop: 56, alignItems: 'stretch' }}>
            {column(leftTitle, leftItems, true, -40)}
            {column(rightTitle, rightItems, false, 40)}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
