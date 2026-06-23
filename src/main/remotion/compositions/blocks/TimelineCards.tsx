/**
 * TimelineCards — a vertical step sequence where each step is a shadcn Card on
 * a connecting spine, with a lucide icon per step (Card variant of Timeline).
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; each
 * step body is a shadcn `Card`. The spine draws downward as the cards reveal.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Card, CardContent } from '@/components/ui/card'
import { resolveIcon } from './icon'
import type { TimelineCardsProps } from './types'

export const TimelineCards: React.FC<TimelineCardsProps> = ({
  skinId,
  kicker,
  heading,
  steps,
  accentColor
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const skin = SKINS[skinId]
  const accent = accentColor ?? skin.accent
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } })

  const spineProgress = interpolate(frame, [14, 14 + steps.length * 7], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })

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

          <div style={{ position: 'relative', marginTop: 52, paddingLeft: 8 }}>
            {/* Spine */}
            <div
              style={{
                position: 'absolute',
                left: 47,
                top: 48,
                bottom: 48,
                width: 3,
                background: `${accent}44`,
                transformOrigin: 'top',
                transform: `scaleY(${spineProgress})`
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {steps.map((step, i) => {
                const e = spring({
                  frame: frame - 16 - i * 7,
                  fps,
                  config: { damping: 18, stiffness: 120 }
                })
                const Icon = resolveIcon(step.icon)
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 32,
                      opacity: e,
                      transform: `translateX(${interpolate(e, [0, 1], [-34, 0])}px)`
                    }}
                  >
                    {/* Spine node */}
                    <div
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        flexShrink: 0,
                        width: 80,
                        height: 80,
                        borderRadius: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: accent,
                        boxShadow: `0 10px 30px ${accent}66, inset 0 1px 0 ${BRAND_FG}33`,
                        transform: `scale(${interpolate(e, [0, 1], [0.8, 1])})`
                      }}
                    >
                      <Icon size={42} color={BRAND_BG} strokeWidth={2.4} />
                    </div>
                    <Card
                      className="flex-1 border bg-card text-card-foreground"
                      style={{
                        borderColor: `${accent}33`,
                        boxShadow: `0 16px 40px rgba(0,0,0,0.4), inset 0 1px 0 ${BRAND_FG}12`
                      }}
                    >
                      <CardContent className="p-7">
                        <div
                          style={{
                            fontFamily: 'Geist',
                            fontWeight: 700,
                            fontSize: 44,
                            color: BRAND_FG,
                            lineHeight: 1.05
                          }}
                        >
                          {step.title}
                        </div>
                        {step.detail && (
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
                            {step.detail}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
            </div>
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
