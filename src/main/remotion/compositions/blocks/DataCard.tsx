import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'
import { BRAND_ACCENT } from '../../../edit-styles/shared/brand'
import { EASE } from '../../shared/easing'
import { DarkCard, GlowDot } from '../../shared/primitives'
import { PrestyjFonts } from '../../shared/fonts'
import type { DataCardProps } from './types'

/* ------------------------------------------------------------------ */
/*  DataCard — floating Westworld panel with label, metric, status      */
/* ------------------------------------------------------------------ */

const TREND_ICONS = { up: '▲', down: '▼', stable: '●' } as const
const TREND_COLORS = { up: '#4ade80', down: '#f87171', stable: '#9ca3af' } as const

export const DataCard: React.FC<DataCardProps> = ({
  label,
  value,
  unit,
  status,
  trend = 'stable',
  trendValue,
  accentColor = BRAND_ACCENT
}) => {
  const frame = useCurrentFrame()

  // Number count-up: parse the numeric part and animate from 0.
  const numericTarget = parseFloat(value.replace(/[^0-9.]/g, ''))
  const countUpProgress = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })
  const displayNumeric = isNaN(numericTarget)
    ? value
    : Math.round(numericTarget * countUpProgress).toString()

  // Card entrance fade + y-shift.
  const entranceOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  const entranceY = interpolate(frame, [0, 15], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })

  // Trend reveal (staggered after card).
  const trendOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <PrestyjFonts />
      <div
        style={{
          opacity: entranceOpacity,
          transform: `translateY(${entranceY}px)`
        }}
      >
        <DarkCard accentColor={accentColor} width={640} padding={48}>
          {/* Label — small caps monospace */}
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 20,
              letterSpacing: 3,
              color: accentColor,
              textTransform: 'uppercase' as const,
              marginBottom: 16,
              opacity: 0.9
            }}
          >
            {label}
          </div>

          {/* Value — giant Bebas Neue number */}
          <div
            style={{
              fontFamily: 'Bebas Neue, sans-serif',
              fontSize: 120,
              lineHeight: 1,
              color: '#f6ecd9',
              display: 'flex',
              alignItems: 'baseline',
              gap: 8
            }}
          >
            <span>{displayNumeric}</span>
            {unit && (
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 24,
                  color: '#f6ecd988',
                  letterSpacing: 2
                }}
              >
                {unit}
              </span>
            )}
          </div>

          {/* Bottom row — status dot + trend */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 28,
              opacity: trendOpacity
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GlowDot status={status} />
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 14,
                  color: '#f6ecd988',
                  textTransform: 'uppercase' as const,
                  letterSpacing: 2
                }}
              >
                {status}
              </span>
            </div>

            {trendValue && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 16,
                  color: TREND_COLORS[trend]
                }}
              >
                <span>{TREND_ICONS[trend]}</span>
                <span>{trendValue}</span>
              </div>
            )}
          </div>
        </DarkCard>
      </div>
    </AbsoluteFill>
  )
}
