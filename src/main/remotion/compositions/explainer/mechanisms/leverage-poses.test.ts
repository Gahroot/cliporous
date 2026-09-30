import { describe, expect, it } from 'vitest';
import type { LeverageScene } from '../types';
import { sampleLeverage } from './leverage-poses';

const scene: LeverageScene = {
  kind: 'leverage',
  label: 'Move the fulcrum',
  effortAt: 0.3,
  pivotAt: 1.2,
  liftAt: 2,
  holdAt: 3.2,
};

describe('leverage causal contacts', () => {
  it('levels the beam while the fulcrum moves, then lifts and holds', () => {
    expect(sampleLeverage(0, scene).angle).toBe(0);
    expect(sampleLeverage(0.75, scene).angle).toBeGreaterThan(0);
    for (const t of [1.2, 1.5, 2]) expect(sampleLeverage(t, scene).angle).toBeCloseTo(0, 12);
    expect(sampleLeverage(1.6, scene).pivotX).toBeGreaterThan(-0.25);
    const final = sampleLeverage(scene.holdAt, scene);
    expect(final.pivotX).toBeCloseTo(0.55);
    expect(final.angle).toBeCloseTo(0.3);
    expect(final.load[1]).toBeGreaterThan(0);
    expect(final.effort[1]).toBeLessThan(0);
    expect(sampleLeverage(1000, scene)).toEqual(final);
  });

  it('keeps both contacts on one rigid beam and preserves the actual arm ratio', () => {
    for (let frame = 0; frame < 150; frame++) {
      const pose = sampleLeverage(frame / 30, scene);
      const { effort, load, angle, pivotX } = pose;
      expect(Math.hypot(load[0] - effort[0], load[1] - effort[1])).toBeCloseTo(2.3, 10);
      expect(effort[0]).toBeCloseTo(pivotX + (-1.15 - pivotX) * Math.cos(angle), 12);
      expect(load[0]).toBeCloseTo(pivotX + (1.15 - pivotX) * Math.cos(angle), 12);
      if (Math.abs(angle) > 1e-5) {
        expect(-effort[1] / load[1]).toBeCloseTo((1.15 + pivotX) / (1.15 - pivotX), 10);
      }
    }
  });

  it('has continuous contacts and angle at every causal boundary', () => {
    for (const t of [scene.effortAt, scene.pivotAt, scene.liftAt, scene.holdAt]) {
      const before = sampleLeverage(t - 1e-6, scene);
      const after = sampleLeverage(t + 1e-6, scene);
      expect(after.angle).toBeCloseTo(before.angle, 8);
      expect(after.pivotX).toBeCloseTo(before.pivotX, 8);
      expect(after.load[1]).toBeCloseTo(before.load[1], 8);
      expect(after.effort[1]).toBeCloseTo(before.effort[1], 8);
    }
  });

  it('is finite and identical for shuffled frame requests', () => {
    const times = [-1, 0.3, 0.6, 1.2, 1.7, 2, 2.6, 3.2, 5, 1000];
    const first = times.map((t) => sampleLeverage(t, scene));
    for (const index of [8, 2, 7, 0, 9, 4, 1, 6, 3, 5]) {
      const pose = sampleLeverage(times[index], scene);
      expect(pose).toEqual(first[index]);
      expect([pose.pivotX, pose.angle, ...pose.effort, ...pose.load].every(Number.isFinite)).toBe(
        true,
      );
    }
  });
});
