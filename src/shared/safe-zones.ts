/**
 * Safe Zone Layout Engine (Shared Module)
 *
 * Defines the platform UI dead zones for TikTok, Instagram Reels, and YouTube Shorts
 * on a 1080×1920 (9:16) canvas. Provides helpers to compute safe placement rectangles
 * for text overlays, captions, hook titles, logos, progress bars, and other graphics.
 *
 * This module contains only pure data and pure computation — no I/O, no system access,
 * no Electron APIs. It is importable by main, preload, and renderer processes alike.
 *
 * Dead zone data sourced from platform guidelines and creator tooling (2026):
 *   TikTok  — top 108px, bottom 320px, left 60px, right 120px → safe 900×1492
 *   Reels   — top 210px, bottom 310px, left 0px,  right 84px  → safe 996×1400
 *   Shorts  — top 120px, bottom 300px, left 0px,  right 96px  → safe 984×1500
 *   Universal — most conservative across all three platforms
 */

import type { Platform } from './types'
export type { Platform }

// ---------------------------------------------------------------------------
// Canvas constants
// ---------------------------------------------------------------------------

export const CANVAS_WIDTH = 1080
export const CANVAS_HEIGHT = 1920

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The category of overlay element being placed.
 * Used by `getElementPlacement` to return a narrowed safe rect within the
 * platform's overall safe zone.
 */
export type ElementType =
  | 'caption'          // Burned-in captions/subtitles — bottom portion of safe zone
  | 'hook_text'        // Attention-grabbing headline — top portion of safe zone
  | 'upper_third'      // Upper third of safe zone (name bars, intros)
  | 'middle'           // Centred middle band (pull quotes, reactions)
  | 'lower_third'      // Lower third (speaker name, title bars)
  | 'progress_bar'     // Thin progress bar strip at the bottom edge of safe zone
  | 'logo'             // Watermark / logo — top-right corner of safe zone
  | 'comment_overlay'  // Simulated comment block — middle-left
  | 'full_frame'       // Entire safe zone rectangle

/** A rectangle on the 1080×1920 canvas (pixel coordinates). */
export interface SafeZoneRect {
  /** Left edge in pixels */
  x: number
  /** Top edge in pixels */
  y: number
  width: number
  height: number
}

/**
 * The four dead zone measurements for a platform.
 * A dead zone is any area where platform UI (profile pic, engagement buttons,
 * caption bar, description text, etc.) overlaps the video content.
 */
export interface PlatformDeadZones {
  /** Height of the top dead zone (profile picture, username, follow button) */
  top: number
  /** Height of the bottom dead zone (captions, description, engagement buttons) */
  bottom: number
  /** Width of the left dead zone */
  left: number
  /** Width of the right dead zone (like/comment/share/bookmark button column) */
  right: number
}

/** Full safe zone data for one platform. */
export interface PlatformSafeZone {
  /** Human-readable platform label */
  name: string
  /** The safe content rectangle — the largest area free from all UI overlays */
  safeRect: SafeZoneRect
  /** Raw dead zone measurements used to compute safeRect */
  deadZones: PlatformDeadZones
  /**
   * The right-edge engagement button column (like / comment / share / save stack).
   * Content placed here will be partially or fully obscured by platform buttons.
   * Exposed so callers can explicitly avoid this region when centering text.
   */
  engagementButtonColumn: SafeZoneRect
}

// ---------------------------------------------------------------------------
// Platform safe zone definitions
// ---------------------------------------------------------------------------

/**
 * Pre-computed safe zone data for every supported platform.
 *
 * Pixel values assume a 1080×1920 (9:16) canvas.
 * Sources: TikTok Creative Center, Meta Business Help Center, YouTube Help (2026).
 */
