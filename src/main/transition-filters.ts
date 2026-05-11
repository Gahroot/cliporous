// ---------------------------------------------------------------------------
// Transition Filters — FFmpeg filter builders for segment-to-segment transitions
//
// These create visual effects between segments in the Captions.ai-style editor.
// Each builder returns FFmpeg filter string(s) compatible with filter_complex
// chains used by the render pipeline.
//
// Four transition types:
//   1. Hard cut      — instant switch (no filter needed)
//   2. Crossfade     — smooth fade overlap via xfade + acrossfade
//   3. Flash cut     — brief solid-color flash at the cut point
//   4. Color wash    — full-frame accent color overlay with fade envelope
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransitionFilterParams {
  /** Transition duration in seconds */
  duration: number
  /** Hex color for flash/wash (e.g. '#FF6B35') */
  color: string
  /** 0.0–1.0 peak opacity for color wash */
  opacity?: number
  /** Time in seconds where the transition occurs */
  offsetTime: number
  /** Video fps for frame calculations */
  fps: number
  /** Output width — locked to 1080 (9:16 vertical) */
  width: number
  /** Output height — locked to 1920 (9:16 vertical) */
  height: number
}

/**
 * Result from a transition filter builder.
 *
 * - `videoFilter`:  filter_complex snippet for the video stream
 * - `audioFilter`:  filter_complex snippet for the audio stream (null if N/A)
 * - `inputs`:       any additional inputs required (e.g. color source for flash)
 */
