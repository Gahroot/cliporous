import { describe, expect, it } from 'vitest';
import { LEAK_SEAL_SECONDS, type ResourceLeakScene } from '../types';
import {
  LEAK_OPEN_SECONDS,
  RESOURCE_FINAL_LEVEL,
  RESOURCE_INITIAL_LEVEL,
  sampleResourceLeak,
} from './resource-leak-poses';

const scene: ResourceLeakScene = {
  kind: 'resource-leak',
  label: 'Keep the resource',
  inflowAt: 0.3,
  leakAt: 1.2,
  sealAt: 2.8,
  retainAt: 4.4,
};
const closedAt = scene.sealAt + LEAK_SEAL_SECONDS;
const boundaries = [
  scene.inflowAt,
  scene.leakAt,
  scene.leakAt + LEAK_OPEN_SECONDS,
  scene.sealAt,
  closedAt,
  scene.retainAt,
];

describe('authored resource conservation', () => {
  it('rests before inflow; cannot lose resource while the taps are shut', () => {
    for (const time of [-100, 0, scene.inflowAt]) {
      expect(sampleResourceLeak(time, scene)).toEqual({
        level: RESOURCE_INITIAL_LEVEL,
        leakOpen: 0,
        inletRate: 0,
        leakRate: 0,
        incoming: 0,
        escaped: 0,
      });
    }
    const fed = sampleResourceLeak(scene.leakAt, scene);
    expect(fed.level).toBeCloseTo(0.5);
    expect(fed.incoming).toBeCloseTo(0.24);
    expect(fed.escaped).toBe(0);
    expect(fed.leakOpen).toBe(0);
  });

  it('leaks exceed inflow until both taps seal, then retained volume rises', () => {
    const leaking = sampleResourceLeak(2, scene);
    expect(leaking.leakOpen).toBe(1);
    expect(leaking.leakRate).toBeGreaterThan(leaking.inletRate);
    expect(leaking.level).toBeLessThan(0.5);
    expect(sampleResourceLeak(scene.sealAt, scene).leakOpen).toBe(1);
    expect(sampleResourceLeak(scene.sealAt + 0.16, scene).leakOpen).toBeCloseTo(0.5);
    const sealed = sampleResourceLeak(closedAt, scene);
    expect(sealed.level).toBeCloseTo(0.3);
    expect(sealed.leakOpen).toBe(0);
    expect(sealed.leakRate).toBe(0);
    expect(sealed.escaped).toBeCloseTo(0.34);
    const retained = sampleResourceLeak((closedAt + scene.retainAt) / 2, scene);
    expect(retained.level).toBeGreaterThan(sealed.level);
    expect(retained.escaped).toBe(sealed.escaped);
  });

  it('conserves incoming = retained change + caught leakage at every sampled frame', () => {
    for (let frame = -60; frame <= 420; frame++) {
      const pose = sampleResourceLeak(frame / 60, scene);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(pose.level + pose.escaped - RESOURCE_INITIAL_LEVEL).toBeCloseTo(pose.incoming, 12);
      expect(pose.level).toBeGreaterThanOrEqual(RESOURCE_INITIAL_LEVEL);
      expect(pose.level).toBeLessThanOrEqual(RESOURCE_FINAL_LEVEL);
      expect(pose.inletRate).toBeGreaterThanOrEqual(0);
      expect(pose.leakRate).toBeGreaterThanOrEqual(0);
      expect(pose.leakOpen).toBeGreaterThanOrEqual(0);
      expect(pose.leakOpen).toBeLessThanOrEqual(1);
      expect(pose.leakRate === 0).toBe(pose.leakOpen === 0);
    }
  });

  it('visible inlet and leakage rates are derivatives of their volume curves', () => {
    const dt = 1e-5;
    for (const t of [0.7, 1.24, 1.5, 2.2, 2.85, 3.08, 3.8, 4.2]) {
      const a = sampleResourceLeak(t - dt, scene);
      const b = sampleResourceLeak(t + dt, scene);
      const pose = sampleResourceLeak(t, scene);
      expect((b.incoming - a.incoming) / (2 * dt)).toBeCloseTo(pose.inletRate, 7);
      expect((b.escaped - a.escaped) / (2 * dt)).toBeCloseTo(pose.leakRate, 7);
      expect((b.level - a.level) / (2 * dt)).toBeCloseTo(pose.inletRate - pose.leakRate, 7);
    }
  });

  it.each(boundaries)('all transforms and rates are continuous around t=%s', (at) => {
    const before = sampleResourceLeak(at - 1e-7, scene);
    const after = sampleResourceLeak(at + 1e-7, scene);
    for (const key of [
      'level',
      'leakOpen',
      'inletRate',
      'leakRate',
      'incoming',
      'escaped',
    ] as const) {
      expect(after[key]).toBeCloseTo(before[key], 5);
    }
  });

  it('holds exact final level and volumes indefinitely, with no ongoing streams', () => {
    const final = sampleResourceLeak(scene.retainAt, scene);
    expect(final).toMatchObject({
      level: RESOURCE_FINAL_LEVEL,
      leakOpen: 0,
      inletRate: 0,
      leakRate: 0,
      escaped: 0.34,
    });
    for (const time of [5, 100, Number.MAX_VALUE])
      expect(sampleResourceLeak(time, scene)).toEqual(final);
  });

  it('does not depend on previous frames, including reverse and shuffled requests', () => {
    const order = [4.5, 0.5, 2.9, -1, 3.3, 1.25, 4.5, 0.5];
    const expected = order.map((time) => sampleResourceLeak(time, scene));
    for (const time of order.slice().reverse()) sampleResourceLeak(time, scene);
    expect(order.map((time) => sampleResourceLeak(time, scene))).toEqual(expected);
  });

  it('keeps the same bounded volumes for minimum and maximum accepted durations', () => {
    for (const [inflowAt, leakAt, sealAt, retainAt] of [
      [0.3, 0.85, 1.6, 2.6],
      [0.3, 2, 4.5, 7.3],
    ]) {
      const schedule = { ...scene, inflowAt, leakAt, sealAt, retainAt };
      for (let frame = 0; frame <= 500; frame++) {
        const pose = sampleResourceLeak(frame / 60, schedule);
        expect(pose.level).toBeGreaterThanOrEqual(RESOURCE_INITIAL_LEVEL);
        expect(pose.level).toBeLessThanOrEqual(RESOURCE_FINAL_LEVEL);
        expect(pose.level + pose.escaped - RESOURCE_INITIAL_LEVEL).toBeCloseTo(pose.incoming, 12);
      }
      expect(sampleResourceLeak(10, schedule)).toEqual(sampleResourceLeak(10, scene));
    }
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('fails to a finite resting pose for invalid time %s', (time) => {
    expect(sampleResourceLeak(time, scene)).toEqual(sampleResourceLeak(0, scene));
    for (const field of ['inflowAt', 'leakAt', 'sealAt', 'retainAt'] as const) {
      expect(sampleResourceLeak(2, { ...scene, [field]: time })).toEqual(
        sampleResourceLeak(0, scene),
      );
    }
  });

  it('does not simulate malformed or reversed timelines', () => {
    for (const patch of [
      { leakAt: scene.inflowAt },
      { sealAt: scene.leakAt },
      { retainAt: closedAt },
    ]) {
      expect(sampleResourceLeak(2, { ...scene, ...patch })).toEqual(sampleResourceLeak(0, scene));
    }
  });
});
