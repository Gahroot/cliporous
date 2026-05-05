import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { PrestyjBackground } from '../shared/PrestyjBackground'
import { PrestyjFonts } from '../shared/fonts'
import { EASE } from '../shared/easing'

export interface FullscreenQuoteProps {
  /** The quote body. Word-by-word reveal happens automatically. */
  quote: string
  /** Optional attribution rendered below the quote in script font. */
  attribution?: string
  /** Hex accent color (PRESTYJ default: #7058E3). */
  accentColor: string
  /** Hex primary text color (default white). */
  primaryColor: string
  /** Body display font family — must match a loaded @font-face. */
  bodyFont: string
  /** Script attribution font family — must match a loaded @font-face. */
  scriptFont: string
}

const WORD_STAGGER_FRAMES = 3
const WORD_REVEAL_FRAMES = 18
const ATTRIBUTION_DELAY_FRAMES = 14

export const FullscreenQuote: React.FC<FullscreenQuoteProps> = ({
  quote,
  attribution,
  accentColor,
  primaryColor,
  bodyFont,
  scriptFont
}) => {
  const frame = useCurrentFrame()
  const { fps, height, durationInFrames } = useVideoConfig()

  const words = quote.split(/\s+/).filter(Boolean)
  const lastWordEnter = (words.length - 1) * WORD_STAGGER_FRAMES + WORD_REVEAL_FRAMES
  const attributionStart = lastWordEnter + ATTRIBUTION_DELAY_FRAMES

  // Sizing: shrink as word count grows so long quotes still fit. The
  // breakpoints are tuned for 1080×1920; if you change canvas, retune.
  const fontSize =
    words.length <= 6 ? 132 : words.length <= 12 ? 108 : words.length <= 20 ? 88 : 72

  // Subtle 4% scale-out near the very end gives the segment a "release"
  // even if the next segment uses hard-cut. Cinematic micro-detail.
  const exitStart = durationInFrames - fps * 0.6
  const releaseScale = interpolate(frame, [exitStart, durationInFrames], [1, 1.04], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.inExpo
  })
  const releaseOpacity = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0.85],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  return (
    <AbsoluteFill>
      <PrestyjFonts />
      <PrestyjBackground accentColor={accentColor} />

      {/* Centered stack — quote dominates, attribution is a quiet whisper. */}
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 110px',
          transform: `scale(${releaseScale})`,
          opacity: releaseOpacity
        }}
      >
        {/* Tiny accent bar above quote — the "designed" tell. */}
        <AccentBar
          frame={frame}
          fps={fps}
          color={accentColor}
        />

        <p
          style={{
            color: primaryColor,
            fontFamily: bodyFont,
            fontWeight: 700,
            fontSize,
            lineHeight: 1.08,
            letterSpacing: '-0.025em',
            textAlign: 'center',
            margin: 0,
            marginTop: 40,
            // Per-word spans inherit; whitespace preserved between spans.
            wordSpacing: '0.05em'
          }}
        >
          {words.map((word, i) => (
            <Word key={i} word={word} index={i} frame={frame} />
          ))}
        </p>

        {attribution ? (
          <Attribution
            text={attribution}
            font={scriptFont}
            color={accentColor}
            startFrame={attributionStart}
            frame={frame}
            fps={fps}
          />
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const Word: React.FC<{ word: string; index: number; frame: number }> = ({
  word,
  index,
  frame
}) => {
  const localFrame = frame - index * WORD_STAGGER_FRAMES
  const progress = interpolate(localFrame, [0, WORD_REVEAL_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })
  const ty = (1 - progress) * 24
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: progress,
        transform: `translateY(${ty}px)`,
        marginRight: '0.28em',
        // Touch of motion blur on the inbound — sells the easing.
        filter: progress < 1 ? `blur(${(1 - progress) * 2.5}px)` : undefined
      }}
    >
      {word}
    </span>
  )
}

const Attribution: React.FC<{
  text: string
  font: string
  color: string
  startFrame: number
  frame: number
  fps: number
}> = ({ text, font, color, startFrame, frame, fps }) => {
  const localFrame = frame - startFrame
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 18, stiffness: 110, mass: 0.7 }
  })
  return (
    <p
      style={{
        marginTop: 70,
        marginBottom: 0,
        fontFamily: font,
        fontSize: 78,
        color,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 24}px)`,
        letterSpacing: '0.01em',
        // Faint glow makes script type read as "luxe" against dark bg.
        textShadow: `0 0 30px ${color}44`
      }}
    >
      {text}
    </p>
  )
}

const AccentBar: React.FC<{ frame: number; fps: number; color: string }> = ({
  frame,
  fps,
  color
}) => {
  // Bar grows from center outward in the first 20 frames.
  const progress = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })
  return (
    <div
      style={{
        width: 120 * progress,
        height: 4,
        background: color,
        borderRadius: 2,
        marginBottom: 8,
        boxShadow: `0 0 20px ${color}88`
      }}
    />
  )
}
