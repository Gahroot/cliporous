import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { PrestyjFonts } from '../shared/fonts'
import { EASE } from '../shared/easing'
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../edit-styles/shared/brand'

/** Word with clip-relative seconds. End is optional (currently unused for visuals,
 *  but plumbed so future variants can fade out on word.end). */
export interface QuoteWord {
  text: string
  /** Clip-relative seconds, snapped to the segment start. */
  start: number
  end?: number
}

export interface FullscreenQuoteProps {
  /** The quote body, used as fallback when `words` is omitted. */
  quote: string
  /**
   * Per-word timings, clip-relative. When supplied, each word reveals on the
   * frame matching its spoken `start` — i.e. the on-screen text marches in
   * lock-step with the speaker. When omitted, words are evenly spaced across
   * the segment duration so the composition still works in Studio previews.
   */
  words?: QuoteWord[]
  /** Optional attribution rendered below the quote in script font. */
  attribution?: string
  /**
   * Accent color used for attribution glow + emphasis word recolor. Defaults
   * to BRAND_ACCENT. The accent bar that used to sit above the quote has
   * been removed — the quote itself is the hero now.
   */
  accentColor?: string
  /** Primary text color. Defaults to BRAND_FG. */
  primaryColor?: string
  /**
   * Solid background color rendered behind the quote. Defaults to BRAND_BG.
   * Mirrors the FFmpeg `color=` source used by buildFullscreenTextCenter so
   * preview and final render are pixel-identical on the backdrop.
   */
  backgroundColor?: string
  /** Body display font family — must match a loaded @font-face. */
  bodyFont: string
  /** Script attribution font family — must match a loaded @font-face. */
  scriptFont: string
  /**
   * Optional set of word indices that should render in the accent color.
   * Lets `emphasis` / `emphasis_highlight` caption modes carry through to
   * this archetype.
   */
  emphasisIndices?: number[]
}

// Per-word reveal: gentle 10-frame ease, no motion blur, no rise — the cut
// between words *is* the percussion, no need to dress it up. Each word holds
// once revealed.
const WORD_REVEAL_FRAMES = 10
const ATTRIBUTION_DELAY_FRAMES = 14

export const FullscreenQuote: React.FC<FullscreenQuoteProps> = ({
  quote,
  words: wordsProp,
  attribution,
  accentColor = BRAND_ACCENT,
  primaryColor = BRAND_FG,
  backgroundColor = BRAND_BG,
  bodyFont,
  scriptFont,
  emphasisIndices
}) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  // Resolve the on-screen word list + per-word reveal frame.
  const words = resolveWords(quote, wordsProp, fps, durationInFrames)
  const lastWordEnter = (words[words.length - 1]?.revealFrame ?? 0) + WORD_REVEAL_FRAMES
  const attributionStart = lastWordEnter + ATTRIBUTION_DELAY_FRAMES

  // Sizing: Bebas Neue is condensed all-caps, so it packs ~30% more glyphs
  // per line than Geist Bold did. Pump the size up accordingly and let long
  // quotes wrap to two/three lines without shrinking too aggressively.
  const fontSize =
    words.length <= 6 ? 196 : words.length <= 12 ? 156 : words.length <= 20 ? 124 : 104

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

  const emphasisSet = React.useMemo(
    () => new Set(emphasisIndices ?? []),
    [emphasisIndices]
  )

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      <PrestyjFonts />

      {/*
        "just subtitles" archetype: solid brand backdrop only. No gradient,
        no vignette, no grain — mirrors the FFmpeg buildFullscreenTextCenter
        layout (color=c=BRAND_BG) and the example reference frame.
      */}

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
        <p
          style={{
            color: primaryColor,
            fontFamily: bodyFont,
            // Bebas Neue is a single weight (400). 700 would force a synthetic
            // bold and crush the letterforms — keep it native.
            fontWeight: 400,
            fontSize,
            // Bebas hugs the baseline; a tighter line-height reads as a
            // monolithic slab rather than a stacked sentence.
            lineHeight: 0.96,
            letterSpacing: '0.005em',
            textAlign: 'center',
            margin: 0,
            // Words come pre-uppercased by Bebas's design, but force it so
            // mixed-case ASR output renders consistently.
            textTransform: 'uppercase'
          }}
        >
          {words.map((w, i) => (
            <Word
              key={i}
              word={w.text}
              revealFrame={w.revealFrame}
              frame={frame}
              accent={emphasisSet.has(i) ? accentColor : null}
            />
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
// Helpers
// ---------------------------------------------------------------------------

interface ResolvedWord {
  text: string
  revealFrame: number
}

/**
 * Build the per-word reveal schedule. When `wordsProp` is supplied, each
 * word's `start` (clip-relative seconds) is snapped to the nearest frame so
 * the on-screen text lock-steps with the speaker. When omitted (Studio
 * previews, ad-hoc renders), words are spread evenly across the composition
 * so the animation still plays back without timing data.
 */
function resolveWords(
  quote: string,
  wordsProp: QuoteWord[] | undefined,
  fps: number,
  durationInFrames: number
): ResolvedWord[] {
  if (wordsProp && wordsProp.length > 0) {
    // Assume `start` is segment-relative (0 = first frame of this composition).
    // Anchor the first word to frame 0 in case ASR has a small lead-in.
    const firstStart = wordsProp[0].start
    return wordsProp.map((w, i) => ({
      text: w.text,
      revealFrame:
        i === 0
          ? 0
          : Math.max(0, Math.round((w.start - firstStart) * fps))
    }))
  }

  const fallback = quote.split(/\s+/).filter(Boolean)
  if (fallback.length === 0) return []
  // Spread evenly across the first 80% of the composition so the last word
  // has room to breathe before the release scale-out.
  const usable = Math.max(1, Math.floor(durationInFrames * 0.8))
  const step = Math.max(3, Math.floor(usable / fallback.length))
  return fallback.map((text, i) => ({ text, revealFrame: i * step }))
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const Word: React.FC<{
  word: string
  revealFrame: number
  frame: number
  accent: string | null
}> = ({ word, revealFrame, frame, accent }) => {
  const localFrame = frame - revealFrame
  const progress = interpolate(localFrame, [0, WORD_REVEAL_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: progress,
        marginRight: '0.28em',
        color: accent ?? undefined
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
        fontSize: 117,
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
