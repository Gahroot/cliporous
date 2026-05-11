/**
 * Safe Zone Layout — locked to a single 9:16 vertical union zone
 *
 * Output is hard-locked to 1080×1920 vertical. There is no per-platform
 * branching (TikTok / Reels / Shorts): the safe zone is the union of
 * historical platform constraints, expressed as a single rectangle that
 * keeps overlay text clear of every known UI dead zone (top status bars,
 * captions overlay, bottom action rails).
 */

import { OUTPUT_WIDTH, OUTPUT_HEIGHT } from './aspect-ratios'

// ---------------------------------------------------------------------------
// Canvas dimensions (re-exported for convenience)
// ---------------------------------------------------------------------------

export const CANVAS_WIDTH = OUTPUT_WIDTH
export const CANVAS_HEIGHT = OUTPUT_HEIGHT

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SafeZoneRect {
  /** Left edge in pixels from canvas origin (top-left). */
  x: number
  /** Top edge in pixels from canvas origin (top-left). */
  y: number
  /** Width in pixels. */
  width: number
  /** Height in pixels. */
  height: number
}

/** Logical placement bucket within the safe zone. */
export type ElementType = 'hook' | 'caption' | 'rehook' | 'logo'

// ---------------------------------------------------------------------------
// Single union safe zone (9:16 vertical)
// ---------------------------------------------------------------------------
//
// Pixel margins are scaled proportionally from the canonical 1080×1920
// canvas:
//   top    = 220/1920 ≈ 11.46%   →  ~220px @ 1920
//   bottom = 360/1920 ≈ 18.75%   →  ~360px @ 1920
//   side   =  60/1080 ≈  5.56%   →   ~60px @ 1080
//
// These bounds are the *union* of the strictest dead zones across short-form
// vertical platforms — anything inside this rectangle is safe everywhere.

const SIDE_MARGIN = Math.round(CANVAS_WIDTH * 0.0556)   // ~60 @ 1080
const TOP_MARGIN = Math.round(CANVAS_HEIGHT * 0.1146)   // ~220 @ 1920
const BOTTOM_MARGIN = Math.round(CANVAS_HEIGHT * 0.1875) // ~360 @ 1920

/**
 * The single union safe zone for the locked 9:16 vertical canvas.
 * All overlay text (hook, captions, rehook) must stay inside this rectangle.
 */
export const SAFE_ZONE: SafeZoneRect = {
  x: SIDE_MARGIN,
  y: TOP_MARGIN,
  width: CANVAS_WIDTH - SIDE_MARGIN * 2,
  height: CANVAS_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the single union safe zone. */
export function getSafeZone(): SafeZoneRect {
  return SAFE_ZONE
}

/** Return whether a point is inside the union safe zone. */
export function isInsideSafeZone(x: number, y: number): boolean {
  return (
    x >= SAFE_ZONE.x &&
    x <= SAFE_ZONE.x + SAFE_ZONE.width &&
    y >= SAFE_ZONE.y &&
    y <= SAFE_ZONE.y + SAFE_ZONE.height
  )
}

/**
 * Clamp a rectangle so it fits entirely inside the union safe zone.
 * Returns a new rect — does not mutate.
 */
export function clampToSafeZone(rect: SafeZoneRect): SafeZoneRect {
  const w = Math.min(rect.width, SAFE_ZONE.width)
  const h = Math.min(rect.height, SAFE_ZONE.height)
  const x = Math.max(SAFE_ZONE.x, Math.min(rect.x, SAFE_ZONE.x + SAFE_ZONE.width - w))
  const y = Math.max(SAFE_ZONE.y, Math.min(rect.y, SAFE_ZONE.y + SAFE_ZONE.height - h))
  return { x, y, width: w, height: h }
}

/**
 * Convert the union safe zone to ASS subtitle margin values
 * (MarginL, MarginR, MarginV) for libass-rendered overlays.
 */
export function rectToAssMargins(): { marginL: number; marginR: number; marginV: number } {
  return {
    marginL: SAFE_ZONE.x,
    marginR: CANVAS_WIDTH - (SAFE_ZONE.x + SAFE_ZONE.width),
    marginV: CANVAS_HEIGHT - (SAFE_ZONE.y + SAFE_ZONE.height)
  }
}

/**
 * Get a recommended Y position (px from top) for a given element type
 * within the union safe zone.
 */
export function getElementPlacement(element: ElementType): { y: number } {
  switch (element) {
    case 'hook':
      // Just inside the top margin
      return { y: SAFE_ZONE.y + Math.round(SAFE_ZONE.height * 0.04) }
    case 'rehook':
      // Slightly below the hook position
      return { y: SAFE_ZONE.y + Math.round(SAFE_ZONE.height * 0.18) }
    case 'caption':
      // Lower-third area
      return { y: SAFE_ZONE.y + Math.round(SAFE_ZONE.height * 0.72) }
    case 'logo':
      // Top-left corner of the safe zone
      return { y: SAFE_ZONE.y }
  }
}
