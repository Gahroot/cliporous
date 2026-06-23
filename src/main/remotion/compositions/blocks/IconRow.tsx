/**
 * IconRow — a horizontal row of icon tiles with labels.
 *
 * A *content block*: it composes a `BlockSkin` (via `skinId`) for its look so
 * the same block renders in every skin. All motion is frame-clock driven.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { icons, HelpCircle, type LucideIcon } from 'lucide-react'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import type { IconRowProps } from './types'

/** Resolve a Lucide icon by its PascalCase name, with a safe fallback. */
const resolveIcon = (name: string): LucideIcon =>
  (icons as Record<string, LucideIcon>)[name] ?? HelpCircle

export const IconRow: React.FC<IconRowProps> = ({
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
              display: 'flex',
              justifyContent: 'space-between',
              gap: 28,
              marginTop: 64
            }}
          >
            {items.map((item, i) => {
              const e = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 16, stiffness: 120, mass: 0.8 }
              })
              const Icon = resolveIcon(item.icon)
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    opacity: e,
                    transform: `translateY(${interpolate(e, [0, 1], [34, 0])}px)`
                  }}
                >
                  {/* Icon tile */}
                  <div
                    style={{
                      width: 130,
                      height: 130,
                      borderRadius: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `radial-gradient(120% 120% at 50% 0%, ${accent}30 0%, ${BRAND_FG}0a 70%)`,
                      border: `1px solid ${accent}44`,
                      boxShadow: `0 18px 44px rgba(0,0,0,0.45), inset 0 1px 0 ${BRAND_FG}22, 0 0 40px ${accent}1f`,
                      transform: `scale(${interpolate(e, [0, 1], [0.8, 1])})`
                    }}
                  >
                    <Icon size={62} color={accent} strokeWidth={2} absoluteStrokeWidth />
                  </div>
                  <div
                    style={{
                      fontFamily: 'Geist',
                      fontWeight: 700,
                      fontSize: 32,
                      lineHeight: 1.15,
                      color: BRAND_FG,
                      marginTop: 26
                    }}
                  >
                    {item.label}
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
