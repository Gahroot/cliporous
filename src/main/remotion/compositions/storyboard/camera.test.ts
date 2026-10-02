import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { STORYBOARD_LIMITS } from '../../../../shared/storyboards';
import {
  boardOpacity,
  cameraAt,
  sampleQuad,
  wobblePath,
  worldToScreen,
  worldTransform,
} from './camera';
import { BOARD_CAMERA_FOV, pixelCameraDistance } from './prop-state';
import type { CameraShot } from './types';

const shots: CameraShot[] = [
  { at: 2, dur: 0, x: 500, y: 500, zoom: 1, driftX: 4 },
  { at: 4, dur: 2, x: 1800, y: 500, zoom: 0.9 },
  { at: 5, dur: 2, x: 3200, y: 450, zoom: 0.5 },
];
describe('segment-local board camera', () => {
  it('is continuous across drift, interrupted moves and completed holds', () => {
    for (const at of [2, 4, 5, 6, 7, 12]) {
      const a = cameraAt(shots, at - 0.000001);
      const b = cameraAt(shots, at + 0.000001);
      expect(Math.abs(a.x - b.x)).toBeLessThan(0.03);
      expect(Math.abs(a.zoom - b.zoom)).toBeLessThan(0.0001);
    }
    expect(cameraAt(shots, 20)).toEqual(cameraAt(shots, 30));
  });
  it('bounds invalid zooms and final drift', () => {
    const bad = [{ at: 0, dur: 0, x: 0, y: 0, zoom: -2, driftX: 999 }];
    expect(cameraAt(bad, 100)).toEqual({ x: 36, y: 0, zoom: STORYBOARD_LIMITS.minZoom });
    expect(cameraAt([{ ...bad[0], zoom: Infinity }], 0).zoom).toBe(1);
    expect(cameraAt([{ ...bad[0], zoom: 10 }], 0).zoom).toBe(STORYBOARD_LIMITS.maxZoom);
  });
  it('projects 2D anchors and Three z=0 anchors identically through pans/zooms', () => {
    const width = 1920;
    const height = 1080;
    const three = new PerspectiveCamera(BOARD_CAMERA_FOV, width / height, 10, 20_000);
    three.position.set(0, 0, pixelCameraDistance(height));
    three.lookAt(0, 0, 0);
    three.updateMatrixWorld();
    three.updateProjectionMatrix();
    for (const t of [0, 4.3, 5.6, 7, 30]) {
      const cam = cameraAt(shots, t);
      for (const p of [
        { x: 500, y: 500 },
        { x: 2100, y: 150 },
        { x: 3200, y: 750 },
      ]) {
        const screen = worldToScreen(p, cam, width, height);
        const projected = new Vector3(screen.x - width / 2, height / 2 - screen.y, 0).project(
          three,
        );
        expect(((projected.x + 1) * width) / 2).toBeCloseTo(screen.x, 8);
        expect(((1 - projected.y) * height) / 2).toBeCloseTo(screen.y, 8);
        expect(worldTransform(cam, width, height)).toContain(`scale(${cam.zoom})`);
      }
    }
  });
  it('leaves transparent source lead/tail and holds an opaque board between fades', () => {
    const spec = { boardIn: { at: 1, dur: 0.5 }, boardOut: { at: 8, dur: 0.5 } };
    expect([0, 1, 1.5, 5, 8, 8.5, 9].map((t) => boardOpacity(spec, t))).toEqual([
      0, 0, 1, 1, 1, 0, 0,
    ]);
    expect(boardOpacity({ boardIn: { at: 1, dur: 0 }, boardOut: { at: 8, dur: 0 } }, 4)).toBe(1);
  });
  it('is seek-repeatable, including seeded ink geometry', () => {
    const points = sampleQuad({ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 });
    const path = wobblePath(points, 'process-link', 1.6);
    for (const t of [7, 1, 5.2, 0, 5.2, 7]) {
      expect(cameraAt(shots, t)).toEqual(cameraAt(shots, t));
      expect(wobblePath(points, 'process-link', 1.6)).toBe(path);
    }
    expect(wobblePath(points, 'other-link', 1.6)).not.toBe(path);
    expect(wobblePath(points, 'any', 0)).toBe(wobblePath(points, 'seed', 0));
  });
});
