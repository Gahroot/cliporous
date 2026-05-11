/**
 * Auto-Zoom Engine — animated zoom/pan for rendered clips.
 *
 * Supports three modes:
 * - ken-burns:  smooth sinusoidal breathing zoom (cosine wave)
 * - reactive:   zoom responds to word emphasis moments (keyframe-driven)
 * - jump-cut:   instant zoom level changes simulating multi-camera editing
 *
 * The filter must be inserted AFTER `scale=1080:1920` (the locked 9:16 canvas)
 * in the filter chain and BEFORE any subtitle burn-in (e.g. `ass=...`).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { ZoomIntensity, ZoomMode, WordTimestamp } from '@shared/types'
import { OUTPUT_WIDTH, OUTPUT_HEIGHT } from './aspect-ratios'
export type { ZoomIntensity, ZoomMode }

export interface ZoomSettings {
  /** Whether auto-zoom is applied to rendered clips */
  enabled: boolean
  /**
   * Zoom animation mode.
   * - ken-burns:  smooth sinusoidal breathing (default)
   * - reactive:   zoom responds to word emphasis moments (keyframe-driven)
   * - jump-cut:   instant zoom level changes simulating multi-camera editing
   */
  mode: ZoomMode
  /**
   * How pronounced the zoom/pan motion is.
   * - subtle:  ±5% zoom, no horizontal drift  (default)
   * - medium:  ±9% zoom, gentle horizontal drift
   * - dynamic: ±13% zoom, noticeable horizontal drift
   */
  intensity: ZoomIntensity
  /**
   * Seconds between zoom direction reversals (half-period of the sine wave).
   * Default: 4 → full zoom cycle every 8 seconds.
   */
  intervalSeconds: number
}

export interface ZoomKeyframe {
  time: number
  zoom: number   // absolute zoom factor, e.g. 1.08
  panX: number   // normalised x of view centre (0–1)
  panY: number   // normalised y of view centre (0–1)
}

/**
 * A single emphasis event to drive reactive zoom.
 * Times are clip-relative (0-based) in seconds.
 */
export interface EmphasisKeyframe {
  /** Start of the emphasised word in seconds (clip-relative) */
  time: number
  /** End of the emphasised word in seconds (clip-relative) */
  end: number
  /** Whether this is a regular emphasis hit, the supersize (loudest) word, or a boxed emphasis. */
  level: 'emphasis' | 'supersize' | 'box'
}

// ---------------------------------------------------------------------------
// Intensity config
// ---------------------------------------------------------------------------

interface IntensityConfig {
  /** Max zoom above 1.0 (amplitude of cosine oscillation) */
  amplitude: number
  /**
   * Horizontal pan expressed as a fraction of the zoomed visible width
   * on either side of centre. 0 = no horizontal drift.
   */
  panFrac: number
}

// ---------------------------------------------------------------------------
// NAN-safe wrapper for crop expressions
// ---------------------------------------------------------------------------

/**
 * FFmpeg's crop filter evaluates w/h/x/y during filter graph initialisation
 * when `t` is NAN (no frame has been decoded yet).  Any expression that uses
 * `t` directly (e.g. `cos(2*PI*t/T)`) will evaluate to NAN, causing
 * "Error when evaluating the expression" and aborting the render.
 *
 * This helper wraps an expression so that when `t` is NAN (init time) it
 * returns a safe constant, and when `t` is valid (per-frame) it evaluates
 * the real expression.
 *
 *   isnan(t) → 1 at init, 0 at runtime
 */
function nanSafe(expr: string, fallback: string): string {
  return `if(isnan(t),${fallback},${expr})`
}

const INTENSITY_CONFIG: Record<ZoomIntensity, IntensityConfig> = {
  subtle:  { amplitude: 0.05, panFrac: 0.00 },
  medium:  { amplitude: 0.09, panFrac: 0.03 },
  dynamic: { amplitude: 0.13, panFrac: 0.05 },
}

// ---------------------------------------------------------------------------
// Reactive zoom config
// ---------------------------------------------------------------------------

interface ReactiveConfig {
  /** Neutral zoom applied when no emphasis event is active */
  base: number
  /** Peak zoom for 'emphasis'-level words */
  emphasis: number
  /** Peak zoom for 'supersize'-level words */
  supersize: number
  /** Peak zoom for 'box'-level words */
  box: number
  /** Linear ramp-in and ramp-out duration in seconds around each word */
  rampSeconds: number
}

const REACTIVE_CONFIG: Record<ZoomIntensity, ReactiveConfig> = {
  subtle:  { base: 1.00, emphasis: 1.06, supersize: 1.10, box: 1.06, rampSeconds: 0.15 },
  medium:  { base: 1.00, emphasis: 1.08, supersize: 1.13, box: 1.08, rampSeconds: 0.12 },
  dynamic: { base: 1.00, emphasis: 1.10, supersize: 1.16, box: 1.10, rampSeconds: 0.10 },
}

