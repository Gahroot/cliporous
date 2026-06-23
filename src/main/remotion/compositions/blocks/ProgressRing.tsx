import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'
import { BRAND_ACCENT } from '../../../edit-styles/shared/brand'
import { EASE } from '../../shared/easing'
import { PrestyjFonts } from '../../shared/fonts'
import type { ProgressRingProps } from './types'

/* ------------------------------------------------------------------ */
/*  ProgressRing — circular animated progress indicator                 */
/* ------------------------------------------------------------------ */

const SIZES = {
  sm: { dimension: 160, stroke: 8, fontSize: 36, labelSize: 14 },
  md: { dimension: 240, stroke: 10, fontSize: 52, labelSize: 16 },
  lg: { dimension: 320, stroke: 12, fontSize: 72, labelSize: 18 }
} as const

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  label,
  sublabel,
  size = 'md',
  accentColor = BRAND_ACCENT
}) => {
  const frame = useCurrentFrame()
  const { dimension, stroke, fontSize, labelSize } = SIZES[size]

  const radius = (dimension - stroke) / 2
  const circumference = 2 * Math.PI * radius

  // Animate stroke-dashoffset from full to target.
  const fillProgress = interpolate(frame, [0, 45], [0, value / 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })
  const dashOffset = circumference * (1 - fillProgress)

  // Entrance fade.
  const entranceOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  const entranceScale = interpolate(frame, [0, 20], [0.9, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })

  // Label fade-in (staggered).
  const labelOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })

  // Counter for the sublabel.
  const displayPercent = Math.round(fillProgress * 100)

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <PrestyjFonts />
      <div
        style={{
          opacity: entranceOpacity,
          transform: `scale(${entranceScale})`,
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center'
        }}
      >
        <div style={{ position: 'relative', width: dimension, height: dimension }}>
          <svg width={dimension} height={dimension}>
            {/* Background track */}
            <circle
              cx={dimension / 2}
              cy={dimension / 2}
              r={radius}
              fill="none"
              stroke="#1a1a1a"
              strokeWidth={stroke}
            />
            {/* Animated arc */}
            <circle
              cx={dimension / 2}
              cy={dimension / 2}
              r={radius}
              fill="none"
              stroke={accentColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${dimension / 2} ${dimension / 2})`}
              style={{
                filter: `drop-shadow(0 0 8px ${accentColor}66)`
              }}
            />
          </svg>

          {/* Center text */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: dimension,
              height: dimension,
              display: 'flex',
              flexDirection: 'column' as const,
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <span
              style={{
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize,
                color: '#f6ecd9',
                lineHeight: 1
              }}
            >
              {sublabel ?? `${displayPercent}%`}
            </span>
          </div>
        </div>

        {/* Label below */}
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: labelSize,
            letterSpacing: 3,
            color: accentColor,
            textTransform: 'uppercase' as const,
            marginTop: 16,
            opacity: labelOpacity
          }}
        >
          {label}
        </div>
      </div>
    </AbsoluteFill>
  )
}
