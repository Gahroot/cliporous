import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'
import { BRAND_ACCENT } from '../../../edit-styles/shared/brand'
import { EASE } from '../../shared/easing'
import { DarkCard } from '../../shared/primitives'
import { PrestyjFonts } from '../../shared/fonts'
import type { StatStackProps } from './types'

/* ------------------------------------------------------------------ */
/*  StatStack — vertical list of metrics with progress bars             */
/* ------------------------------------------------------------------ */

export const StatStack: React.FC<StatStackProps> = ({
  title,
  stats,
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

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <PrestyjFonts />
      <div style={{ opacity: entranceOpacity, transform: `translateY(${entranceY}px)` }}>
        <DarkCard accentColor={accentColor} width={580} padding={48}>
          {/* Title */}
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 20,
              letterSpacing: 3,
              color: accentColor,
              textTransform: 'uppercase' as const,
              marginBottom: 32
            }}
          >
            {title}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 24 }}>
            {stats.map((stat, i) => {
              // Staggered row entrance.
              const rowOpacity = interpolate(
                frame,
                [12 + i * 6, 22 + i * 6],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
              )
              const rowX = interpolate(
                frame,
                [12 + i * 6, 22 + i * 6],
                [-12, 0],
                {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: EASE.outExpo
                }
              )

              // Bar fill animation.
              const barFill = stat.bar !== undefined
                ? interpolate(
                    frame,
                    [18 + i * 6, 35 + i * 6],
                    [0, stat.bar],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.outExpo }
                  )
                : undefined

              return (
                <div
                  key={`${stat.label}-${i}`}
                  style={{ opacity: rowOpacity, transform: `translateX(${rowX}px)` }}
                >
                  {/* Label + value row */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: stat.bar !== undefined ? 8 : 0
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 14,
                        letterSpacing: 2,
                        color: '#f6ecd988',
                        textTransform: 'uppercase' as const
                      }}
                    >
                      {stat.label}
                    </span>
                    <span
                      style={{
                        fontFamily: 'Bebas Neue, sans-serif',
                        fontSize: 28,
                        color: '#f6ecd9'
                      }}
                    >
                      {stat.value}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {stat.bar !== undefined && barFill !== undefined && (
                    <div
                      style={{
                        width: '100%',
                        height: 3,
                        backgroundColor: '#1a1a1a',
                        borderRadius: 2,
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          width: `${barFill * 100}%`,
                          height: '100%',
                          backgroundColor: accentColor,
                          borderRadius: 2,
                          boxShadow: `0 0 8px ${accentColor}44`
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </DarkCard>
      </div>
    </AbsoluteFill>
  )
}
