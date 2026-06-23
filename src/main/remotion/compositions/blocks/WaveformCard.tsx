import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'
import { BRAND_ACCENT } from '../../../edit-styles/shared/brand'
import { EASE } from '../../shared/easing'
import { DarkCard } from '../../shared/primitives'
import { PrestyjFonts } from '../../shared/fonts'
import type { WaveformCardProps } from './types'

/* ------------------------------------------------------------------ */
/*  WaveformCard — animated audio/voice waveform bars                   */
/* ------------------------------------------------------------------ */

export const WaveformCard: React.FC<WaveformCardProps> = ({
  title,
  bars,
  active = false,
  label,
  accentColor = BRAND_ACCENT
}) => {
  const frame = useCurrentFrame()

  // Card entrance.
  const entranceOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  const entranceY = interpolate(frame, [0, 15], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })

  // Label fade-in (staggered).
  const labelOpacity = interpolate(frame, [20, 35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })

  const maxBarHeight = 120
  const barWidth = 6
  const barGap = 4

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <PrestyjFonts />
      <div style={{ opacity: entranceOpacity, transform: `translateY(${entranceY}px)` }}>
        <DarkCard accentColor={accentColor} width={640} padding={48}>
          {/* Title */}
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 20,
              letterSpacing: 3,
              color: accentColor,
              textTransform: 'uppercase' as const,
              marginBottom: 24
            }}
          >
            {title}
          </div>

          {/* Waveform bars */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: barGap,
              height: maxBarHeight + 16
            }}
          >
            {bars.map((h, i) => {
              // When active, bars oscillate gently based on frame.
              const baseHeight = Math.max(0.05, Math.min(1, h))
              const oscillation = active
                ? interpolate(
                    Math.sin(frame * 0.2 + i * 0.8),
                    [-1, 1],
                    [-0.15, 0.15]
                  )
                : 0
              const normalizedHeight = Math.max(0.05, Math.min(1, baseHeight + oscillation))

              // Staggered reveal per bar.
              const barReveal = interpolate(
                frame,
                [8 + i * 1.5, 18 + i * 1.5],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
              )

              return (
                <div
                  key={`${i}-${bars.length}`}
                  style={{
                    width: barWidth,
                    height: maxBarHeight * normalizedHeight * barReveal,
                    backgroundColor: accentColor,
                    borderRadius: barWidth / 2,
                    opacity: 0.7 + normalizedHeight * 0.3,
                    transition: 'none'
                  }}
                />
              )
            })}
          </div>

          {/* Status label */}
          {label && (
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 14,
                letterSpacing: 3,
                color: active ? accentColor : '#f6ecd966',
                textTransform: 'uppercase' as const,
                textAlign: 'center' as const,
                marginTop: 24,
                opacity: labelOpacity
              }}
            >
              {label}
            </div>
          )}
        </DarkCard>
      </div>
    </AbsoluteFill>
  )
}
