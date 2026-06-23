/**
 * ProgressBars — horizontal ranked bars that grow from the left.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. Each
 * bar track is a shadcn `Progress`; the fill is an accent child whose width is
 * interpolated by the frame clock (rather than radix's CSS value transition,
 * which is inert in a rendered frame).
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Progress } from '@/components/ui/progress'
import type { ProgressBarsProps } from './types'

export const ProgressBars: React.FC<ProgressBarsProps> = ({
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 38, marginTop: 60 }}>
            {bars.map((bar, i) => {
              const grow = spring({
                frame: frame - 16 - i * 6,
                fps,
                config: { damping: 18, stiffness: 110, mass: 0.8 }
              })
              const value = Math.max(0, Math.min(1, bar.value))
              const pct = value * grow * 100
              return (
                <div key={i}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 16,
                      opacity: grow
                    }}
                  >
                    <span style={{ fontFamily: 'Geist', fontWeight: 700, fontSize: 34, color: BRAND_FG }}>
                      {bar.label}
                    </span>
                    <span
                      style={{
                        fontFamily: 'Bebas Neue',
                        fontSize: 44,
                        color: accent,
                        textShadow: `0 0 24px ${accent}40`
                      }}
                    >
                      {bar.valueLabel}
                    </span>
                  </div>
                  {/* shadcn Progress is the styled track; its own Indicator is
                      left empty (value 0) and the accent fill is overlaid as a
                      sibling so the width is frame-clock driven, not radix CSS. */}
                  <div style={{ position: 'relative' }}>
                    <Progress
                      value={0}
                      className="h-7 rounded-full"
                      style={{ backgroundColor: `${BRAND_FG}14`, border: `1px solid ${accent}22` }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${pct}%`,
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${accent}cc 0%, ${accent} 100%)`,
                        boxShadow: `0 0 24px ${accent}55`
                      }}
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
