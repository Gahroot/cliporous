import type { LongformPresentation } from './longform-scenes';

export interface LongformRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LongformLayout {
  width: 1920;
  height: 1080;
  explanation: LongformRect;
  speaker: LongformRect | null;
  /** Absolute canvas coordinates; scene stages translate these into their own local space. */
  text: LongformRect;
  model: LongformRect;
  caption: LongformRect;
}

/** One geometry owner for FFmpeg source placement and Remotion stage/text reservations. */
export function getLongformLayout(presentation: LongformPresentation): LongformLayout {
  if (presentation === 'speaker-side') {
    return {
      width: 1920,
      height: 1080,
      explanation: { x: 720, y: 0, width: 1200, height: 1080 },
      // Edge-to-edge left column: the speaker fills its whole section, no margins or bars.
      speaker: { x: 0, y: 0, width: 720, height: 1080 },
      text: { x: 776, y: 48, width: 1088, height: 196 },
      model: { x: 776, y: 256, width: 1088, height: 680 },
      caption: { x: 48, y: 940, width: 624, height: 92 },
    };
  }
  return {
    width: 1920,
    height: 1080,
    explanation: { x: 0, y: 0, width: 1920, height: 1080 },
    speaker: presentation === 'speaker-pip' ? { x: 64, y: 704, width: 592, height: 334 } : null,
    text: { x: 64, y: 64, width: 608, height: presentation === 'speaker-pip' ? 584 : 884 },
    model: { x: 736, y: 80, width: 1120, height: 912 },
    caption: { x: 752, y: 1000, width: 1088, height: 64 },
  };
}

export interface LongformCoverCrop {
  /** Source-pixel crop window (even sizes), aspect-matched to the pane. */
  crop: LongformRect;
  /** Destination pane, filled edge to edge. */
  rect: LongformRect;
}

/**
 * Cover a speaker pane: crop the source to the pane's aspect, then scale to fill it, so a
 * professional edit never shows letterbox bars inside the pane. No face data reaches this
 * path, so the window is centred horizontally and biased towards the top (headroom) when
 * trimming height.
 */
export function coverLongformSource(
  sourceWidth: number,
  sourceHeight: number,
  rect: LongformRect,
): LongformCoverCrop {
  assertSourceDimensions(sourceWidth, sourceHeight);
  const paneAspect = rect.width / rect.height;
  const sourceAspect = sourceWidth / sourceHeight;
  const even = (value: number): number => Math.max(2, Math.floor(value / 2) * 2);
  const width = even(sourceAspect > paneAspect ? sourceHeight * paneAspect : sourceWidth);
  const height = even(sourceAspect > paneAspect ? sourceHeight : sourceWidth / paneAspect);
  return {
    crop: {
      x: Math.floor((sourceWidth - width) / 2),
      y: Math.floor((sourceHeight - height) / 3),
      width,
      height,
    },
    rect: { ...rect },
  };
}

function assertSourceDimensions(sourceWidth: number, sourceHeight: number): void {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new Error('Source dimensions must be finite positive numbers.');
  }
}

/** Contain, never distort or assume a face can safely be cropped from the source. */
export function containLongformSource(
  sourceWidth: number,
  sourceHeight: number,
  rect: LongformRect,
): LongformRect {
  assertSourceDimensions(sourceWidth, sourceHeight);
  const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight);
  const width = Math.max(2, Math.floor((sourceWidth * scale) / 2) * 2);
  const height = Math.max(2, Math.floor((sourceHeight * scale) / 2) * 2);
  return {
    x: rect.x + Math.floor((rect.width - width) / 2),
    y: rect.y + Math.floor((rect.height - height) / 2),
    width,
    height,
  };
}
