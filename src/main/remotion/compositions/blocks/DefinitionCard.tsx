/**
 * DefinitionCard — a shadcn Card dictionary entry: lucide BookOpen, the term
 * with a part-of-speech Badge, a Separator, and the definition body. An accent
 * underline draws in under the term.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; the
 * entry panel is a shadcn `Card`. All motion is frame-clock driven.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { BookOpen } from 'lucide-react'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { DefinitionCardProps } from './types'

export const DefinitionCard: React.FC<DefinitionCardProps> = ({
  skinId,
  kicker,
  heading,
  term,
  partOfSpeech,
  definition,
  accentColor
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const skin = SKINS[skinId]
  const accent = accentColor ?? skin.accent
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } })

  const underline = interpolate(frame, [22, 22 + fps * 0.8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  const defIn = spring({ frame: frame - 30, fps, config: { damping: 18, stiffness: 110 } })

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `radial-gradient(120% 120% at 50% 0%, ${accent}30 0%, ${BRAND_FG}0a 70%)`,
                    border: `1px solid ${accent}44`
                  }}
                >
                  <BookOpen size={44} color={accent} strokeWidth={2} absoluteStrokeWidth />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 112, lineHeight: 0.9, color: BRAND_FG }}>
                    {term}
                  </span>
                  {partOfSpeech && (
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: `${accent}55`,
                        color: accent,
                        fontFamily: 'Geist',
                        fontStyle: 'italic',
                        fontSize: 28,
                        padding: '6px 16px',
                        borderRadius: 999
                      }}
                    >
                      {partOfSpeech}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Accent underline draws in */}
              <div
                style={{
                  height: 4,
                  width: 220,
                  marginTop: 18,
                  marginLeft: 100,
                  borderRadius: 4,
                  background: accent,
                  transformOrigin: 'left center',
                  transform: `scaleX(${underline})`,
                  boxShadow: `0 0 18px ${accent}66`
                }}
              />

              <Separator className="my-9" style={{ backgroundColor: `${accent}33` }} />

              <div
                style={{
                  fontFamily: 'Geist',
                  fontWeight: 400,
                  fontSize: 44,
                  lineHeight: 1.4,
                  color: `${BRAND_FG}dd`,
                  opacity: defIn,
                  transform: `translateY(${interpolate(defIn, [0, 1], [18, 0])}px)`
                }}
              >
                {definition}
              </div>
            </CardContent>
          </Card>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
