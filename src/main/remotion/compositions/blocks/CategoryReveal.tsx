import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'
import { BRAND_ACCENT } from '../../../edit-styles/shared/brand'
import { EASE } from '../../shared/easing'
import { GridOverlay, AccentLine } from '../../shared/primitives'
import { PrestyjFonts } from '../../shared/fonts'
import type { CategoryRevealProps } from './types'

/* ------------------------------------------------------------------ */
/*  CategoryReveal — full-screen section intro with animated line       */
/* ------------------------------------------------------------------ */

export const CategoryReveal: React.FC<CategoryRevealProps> = ({
  category,
  tagline,
  accentColor = BRAND_ACCENT
}) => {
  const frame = useCurrentFrame()

  // Category text entrance.
  const categoryOpacity = interpolate(frame, [5, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  const categoryY = interpolate(frame, [5, 22], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })

  // Tagline entrance (staggered after line).
  const taglineOpacity = interpolate(frame, [35, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  const taglineY = interpolate(frame, [35, 50], [12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0a0a0a',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <PrestyjFonts />

      {/* Subtle grid overlay */}
      <GridOverlay color={accentColor} opacity={0.03} cellSize={80} />

      {/* Center content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          gap: 20
        }}
      >
        {/* Category name */}
        <div
          style={{
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: 80,
            color: '#f6ecd9',
            letterSpacing: 6,
            opacity: categoryOpacity,
            transform: `translateY(${categoryY}px)`,
            textAlign: 'center' as const
          }}
        >
          {category}
        </div>

        {/* Animated accent line */}
        <div style={{ position: 'relative', width: 200, height: 2 }}>
          <AccentLine
            color={accentColor}
            width={200}
            height={2}
            durationFrames={25}
            delayFrames={18}
            y={0}
            x={0}
          />
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 22,
            color: '#f6ecd988',
            letterSpacing: 1,
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            textAlign: 'center' as const
          }}
        >
          {tagline}
        </div>
      </div>
    </AbsoluteFill>
  )
}
