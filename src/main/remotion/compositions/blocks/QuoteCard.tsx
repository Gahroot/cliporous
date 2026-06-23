/**
 * QuoteCard — a shadcn Card holding a large pull quote with a lucide Quote mark
 * and a shadcn Avatar attribution.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; the
 * quote panel is a shadcn `Card`, the attribution uses shadcn `Avatar`. The
 * quote reveals via a frame-driven clip mask.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { Quote } from 'lucide-react'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import type { QuoteCardProps } from './types'

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

export const QuoteCard: React.FC<QuoteCardProps> = ({
  skinId,
  kicker,
  heading,
  quote,
  name,
  role,
  avatarUrl,
  accentColor
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const skin = SKINS[skinId]
  const accent = accentColor ?? skin.accent
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } })

  const reveal = interpolate(frame, [16, 16 + fps * 1], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  const attrIn = spring({ frame: frame - 34, fps, config: { damping: 18, stiffness: 110 } })

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

          <Card
            className="border bg-card text-card-foreground"
            style={{
              marginTop: 48,
              borderColor: `${accent}33`,
              boxShadow: `0 26px 70px rgba(0,0,0,0.45), inset 0 1px 0 ${BRAND_FG}12`
            }}
          >
            <CardContent className="p-12">
              <Quote size={72} color={accent} strokeWidth={2.2} style={{ opacity: 0.9 }} />
              <div
                style={{
                  marginTop: 24,
                  clipPath: `inset(0 ${100 - reveal}% 0 0)`
                }}
              >
                <div
                  style={{
                    fontFamily: 'Instrument Serif',
                    fontStyle: 'italic',
                    fontSize: 76,
                    lineHeight: 1.18,
                    color: BRAND_FG
                  }}
                >
                  {quote}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24,
                  marginTop: 44,
                  opacity: attrIn,
                  transform: `translateY(${interpolate(attrIn, [0, 1], [16, 0])}px)`
                }}
              >
                <Avatar
                  className="h-20 w-20"
                  style={{ border: `2px solid ${accent}66`, boxShadow: `0 0 24px ${accent}33` }}
                >
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                  <AvatarFallback
                    style={{
                      background: `${accent}22`,
                      color: accent,
                      fontFamily: 'Bebas Neue',
                      fontSize: 36
                    }}
                  >
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div style={{ fontFamily: 'Geist', fontWeight: 700, fontSize: 36, color: BRAND_FG }}>
                    {name}
                  </div>
                  {role && (
                    <div
                      style={{
                        fontFamily: 'Geist',
                        fontSize: 28,
                        color: `${BRAND_FG}99`,
                        marginTop: 4
                      }}
                    >
                      {role}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
