/**
 * Comparison — two columns (✓ do this / ✕ not this) side by side.
 *
 * A *content block*: it composes a `BlockSkin` (via `skinId`) for its look so
 * the same block renders in every skin. All motion is frame-clock driven.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import type { ComparisonProps } from './types'

const NEGATIVE = '#e0683f'

const Mark: React.FC<{ kind: 'check' | 'cross'; color: string; progress: number }> = ({
  kind,
  color,
  progress
}) => (
  <div
    style={{
      flexShrink: 0,
      width: 52,
      height: 52,
      borderRadius: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Geist',
      fontWeight: 700,
      fontSize: 34,
      lineHeight: 1,
      color: BRAND_BG,
      background: color,
      boxShadow: `0 6px 18px ${color}55`,
      transform: `scale(${interpolate(progress, [0, 1], [0.4, 1])})`,
      opacity: progress
    }}
  >
    {kind === 'check' ? '✓' : '✕'}
  </div>
)

const Column: React.FC<{
  title: string
  items: string[]
  kind: 'check' | 'cross'
  markColor: string
  accent: string
  startFrame: number
}> = ({ title, items, kind, markColor, accent, startFrame }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 30 }}>
      <div
        style={{
          fontFamily: 'Bebas Neue',
          fontSize: 56,
          lineHeight: 1,
          letterSpacing: 1,
          color: kind === 'check' ? accent : `${BRAND_FG}88`,
          paddingBottom: 22,
          borderBottom: `2px solid ${kind === 'check' ? accent : BRAND_FG}2e`
        }}
      >
        {title}
      </div>
      {items.map((item, i) => {
        const e = spring({
          frame: frame - startFrame - i * 6,
          fps,
          config: { damping: 18, stiffness: 120 }
        })
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              opacity: e,
              transform: `translateY(${interpolate(e, [0, 1], [22, 0])}px)`
            }}
          >
            <Mark kind={kind} color={markColor} progress={e} />
            <span
              style={{
                fontFamily: 'Geist',
                fontWeight: 700,
                fontSize: 38,
                lineHeight: 1.1,
                color: kind === 'check' ? BRAND_FG : `${BRAND_FG}99`
              }}
            >
              {item}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export const Comparison: React.FC<ComparisonProps> = ({
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
  const dividerProgress = interpolate(frame, [16, 44], [0, 1], {
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

          <div style={{ position: 'relative', display: 'flex', gap: 80, marginTop: 60 }}>
            <Column
              title={leftTitle}
              items={leftItems}
              kind="check"
              markColor={accent}
              accent={accent}
              startFrame={18}
            />
            {/* Center divider */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: 2,
                marginLeft: -1,
                background: `${BRAND_FG}26`,
                transformOrigin: 'top',
                transform: `scaleY(${dividerProgress})`
              }}
            />
            <Column
              title={rightTitle}
              items={rightItems}
              kind="cross"
              markColor={NEGATIVE}
              accent={accent}
              startFrame={24}
            />
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
