import React from 'react'
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  staticFile
} from 'remotion'
import { PrestyjBackground } from '../shared/PrestyjBackground'
import { PrestyjFonts } from '../shared/fonts'
import { EASE } from '../shared/easing'

export interface FullscreenQuotePlusBrollProps {
  /** The quote body — anchored to the upper-left card. */
  quote: string
  /** Optional attribution rendered below the quote in script font. */
  attribution?: string
  /**
   * Either an absolute filesystem path (production caller) or a relative
   * path resolvable via staticFile() (Studio preview). Empty string skips
   * the image — the composition degrades to a quote-only layout.
   */
  imagePath: string
  accentColor: string
  primaryColor: string
  bodyFont: string
  scriptFont: string
}

const WORD_STAGGER_FRAMES = 3
const WORD_REVEAL_FRAMES = 18
const IMAGE_ENTER_DELAY = 8

export const FullscreenQuotePlusBroll: React.FC<FullscreenQuotePlusBrollProps> = ({
  quote,
  attribution,
  imagePath,
  accentColor,
  primaryColor,
  bodyFont,
  scriptFont
}) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const words = quote.split(/\s+/).filter(Boolean)
  const fontSize =
    words.length <= 8 ? 96 : words.length <= 16 ? 78 : words.length <= 24 ? 64 : 56

  // Image entry: scale-from-0.94 + fade, slightly delayed so quote starts
  // first and the eye lands on text before the image enters.
  const imgEnter = spring({
    frame: frame - IMAGE_ENTER_DELAY,
    fps,
    config: { damping: 22, stiffness: 90, mass: 0.9 }
  })
  const imgScale = 0.94 + 0.06 * imgEnter
  const imgOpacity = interpolate(imgEnter, [0, 1], [0, 1])

  // Card-edge accent corner — small geometric tell that reads "designed".
  const cornerProgress = interpolate(frame, [10, 35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })

  // Late micro-release for cohesion with FullscreenQuote.
  const exitStart = durationInFrames - fps * 0.6
  const releaseOpacity = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0.85],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  const lastWordEnter = (words.length - 1) * WORD_STAGGER_FRAMES + WORD_REVEAL_FRAMES
  const attributionStart = lastWordEnter + 14

  const resolvedImage = imagePath
    ? imagePath.startsWith('/') || imagePath.startsWith('file://')
      ? `file://${imagePath.replace(/^file:\/\//, '')}`
      : staticFile(imagePath)
    : null

  return (
    <AbsoluteFill style={{ opacity: releaseOpacity }}>
      <PrestyjFonts />
      <PrestyjBackground accentColor={accentColor} />

      {/* Vertical stack: image card on top (B-roll moment), quote below. */}
      <AbsoluteFill
        style={{
          flexDirection: 'column',
          padding: '160px 90px',
          gap: 70
        }}
      >
        {/* Image card — rounded, border, drop-shadow, corner accent shape. */}
        {resolvedImage ? (
          <div
            style={{
              position: 'relative',
              flex: '0 0 56%',
              transform: `scale(${imgScale})`,
              opacity: imgOpacity,
              transformOrigin: 'center'
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 32,
                overflow: 'hidden',
                border: `1px solid ${accentColor}55`,
                boxShadow: `0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px ${accentColor}22`
              }}
            >
              <Img
                src={resolvedImage}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
              {/* Subtle gradient overlay on image — unifies it with bg. */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `linear-gradient(180deg, transparent 60%, ${accentColor}22 100%)`
                }}
              />
            </div>
            {/* Corner accent bracket — top-left. Small, deliberate. */}
            <CornerBracket
              progress={cornerProgress}
              color={accentColor}
              corner="top-left"
            />
            <CornerBracket
              progress={cornerProgress}
              color={accentColor}
              corner="bottom-right"
            />
          </div>
        ) : null}

        {/* Quote section. */}
        <div
          style={{
            flex: '1 1 auto',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'center',
            textAlign: 'center'
          }}
        >
          <p
            style={{
              color: primaryColor,
              fontFamily: bodyFont,
              fontWeight: 700,
              fontSize,
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
              margin: 0,
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
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------------------
// Sub-components — Word + Attribution mirror FullscreenQuote intentionally so
// motion language stays consistent across compositions.
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
  const ty = (1 - progress) * 20
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: progress,
        transform: `translateY(${ty}px)`,
        marginRight: '0.28em',
        filter: progress < 1 ? `blur(${(1 - progress) * 2}px)` : undefined
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
        marginTop: 50,
        marginBottom: 0,
        fontFamily: font,
        fontSize: 64,
        color,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 20}px)`,
        textShadow: `0 0 24px ${color}44`
      }}
    >
      {text}
    </p>
  )
}

const CornerBracket: React.FC<{
  progress: number
  color: string
  corner: 'top-left' | 'bottom-right'
}> = ({ progress, color, corner }) => {
  const len = 36 * progress
  const thickness = 3
  const offset = -8
  const isTopLeft = corner === 'top-left'
  return (
    <>
      <div
        style={{
          position: 'absolute',
          [isTopLeft ? 'top' : 'bottom']: offset,
          [isTopLeft ? 'left' : 'right']: offset,
          width: len,
          height: thickness,
          background: color,
          opacity: progress,
          boxShadow: `0 0 14px ${color}88`
        }}
      />
      <div
        style={{
          position: 'absolute',
          [isTopLeft ? 'top' : 'bottom']: offset,
          [isTopLeft ? 'left' : 'right']: offset,
          width: thickness,
          height: len,
          background: color,
          opacity: progress,
          boxShadow: `0 0 14px ${color}88`
        }}
      />
    </>
  )
}
