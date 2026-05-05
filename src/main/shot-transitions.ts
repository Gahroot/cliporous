// ---------------------------------------------------------------------------
// Shot Transitions — FFmpeg filter builder for between-shot visual transitions
//
// Generates time-limited FFmpeg filter expressions (fade, overlay position
// animation) at shot boundaries within a single clip. Each transition is
// implemented as an effect on the base video stream using enable expressions
// so no segment splitting is required.
// ---------------------------------------------------------------------------

import type { ShotStyleConfig, ShotTransitionConfig } from '@shared/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TRANSITION_DURATION = 0.3
const MIN_TRANSITION_DURATION = 0.15
const MAX_TRANSITION_DURATION = 1.0

function clampDuration(d: number | undefined): number {
  const dur = d ?? DEFAULT_TRANSITION_DURATION
  return Math.max(MIN_TRANSITION_DURATION, Math.min(MAX_TRANSITION_DURATION, dur))
}

// ---------------------------------------------------------------------------
// Single transition builder
// ---------------------------------------------------------------------------

/**
 * Build FFmpeg filter expression(s) for a single transition at a shot boundary.
 *
 * @param transition  Transition config
 * @param boundaryTime  The time in seconds where the shot boundary occurs
 * @param clipDuration  Total clip duration in seconds
 * @returns           FFmpeg filter string segment(s), or empty string for 'none'
 */
