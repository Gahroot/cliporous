/**
 * Where a floating `over` explainer card may sit on a 9:16 short without
 * covering the speaker's face.
 *
 * The `over` layout composites a transparent card on the full-frame speaker.
 * Its default box (upper third) assumes a medium shot; in close-ups the head
 * fills that area. Given the rows the face covers, the card moves to the free
 * band above or below it; if neither band fits, the scene falls back to the
 * split-screen `stack` layout, which keeps the stage and the speaker apart.
 */

import type { StageSafeBox } from '../remotion/compositions/explainer/types';

/** Rows (px, 0 = top) covered by the speaker's face. */
export interface FaceBand {
  top: number;
  bottom: number;
}

/**
 * Face measurement for one window:
 *  - a `FaceBand` — a face was found there;
 *  - `null` — measurement ran and found no face (nothing to avoid);
 *  - `undefined` — measurement unavailable (face position unknown).
 */
export type FaceMeasurement = FaceBand | null | undefined;

export type OverPlacement = { layout: 'over'; safe?: StageSafeBox } | { layout: 'stack' };

/** Speaker framing on the output canvas (mirrors `buildSpeakerCropScale`). */
export interface SpeakerFraming {
  sourceWidth: number;
  sourceHeight: number;
  cropRect?: { x: number; y: number; width: number; height: number } | undefined;
  width: number;
  height: number;
}

// 1080×1920 canvas geometry ------------------------------------------------

/** Keep clear of platform chrome at the very top. */
const CARD_TOP_LIMIT = 150;
/** The default card top (`stageSafeBox('over', '9:16')`). */
const CARD_DEFAULT_Y = 180;
/** Top of the ordinary caption block (bottom anchor at 85%, two lines). */
const CAPTION_TOP = 1300;
const CARD_X = 90;
const CARD_WIDTH = 900;
const CARD_MAX_HEIGHT = 620;
/** Below this the card's content gets too small to read. */
const CARD_MIN_HEIGHT = 420;
/** Air between the card and the face. */
const FACE_GAP = 40;
/** Detector boxes run brow-to-chin; hair and neck extend past them. */
const HAIR_ALLOWANCE = 0.35;
const CHIN_ALLOWANCE = 0.1;

/**
 * Map a face band from source rows to output-canvas rows, padded for hair
 * and chin. Mirrors the speaker crop: optional face crop, then a centred
 * aspect sub-crop, then a uniform scale. Pure.
 */
export function faceBandOnCanvas(source: FaceBand, framing: SpeakerFraming): FaceBand {
  const crop = framing.cropRect ?? {
    x: 0,
    y: 0,
    width: framing.sourceWidth,
    height: framing.sourceHeight,
  };
  const targetAspect = framing.width / framing.height;
  const visibleHeight =
    crop.width / crop.height > targetAspect ? crop.height : crop.width / targetAspect;
  const visibleTop = crop.y + (crop.height - visibleHeight) / 2;
  const scale = framing.height / visibleHeight;
  const top = (source.top - visibleTop) * scale;
  const bottom = (source.bottom - visibleTop) * scale;
  const faceHeight = Math.max(0, bottom - top);
  return {
    top: Math.max(0, top - faceHeight * HAIR_ALLOWANCE),
    bottom: Math.min(framing.height, bottom + faceHeight * CHIN_ALLOWANCE),
  };
}

/** Choose where the floating card goes for one window. Pure. */
export function placeOverCard(face: FaceMeasurement): OverPlacement {
  if (face === null) return { layout: 'over' };
  if (face === undefined) return { layout: 'stack' };

  const aboveEnd = face.top - FACE_GAP;
  const aboveHeight = aboveEnd - CARD_TOP_LIMIT;
  const belowStart = face.bottom + FACE_GAP;
  const belowHeight = CAPTION_TOP - belowStart;

  if (aboveHeight >= CARD_MIN_HEIGHT && aboveHeight >= belowHeight) {
    const height = Math.min(CARD_MAX_HEIGHT, aboveHeight);
    const y = Math.max(CARD_TOP_LIMIT, Math.min(CARD_DEFAULT_Y, aboveEnd - height));
    return { layout: 'over', safe: box(y, height) };
  }
  if (belowHeight >= CARD_MIN_HEIGHT) {
    const height = Math.min(CARD_MAX_HEIGHT, belowHeight);
    return { layout: 'over', safe: box(belowStart, height) };
  }
  return { layout: 'stack' };
}

function box(y: number, height: number): StageSafeBox {
  return { x: CARD_X, y: Math.round(y), width: CARD_WIDTH, height: Math.round(height) };
}
