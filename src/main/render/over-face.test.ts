import { describe, expect, it } from 'vitest';
import type { FaceCropResult } from '../face-detection';
import { toFaceMeasurement } from './over-face';

const crop = { x: 0, y: 0, width: 1080, height: 1920 };

function result(extra: Partial<FaceCropResult>, faceDetected = true): FaceCropResult {
  return { crop: { ...crop, faceDetected }, ...extra };
}

describe('toFaceMeasurement', () => {
  it('uses the face rows from the accurate detector', () => {
    const band = { top: 57, bottom: 162 };
    expect(toFaceMeasurement(result({ faceBand: band, facesReliable: true }))).toEqual(band);
  });

  it('trusts "no face" only from the accurate detector', () => {
    expect(toFaceMeasurement(result({ facesReliable: true }, false))).toBeNull();
    expect(toFaceMeasurement(result({ facesReliable: false }, false))).toBeUndefined();
  });

  it('treats Haar-only rows as unknown', () => {
    // Haar mistook a patterned shirt for a face (rows 1469–1709 of 1920).
    const haar = result({ faceBand: { top: 1469, bottom: 1709 }, facesReliable: false });
    expect(toFaceMeasurement(haar)).toBeUndefined();
  });

  it('treats a missing result as unknown', () => {
    expect(toFaceMeasurement(undefined)).toBeUndefined();
  });
});
