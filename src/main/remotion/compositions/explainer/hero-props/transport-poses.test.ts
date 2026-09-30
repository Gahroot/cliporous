import { describe, expect, it } from 'vitest';
import { HERO_CATALOG, TRANSPORT_TIMING } from '../hero-catalog';
import {
  BELT_LENGTH,
  BELT_RADIUS,
  sampleBeltPoint,
  sampleRailPoint,
  sampleTransportPose,
} from './transport-poses';

describe('transport signatures and continuous paths', () => {
  it.each(
    Object.entries(TRANSPORT_TIMING),
  )('%s catalog describes the sampled action', (id, time) => {
    expect(HERO_CATALOG[id as keyof typeof TRANSPORT_TIMING].impactSec).toBe(time);
  });

  it('closes the tread without a jump, including negative distances', () => {
    for (const distance of [
      0,
      2,
      2 + Math.PI * BELT_RADIUS,
      4 + Math.PI * BELT_RADIUS,
      BELT_LENGTH,
    ]) {
      const before = sampleBeltPoint(distance - 1e-6);
      const after = sampleBeltPoint(distance + 1e-6);
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeCloseTo(0, 4);
      expect(Math.cos(after.angle)).toBeCloseTo(Math.cos(before.angle), 4);
      expect(Math.sin(after.angle)).toBeCloseTo(Math.sin(before.angle), 4);
    }
    expect(sampleBeltPoint(0)).toEqual(sampleBeltPoint(BELT_LENGTH));
    expect(sampleBeltPoint(-BELT_LENGTH)).toEqual(sampleBeltPoint(0));
    for (const t of [0, 0.3, 0.8, 1.4, 4]) {
      const distance = sampleTransportPose(t, 0).conveyor.distance;
      expect(sampleBeltPoint(distance).x).toBeCloseTo(-1 + distance);
    }
  });

  it('lengthens the straight belt without stretching rollers or changing travelled distance', () => {
    const length = 6 + 2 * Math.PI * BELT_RADIUS;
    expect(sampleBeltPoint(length, 1.5)).toEqual(sampleBeltPoint(0, 1.5));
    expect(sampleBeltPoint(2.4, 1.5).x - sampleBeltPoint(1.7, 1.5).x).toBeCloseTo(0.7);
    const turn = sampleBeltPoint(3 + (Math.PI * BELT_RADIUS) / 2, 1.5);
    expect(turn.x).toBeCloseTo(1.75);
    expect(turn.y).toBeCloseTo(0);
  });

  it('preserves a single token through either committed route', () => {
    for (const route of ['left', 'right'] as const) {
      expect(sampleRailPoint(0, route)).toEqual([0, -0.9, 0.15]);
      const left = sampleRailPoint(0.45 - 1e-6, route);
      const right = sampleRailPoint(0.45 + 1e-6, route);
      expect(Math.hypot(right[0] - left[0], right[1] - left[1])).toBeLessThan(0.00001);
      expect(sampleRailPoint(1, route)[0]).toBeCloseTo(route === 'left' ? -0.8 : 0.8);
    }
  });

  it('never transfers through a closed valve or an unseated switch', () => {
    for (let frame = 0; frame <= 150; frame++) {
      const pose = sampleTransportPose(frame / 30, 0);
      if (pose.valve.open < 1) expect(pose.valve.flow).toBe(0);
      if (pose.rail.seat < 1) expect(pose.rail.tokenProgress).toBe(0);
      expect(pose.gauge.value).toBeGreaterThanOrEqual(0.15);
      expect(pose.gauge.value).toBeLessThanOrEqual(0.7 + Number.EPSILON);
    }
    expect(sampleTransportPose(100, 0)).toEqual(sampleTransportPose(5, 0));
  });

  it('remains finite before/at/after all beats and in shuffled order', () => {
    for (const time of [6, 0.25, 1.4, 0, 0.65, 1.9, 0.85, 0.3, 1.85, 0.35, 1.25, 0.9]) {
      for (const delta of [-1e-6, 0, 1e-6]) {
        const pose = sampleTransportPose(time + delta, 0);
        const numbers = Object.values(pose)
          .flatMap(Object.values)
          .filter((value) => typeof value === 'number');
        expect(numbers.every(Number.isFinite)).toBe(true);
      }
    }
  });
});
