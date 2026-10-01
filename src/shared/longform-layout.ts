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
      speaker: { x: 32, y: 96, width: 656, height: 820 },
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

/** Contain, never distort or assume a face can safely be cropped from the source. */
export function containLongformSource(
  sourceWidth: number,
  sourceHeight: number,
  rect: LongformRect,
): LongformRect {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new Error('Source dimensions must be finite positive numbers.');
  }
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
