import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { PrestyjFonts } from '../shared/fonts'
import { EASE } from '../shared/easing'

/** Section header pill accent — purple. */
const DEFAULT_ACCENT = '#9F75FF'
/** Dark warm backdrop. */
const DEFAULT_BG = '#1A1A2E'

export interface SectionHeaderProps {
  /** Section title rendered inside the pill (uppercased). */
  text: string
  /** Optional leading emoji icon. */
  iconEmoji?: string
  /** Pill / glow accent color. Defaults to purple. */
  accentColor?: string
  /** Full-frame background color. Defaults to dark warm navy. */
  backgroundColor?: string
}

/**
 * Full-frame purple pill section divider. Opaque background — rendered as a
 * standalone 1920×1080 clip and concatenated into the long-form timeline at a
 * topic transition.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  text,
  iconEmoji,
  accentColor = DEFAULT_ACCENT,
  backgroundColor = DEFAULT_BG
}) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const enter = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.8 }
  })

  const exitStart = durationInFrames - Math.round(fps * 0.5)
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.inExpo
  })

  const scale = interpolate(enter, [0, 1], [0.85, 1])
  const label = text.toUpperCase()

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <PrestyjFonts />
      <div
        style={{
          transform: `scale(${scale})`,
          opacity: enter * exitOpacity,
          display: 'flex',
          alignItems: 'center',
          gap: 36,
          padding: '40px 96px',
          borderRadius: 9999,
          backgroundColor: accentColor,
          boxShadow: `0 0 90px ${accentColor}80, 0 0 30px ${accentColor}aa`
        }}
      >
        {iconEmoji ? (
          <span style={{ fontSize: 120, lineHeight: 1 }}>{iconEmoji}</span>
        ) : null}
        <span
          style={{
            fontFamily: 'Bebas Neue',
            fontWeight: 400,
            fontSize: 150,
            lineHeight: 1,
            letterSpacing: '0.03em',
            color: '#FFFFFF'
          }}
        >
          {label}
        </span>
      </div>
    </AbsoluteFill>
  )
}
