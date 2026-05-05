/**
 * Segment-based zoom filter builders for the FFmpeg render pipeline.
 *
 * Four distinct zoom effects modelled after Captions.ai-style editing:
 *   1. Drift Zoom   — Ken Burns slow drift (ember, film, clarity styles)
 *   2. Snap Zoom    — Instant punch-in on emphasis (impact, rebel styles)
 *   3. Word Pulse   — Rhythmic ease-in-out zoom pulse per word (volt, prime styles)
 *   4. Zoom-Out Reveal — Pull-back from zoomed-in to 1.0x (ember, film B-roll)
 *
 * All builders return an FFmpeg filter string (crop=...+scale=...) that can be
 * inserted into a filter chain after the initial scale and before subtitle burn-in.
 *
 * Uses crop+scale (not zoompan) for performance and Windows compatibility.
 * Avoids escaped commas — uses abs()-based min/max instead of multi-arg functions
 * inside option values.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZoomFilterParams {
  /** Output width in pixels — locked to 720 (9:16 vertical) */
  width: number
  /** Output height in pixels — locked to 1280 (9:16 vertical) */
  height: number
  /** Video frame rate */
  fps: number
  /** Segment duration in seconds */
  duration: number
  /** Maximum zoom scale (1.03–1.20) */
  zoomIntensity: number
  /** Offset of this segment within the full clip (seconds). Default 0. */
  startTime?: number
  /** Emphasis timestamps for snap zoom / word pulse */
  emphasisTimestamps?: { time: number; duration: number }[]
  /** Full word pulse timestamps (segment-local, in seconds) for word-pulse zoom modes that need every word. */
  allWordTimestamps?: { time: number; duration: number }[]
  /** Pan direction for drift zoom */
  panDirection?: 'left-right' | 'right-left' | 'center'
  /** Normalised Y position of face centre (0–1). Default 0.38. */
  faceYNorm?: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PI_STR = '3.141592653589793'

/**
 * Clamp expression using abs() — avoids commas in FFmpeg option values.
 *   max(0, min(val, hi))
 */
function clampExpr(val: string, hi: string): string {
  // min(a, b) = (a + b - abs(a - b)) / 2
  const minVal = `((${val})+(${hi})-abs((${val})-(${hi})))/2`
  // max(0, v) = (v + abs(v)) / 2
  return `((${minVal})+abs(${minVal}))/2`
}

/**
 * Build the Y crop expression that keeps the face in frame.
 * Uses abs()-based clamp — no commas.
 */
function faceTrackY(zExpr: string, faceY: number): string {
  const FY = Math.max(0, Math.min(1, faceY)).toFixed(3)
  const ideal = `ih*${FY}-ih/(${zExpr})/2`
  const hi = `ih-ih/(${zExpr})`
  return clampExpr(ideal, hi)
}

/**
 * Build a centred X crop expression with optional horizontal drift.
 */
function centredX(zExpr: string): string {
  return `iw/2-(iw/(${zExpr})/2)`
}

/**
 * FFmpeg's crop filter evaluates w/h/x/y during filter graph initialisation
 * when `t` is NAN.  Wrap each expression so it returns a safe constant at
 * init time and the real value per-frame.
 */
function nanSafe(expr: string, fallback: string): string {
  return `if(isnan(t),${fallback},${expr})`
}

/**
 * Assemble a crop+scale filter string from sub-expressions.
 * Every parameter is wrapped with nanSafe() so the filter graph can
 * initialise even when `t` is NAN (before any frames are decoded).
 */
function assembleCropScale(
  cropW: string,
  cropH: string,
  cropX: string,
  cropY: string,
  outW: number,
  outH: number
): string {
  return `crop=w='${nanSafe(cropW, 'iw')}':h='${nanSafe(cropH, 'ih')}':x='${nanSafe(cropX, '0')}':y='${nanSafe(cropY, '0')}',scale=${outW}:${outH}`
}

// ---------------------------------------------------------------------------
// 1. Drift Zoom — Ken Burns slow drift
// ---------------------------------------------------------------------------

/**
 * Slow continuous zoom from 1.0× to `zoomIntensity` over the segment duration,
 * with optional horizontal pan direction.
 *
 * Used by: ember, film, clarity caption styles.
 */