/**
 * Internal segment used to build piecewise-linear reactive zoom expressions.
 * Zoom interpolates linearly from `zoomStart` to `zoomEnd` over [start, end].
 * For constant segments `zoomStart === zoomEnd`.
 */
interface ReactiveSegment {
  start: number
  end: number
  zoomStart: number
  zoomEnd: number
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an FFmpeg `zoompan` filter string for Ken Burns-style motion.
 *
 * @param clipDuration   Duration of the clip in seconds (used to floor the period).
 * @param settings       Zoom settings from the user.
 * @param faceYNorm      Optional normalised Y position (0–1) of the face centre
 *                       within the output frame.  Defaults to 0.38
 *                       (upper-middle — typical for talking-head after face crop).
 * @param outW           Output frame width in pixels (default: 1080 — locked 9:16).
 * @param outH           Output frame height in pixels (default: 1920 — locked 9:16).
 * @returns              A zoompan filter string (empty string when zoom is disabled).
 */
export function generateZoomFilter(
  clipDuration: number,
  settings: ZoomSettings,
  faceYNorm: number = 0.38,
  outW: number = OUTPUT_WIDTH,
  outH: number = OUTPUT_HEIGHT,
  wordTimestamps?: WordTimestamp[],
  emphasisKeyframes?: EmphasisKeyframe[]
): string {
  if (!settings.enabled) return ''

  const mode = settings.mode ?? 'ken-burns'

  // Jump-cut mode: hard step-function zoom changes simulating multi-cam editing
  if (mode === 'jump-cut') {
    return generateJumpCutZoomFilter(clipDuration, settings, faceYNorm, outW, outH, wordTimestamps)
  }

  // Reactive mode: keyframe-driven zoom tied to word emphasis moments
  if (mode === 'reactive') {
    return generateReactiveZoomFilter(
      clipDuration,
      settings,
      faceYNorm,
      outW,
      outH,
      emphasisKeyframes ?? []
    )
  }

  if (mode !== 'ken-burns') return ''

  const { amplitude, panFrac } = INTENSITY_CONFIG[settings.intensity]

  // Full sine cycle = 2× the user's interval.  Never allow the period to
  // exceed 2× the clip duration so there is at least one visible cycle.
  const rawPeriod = settings.intervalSeconds * 2
  const period = Math.min(rawPeriod, clipDuration > 0 ? clipDuration * 2 : rawPeriod)

  const T  = period.toFixed(2)
  const A  = amplitude.toFixed(4)
  const FY = Math.max(0, Math.min(1, faceYNorm)).toFixed(3)
  const PF = panFrac.toFixed(4)

  // ── Zoom expression ────────────────────────────────────────────────────────
  // Uses cosine so zoom starts at maximum (1+A) at t=0 and descends to 1.0
  // at t=T/2, then returns to maximum at t=T.  This avoids a jarring "jump"
  // at the very first frame (the clip opens slightly zoomed in and gently
  // breathes out/in).
  //
  //   z(t) = 1 + A × (0.5 + 0.5 × cos(2π t / T))
  //        range: [1.0, 1+A]
  // The crop filter uses `t` for timestamp (not `in_time` like zoompan).
  // It also has no built-in `zoom` variable, so we inline the zoom expression
  // everywhere it's referenced.
  // Use literal PI value instead of relying on FFmpeg's built-in constant
  // which may not be available on all builds (especially Windows).
  const PI_VAL = '3.141592653589793'
  const zExpr = `1+${A}*(0.5+0.5*cos(2*${PI_VAL}*t/${T}))`

  // ── X (horizontal) expression ──────────────────────────────────────────────
  // For the crop filter, x/y represent the top-left corner of the crop window.
  // `iw/2-(iw/z/2)` centres the crop horizontally.  Since the crop filter
  // doesn't have a `zoom` variable, we inline the zoom expression as `z`.
  //
  // For medium/dynamic we add a gentle horizontal drift proportional to
  // the visible width (iw/z), offset by a quarter-phase so it feels
  // independent from the zoom rhythm.
  let xExpr: string
  if (panFrac > 0) {
    xExpr = `iw/2-(iw/(${zExpr})/2)+${PF}*(iw/(${zExpr}))*sin(2*${PI_VAL}*t/${T}+${PI_VAL}/2)`
  } else {
    xExpr = `iw/2-(iw/(${zExpr})/2)`
  }

  // ── Y (vertical) expression ────────────────────────────────────────────────
  // We want to keep the face (at normalised position FY) in view.
  // Clamp to [0, ih − ih/z] to stay within frame bounds.
  //
  // We implement clamp(ideal, 0, hi) using only abs() — a single-argument
  // function that requires no commas.  This avoids the '\,' escape that FFmpeg
  // needs inside filter option values; that escape is handled inconsistently
  // by different Windows FFmpeg builds and causes "Error opening output file:
  // Invalid argument" on the Windows packaged binary.
  //
  //   min(a, b) = (a + b - abs(a - b)) / 2   — no commas needed
  //   max(0, v) = (v + abs(v)) / 2            — no commas needed
  //
  // ideal_y = ih * FY − ih / z / 2
  // hi      = ih − ih / z          (maximum valid y so crop stays in frame)
  // y       = max(0, min(ideal_y, hi))
  const ideal = `ih*${FY}-ih/(${zExpr})/2`
  const hi    = `ih-ih/(${zExpr})`
  const minVal = `((${ideal})+(${hi})-abs((${ideal})-(${hi})))/2`
  const yExpr  = `((${minVal})+abs(${minVal}))/2`

  // ── Assemble as crop+scale instead of zoompan for much better performance ──
  // zoompan with d=1 evaluates per-frame expressions through a slow expression
  // engine. Using crop with time-based expressions + scale is significantly
  // faster because crop is a native, optimised FFmpeg filter.
  //
  // The crop filter extracts a region of size (iw/zoom × ih/zoom) from the
  // 1080×1920 input, centred at (x, y), then scale restores it to 1080×1920.
  // This produces the same visual result as zoompan but with much less overhead.
  //
  // crop width/height expressions: iw and ih refer to the input (1080×1920).
  // We divide by the zoom factor to get the visible sub-region.
  // Each expression is wrapped with nanSafe() so FFmpeg gets a valid constant
  // during filter graph init (when t=NAN) and the real expression per-frame.
  const cropW = nanSafe(`iw/(${zExpr})`, 'iw')
  const cropH = nanSafe(`ih/(${zExpr})`, 'ih')
  // crop x/y use the same expressions adapted for crop semantics
  // (crop x/y = top-left corner of the visible region)
  const cropX = nanSafe(xExpr, '0')
  const cropY = nanSafe(yExpr, '0')

  return `crop=w='${cropW}':h='${cropH}':x='${cropX}':y='${cropY}',scale=${outW}:${outH}`
}

// ---------------------------------------------------------------------------
// Reactive Zoom — keyframe-driven zoom tied to word emphasis moments
// ---------------------------------------------------------------------------

/**
 * Build a flat timeline of piecewise-linear zoom segments for the full clip
 * duration. Each emphasis event produces three consecutive segments:
 *   ramp-in → hold → ramp-out
 * Gaps between events are filled with a constant base-zoom segment.
 */
function buildReactiveSegments(
  clipDuration: number,
  emphasisKeyframes: EmphasisKeyframe[],
  cfg: ReactiveConfig
): ReactiveSegment[] {
  const R = cfg.rampSeconds
  const sorted = [...emphasisKeyframes].sort((a, b) => a.time - b.time)
  const segs: ReactiveSegment[] = []
  let cursor = 0

  for (const kf of sorted) {
    const Z = kf.level === 'supersize' ? cfg.supersize : kf.level === 'box' ? cfg.box : cfg.emphasis
    // Clamp ramp window to valid clip range and avoid overlapping with cursor
    const rampIn  = Math.max(cursor, kf.time - R)
    const holdEnd = Math.min(clipDuration, kf.end)
    const rampOut = Math.min(clipDuration, kf.end + R)

    // Skip if the emphasis event falls before the current cursor (overlap)
    if (rampIn >= rampOut) continue

    // Base segment before this event
    if (rampIn > cursor) {
      segs.push({ start: cursor, end: rampIn, zoomStart: cfg.base, zoomEnd: cfg.base })
    }

    // Ramp in: base → Z
    if (kf.time > rampIn) {
      segs.push({ start: rampIn, end: kf.time, zoomStart: cfg.base, zoomEnd: Z })
    }

    // Hold at peak zoom during the word
    if (holdEnd > kf.time) {
      segs.push({ start: kf.time, end: holdEnd, zoomStart: Z, zoomEnd: Z })
    }

    // Ramp out: Z → base
    if (rampOut > holdEnd) {
      segs.push({ start: holdEnd, end: rampOut, zoomStart: Z, zoomEnd: cfg.base })
    }

    cursor = rampOut
  }

  // Tail base segment
  if (cursor < clipDuration) {
    segs.push({ start: cursor, end: clipDuration, zoomStart: cfg.base, zoomEnd: cfg.base })
  }

  return segs
}

/**
 * Build a piecewise expression string for the reactive zoom filter.
 *
 * For each segment the zoom factor is a linear interpolation from zoomStart
 * to zoomEnd over [start, end] — constant segments (zoomStart === zoomEnd)
 * simplify to a single numeric literal.
 *
 * `exprFn` transforms the per-segment zoom expression string into a crop
 * parameter expression (cropW, cropH, cropX, or cropY).
 *
 * The nested if(between(...)) structure is built back-to-front so the last
 * segment acts as the fallback branch.
 */
function buildReactivePiecewiseExpr(
  segs: ReactiveSegment[],
  exprFn: (zExpr: string) => string
): string {
  if (segs.length === 0) return exprFn('1')

  const zoomExprFor = (seg: ReactiveSegment): string => {
    if (Math.abs(seg.zoomStart - seg.zoomEnd) < 0.000001) {
      return seg.zoomStart.toFixed(6)
    }
    const z0  = seg.zoomStart.toFixed(6)
    const dz  = (seg.zoomEnd - seg.zoomStart).toFixed(6)
    const dur = Math.max(0.001, seg.end - seg.start).toFixed(4)
    const s   = seg.start.toFixed(4)
    return `${z0}+${dz}*(t-${s})/${dur}`
  }

  // Build from last segment backwards; last segment is the fallback value
  let expr = exprFn(zoomExprFor(segs[segs.length - 1]))
  for (let i = segs.length - 2; i >= 0; i--) {
    const seg = segs[i]
    const s = seg.start.toFixed(3)
    const e = seg.end.toFixed(3)
    expr = `if(between(t,${s},${e}),${exprFn(zoomExprFor(seg))},${expr})`
  }
  return expr
}

/**
 * Generate a reactive zoom filter that pushes in on emphasis and supersize
 * words and smoothly returns to neutral zoom between them.
 *
 * When no emphasis keyframes are provided the filter returns an empty string
 * so the pipeline falls back gracefully (no zoom applied).
 */
function generateReactiveZoomFilter(
  clipDuration: number,
  settings: ZoomSettings,
  faceYNorm: number,
  outW: number,
  outH: number,
  emphasisKeyframes: EmphasisKeyframe[]
): string {
  if (clipDuration <= 0 || emphasisKeyframes.length === 0) return ''

  const cfg = REACTIVE_CONFIG[settings.intensity]
  const segs = buildReactiveSegments(clipDuration, emphasisKeyframes, cfg)
  if (segs.length === 0) return ''

  const FY = Math.max(0, Math.min(1, faceYNorm)).toFixed(3)

  // Crop width/height: iw/z and ih/z
  // Wrapped with nanSafe() so t=NAN at init returns a valid constant.
  const cropW = nanSafe(buildReactivePiecewiseExpr(segs, (z) => `iw/(${z})`), 'iw')
  const cropH = nanSafe(buildReactivePiecewiseExpr(segs, (z) => `ih/(${z})`), 'ih')

  // Crop X: horizontally centred (no horizontal drift in reactive mode)
  const cropX = nanSafe(buildReactivePiecewiseExpr(segs, (z) => `iw/2-(iw/(${z})/2)`), '0')

  // Crop Y: face-tracking, clamped with abs()-based min/max (Windows-safe)
  const cropY = nanSafe(buildReactivePiecewiseExpr(segs, (z) => {
    const ideal  = `ih*${FY}-ih/(${z})/2`
    const hi     = `ih-ih/(${z})`
    const minVal = `((${ideal})+(${hi})-abs((${ideal})-(${hi})))/2`
    return `((${minVal})+abs(${minVal}))/2`
  }), '0')

  return `crop=w='${cropW}':h='${cropH}':x='${cropX}':y='${cropY}',scale=${outW}:${outH}`
}

// ---------------------------------------------------------------------------
// Jump-Cut Multi-Cam Simulation
// ---------------------------------------------------------------------------

/**
 * Zoom range per intensity level for jump-cut mode.
 * Each "cut" alternates between 1.0 (wide) and a random zoom in [min, max].
 */
const JUMP_CUT_ZOOM_RANGE: Record<ZoomIntensity, { min: number; max: number }> = {
  subtle:  { min: 1.06, max: 1.10 },
  medium:  { min: 1.08, max: 1.13 },
  dynamic: { min: 1.10, max: 1.15 },
}

/**
 * Maximum horizontal crop shift in pixels (±) at each cut point.
 * Applied to the locked 1080-wide canvas to enhance the multi-cam illusion.
 */
const JUMP_CUT_MAX_PAN_PX = 20

/** Simple seeded PRNG (mulberry32) for deterministic per-clip randomness. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Derive a deterministic seed from clip duration so same clip = same cuts. */
function clipSeed(duration: number): number {
  return Math.round(duration * 1000) ^ 0xdeadbeef
}

/**
 * Segment definition for one "shot" in the simulated multi-cam edit.
 */
interface JumpCutSegment {
  /** Start time in seconds (0-based, relative to clip start) */
  start: number
  /** End time in seconds */
  end: number
  /** Zoom factor for this segment (1.0 = wide, >1.0 = punched in) */
  zoom: number
  /** Horizontal crop offset in pixels from centre (can be negative) */
  panOffsetPx: number
}

/**
 * Compute cut points aligned to sentence boundaries when word timestamps are
 * available. A "sentence boundary" is detected after words ending in sentence-
 * ending punctuation (. ! ? …) with a pause ≥ 150ms before the next word.
 *
 * Falls back to randomised 3–5 second intervals when no word data is available.
 */
function computeJumpCutPoints(
  clipDuration: number,
  intervalSeconds: number,
  rng: () => number,
  wordTimestamps?: WordTimestamp[]
): number[] {
  const cuts: number[] = [0]

  if (wordTimestamps && wordTimestamps.length > 0) {
    // Find sentence boundaries from word timestamps
    const sentenceEnders = /[.!?…]+$/
    for (let i = 0; i < wordTimestamps.length - 1; i++) {
      const word = wordTimestamps[i]
      const next = wordTimestamps[i + 1]
      if (sentenceEnders.test(word.text.trim()) && (next.start - word.end) >= 0.15) {
        // Use the start of the next word as the cut point (clean transition)
        const cutTime = next.start
        const lastCut = cuts[cuts.length - 1]
        // Enforce minimum 2s between cuts, maximum 6s
        if (cutTime - lastCut >= 2.0 && cutTime < clipDuration - 0.5) {
          // If gap since last cut > 6s, we should have cut earlier —
          // but sentence-aligned cuts are better so we allow up to 8s
          if (cutTime - lastCut <= 8.0) {
            cuts.push(cutTime)
          }
        }
      }
    }

    // If sentence detection produced too few cuts (< 2 cuts for a long clip),
    // fill gaps > 5s with randomised cuts
    const minCuts = Math.max(2, Math.floor(clipDuration / 5))
    if (cuts.length < minCuts) {
      // Find gaps > 5s and insert random cuts
      const filled: number[] = [0]
      for (let i = 1; i < cuts.length; i++) {
        const gap = cuts[i] - filled[filled.length - 1]
        if (gap > 5.5) {
          // Insert one or more random cuts in this gap
          const nInsert = Math.floor(gap / (3 + rng() * 2))
          const segLen = gap / (nInsert + 1)
          for (let j = 1; j <= nInsert; j++) {
            filled.push(filled[filled.length - 1] + segLen)
          }
        }
        filled.push(cuts[i])
      }
      // Fill the tail gap
      const tailGap = clipDuration - filled[filled.length - 1]
      if (tailGap > 5.5) {
        const nInsert = Math.floor(tailGap / (3 + rng() * 2))
        const segLen = tailGap / (nInsert + 1)
        for (let j = 1; j <= nInsert; j++) {
          filled.push(filled[filled.length - 1] + segLen)
        }
      }
      return filled
    }
  } else {
    // No word timestamps — randomised 3–5 second intervals
    let t = 0
    while (t < clipDuration - 1.5) {
      const interval = 3 + rng() * 2 // 3–5 seconds
      t += interval
      if (t < clipDuration - 0.5) {
        cuts.push(t)
      }
    }
  }

  return cuts
}

/**
 * Build the segment list for jump-cut multi-cam simulation.
 * Alternates between 1.0 (wide shot) and a random zoomed level.
 * Each segment also gets a slight horizontal pan offset.
 */
function buildJumpCutSegments(
  clipDuration: number,
  settings: ZoomSettings,
  wordTimestamps?: WordTimestamp[]
): JumpCutSegment[] {
  const rng = mulberry32(clipSeed(clipDuration))
  const { min: zoomMin, max: zoomMax } = JUMP_CUT_ZOOM_RANGE[settings.intensity]

  const cutPoints = computeJumpCutPoints(
    clipDuration,
    settings.intervalSeconds,
    rng,
    wordTimestamps
  )

  const segments: JumpCutSegment[] = []
  for (let i = 0; i < cutPoints.length; i++) {
    const start = cutPoints[i]
    const end = i + 1 < cutPoints.length ? cutPoints[i + 1] : clipDuration

    // Alternate: even segments = wide (1.0), odd = punched in
    const isZoomed = i % 2 === 1
    const zoom = isZoomed ? zoomMin + rng() * (zoomMax - zoomMin) : 1.0

    // Random horizontal shift (only for zoomed segments to enhance the illusion)
    const panOffsetPx = isZoomed
      ? Math.round((rng() * 2 - 1) * JUMP_CUT_MAX_PAN_PX)
      : 0

    segments.push({ start, end, zoom, panOffsetPx })
  }

  return segments
}

/**
 * Generate an FFmpeg crop+scale filter with piecewise step-function zoom
 * that simulates multi-camera editing. Each segment has a constant zoom
 * level with zero easing — the viewer's brain reads each transition as
 * a camera cut, resetting attention.
 *
 * The expression uses nested `if(between(t,start,end), value, ...)` to
 * build a step function evaluated per-frame by FFmpeg's expression engine.
 * Since crop is a native filter, this is fast even with many segments.
 */
function generateJumpCutZoomFilter(
  clipDuration: number,
  settings: ZoomSettings,
  faceYNorm: number,
  outW: number,
  outH: number,
  wordTimestamps?: WordTimestamp[]
): string {
  if (clipDuration <= 0) return ''

  const segments = buildJumpCutSegments(clipDuration, settings, wordTimestamps)
  if (segments.length === 0) return ''

  const FY = Math.max(0, Math.min(1, faceYNorm)).toFixed(3)

  // ── Build piecewise zoom expression ────────────────────────────────────
  // Nested if(between(t, start, end), zoomValue, nextBranch)
  // The last segment is the fallback (no between check needed).
  const zExpr = buildStepExpr(
    segments,
    (seg) => seg.zoom.toFixed(4)
  )

  // ── Build piecewise X-offset expression ────────────────────────────────
  // Centre + per-segment horizontal shift. Offset is in input pixels and is
  // added directly to the centre formula — canvas-agnostic.
  // (Locked output canvas is 1080×1920; offsets are calibrated against `iw`.)
  const xExpr = buildStepExpr(
    segments,
    (seg) => {
      const centre = `iw/2-(iw/(${seg.zoom.toFixed(4)})/2)`
      if (seg.panOffsetPx === 0) return centre
      return `${centre}+${seg.panOffsetPx}`
    }
  )

  // ── Y expression (same clamped face-tracking as ken-burns) ─────────────
  // Since jump-cut zoom is constant per segment, we can simplify slightly,
  // but we still need the step function for the zoom value in y calculations.
  // We use the same abs()-based clamp to avoid commas (Windows compat).
  const yExpr = buildStepExpr(
    segments,
    (seg) => {
      const z = seg.zoom.toFixed(4)
      const ideal = `ih*${FY}-ih/(${z})/2`
      const hi = `ih-ih/(${z})`
      const minVal = `((${ideal})+(${hi})-abs((${ideal})-(${hi})))/2`
      return `((${minVal})+abs(${minVal}))/2`
    }
  )

  // Crop dimensions also need the step function zoom
  // All expressions wrapped with nanSafe() for t=NAN safety at init time.
  const cropW = nanSafe(buildStepExpr(segments, (seg) => `iw/${seg.zoom.toFixed(4)}`), 'iw')
  const cropH = nanSafe(buildStepExpr(segments, (seg) => `ih/${seg.zoom.toFixed(4)}`), 'ih')
  const safeX = nanSafe(xExpr, '0')
  const safeY = nanSafe(yExpr, '0')

  // Wrap each expression in single quotes so FFmpeg's option parser doesn't
  // interpret commas inside between()/if() as filter chain separators.
  // The expression evaluator receives the unquoted string and handles commas
  // as function argument delimiters correctly.
  return `crop=w='${cropW}':h='${cropH}':x='${safeX}':y='${safeY}',scale=${outW}:${outH}`
}

/**
 * Build a nested if(between(t,...), val, ...) step-function expression.
 *
 * For N segments the expression is:
 *   if(between(t,s0,e0), v0, if(between(t,s1,e1), v1, ... vN))
 *
 * The last segment's value is the fallback (covers end-of-clip rounding).
 *
 * Commas inside FFmpeg expression function calls (between, if, etc.) are
 * parsed by the expression evaluator, NOT the option-value parser. The
 * '\,' escaping issue only applies to the filter-chain boundary between
 * filters (e.g. `crop=...\,scale=...`). Inside a single filter's option
 * value, expression commas are safe on all platforms including Windows.
 */
function buildStepExpr(
  segments: JumpCutSegment[],
  valueFn: (seg: JumpCutSegment) => string
): string {
  if (segments.length === 1) return valueFn(segments[0])

  // Build from the last segment backwards — last segment is the fallback
  let expr = valueFn(segments[segments.length - 1])
  for (let i = segments.length - 2; i >= 0; i--) {
    const seg = segments[i]
    const s = seg.start.toFixed(3)
    const e = seg.end.toFixed(3)
    const v = valueFn(seg)
    expr = `if(between(t,${s},${e}),${v},${expr})`
  }
  return expr
}

/**
 * Derive a set of representative ZoomKeyframes for a given clip duration and
 * settings.  These are not used by FFmpeg directly (the filter uses continuous
 * expressions), but they can be useful for previews or debugging.
 */
export function getZoomKeyframes(
  clipDuration: number,
  settings: ZoomSettings,
  faceYNorm: number = 0.38
): ZoomKeyframe[] {
  if (!settings.enabled || clipDuration <= 0) return []

  const mode = settings.mode ?? 'ken-burns'

  // Jump-cut mode: one keyframe per segment (step function, no interpolation)
  if (mode === 'jump-cut') {
    const segments = buildJumpCutSegments(clipDuration, settings)
    return segments.map((seg) => ({
      time: seg.start,
      zoom: seg.zoom,
      panX: 0.5 + seg.panOffsetPx / OUTPUT_WIDTH,
      panY: Math.max(0, Math.min(1, faceYNorm - 0.5 / seg.zoom)),
    }))
  }

  // Only ken-burns generates continuous preview keyframes
  if (mode !== 'ken-burns') return []

  const { amplitude, panFrac } = INTENSITY_CONFIG[settings.intensity]
  const period = Math.min(settings.intervalSeconds * 2, clipDuration * 2)
  const sampleInterval = period / 4 // quarter-phase samples
  const keyframes: ZoomKeyframe[] = []

  for (let t = 0; t <= clipDuration; t += sampleInterval) {
    const theta = (2 * Math.PI * t) / period
    const zoom = 1 + amplitude * (0.5 + 0.5 * Math.cos(theta))
    const panX = 0.5 + panFrac * Math.sin(theta + Math.PI / 2)
    const panY = Math.max(0, Math.min(1, faceYNorm - 0.5 / zoom))
    keyframes.push({ time: t, zoom, panX, panY })
  }

  return keyframes
}

// ---------------------------------------------------------------------------
// Piecewise Per-Shot Zoom — different zoom modes for different time ranges
// ---------------------------------------------------------------------------

import type { ShotStyleConfig } from '@shared/types'

/**
 * Generate a composite zoom filter that applies different zoom modes and
 * intensities to different shot time ranges within a single clip.
 *
 * For each shot with a zoom override, the function builds that shot's zoom
 * crop expressions, then composites them using `if(between(t,start,end), ...)`:
 *
 *   cropW = if(between(t,s1,e1), shot1CropW, if(between(t,s2,e2), shot2CropW, defaultCropW))
 *   cropH = if(between(t,s1,e1), shot1CropH, if(between(t,s2,e2), shot2CropH, defaultCropH))
 *   cropX = if(between(t,s1,e1), shot1CropX, ...)
 *   cropY = if(between(t,s1,e1), shot1CropY, ...)
 *
 * @returns A crop+scale filter string, or empty string if no per-shot overrides apply.
 */
export function generatePiecewiseZoomFilter(
  clipDuration: number,
  globalSettings: ZoomSettings,
  shotStyleConfigs: ShotStyleConfig[],
  faceYNorm: number = 0.38,
  outW: number = OUTPUT_WIDTH,
  outH: number = OUTPUT_HEIGHT,
  wordTimestamps?: WordTimestamp[],
  emphasisKeyframes?: EmphasisKeyframe[]
): string {
  if (!globalSettings.enabled || shotStyleConfigs.length === 0) return ''

  // Filter to shots that have zoom overrides
  const shotsWithZoom = shotStyleConfigs.filter((s) => s.zoom !== null && s.zoom !== undefined)
  if (shotsWithZoom.length === 0) return ''

  // Build the zoom expressions for each shot's time range
  // We use if(between(t,s,e), shotExpr, ...) nesting
  const PI_VAL = '3.141592653589793'

  // Helper: build the crop expressions for a specific zoom config
  function buildZoomExprs(
    mode: ZoomMode,
    intensity: ZoomIntensity,
    intervalSeconds: number,
    shotStartTime: number,
    shotEndTime: number
  ): { cropW: string; cropH: string; cropX: string; cropY: string } {
    const cfg = INTENSITY_CONFIG[intensity]
    const { amplitude, panFrac } = cfg

    if (mode === 'ken-burns') {
      const rawPeriod = intervalSeconds * 2
      const period = Math.min(rawPeriod, (shotEndTime - shotStartTime) * 2 || rawPeriod)
      const T = period.toFixed(2)
      const A = amplitude.toFixed(4)
      const FY = Math.max(0, Math.min(1, faceYNorm)).toFixed(3)
      const PF = panFrac.toFixed(4)

      const zExpr = `1+${A}*(0.5+0.5*cos(2*${PI_VAL}*(t-${shotStartTime.toFixed(3)})/${T}))`
      const cropW = `iw/(${zExpr})`
      const cropH = `ih/(${zExpr})`
      let cropX: string
      if (panFrac > 0) {
        cropX = `iw/2-(iw/(${zExpr})/2)+${PF}*(iw/(${zExpr}))*sin(2*${PI_VAL}*(t-${shotStartTime.toFixed(3)})/${T}+${PI_VAL}/2)`
      } else {
        cropX = `iw/2-(iw/(${zExpr})/2)`
      }
      const ideal = `ih*${FY}-ih/(${zExpr})/2`
      const hi = `ih-ih/(${zExpr})`
      const minVal = `((${ideal})+(${hi})-abs((${ideal})-(${hi})))/2`
      const cropY = `((${minVal})+abs(${minVal}))/2`

      return { cropW, cropH, cropX, cropY }
    }

    if (mode === 'reactive') {
      // Use the global reactive logic but shift emphasis keyframes to shot-relative
      const shotKeyframes = (emphasisKeyframes ?? []).filter(
        (kf) => kf.time >= shotStartTime && kf.time <= shotEndTime
      )
      const reactiveCfg = REACTIVE_CONFIG[intensity]

      // Build a simple reactive expression for this shot
      // For per-shot reactive, we generate a simplified piecewise zoom
      const baseZ = reactiveCfg.base.toFixed(4)
      if (shotKeyframes.length === 0) {
        // No emphasis in this shot — just use base zoom
        const zExpr = baseZ
        const cropW = `iw/(${zExpr})`
        const cropH = `ih/(${zExpr})`
        const FY = Math.max(0, Math.min(1, faceYNorm)).toFixed(3)
        const cropX = `iw/2-(iw/(${zExpr})/2)`
        const ideal = `ih*${FY}-ih/(${zExpr})/2`
        const hi = `ih-ih/(${zExpr})`
        const minVal = `((${ideal})+(${hi})-abs((${ideal})-(${hi})))/2`
        const cropY = `((${minVal})+abs(${minVal}))/2`
        return { cropW, cropH, cropX, cropY }
      }

      // Build nested if expressions for reactive zoom
      let zExpr = baseZ
      for (const kf of shotKeyframes) {
        const Z = (kf.level === 'supersize' ? reactiveCfg.supersize : kf.level === 'box' ? reactiveCfg.box : reactiveCfg.emphasis).toFixed(4)
        const s = kf.time.toFixed(3)
        const e = kf.end.toFixed(3)
        zExpr = `if(between(t\\,${s}\\,${e})\\,${Z}\\,${zExpr})`
      }

      const cropW = `iw/(${zExpr})`
      const cropH = `ih/(${zExpr})`
      const FY = Math.max(0, Math.min(1, faceYNorm)).toFixed(3)
      const cropX = `iw/2-(iw/(${zExpr})/2)`
      const ideal = `ih*${FY}-ih/(${zExpr})/2`
      const hi = `ih-ih/(${zExpr})`
      const minVal = `((${ideal})+(${hi})-abs((${ideal})-(${hi})))/2`
      const cropY = `((${minVal})+abs(${minVal}))/2`
      return { cropW, cropH, cropX, cropY }
    }

    if (mode === 'jump-cut') {
      // Simple step-function zoom for this shot
      const z = (1 + amplitude).toFixed(4)
      const FY = Math.max(0, Math.min(1, faceYNorm)).toFixed(3)
      const cropW = `iw/${z}`
      const cropH = `ih/${z}`
      const cropX = `iw/2-(iw/${z}/2)`
      const ideal = `ih*${FY}-ih/${z}/2`
      const hi = `ih-ih/${z}`
      const minVal = `((${ideal})+(${hi})-abs((${ideal})-(${hi})))/2`
      const cropY = `((${minVal})+abs(${minVal}))/2`
      return { cropW, cropH, cropX, cropY }
    }

    // Fallback: no zoom
    return {
      cropW: 'iw', cropH: 'ih',
      cropX: '0', cropY: '0'
    }
  }

  // Build the global (default) zoom expressions for time ranges without overrides
  const globalExprs = buildZoomExprs(
    globalSettings.mode,
    globalSettings.intensity,
    globalSettings.intervalSeconds,
    0,
    clipDuration
  )

  // Build per-shot expressions
  const shotExprs = shotsWithZoom.map((shot) => ({
    startTime: shot.startTime,
    endTime: shot.endTime,
    exprs: buildZoomExprs(
      shot.zoom!.mode,
      shot.zoom!.intensity,
      shot.zoom!.intervalSeconds,
      shot.startTime,
      shot.endTime
    )
  }))

  // Composite: nest if(between(t,s,e), shotExpr, ...) for each shot
  // We need separate composites for cropW, cropH, cropX, cropY
  let cropW = globalExprs.cropW
  let cropH = globalExprs.cropH
  let cropX = globalExprs.cropX
  let cropY = globalExprs.cropY

  // Build inside-out: innermost shot first, wrapping with if()
  for (let i = shotExprs.length - 1; i >= 0; i--) {
    const s = shotExprs[i]
    const sStart = s.startTime.toFixed(3)
    const sEnd = s.endTime.toFixed(3)
    cropW = `if(between(t\\,${sStart}\\,${sEnd})\\,${s.exprs.cropW}\\,${cropW})`
    cropH = `if(between(t\\,${sStart}\\,${sEnd})\\,${s.exprs.cropH}\\,${cropH})`
    cropX = `if(between(t\\,${sStart}\\,${sEnd})\\,${s.exprs.cropX}\\,${cropX})`
    cropY = `if(between(t\\,${sStart}\\,${sEnd})\\,${s.exprs.cropY}\\,${cropY})`
  }

  return `crop=w='${nanSafe(cropW, 'iw')}':h='${nanSafe(cropH, 'ih')}':x='${nanSafe(cropX, '0')}':y='${nanSafe(cropY, '0')}',scale=${outW}:${outH}`
}