export interface TransitionFilterResult {
  videoFilter: string
  audioFilter: string | null
  /** Additional FFmpeg input arguments (e.g. ['-f', 'lavfi', '-i', 'color=...']) */
  inputs: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a hex colour string to FFmpeg-compatible 0xRRGGBB format.
 * Accepts '#RRGGBB', '#RGB', or bare 'RRGGBB'.
 */
function hexToFFmpeg(hex: string): string {
  let h = hex.replace(/^#/, '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  return `0x${h.toUpperCase()}`
}

/**
 * Convert hex colour to FFmpeg alpha-aware format: 0xRRGGBB@opacity
 */
function hexToFFmpegAlpha(hex: string, opacity: number): string {
  return `${hexToFFmpeg(hex)}@${opacity.toFixed(2)}`
}

/** Round to 3 decimal places for FFmpeg time expressions */
function t(seconds: number): string {
  return seconds.toFixed(3)
}

// ---------------------------------------------------------------------------
// 1. Hard Cut — instant switch, no filter needed
// ---------------------------------------------------------------------------

/**
 * Build a hard cut transition (instant switch between segments).
 *
 * Returns `null` — the render pipeline handles plain concat without any
 * transition filter. Used by: ember, align, growth, pulse, recess.
 */
export function buildHardCut(): null {
  return null
}

// ---------------------------------------------------------------------------
// 2. Crossfade — smooth dissolve overlap
// ---------------------------------------------------------------------------

/**
 * Build a crossfade transition between two segments using FFmpeg xfade
 * (video) and acrossfade (audio).
 *
 * Video:  `[segA][segB]xfade=transition=fade:duration=D:offset=T[vout]`
 * Audio:  `[aA][aB]acrossfade=d=D:c1=tri:c2=tri[aout]`
 *
 * The offset is the time in the first segment where the fade begins,
 * calculated as: (segment A duration) - crossfade duration.
 *
 * Used by: cinematic, film, clarity, rebel, prime.
 *
 * @param params          Transition parameters
 * @param segALabel       Input label for segment A video (e.g. '[0:v]')
 * @param segBLabel       Input label for segment B video (e.g. '[1:v]')
 * @param audioALabel     Input label for segment A audio (e.g. '[0:a]')
 * @param audioBLabel     Input label for segment B audio (e.g. '[1:a]')
 * @param outputVideo     Output label for merged video (e.g. '[vout]')
 * @param outputAudio     Output label for merged audio (e.g. '[aout]')
 */
export function buildCrossfade(
  params: TransitionFilterParams,
  segALabel = '[0:v]',
  segBLabel = '[1:v]',
  audioALabel = '[0:a]',
  audioBLabel = '[1:a]',
  outputVideo = '[vout]',
  outputAudio = '[aout]'
): TransitionFilterResult {
  const dur = Math.max(0.1, Math.min(1.0, params.duration))

  const videoFilter =
    `${segALabel}${segBLabel}xfade=transition=fade:duration=${t(dur)}:offset=${t(params.offsetTime)}${outputVideo}`

  const audioFilter =
    `${audioALabel}${audioBLabel}acrossfade=d=${t(dur)}:c1=tri:c2=tri${outputAudio}`

  return {
    videoFilter,
    audioFilter,
    inputs: []
  }
}

// ---------------------------------------------------------------------------
// 3. Flash Cut — brief solid-color flash between segments
// ---------------------------------------------------------------------------

/**
 * Build a flash cut transition — a 2–3 frame solid colour burst at the cut
 * point between two segments.
 *
 * Implementation: generates a short solid-colour video via lavfi `color`
 * source, then uses `xfade` to blend from segment A → flash → segment B.
 *
 * Flash duration: 0.067–0.1 seconds (2–3 frames at 30fps).
 * Flash colour: configurable (white #FFFFFF for Impact style, accent for others).
 *
 * Used by: align (14 per video!), volt, impact, growth, cinematic.
 *
 * @param params          Transition parameters (duration = flash length)
 * @param segALabel       Input label for segment A video
 * @param segBLabel       Input label for segment B video
 * @param audioALabel     Input label for segment A audio
 * @param audioBLabel     Input label for segment B audio
 * @param flashInputLabel Input label for the flash colour source
 * @param outputVideo     Output label for merged video
 * @param outputAudio     Output label for merged audio
 */
export function buildFlashCut(
  params: TransitionFilterParams,
  segALabel = '[0:v]',
  segBLabel = '[1:v]',
  audioALabel = '[0:a]',
  audioBLabel = '[1:a]',
  flashInputLabel = '[flash]',
  outputVideo = '[vout]',
  outputAudio = '[aout]'
): TransitionFilterResult {
  // Clamp flash duration to 2–3 frames
  const minFrames = 2
  const maxFrames = 3
  const frameDuration = 1 / params.fps
  const flashDur = Math.max(
    minFrames * frameDuration,
    Math.min(maxFrames * frameDuration, params.duration)
  )

  const ffmpegColor = hexToFFmpeg(params.color)

  // The lavfi colour source input — generates a solid-colour video
  const colorInput = [
    '-f', 'lavfi',
    '-i', `color=c=${ffmpegColor}:s=${params.width}x${params.height}:r=${params.fps}:d=${t(flashDur)}`
  ]

  // Scale the flash to match output dimensions and set pixel format
  const flashPrep = `${flashInputLabel}scale=${params.width}:${params.height},setsar=1,format=yuv420p[flashready]`

  // Two-stage xfade: segA → flash (fade), then flash → segB (fade)
  // Half the flash duration for each fade
  const halfFlash = flashDur / 2

  const xfade1 =
    `${segALabel}[flashready]xfade=transition=fade:duration=${t(halfFlash)}:offset=${t(params.offsetTime)}[mid]`

  const xfade2 =
    `[mid]${segBLabel}xfade=transition=fade:duration=${t(halfFlash)}:offset=${t(params.offsetTime + halfFlash)}${outputVideo}`

  const videoFilter = [flashPrep, xfade1, xfade2].join(';')

  // Audio: simple concat (flash has no audio — just join A and B)
  const audioFilter =
    `${audioALabel}${audioBLabel}concat=v=0:a=1${outputAudio}`

  return {
    videoFilter,
    audioFilter,
    inputs: colorInput
  }
}

// ---------------------------------------------------------------------------
// 4. Color Wash — full-frame accent colour overlay with fade envelope
// ---------------------------------------------------------------------------

/**
 * Build a colour wash transition — a semi-transparent accent colour overlay
 * that fades in over the last frames of segment A and fades out over the
 * first frames of segment B.
 *
 * Opacity peaks at 60–80% at the midpoint, creating a smooth colour pulse.
 * Total duration: 0.3–0.5 seconds.
 *
 * Implementation: generates a solid colour overlay and uses the `overlay`
 * filter with a time-limited alpha expression that ramps up then down.
 *
 * Used by: cinematic (5 per 10s clip — signature effect).
 *
 * @param params          Transition parameters
 * @param segALabel       Input label for segment A video
 * @param segBLabel       Input label for segment B video
 * @param audioALabel     Input label for segment A audio
 * @param audioBLabel     Input label for segment B audio
 * @param colorInputLabel Input label for the colour source
 * @param outputVideo     Output label for merged video
 * @param outputAudio     Output label for merged audio
 */
export function buildColorWash(
  params: TransitionFilterParams,
  segALabel = '[0:v]',
  segBLabel = '[1:v]',
  audioALabel = '[0:a]',
  audioBLabel = '[1:a]',
  colorInputLabel = '[wash]',
  outputVideo = '[vout]',
  outputAudio = '[aout]'
): TransitionFilterResult {
  const dur = Math.max(0.2, Math.min(1.0, params.duration))
  const peakOpacity = Math.max(0.1, Math.min(1.0, params.opacity ?? 0.7))

  const halfDur = dur / 2
  const washStart = params.offsetTime - halfDur
  const washEnd = params.offsetTime + halfDur
  const ffmpegColor = hexToFFmpeg(params.color)

  // Lavfi colour source input — solid colour video for the wash overlay
  const colorInput = [
    '-f', 'lavfi',
    '-i', `color=c=${ffmpegColor}:s=${params.width}x${params.height}:r=${params.fps}:d=${t(dur)}`
  ]

  // First, xfade segment A and B with a standard crossfade as the base
  const baseFade =
    `${segALabel}${segBLabel}xfade=transition=fade:duration=${t(dur)}:offset=${t(washStart > 0 ? washStart : 0)}[basevid]`

  // Prepare the colour overlay: set pixel format and scale
  const washPrep =
    `${colorInputLabel}scale=${params.width}:${params.height},setsar=1,format=yuva420p,` +
    `colorchannelmixer=aa=${peakOpacity.toFixed(2)}[washready]`

  // Build the alpha ramp expression: triangle envelope from 0→peak→0
  // The overlay is enabled only during the wash window
  // Alpha ramps: linear in for first half, linear out for second half
  //   alpha = peak * (1 - abs(2*(t - midpoint) / dur))
  const midpoint = (washStart + washEnd) / 2
  const alphaExpr =
    `if(between(t\\,${t(Math.max(0, washStart))}\\,${t(washEnd)})\\,` +
    `${peakOpacity.toFixed(2)}*(1-abs(2*(t-${t(midpoint)})/${t(dur)}))\\,0)`

  // Overlay the colour wash on top of the base video with time-limited alpha
  // We use geq on the wash to modulate its alpha per-frame
  const washAlpha =
    `[washready]geq=lum='lum(X\\,Y)':cb='cb(X\\,Y)':cr='cr(X\\,Y)':` +
    `a='${alphaExpr}*alpha(X\\,Y)':enable='between(t\\,${t(Math.max(0, washStart))}\\,${t(washEnd)})'[washalpha]`

  const overlay =
    `[basevid][washalpha]overlay=0:0:enable='between(t\\,${t(Math.max(0, washStart))}\\,${t(washEnd)})'${outputVideo}`

  const videoFilter = [baseFade, washPrep, washAlpha, overlay].join(';')

  // Audio: standard crossfade to match the video dissolve
  const audioFilter =
    `${audioALabel}${audioBLabel}acrossfade=d=${t(dur)}:c1=tri:c2=tri${outputAudio}`

  return {
    videoFilter,
    audioFilter,
    inputs: colorInput
  }
}

// ---------------------------------------------------------------------------
// Inline transition helpers (single-stream, no segment splitting)
// ---------------------------------------------------------------------------

/**
 * Build an inline flash cut filter for use within a single video stream.
 * Instead of splitting segments, this overlays a brief colour flash at a
 * specific time using drawbox with a time-limited enable expression.
 *
 * This is useful when the render pipeline processes a single continuous clip
 * and needs to insert flash effects at cut points without segment splitting.
 *
 * @param params Transition parameters (offsetTime = centre of flash)
 */
export function buildInlineFlashCut(params: TransitionFilterParams): string {
  const frameDuration = 1 / params.fps
  const flashDur = Math.max(2 * frameDuration, Math.min(3 * frameDuration, params.duration))

  const halfFlash = flashDur / 2
  const start = params.offsetTime - halfFlash
  const end = params.offsetTime + halfFlash
  const ffmpegColor = hexToFFmpegAlpha(params.color, 1.0)

  // drawbox covering the full frame with the flash colour
  return (
    `drawbox=x=0:y=0:w=${params.width}:h=${params.height}:` +
    `color=${ffmpegColor}:t=fill:` +
    `enable='between(t\\,${t(Math.max(0, start))}\\,${t(end)})'`
  )
}

/**
 * Build an inline colour wash filter for use within a single video stream.
 * Overlays a semi-transparent accent colour with a fade-in/fade-out envelope
 * at the specified time.
 *
 * Uses drawbox with a time-varying alpha expression to create the wash effect
 * without requiring additional inputs or segment splitting.
 *
 * @param params Transition parameters (offsetTime = centre of wash)
 */
export function buildInlineColorWash(params: TransitionFilterParams): string {
  const dur = Math.max(0.2, Math.min(1.0, params.duration))
  const peakOpacity = Math.max(0.1, Math.min(1.0, params.opacity ?? 0.7))

  const halfDur = dur / 2
  const start = params.offsetTime - halfDur
  const end = params.offsetTime + halfDur
  const midpoint = params.offsetTime

  // Triangle alpha envelope: ramps 0→peak→0
  const alphaExpr =
    `${peakOpacity.toFixed(2)}*(1-abs(2*(t-${t(midpoint)})/${t(dur)}))`

  const ffmpegColor = hexToFFmpegAlpha(params.color, peakOpacity)

  // drawbox with time-limited enable
  return (
    `drawbox=x=0:y=0:w=${params.width}:h=${params.height}:` +
    `color=${ffmpegColor}:t=fill:` +
    `enable='between(t\\,${t(Math.max(0, start))}\\,${t(end)})'`
  )
}