export function buildDriftZoom(params: ZoomFilterParams): string {
  const {
    width,
    height,
    duration,
    zoomIntensity,
    startTime = 0,
    panDirection = 'center',
    faceYNorm = 0.38,
  } = params

  if (duration <= 0) return ''

  // Linear zoom from 1.0 to zoomIntensity over the segment duration.
  // t is the absolute timestamp; tLocal = t - startTime.
  const A = (zoomIntensity - 1).toFixed(6)
  const S = startTime.toFixed(3)
  const D = duration.toFixed(3)

  // progress = clamp((t - startTime) / duration, 0, 1)
  // Implemented as: max(0, min((t-S)/D, 1))
  const raw = `(t-${S})/${D}`
  const progress = clampExpr(raw, '1')

  // z(t) = 1 + A * progress
  const zExpr = `1+${A}*(${progress})`

  const cropW = `iw/(${zExpr})`
  const cropH = `ih/(${zExpr})`

  // Horizontal pan
  let cropX: string
  if (panDirection === 'left-right') {
    // Pan from left edge to right edge over the duration
    // xOffset drifts from -panRange to +panRange
    const panRange = (0.03).toFixed(4)
    cropX = `iw/2-(iw/(${zExpr})/2)+${panRange}*(iw/(${zExpr}))*(2*(${progress})-1)`
  } else if (panDirection === 'right-left') {
    const panRange = (0.03).toFixed(4)
    cropX = `iw/2-(iw/(${zExpr})/2)+${panRange}*(iw/(${zExpr}))*(1-2*(${progress}))`
  } else {
    cropX = centredX(zExpr)
  }

  const cropY = faceTrackY(zExpr, faceYNorm)

  return assembleCropScale(cropW, cropH, cropX, cropY, width, height)
}

// ---------------------------------------------------------------------------
// 2. Snap Zoom — Punch-in on emphasis
// ---------------------------------------------------------------------------

/**
 * Starts at 1.0×, instantly jumps to `zoomIntensity` at specified timestamps,
 * holds for the word duration, then snaps back. The transition happens in 2–3
 * frames (nearly instant).
 *
 * Used by: impact, rebel caption styles.
 */
export function buildSnapZoom(params: ZoomFilterParams): string {
  const {
    width,
    height,
    fps,
    duration,
    zoomIntensity,
    startTime = 0,
    emphasisTimestamps = [],
    faceYNorm = 0.38,
  } = params

  if (duration <= 0) return ''
  if (emphasisTimestamps.length === 0) return ''

  // Transition duration in seconds: 2–3 frames
  const transFrames = 2
  const transDur = transFrames / fps

  // Build a piecewise zoom expression using nested if(between(t,...)):
  // For each emphasis event we create:
  //   rampIn  (transDur) : 1 → zoomIntensity (linear over 2–3 frames)
  //   hold                : zoomIntensity constant
  //   rampOut (transDur) : zoomIntensity → 1
  // Outside all events: zoom = 1.0

  interface SnapSegment {
    start: number
    end: number
    zExpr: string
  }

  const Z = zoomIntensity.toFixed(6)
  const dZ = (zoomIntensity - 1).toFixed(6)
  const TD = transDur.toFixed(4)
  const segments: SnapSegment[] = []

  const sorted = [...emphasisTimestamps].sort((a, b) => a.time - b.time)

  for (const em of sorted) {
    const absStart = startTime + em.time
    const absEnd = absStart + em.duration

    // Ramp in: absStart - transDur → absStart
    const rampInStart = Math.max(startTime, absStart - transDur)
    if (absStart > rampInStart) {
      const rs = rampInStart.toFixed(3)
      const re = absStart.toFixed(3)
      // Linear from 1 to Z over transDur
      segments.push({
        start: rampInStart,
        end: absStart,
        zExpr: `1+${dZ}*(t-${rs})/${TD}`,
      })
    }

    // Hold at peak
    segments.push({
      start: absStart,
      end: absEnd,
      zExpr: Z,
    })

    // Ramp out: absEnd → absEnd + transDur
    const rampOutEnd = Math.min(startTime + duration, absEnd + transDur)
    if (rampOutEnd > absEnd) {
      const os = absEnd.toFixed(3)
      // Linear from Z to 1 over transDur
      segments.push({
        start: absEnd,
        end: rampOutEnd,
        zExpr: `${Z}-${dZ}*(t-${os})/${TD}`,
      })
    }
  }

  // Build nested if(between(...)) — fallback is 1.0 (no zoom)
  const buildExpr = (exprFn: (z: string) => string): string => {
    let expr = exprFn('1')
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]
      const s = seg.start.toFixed(3)
      const e = seg.end.toFixed(3)
      expr = `if(between(t,${s},${e}),${exprFn(seg.zExpr)},${expr})`
    }
    return expr
  }

  const cropW = buildExpr((z) => `iw/(${z})`)
  const cropH = buildExpr((z) => `ih/(${z})`)
  const cropX = buildExpr((z) => centredX(z))
  const cropY = buildExpr((z) => faceTrackY(z, faceYNorm))

  return assembleCropScale(cropW, cropH, cropX, cropY, width, height)
}

