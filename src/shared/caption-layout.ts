/** Percentage coordinates for the bottom-center of the reserved subtitle block. */
export interface SubtitlePosition {
  x: number;
  y: number;
}

/** Pixel coordinates for the bottom-center of the reserved subtitle block. */
export interface SubtitleAnchor {
  x: number;
  y: number;
}

/** Existing creator-facing default, measured from the canvas top-left. */
export const DEFAULT_SUBTITLE_POSITION: Readonly<SubtitlePosition> = { x: 50, y: 85 };

/** Captions may contain one or two explicitly broken lines. */
export const CAPTION_MAX_LINES = 2;

/** Keep caption glyphs clear of both vertical canvas edges. */
export const CAPTION_HORIZONTAL_INSET_FRACTION = 0.08;

/** Maximum caption line width after applying the shared horizontal inset. */
export const CAPTION_MAX_WIDTH_FRACTION = 1 - CAPTION_HORIZONTAL_INSET_FRACTION * 2;

function finitePercent(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value as number));
}

function finiteCanvasExtent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Convert a percentage subtitle position into a clamped pixel anchor.
 * Invalid position axes fall back independently so one bad persisted value
 * cannot invalidate the other axis.
 */
export function resolveSubtitleAnchor(
  position: Partial<SubtitlePosition> | null | undefined,
  canvasWidth: number,
  canvasHeight: number,
): SubtitleAnchor {
  const width = finiteCanvasExtent(canvasWidth);
  const height = finiteCanvasExtent(canvasHeight);
  const xPercent = finitePercent(position?.x, DEFAULT_SUBTITLE_POSITION.x);
  const yPercent = finitePercent(position?.y, DEFAULT_SUBTITLE_POSITION.y);

  return {
    x: Math.round((xPercent / 100) * width),
    y: Math.round((yPercent / 100) * height),
  };
}
