import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { PrestyjFonts } from '../shared/fonts'
import { EASE } from '../shared/easing'

const DEFAULT_ACCENT = '#FFD600'
const DEFAULT_BG = '#1A1A2E'
const DEFAULT_FG = '#FFFFFF'

export type ConceptCardLayoutKind = 'quote' | 'list' | 'statistic' | 'section-title'

export interface ConceptCardProps {
  /** Card visual layout. */
  layout: ConceptCardLayoutKind
  /** Hero text. */
  text: string
  /** Optional secondary line (subtitle / attribution / unit). */
  subtitle?: string
  /** List items (used when layout === 'list'). */
  items?: string[]
  /** Accent color. Defaults to Hormozi yellow. */
  accentColor?: string
  /** Background color. Defaults to dark warm navy. */
  backgroundColor?: string
}

/**
 * Full-frame concept / illustration card. Opaque 1920×1080 — rendered as a
 * standalone clip and concatenated into the long-form timeline while the
 * source narration continues underneath.
 */
export const ConceptCard: React.FC<ConceptCardProps> = ({
  layout,
  text,
  subtitle,
  items,
  accentColor = DEFAULT_ACCENT,
  backgroundColor = DEFAULT_BG
}) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 110, mass: 0.8 } })
  const exitStart = durationInFrames - Math.round(fps * 0.5)
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.inExpo
  })
  const rise = interpolate(enter, [0, 1], [40, 0])

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 160px'
      }}
    >
      <PrestyjFonts />
      <div
        style={{
          opacity: enter * exitOpacity,
          transform: `translateY(${rise}px)`,
          width: '100%',
          textAlign: layout === 'list' ? 'left' : 'center'
        }}
      >
        {renderLayout({ layout, text, subtitle, items, accentColor, fg: DEFAULT_FG, frame, fps })}
      </div>
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------------------
// Layout renderers
// ---------------------------------------------------------------------------

function renderLayout(p: {
  layout: ConceptCardLayoutKind
  text: string
  subtitle?: string
  items?: string[]
  accentColor: string
  fg: string
  frame: number
  fps: number
}): React.ReactNode {
  const { layout, text, subtitle, items, accentColor, fg, frame, fps } = p

  if (layout === 'statistic') {
    return (
      <>
        <div
          style={{
            fontFamily: 'Bebas Neue',
            fontSize: 420,
            lineHeight: 0.9,
            color: accentColor,
            textShadow: `0 0 60px ${accentColor}55`
          }}
        >
          {text}
        </div>
        {subtitle ? (
          <div
            style={{
              fontFamily: 'Bebas Neue',
              fontSize: 96,
              letterSpacing: '0.04em',
              color: fg,
              marginTop: 8
            }}
          >
            {subtitle.toUpperCase()}
          </div>
        ) : null}
      </>
    )
  }

  if (layout === 'list') {
    const list = items ?? []
    return (
      <>
        <div
          style={{
            fontFamily: 'Bebas Neue',
            fontSize: 130,
            letterSpacing: '0.02em',
            color: accentColor,
            marginBottom: 56,
            textAlign: 'center'
          }}
        >
          {text.toUpperCase()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          {list.map((item, i) => {
            const itemEnter = spring({
              frame: frame - 6 - i * 5,
              fps,
              config: { damping: 18, stiffness: 120, mass: 0.7 }
            })
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 32,
                  opacity: itemEnter,
                  transform: `translateX(${interpolate(itemEnter, [0, 1], [-40, 0])}px)`
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    backgroundColor: accentColor
                  }}
                />
                <span
                  style={{
                    fontFamily: 'Geist',
                    fontWeight: 700,
                    fontSize: 76,
                    color: fg,
                    lineHeight: 1.05
                  }}
                >
                  {item}
                </span>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  if (layout === 'section-title') {
    return (
      <>
        <div
          style={{
            fontFamily: 'Bebas Neue',
            fontSize: 280,
            lineHeight: 0.92,
            letterSpacing: '0.02em',
            color: fg
          }}
        >
          {text.toUpperCase()}
        </div>
        {subtitle ? (
          <div
            style={{
              fontFamily: 'Geist',
              fontWeight: 700,
              fontSize: 64,
              color: accentColor,
              marginTop: 24
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </>
    )
  }

  // 'quote'
  return (
    <>
      <div
        style={{
          fontFamily: 'Geist',
          fontWeight: 700,
          fontSize: 120,
          lineHeight: 1.1,
          color: fg
        }}
      >
        {text}
      </div>
      {subtitle ? (
        <div
          style={{
            fontFamily: 'Bebas Neue',
            fontSize: 80,
            letterSpacing: '0.04em',
            color: accentColor,
            marginTop: 40
          }}
        >
          {subtitle.toUpperCase()}
        </div>
      ) : null}
    </>
  )
}
