import { describe, expect, it } from 'vitest';
import { explanationLabelTop } from '../../explanation-layout';
import { projectToStage } from '../../three-helpers';
import { PERSPECTIVE_FIXTURES } from './fixture-data';
import { CHIP_SCENE, FIXTURE_DURATION } from './fixtures';
import {
  boxCorners,
  futuresPose,
  perspectiveBounds,
  perspectivePose,
  scaleBounds,
  scalePose,
  TRACKED_CHIP,
  TRACKED_CUSTOMER,
  twinPose,
} from './poses';

describe.each(PERSPECTIVE_FIXTURES)('$scene.preset: every authored frame', ({ scene }) => {
  it('is deterministic under forward, reverse, repeated and arbitrary seeks and settles fully', () => {
    const original = structuredClone(scene);
    const frames = Array.from({ length: Math.round(FIXTURE_DURATION * 30) + 1 }, (_, i) => i);
    const poses = frames.map((frame) => perspectivePose(scene, frame / 30));
    for (const frame of [...frames].reverse())
      expect(perspectivePose(scene, frame / 30)).toEqual(poses[frame]);
    for (const frame of [87, 240, 0, 336, 87, 40, 192, 40])
      expect(perspectivePose(scene, frame / 30)).toEqual(poses[frame]);
    expect(perspectivePose(scene, -10)).toEqual(perspectivePose(scene, 0));
    expect(perspectivePose(scene, 100)).toEqual(perspectivePose(scene, scene.resolveAt));
    expect(perspectivePose(scene, FIXTURE_DURATION)).toEqual(
      perspectivePose(scene, scene.resolveAt),
    );
    expect(scene).toEqual(original);
    const numbers = (v: unknown): number[] =>
      typeof v === 'number'
        ? [v]
        : v && typeof v === 'object'
          ? Object.values(v).flatMap(numbers)
          : [];
    for (const pose of poses) expect(numbers(pose).every(Number.isFinite)).toBe(true);
  });

  it('projects complete visible geometry into reserved model space at all 337 frames', () => {
    // ExplanationStage uses this same virtual 1080×960 canvas in stack, flipped,
    // takeover and over; SceneFrame transforms model and text together.
    const bottom =
      scene.kind === 'possible-futures'
        ? 676
        : scene.kind === 'digital-twin'
          ? 702
          : explanationLabelTop(4) - 8;
    for (let frame = 0; frame <= FIXTURE_DURATION * 30; frame++) {
      const t = frame / 30;
      const { camera } = perspectivePose(scene, t);
      for (const point of perspectiveBounds(scene, t).flatMap(boxCorners)) {
        const p = projectToStage(camera, point);
        const message = `${scene.preset} frame=${frame} point=${point}`;
        expect(p.x, message).toBeGreaterThan(60);
        expect(p.x, message).toBeLessThan(1020);
        expect(p.y, message).toBeGreaterThan(278);
        expect(p.y, message).toBeLessThan(bottom);
      }
    }
  });

  it('preserves original identity, equal future weight and actual-vs-model state at every frame', () => {
    for (let frame = 0; frame <= FIXTURE_DURATION * 30; frame++) {
      const t = frame / 30;
      if (scene.kind === 'scale-hierarchy') {
        const p = scalePose(scene, t);
        expect(p.trackedPosition).toEqual(
          scene.preset === 'chip-to-center' ? TRACKED_CHIP : TRACKED_CUSTOMER,
        );
        expect(p.trackedId).toBe('tracked-subject');
        for (const amount of [p.server, p.rack, p.center, p.segment, p.market]) {
          expect(amount).toBeGreaterThanOrEqual(0);
          expect(amount).toBeLessThanOrEqual(1);
        }
      } else if (scene.kind === 'possible-futures') {
        const p = futuresPose(scene, t);
        expect(p.present).toEqual(futuresPose(scene, 0).present);
        expect(new Set(p.alternatives.map((a) => a.pathWidth)).size).toBe(1);
        expect(new Set(p.alternatives.map((a) => a.scale)).size).toBe(1);
        expect(p.alternatives.map((a) => a.id)).toEqual(scene.alternatives.map((a) => a.id));
        for (const a of p.alternatives) {
          expect(a.gate).toBeGreaterThanOrEqual(0);
          expect(a.gate).toBeLessThanOrEqual(1);
        }
      } else {
        const p = twinPose(scene, t);
        expect(p.physical).toEqual(twinPose(scene, 0).physical);
        expect(p.model.id).not.toBe(p.physical.id);
        expect(p.model.gate).toBeGreaterThanOrEqual(0);
        expect(p.model.gate).toBeLessThanOrEqual(1);
        if (scene.preset === 'mirror-state' || t <= scene.checkAt)
          expect(p.model.gate).toBe(p.physical.gate);
        if (scene.preset === 'simulated-change' && t >= scene.resolveAt)
          expect(p.model.gate).not.toBe(p.physical.gate);
      }
    }
  });
});

describe('perspective pilot poses and projection', () => {
  it('keeps the same chip fixed through every reveal and settles its camera', () => {
    for (let f = 0; f <= 336; f++) {
      const p = scalePose(CHIP_SCENE, f / 30);
      expect(p.trackedId).toBe('tracked-subject');
      expect(p.trackedPosition).toEqual(TRACKED_CHIP);
      for (const value of [p.server, p.rack, p.center]) expect(value).toBeGreaterThanOrEqual(0);
      for (const value of [p.server, p.rack, p.center]) expect(value).toBeLessThanOrEqual(1);
    }
    expect(scalePose(CHIP_SCENE, CHIP_SCENE.resolveAt)).toEqual(
      scalePose(CHIP_SCENE, FIXTURE_DURATION),
    );
  });

  it('is seek-order independent, including backward and out-of-window requests', () => {
    const times = [-5, 0, 2, 4, 6, 8, 10, 40];
    const expected = times.map((t) => scalePose(CHIP_SCENE, t));
    for (const index of [7, 0, 6, 2, 1, 5, 3, 4])
      expect(scalePose(CHIP_SCENE, times[index] ?? 0)).toEqual(expected[index]);
  });

  it('keeps all model bounds below title/condition and above editorial rails at every frame', () => {
    for (let f = 0; f <= 336; f++) {
      const t = f / 30;
      const { camera } = scalePose(CHIP_SCENE, t);
      for (const point of scaleBounds(CHIP_SCENE, t).flatMap(boxCorners)) {
        const p = projectToStage(camera, point);
        expect(p.x, `f=${f} x`).toBeGreaterThan(60);
        expect(p.x, `f=${f} x`).toBeLessThan(1020);
        expect(p.y, `f=${f} y`).toBeGreaterThan(204);
        expect(p.y, `f=${f} y`).toBeLessThan(772);
      }
    }
  });
});
