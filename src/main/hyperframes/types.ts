// ---------------------------------------------------------------------------
// HyperFrames overlay types — shared between engine, renderer, and feature
// ---------------------------------------------------------------------------

/** Supported overlay block names in the catalog. */
export type OverlayBlockName =
  | 'popup-card'
  | 'icon-callout'
  | 'animated-label'
  | 'progress-bar'
  | 'glowing-badge'

/** Position on the 1080×1920 canvas (percentage-based, 0–100). */
export interface OverlayPosition {
  x: number
  y: number
}

/** Timing for a single overlay instance. */
export interface OverlayTiming {
  /** Start time in seconds relative to clip start (0-based). */
  start: number
  /** Duration in seconds. */
  duration: number
}

/** Base props shared by all overlay blocks. */
export interface BaseOverlayProps {
  /** Text content (label, title, badge text, etc.). */
  text?: string
  /** Primary color (hex, e.g. '#9f75ff'). */
  color?: string
  /** Font size in pixels. */
  fontSize?: number
  /** Position on canvas (percentage-based). */
  position?: OverlayPosition
}

/** Props for the popup-card block. */
export interface PopupCardProps extends BaseOverlayProps {
  /** Subtitle or secondary text. */
  subtitle?: string
  /** Icon emoji or text character. */
  icon?: string
  /** Border radius in pixels. */
  borderRadius?: number
}

/** Props for the icon-callout block. */
export interface IconCalloutProps extends BaseOverlayProps {
  /** Icon emoji or text character. */
  icon?: string
  /** Icon size in pixels. */
  iconSize?: number
}

/** Props for the animated-label block. */
export interface AnimatedLabelProps extends BaseOverlayProps {
  /** Animation style: 'typewriter', 'fade-slide', or 'scale-bounce'. */
  animation?: 'typewriter' | 'fade-slide' | 'scale-bounce'
}

/** Props for the progress-bar block. */
export interface ProgressBarProps extends BaseOverlayProps {
  /** Progress value 0–1 (fraction complete). */
  progress?: number
  /** Bar height in pixels. */
  height?: number
  /** Bar width as percentage of canvas width (0–100). */
  widthPercent?: number
}

/** Props for the glowing-badge block. */
export interface GlowingBadgeProps extends BaseOverlayProps {
  /** Glow intensity (1–10, default 5). */
  glowIntensity?: number
  /** Badge shape: 'pill' or 'circle'. */
  shape?: 'pill' | 'circle'
}

/** Union of all overlay prop types keyed by block name. */
export type OverlayPropsMap = {
  'popup-card': PopupCardProps
  'icon-callout': IconCalloutProps
  'animated-label': AnimatedLabelProps
  'progress-bar': ProgressBarProps
  'glowing-badge': GlowingBadgeProps
}

/** A single overlay overlay request to render. */
export interface OverlayRequest {
  /** Catalog block to render. */
  block: OverlayBlockName
  /** Block-specific props. */
  props: BaseOverlayProps
  /** Timing on the clip timeline. */
  timing: OverlayTiming
}

/** Result of rendering an overlay — path to the temp MOV file. */
export interface OverlayRenderResult {
  /** Absolute path to the rendered MOV (ProRes 4444 with alpha). */
  movPath: string
  /** Duration of the rendered overlay in seconds. */
  duration: number
  /** Width in pixels. */
  width: number
  /** Height in pixels. */
  height: number
}
