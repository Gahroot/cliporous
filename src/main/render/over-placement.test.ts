import { describe, expect, it } from 'vitest';
import { faceBandOnCanvas, placeOverCard } from './over-placement';

const canvas = { width: 1080, height: 1920 };

describe('faceBandOnCanvas', () => {
  it('maps a 16:9 source face onto the 9:16 canvas with hair and chin room', () => {
    // Measured on a real 640×360 close-up: face rows 57–162.
    const band = faceBandOnCanvas(
      { top: 57, bottom: 162 },
      { sourceWidth: 640, sourceHeight: 360, ...canvas },
    );
    // 1920/360 = 5.33× → 304–864, then −35% / +10% of the 560px face.
    expect(band.top).toBeCloseTo(108, 0);
    expect(band.bottom).toBeCloseTo(920, 0);
  });

  it('accounts for a face crop that starts below the top of the source', () => {
    const band = faceBandOnCanvas(
      { top: 400, bottom: 500 },
      {
        sourceWidth: 1920,
        sourceHeight: 1080,
        cropRect: { x: 600, y: 200, width: 450, height: 800 },
        ...canvas,
      },
    );
    // 1920/800 = 2.4× from row 200 → 480–720, padded by 84 / 24.
    expect(band.top).toBeCloseTo(396, 0);
    expect(band.bottom).toBeCloseTo(744, 0);
  });
});

describe('placeOverCard', () => {
  it('keeps the default position when no face is in shot', () => {
    expect(placeOverCard(null)).toEqual({ layout: 'over' });
  });

  it('uses the split screen when the face position is unknown', () => {
    expect(placeOverCard(undefined)).toEqual({ layout: 'stack' });
  });

  it('puts the card above a low face', () => {
    const placed = placeOverCard({ top: 900, bottom: 1250 });
    expect(placed).toEqual({ layout: 'over', safe: { x: 90, y: 180, width: 900, height: 620 } });
  });

  it('puts the card below a high face, above the captions', () => {
    const placed = placeOverCard({ top: 120, bottom: 560 });
    expect(placed.layout).toBe('over');
    if (placed.layout !== 'over' || !placed.safe) throw new Error('expected a placed card');
    expect(placed.safe.y).toBe(600);
    expect(placed.safe.y + placed.safe.height).toBeLessThanOrEqual(1300);
  });

  it('never overlaps the padded face band', () => {
    for (let top = 0; top <= 1500; top += 50) {
      const face = { top, bottom: top + 400 };
      const placed = placeOverCard(face);
      if (placed.layout !== 'over' || !placed.safe) continue;
      const cardTop = placed.safe.y;
      const cardBottom = placed.safe.y + placed.safe.height;
      expect(cardBottom <= face.top || cardTop >= face.bottom).toBe(true);
    }
  });

  it('falls back to the split screen for a close-up that fills the frame', () => {
    expect(placeOverCard({ top: 108, bottom: 920 })).toEqual({ layout: 'stack' });
  });
});