export const PLATFORM_SAFE_ZONES: Record<Platform, PlatformSafeZone> = {
  /**
   * TikTok (2026)
   * Top: @username + sound label + follow button  → 108 px
   * Bottom: captions (dynamic) + progress bar + engagement row → 320 px
   * Left: edge margin → 60 px
   * Right: like / comment / share / sound disc column → 120 px
   * Safe zone: 900 × 1492 px
   */
  tiktok: {
    name: 'TikTok',
    deadZones: { top: 108, bottom: 320, left: 60, right: 120 },
    safeRect: {
      x: 60,
      y: 108,
      width: CANVAS_WIDTH - 60 - 120,   // 900
      height: CANVAS_HEIGHT - 108 - 320  // 1492
    },
    engagementButtonColumn: {
      x: CANVAS_WIDTH - 120,
      y: 108,
      width: 120,
      height: CANVAS_HEIGHT - 108 - 320
    }
  },

  /**
   * Instagram Reels (2026)
   * Top: profile picture + "Follow" + three-dot menu → 210 px
   * Bottom: caption bar + audio attribution + engagement buttons → 310 px
   * Left: no dead zone → 0 px
   * Right: like / comment / share / audio disc column → 84 px
   * Safe zone: 996 × 1400 px
   */
  reels: {
    name: 'Instagram Reels',
    deadZones: { top: 210, bottom: 310, left: 0, right: 84 },
    safeRect: {
      x: 0,
      y: 210,
      width: CANVAS_WIDTH - 0 - 84,    // 996
      height: CANVAS_HEIGHT - 210 - 310 // 1400
    },
    engagementButtonColumn: {
      x: CANVAS_WIDTH - 84,
      y: 210,
      width: 84,
      height: CANVAS_HEIGHT - 210 - 310
    }
  },

  /**
   * YouTube Shorts (2026)
   * Top: minimal status area (grows with notch) → 120 px
   * Bottom: channel name + subscribe button + audio + description → 300 px
   * Left: no dead zone → 0 px
   * Right: like / dislike / comment / share column → 96 px
   * Safe zone: 984 × 1500 px
   * Note: when description is expanded the bottom dead zone grows to ~360 px.
   * The subscribe button occupies roughly the bottom-left 180×80 px area.
   */
  shorts: {
    name: 'YouTube Shorts',
    deadZones: { top: 120, bottom: 300, left: 0, right: 96 },
    safeRect: {
      x: 0,
      y: 120,
      width: CANVAS_WIDTH - 0 - 96,    // 984
      height: CANVAS_HEIGHT - 120 - 300 // 1500
    },
    engagementButtonColumn: {
      x: CANVAS_WIDTH - 96,
      y: 120,
      width: 96,
      height: CANVAS_HEIGHT - 120 - 300
    }
  },

  /**
   * Universal — the most conservative safe zone that works across all three
   * platforms simultaneously. Use this when exporting one asset for all platforms.
   * Top: 210 px (Reels), Bottom: 320 px (TikTok), Left: 60 px (TikTok), Right: 120 px (TikTok)
   * Safe zone: 900 × 1390 px
   */
  universal: {
    name: 'Universal (All Platforms)',
    deadZones: { top: 210, bottom: 320, left: 60, right: 120 },
    safeRect: {
      x: 60,
      y: 210,
      width: CANVAS_WIDTH - 60 - 120,    // 900
      height: CANVAS_HEIGHT - 210 - 320  // 1390
    },
    engagementButtonColumn: {
      x: CANVAS_WIDTH - 120,
      y: 210,
      width: 120,
      height: CANVAS_HEIGHT - 210 - 320
    }
  }
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Returns the full safe zone rectangle for a platform.
 * This is the largest contiguous area guaranteed to be free of all UI overlays.
 */
export function getSafeZone(platform: Platform): SafeZoneRect {
  return PLATFORM_SAFE_ZONES[platform].safeRect
}

/**
 * Returns the dead zone measurements for a platform.
 */
export function getDeadZones(platform: Platform): PlatformDeadZones {
  return PLATFORM_SAFE_ZONES[platform].deadZones
}

/**
 * Returns a safe placement rectangle for the given element type on the given platform.
 *
 * The returned rect is a sub-region of the platform's safe zone, positioned and
 * sized to match the typical on-screen location for that element type. All coordinates
 * are in pixels on the 1080×1920 canvas.
 *
 * Use this to:
 *  - Set MarginL / MarginR / MarginV in ASS subtitle files (captions, hook_text)
 *  - Position FFmpeg overlay filters (logo, comment_overlay)
 *  - Constrain burn-in graphics to avoid platform UI (progress_bar, lower_third)
 */
export function getElementPlacement(platform: Platform, element: ElementType): SafeZoneRect {
  const { x, y, width, height } = PLATFORM_SAFE_ZONES[platform].safeRect

  switch (element) {
    // ── Full safe area ────────────────────────────────────────────────────────
    case 'full_frame':
      return { x, y, width, height }

    // ── Hook text — top 22% of safe zone ─────────────────────────────────────
    case 'hook_text':
      return { x, y, width, height: Math.round(height * 0.22) }

    // ── Upper third — top 33% of safe zone ───────────────────────────────────
    case 'upper_third':
      return { x, y, width, height: Math.round(height / 3) }

    // ── Middle band — central 40% of safe zone ────────────────────────────────
    case 'middle': {
      const h = Math.round(height * 0.40)
      return { x, y: y + Math.round((height - h) / 2), width, height: h }
    }

    // ── Lower third — bottom 33% of safe zone ────────────────────────────────
    case 'lower_third': {
      const h = Math.round(height / 3)
      return { x, y: y + height - h, width, height: h }
    }

    // ── Captions — bottom 22% of safe zone ───────────────────────────────────
    // Captions sit near the bottom of the safe zone, well above the caption/button
    // dead zone. The rect covers the full safe width so text can center naturally.
    case 'caption': {
      const h = Math.round(height * 0.22)
      return { x, y: y + height - h, width, height: h }
    }

    // ── Progress bar — thin strip at the very bottom of safe zone ─────────────
    // 8 px tall, spanning the full safe width.
    case 'progress_bar':
      return { x, y: y + height - 8, width, height: 8 }

    // ── Logo / watermark — top-right corner of safe zone ──────────────────────
    // 120×120 px square in the top-right corner of the safe area.
    // Sits inside the safe zone, not in the engagement button column.
    case 'logo': {
      const size = 120
      return { x: x + width - size, y, width: size, height: size }
    }

    // ── Comment overlay — middle-left area ───────────────────────────────────
    // A 140 px tall block at 72% of safe width, vertically centred in safe zone.
    // Positioned on the left to avoid right-side engagement buttons.
    case 'comment_overlay': {
      const h = 140
      const w = Math.round(width * 0.72)
      return {
        x,
        y: y + Math.round((height - h) / 2),
        width: w,
        height: h
      }
    }
  }
}

/**
 * Clamps an arbitrary rectangle to stay within the platform's safe zone.
 *
 * Useful when an element has been manually positioned and you want to snap it
 * back into bounds before rendering.
 *
 * @param rect   The rectangle to clamp (pixel coordinates on 1080×1920 canvas)
 * @param platform  Target platform
 * @returns A new rect guaranteed to be fully inside the safe zone
 */
export function clampToSafeZone(rect: SafeZoneRect, platform: Platform): SafeZoneRect {
  const safe = PLATFORM_SAFE_ZONES[platform].safeRect

  const x = Math.max(safe.x, Math.min(rect.x, safe.x + safe.width))
  const y = Math.max(safe.y, Math.min(rect.y, safe.y + safe.height))
  const maxW = safe.x + safe.width - x
  const maxH = safe.y + safe.height - y
  const width = Math.min(rect.width, maxW)
  const height = Math.min(rect.height, maxH)

  return { x, y, width, height }
}

/**
 * Checks whether a rectangle is fully contained within the platform's safe zone.
 *
 * @param rect      The rectangle to test
 * @param platform  Target platform
 * @returns `true` if the rect is completely inside the safe zone; `false` otherwise
 */
export function isInsideSafeZone(rect: SafeZoneRect, platform: Platform): boolean {
  const safe = PLATFORM_SAFE_ZONES[platform].safeRect
  return (
    rect.x >= safe.x &&
    rect.y >= safe.y &&
    rect.x + rect.width <= safe.x + safe.width &&
    rect.y + rect.height <= safe.y + safe.height
  )
}

/**
 * Converts a SafeZoneRect to ASS subtitle margin values.
 *
 * ASS margins are measured from the canvas edge inward:
 *   MarginL = pixels from left canvas edge
 *   MarginR = pixels from right canvas edge
 *   MarginV = pixels from bottom canvas edge (for \an2/\an8 alignment)
 *
 * @param rect  The placement rectangle (from `getElementPlacement`)
 * @returns Object with MarginL, MarginR, MarginV for use in ASS style overrides
 */
export function rectToAssMargins(rect: SafeZoneRect): {
  MarginL: number
  MarginR: number
  MarginV: number
} {
  return {
    MarginL: rect.x,
    MarginR: CANVAS_WIDTH - (rect.x + rect.width),
    MarginV: CANVAS_HEIGHT - (rect.y + rect.height)
  }
}
