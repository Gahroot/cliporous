import { describe, expect, it } from 'vitest';
import { cameraRig, projectToStage } from '../three-helpers';
import {
  MECHANISM_CAMERA,
  MECHANISM_LABEL_SAFE,
  placeLabel,
  projectAnchor,
  transformAnchor,
} from './anchors';

describe('authored attachment points', () => {
  it('uses the same XYZ group transforms as model parts', () => {
    const point = transformAnchor([1, 0, 0], {
      position: [2, 1, 0],
      rotation: [0, 0, Math.PI / 2],
      scale: 2,
    });
    expect(point[0]).toBeCloseTo(2);
    expect(point[1]).toBeCloseTo(3);
    expect(point[2]).toBe(0);
  });

  it('tracks the exact camera projection in shuffled frame order', () => {
    for (const frame of [150, 30, 0, 78, 30]) {
      const camera = cameraRig(MECHANISM_CAMERA, frame / 30, { driftDeg: 0, pushAmount: 0 });
      expect(projectAnchor(camera, [0, 0, 0])).toEqual(projectToStage(camera, [0, 0, 0]));
      expect(projectAnchor(camera, [0, 0, 0])?.x).toBeCloseTo(540);
      expect(projectAnchor(camera, [0, 0, 0])?.y).toBeCloseTo(480);
      expect(projectAnchor(camera, [1, 0, 0])?.x).toBeGreaterThan(540);
    }
  });

  it('hides anchors at or behind the camera instead of mirroring them', () => {
    expect(projectAnchor(MECHANISM_CAMERA, MECHANISM_CAMERA.position)).toBeNull();
    expect(projectAnchor(MECHANISM_CAMERA, [0, 5, 20])).toBeNull();
    expect(projectAnchor(MECHANISM_CAMERA, [NaN, 0, 0])).toBeNull();
  });

  it('keeps whole labels within the shared safe box', () => {
    for (const point of [
      { x: -200, y: -50 },
      { x: 5000, y: 5000 },
      { x: 540, y: 480 },
    ]) {
      const placed = placeLabel(point, 280, 76, MECHANISM_LABEL_SAFE);
      expect(placed.x).toBeGreaterThanOrEqual(72);
      expect(placed.y).toBeGreaterThanOrEqual(70);
      expect(placed.x + 280).toBeLessThanOrEqual(1008);
      expect(placed.y + 76).toBeLessThanOrEqual(876);
    }
  });
});
