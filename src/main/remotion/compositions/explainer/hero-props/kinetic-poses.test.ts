import { describe, expect, it } from 'vitest';
import { HERO_CATALOG, KINETIC_TIMING } from '../hero-catalog';
import { sampleKineticPose } from './kinetic-poses';

describe('kinetic hero signature schedules', () => {
  it.each(
    Object.entries(KINETIC_TIMING),
  )('%s action and catalog share impact timing', (id, time) => {
    expect(HERO_CATALOG[id as keyof typeof KINETIC_TIMING].impactSec).toBe(time);
  });

  it('keeps every pose finite at every boundary in arbitrary order', () => {
    const times = [0, 0.15, 0.2, 0.3, 0.35, 0.45, 0.7, 0.85, 0.95, 1, 1.3, 1.35, 1.5, 1.8, 2.1, 6];
    for (const time of [...times].reverse()) {
      for (const delta of [-1e-6, 0, 1e-6]) {
        const pose = sampleKineticPose(time + delta, 0);
        expect(Object.values(pose).flatMap(Object.values).every(Number.isFinite)).toBe(true);
        expect(pose.spring.compression).toBeGreaterThanOrEqual(0);
        expect(pose.spring.compression).toBeLessThanOrEqual(0.65);
        expect(pose.pulley.travel).toBeGreaterThanOrEqual(0);
        expect(pose.pulley.travel).toBeLessThanOrEqual(0.72);
      }
    }
    expect(sampleKineticPose(6, 0)).toEqual(sampleKineticPose(60, 0));
  });

  it('lifts the pawl during a forward stroke and seats it during each detent hold', () => {
    for (const cycle of [0, 1, 2]) {
      expect(sampleKineticPose(0.3 + cycle * 0.5 + 0.15, 0).ratchet.pawl).toBe(0.18);
      expect(sampleKineticPose(0.3 + cycle * 0.5 + 0.4, 0).ratchet.pawl).toBe(0);
    }
  });

  it('compresses before release and ends on the original spring height', () => {
    expect(sampleKineticPose(0, 0).spring.compression).toBe(0);
    expect(sampleKineticPose(0.9, 0).spring.compression).toBe(0.65);
    expect(sampleKineticPose(1.5, 0).spring.compression).toBe(0);
    expect(sampleKineticPose(2, 0).lever.angle).toBeCloseTo(0.22);
    expect(sampleKineticPose(2, 0).ratchet.angle).toBeCloseTo(Math.PI / 2);
  });
});