export function buildTransitionFilter(
  transition: ShotTransitionConfig,
  boundaryTime: number,
  clipDuration: number
): string {
  if (transition.type === 'none') return ''

  const dur = clampDuration(transition.duration)

  // Clamp to avoid transitions that extend beyond clip boundaries
  const fadeOutStart = Math.max(0, boundaryTime - dur / 2)
  const fadeInStart = boundaryTime
  const fadeInEnd = Math.min(clipDuration, boundaryTime + dur / 2)

  switch (transition.type) {
    case 'crossfade': {
      // Approximate crossfade within a single stream using brief fade-out + fade-in
      // at the boundary point. Not a true dissolve (that requires xfade with two
      // streams), but visually similar for fast transitions.
      return [
        `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${(dur / 2).toFixed(3)}:enable='between(t\\,${fadeOutStart.toFixed(3)}\\,${boundaryTime.toFixed(3)})'`,
        `fade=t=in:st=${fadeInStart.toFixed(3)}:d=${(dur / 2).toFixed(3)}:enable='between(t\\,${fadeInStart.toFixed(3)}\\,${fadeInEnd.toFixed(3)})'`
      ].join(',')
    }

    case 'dip-black': {
      // Fade to black before the boundary, then fade from black after
      return [
        `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${(dur / 2).toFixed(3)}`,
        `fade=t=in:st=${fadeInStart.toFixed(3)}:d=${(dur / 2).toFixed(3)}`
      ]
        .map((f, i) => {
          const s = i === 0 ? fadeOutStart : fadeInStart
          const e = i === 0 ? boundaryTime : fadeInEnd
          return `${f}:enable='between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})'`
        })
        .join(',')
    }

    case 'swipe-left': {
      // Brief crop + position shift illusion at the boundary
      // Uses a rapid crop pan from right to left
      const s = fadeOutStart
      const e = fadeInEnd
      const cropExpr =
        `crop=iw:ih:` +
        `'if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,` +
        `(iw*0.05)*(1-abs(2*(t-${boundaryTime.toFixed(3)})/${dur.toFixed(3)}))\\,0)':0:` +
        `enable='between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})'`
      return cropExpr
    }

    case 'swipe-up': {
      // Vertical crop shift at the boundary
      const s = fadeOutStart
      const e = fadeInEnd
      const cropExpr =
        `crop=iw:ih:0:` +
        `'if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,` +
        `(ih*0.05)*(1-abs(2*(t-${boundaryTime.toFixed(3)})/${dur.toFixed(3)}))\\,0)':` +
        `enable='between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})'`
      return cropExpr
    }

    case 'zoom-in': {
      // Brief zoom push at the boundary using zoompan-style crop expression
      const s = fadeOutStart
      const e = fadeInEnd
      const zoomFactor = 0.05 // 5% zoom push
      const zExpr =
        `crop=` +
        `'iw-iw*${zoomFactor}*if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,` +
        `(1-abs(2*(t-${boundaryTime.toFixed(3)})/${dur.toFixed(3)}))\\,0)':` +
        `'ih-ih*${zoomFactor}*if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,` +
        `(1-abs(2*(t-${boundaryTime.toFixed(3)})/${dur.toFixed(3)}))\\,0)':` +
        `'iw*${zoomFactor / 2}*if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,` +
        `(1-abs(2*(t-${boundaryTime.toFixed(3)})/${dur.toFixed(3)}))\\,0)':` +
        `'ih*${zoomFactor / 2}*if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,` +
        `(1-abs(2*(t-${boundaryTime.toFixed(3)})/${dur.toFixed(3)}))\\,0)'`
      return zExpr
    }

    case 'swipe-down': {
      // Vertical crop shift downward at the boundary (inverse of swipe-up)
      const s = fadeOutStart
      const e = fadeInEnd
      const cropExpr =
        `crop=iw:ih:0:` +
        `'if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,` +
        `-(ih*0.05)*(1-abs(2*(t-${boundaryTime.toFixed(3)})/${dur.toFixed(3)}))\\,0)':` +
        `enable='between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})'`
      return cropExpr
    }

    case 'zoom-punch': {
      // Aggressive snap-zoom — punchy, energetic feel.
      // Ramps up faster and snaps back harder than zoom-in.
      // Uses a sharper ease curve (quadratic) and 10% zoom for impact.
      const s = fadeOutStart
      const e = fadeInEnd
      const zoomFactor = 0.10 // 10% zoom — double the gentle zoom-in
      // Quadratic ease: pow((1-abs(2*(t-boundary)/dur)), 2) — sharp snap-back
      const easeExpr =
        `pow((1-abs(2*(t-${boundaryTime.toFixed(3)})/${dur.toFixed(3)}))\\,2)`
      const zExpr =
        `crop=` +
        `'iw-iw*${zoomFactor}*if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,${easeExpr}\\,0)':` +
        `'ih-ih*${zoomFactor}*if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,${easeExpr}\\,0)':` +
        `'iw*${zoomFactor / 2}*if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,${easeExpr}\\,0)':` +
        `'ih*${zoomFactor / 2}*if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,${easeExpr}\\,0)'`
      return zExpr
    }

    case 'glitch': {
      // Digital glitch distortion — RGB channel shift + brief brightness spike.
      // Implemented as: rgbashift (horizontal RGB separation) + noise burst,
      // all time-limited to the transition window.
      const s = fadeOutStart
      const e = fadeInEnd
      // rgbashift shifts red/blue channels horizontally for chromatic aberration
      // The shift amount pulses from 0→max→0 across the transition
      const shiftExpr =
        `if(between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})\\,` +
        `8*(1-abs(2*(t-${boundaryTime.toFixed(3)})/${dur.toFixed(3)}))\\,0)`
      const glitchFilter = [
        `rgbashift=rh='${shiftExpr}':bh='-${shiftExpr}':` +
          `enable='between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})'`,
        // Brief noise burst at the boundary — digital static feel
        `noise=alls=30:allf=t:enable='between(t\\,${s.toFixed(3)}\\,${e.toFixed(3)})'`
      ].join(',')
      return glitchFilter
    }

    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Multi-shot transition builder
// ---------------------------------------------------------------------------

/**
 * Build FFmpeg filter string for all shot transitions in a clip.
 *
 * For each consecutive shot pair, checks the outgoing shot's `transitionOut`
 * and the incoming shot's `transitionIn`. If both are specified, `transitionOut`
 * takes precedence (the outgoing shot "owns" the boundary).
 *
 * @param shots        Per-shot style configs sorted by shotIndex
 * @param clipDuration Total clip duration in seconds
 * @returns            Chained FFmpeg filter string or empty string
 */
export function buildShotTransitionFilters(
  shots: ShotStyleConfig[],
  clipDuration: number
): string {
  if (shots.length < 2) return ''

  // Sort by shotIndex to ensure correct boundary ordering
  const sorted = [...shots].sort((a, b) => a.shotIndex - b.shotIndex)

  const segments: string[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const outgoing = sorted[i]
    const incoming = sorted[i + 1]

    // Boundary time is the end of the outgoing shot (= start of incoming)
    const boundaryTime = outgoing.endTime

    // Outgoing shot's transitionOut takes precedence over incoming's transitionIn
    const transition: ShotTransitionConfig | null | undefined =
      outgoing.transitionOut ?? incoming.transitionIn

    if (!transition || transition.type === 'none') continue

    const filter = buildTransitionFilter(transition, boundaryTime, clipDuration)
    if (filter) segments.push(filter)
  }

  return segments.join(',')
}
