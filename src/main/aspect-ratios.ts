/**
 * Aspect Ratio Configuration
 *
 * Defines the supported output aspect ratios for rendered clips.
 * Each config specifies the output canvas dimensions, display label,
 * target platforms, and human-readable description.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { OutputAspectRatio } from '@shared/types'
export type { OutputAspectRatio }

export interface AspectRatioConfig {
  /** Canonical ratio identifier */
  ratio: OutputAspectRatio
  /** Short display label */
  label: string
  /** Human-readable description */
  description: string
  /** Target platforms */
  platforms: string[]
  /** Output canvas width in pixels */
  width: number
  /** Output canvas height in pixels */
  height: number
  /** Aspect ratio as a decimal (width / height) */
  aspect: number
}

// ---------------------------------------------------------------------------
// Config registry
// ---------------------------------------------------------------------------

export const ASPECT_RATIO_CONFIGS: Record<OutputAspectRatio, AspectRatioConfig> = {
  '9:16': {
    ratio: '9:16',
    label: '9:16',
    description: 'Vertical — full-screen mobile',
    platforms: ['TikTok', 'Reels', 'Shorts'],
    width: 1080,
    height: 1920,
    aspect: 9 / 16
  },
  '1:1': {
    ratio: '1:1',
    label: '1:1',
    description: 'Square — feed posts',
    platforms: ['Instagram Feed', 'Facebook'],
    width: 1080,
    height: 1080,
    aspect: 1
  },
  '4:5': {
    ratio: '4:5',
    label: '4:5',
    description: 'Portrait — Instagram post',
    platforms: ['Instagram Post'],
    width: 1080,
    height: 1350,
    aspect: 4 / 5
  },
  '16:9': {
    ratio: '16:9',
    label: '16:9',
    description: 'Landscape — widescreen',
    platforms: ['YouTube', 'Twitter / X'],
    width: 1920,
    height: 1080,
    aspect: 16 / 9
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the canvas dimensions for an aspect ratio.
 * Defaults to 1080×1920 (9:16) when ratio is undefined.
 */
export function getCanvasDimensions(ratio?: OutputAspectRatio): { width: number; height: number } {
  if (!ratio) return { width: 1080, height: 1920 }
  const config = ASPECT_RATIO_CONFIGS[ratio]
  return { width: config.width, height: config.height }
}

/**
 * Compute the center-crop region from a source video to match the target
 * aspect ratio. Returns crop rectangle (x, y, width, height) in source pixels.
 * Rounds values to even numbers for H.264 compatibility.
 */
export function computeCenterCropForRatio(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: OutputAspectRatio
): { x: number; y: number; width: number; height: number } {
  const roundToEven = (n: number): number => n - (n % 2)
  const { aspect } = ASPECT_RATIO_CONFIGS[targetRatio]

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
