/**
 * Aspect Ratio Configuration — locked to 9:16 vertical (1080×1920)
 *
 * Output is hard-locked to 1080×1920 @ 30fps for vertical short-form video.
 * No other aspect ratios are supported. Platform-specific branching
 * (TikTok / Reels / Shorts) has been removed — the canvas is a single
 * vertical union zone.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The only supported output aspect ratio. */
export type OutputAspectRatio = '9:16'

export interface AspectRatioConfig {
  /** Canonical ratio identifier */
  ratio: OutputAspectRatio
  /** Short display label */
  label: string
  /** Human-readable description */
  description: string
  /** Output canvas width in pixels */
  width: number
  /** Output canvas height in pixels */
  height: number
  /** Aspect ratio as a decimal (width / height) */
  aspect: number
}

// ---------------------------------------------------------------------------
// Locked output dimensions & frame rate
// ---------------------------------------------------------------------------

/** Locked output width in pixels. */
export const OUTPUT_WIDTH = 1080
/** Locked output height in pixels. */
export const OUTPUT_HEIGHT = 1920
/** Locked output frame rate. */
export const OUTPUT_FPS = 30

// ---------------------------------------------------------------------------
// Config registry — only 9:16 is supported
// ---------------------------------------------------------------------------

export const ASPECT_RATIO_CONFIGS: Record<OutputAspectRatio, AspectRatioConfig> = {
  '9:16': {
    ratio: '9:16',
    label: '9:16',
    description: 'Vertical — full-screen mobile (1080×1920 @ 30fps)',
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    aspect: 9 / 16
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the canvas dimensions. Always returns 1080×1920 since output is locked
 * to 9:16 vertical.
 */
export function getCanvasDimensions(_ratio?: OutputAspectRatio): { width: number; height: number } {
  return { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT }
}

/**
 * Compute the center-crop region from a source video to match the locked
 * 9:16 vertical aspect ratio. Returns crop rectangle (x, y, width, height)
 * in source pixels. Rounds values to even numbers for H.264 compatibility.
 */
export function computeCenterCropForRatio(
  sourceWidth: number,
  sourceHeight: number,
  _targetRatio?: OutputAspectRatio
): { x: number; y: number; width: number; height: number } {
  const roundToEven = (n: number): number => n - (n % 2)
  const aspect = ASPECT_RATIO_CONFIGS['9:16'].aspect

  const sourceAspect = sourceWidth / sourceHeight

  let cropW: number
  let cropH: number
  let cropX: number
  let cropY: number

  if (sourceAspect > aspect) {
    // Source is wider than target — crop horizontally
    cropH = roundToEven(sourceHeight)
    cropW = roundToEven(Math.floor(sourceHeight * aspect))
    cropX = roundToEven(Math.floor((sourceWidth - cropW) / 2))
    cropY = 0
  } else {
    // Source is taller/narrower than target — crop vertically
    cropW = roundToEven(sourceWidth)
    cropH = roundToEven(Math.floor(sourceWidth / aspect))
    cropX = 0
    cropY = roundToEven(Math.max(0, Math.floor((sourceHeight - cropH) / 2)))
  }

  return { x: cropX, y: cropY, width: cropW, height: cropH }
}