// ---------------------------------------------------------------------------
// 3. Word Pulse Zoom — Rhythmic ease-in-out per word
// ---------------------------------------------------------------------------

/**
 * Zoom pulses on each emphasised word: 1.0× → `zoomIntensity` → 1.0× using
 * a cosine ease-in-out curve. Higher frequency than snap zoom — pulses every
 * 0.5–1.0 seconds.
 *
 * Used by: volt, prime caption styles.
 */
export function buildWordPulseZoom(params: ZoomFilterParams): string {
  const {
    width,
    height,
    duration,
    zoomIntensity,
    startTime = 0,
    emphasisTimestamps = [],
    faceYNorm = 0.38,
  } = params

  if (duration <= 0) return ''
  if (emphasisTimestamps.length === 0) return ''

  // For each word we build an ease-in-out pulse using cosine:
  //   z(t) = 1 + A * (0.5 - 0.5 * cos(2π * localProgress))
  // where localProgress = (t - pulseStart) / pulseDuration
  // This smoothly goes 1 → (1+A) → 1 over the pulse duration.

  const A = (zoomIntensity - 1).toFixed(6)

  interface PulseSegment {
    start: number
    end: number
    zExpr: string
  }

  const segments: PulseSegment[] = []
  const sorted = [...emphasisTimestamps].sort((a, b) => a.time - b.time)

  for (const em of sorted) {
    const absStart = startTime + em.time
    const pulseDur = Math.max(0.1, em.duration)
    const absEnd = absStart + pulseDur
    const ps = absStart.toFixed(3)
    const pd = pulseDur.toFixed(4)

    // Cosine ease: 0→1→0 over [absStart, absEnd]
    // progress = (t - absStart) / pulseDur
    // z = 1 + A * (0.5 - 0.5 * cos(2*PI*progress))
    const zExpr = `1+${A}*(0.5-0.5*cos(2*${PI_STR}*(t-${ps})/${pd}))`

    segments.push({ start: absStart, end: absEnd, zExpr })
  }

  // Build nested if(between(...)) — fallback is 1.0
  const buildExpr = (exprFn: (z: string) => string): string => {
    let expr = exprFn('1')
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]
      const s = seg.start.toFixed(3)
      const e = seg.end.toFixed(3)
      expr = `if(between(t,${s},${e}),${exprFn(seg.zExpr)},${expr})`
    }
    return expr
  }

  const cropW = buildExpr((z) => `iw/(${z})`)
  const cropH = buildExpr((z) => `ih/(${z})`)
  const cropX = buildExpr((z) => centredX(z))
  const cropY = buildExpr((z) => faceTrackY(z, faceYNorm))

  return assembleCropScale(cropW, cropH, cropX, cropY, width, height)
}

// ---------------------------------------------------------------------------
// 4. Zoom-Out Reveal — Pull-back from zoomed-in to 1.0×
// ---------------------------------------------------------------------------

/**
 * Starts zoomed IN at `zoomIntensity` and slowly zooms OUT to 1.0× over the
 * segment duration. Creates a "revealing" feel — great for B-roll transitions.
 *
 * Used by: ember, film caption styles.
 */
export function buildZoomOutReveal(params: ZoomFilterParams): string {
  const {
    width,
    height,
    duration,
    zoomIntensity,
    startTime = 0,
    faceYNorm = 0.38,
  } = params

  if (duration <= 0) return ''

  // Linear zoom from zoomIntensity down to 1.0 over the segment duration.
  // progress = clamp((t - startTime) / duration, 0, 1)
  // z(t) = zoomIntensity - (zoomIntensity - 1) * progress
  //       = zoomIntensity * (1 - progress) + 1 * progress

  const A = (zoomIntensity - 1).toFixed(6)
  const Z = zoomIntensity.toFixed(6)
  const S = startTime.toFixed(3)
  const D = duration.toFixed(3)

  const raw = `(t-${S})/${D}`
  const progress = clampExpr(raw, '1')

  // z = zoomIntensity - A * progress  (starts at zoomIntensity, ends at 1.0)
  const zExpr = `${Z}-${A}*(${progress})`

  const cropW = `iw/(${zExpr})`
  const cropH = `ih/(${zExpr})`
  const cropX = centredX(zExpr)
  const cropY = faceTrackY(zExpr, faceYNorm)

  return assembleCropScale(cropW, cropH, cropX, cropY, width, height)
}
