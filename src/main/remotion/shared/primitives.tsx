import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion'
import { BRAND_ACCENT } from '../../edit-styles/shared/brand'

/* ------------------------------------------------------------------ */
/*  DarkCard — base floating panel with luminous accent border + glow  */
/* ------------------------------------------------------------------ */

interface DarkCardProps {
  accentColor?: string
  width?: number | string
  height?: number | string
  padding?: number
  glow?: boolean
  children: React.ReactNode
}

export const DarkCard: React.FC<DarkCardProps> = ({
  accentColor = BRAND_ACCENT,
  width = 'auto',
  height = 'auto',
  padding = 32,
  glow = true,
  children
}) => (
  <div
    style={{
      width,
      height,
      padding,
      backgroundColor: '#0a0a0a',
      border: `1px solid ${accentColor}44`,
      borderRadius: 12,
      boxShadow: glow
        ? `0 0 20px ${accentColor}22, inset 0 0 30px ${accentColor}08`
        : 'none',
      position: 'relative',
      overflow: 'hidden'
    }}
  >
    {children}
  </div>
)

/* ------------------------------------------------------------------ */
/*  AccentLine — horizontal animated line that draws across            */
/* ------------------------------------------------------------------ */

interface AccentLineProps {
  color?: string
  width?: number | string
  height?: number
  durationFrames?: number
  delayFrames?: number
  y?: number | string
  x?: number | string
}

export const AccentLine: React.FC<AccentLineProps> = ({
  color = BRAND_ACCENT,
  width = '100%',
  height = 2,
  durationFrames = 30,
  delayFrames = 0,
  y = '50%',
  x = 0
}) => {
  const frame = useCurrentFrame()
  const progress = interpolate(
    frame,
    [delayFrames, delayFrames + durationFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) }
  )

  return (
    <div
      style={{
        position: 'absolute',
        top: y,
        left: x,
        width,
        height,
        backgroundColor: color,
        transformOrigin: 'left center',
        transform: `scaleX(${progress})`,
        opacity: progress
      }}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  GridOverlay — subtle clinical grid lines                            */
/* ------------------------------------------------------------------ */

interface GridOverlayProps {
  color?: string
  opacity?: number
  cellSize?: number
}

export const GridOverlay: React.FC<GridOverlayProps> = ({
  color = BRAND_ACCENT,
  opacity = 0.04,
  cellSize = 60
}) => (
  <AbsoluteFill style={{ opacity, pointerEvents: 'none' }}>
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern
          id="grid-pattern"
          width={cellSize}
          height={cellSize}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`}
            fill="none"
            stroke={color}
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-pattern)" />
    </svg>
  </AbsoluteFill>
)

/* ------------------------------------------------------------------ */
/*  GlowDot — small pulsing status indicator                            */
/* ------------------------------------------------------------------ */

interface GlowDotProps {
  color?: string
  size?: number
  pulse?: boolean
  status?: 'online' | 'offline' | 'processing'
}

const STATUS_COLORS: Record<'online' | 'offline' | 'processing', string> = {
  online: '#4ade80',
  offline: '#6b7280',
  processing: '#facc15'
}

export const GlowDot: React.FC<GlowDotProps> = ({
  color,
  size = 8,
  pulse = true,
  status = 'online'
}) => {
  const frame = useCurrentFrame()
  const dotColor = color ?? STATUS_COLORS[status]
  const pulseScale = pulse
    ? interpolate(Math.sin(frame * 0.15), [-1, 1], [0.85, 1.15])
    : 1

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: dotColor,
        boxShadow: `0 0 ${size}px ${dotColor}88`,
        transform: `scale(${pulseScale})`
      }}
    />
  )
}
