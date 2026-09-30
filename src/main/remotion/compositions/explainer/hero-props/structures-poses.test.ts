import { describe, expect, it } from 'vitest';
import { HERO_CATALOG, STRUCTURE_TIMING } from '../hero-catalog';
import {
  ARCH_BLOCK_IDS,
  ARCH_SIZE,
  archBlockAngle,
  archBlockOffset,
  BRIDGE_SIZE,
  bridgePoint,
  sampleArch,
  sampleBridge,
} from './structures-poses';

describe('hinged bridge contact', () => {
  it('lowers monotonically and meets exactly at the catalog contact time', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let frame = 0; frame < 150; frame++) {
      const pose = sampleBridge(frame / 60);
      expect(pose.angle).toBeLessThanOrEqual(previous);
      expect(pose.angle).toBeGreaterThanOrEqual(0);
      const left = bridgePoint(-1, pose.angle, BRIDGE_SIZE.halfSpan, BRIDGE_SIZE.top);
      const right = bridgePoint(1, pose.angle, BRIDGE_SIZE.halfSpan, BRIDGE_SIZE.top);
      expect(left[0]).toBeLessThanOrEqual(0);
      expect(right[0]).toBeGreaterThanOrEqual(0);
      expect(left[1]).toBe(right[1]);
      previous = pose.angle;
    }
    const at = STRUCTURE_TIMING.bridge;
    expect(HERO_CATALOG.bridge.impactSec).toBe(at);
    expect(sampleBridge(at)).toEqual({ angle: 0 });
    const target = [0, BRIDGE_SIZE.pivotY + BRIDGE_SIZE.top, 0];
    expect(bridgePoint(1, 0, BRIDGE_SIZE.halfSpan, BRIDGE_SIZE.top)).toEqual(target);
    const left = bridgePoint(-1, 0, BRIDGE_SIZE.halfSpan, BRIDGE_SIZE.top);
    expect(left[0]).toBeCloseTo(0, 12);
    expect(left[1]).toBe(target[1]);
  });

  it('keeps the chamfered deck noses and rails from crossing during the complete swing', () => {
    const B = BRIDGE_SIZE;
    for (let step = 0; step <= 200; step++) {
      const angle = (0.82 * step) / 200;
      for (const [x, y] of [
        [0, B.bottom],
        [B.halfSpan - B.noseInset, B.bottom],
        [B.halfSpan, B.top],
        [B.halfSpan, B.top + 0.34],
      ]) {
        expect(bridgePoint(-1, angle, x, y)[0]).toBeLessThanOrEqual(0);
        expect(bridgePoint(1, angle, x, y)[0]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('does not move either hinge while rotating its leaf', () => {
    for (let t = 0; t < 2; t += 0.05) {
      for (const side of [-1, 1] as const)
        expect(bridgePoint(side, sampleBridge(t).angle, 0, 0)).toEqual([
          side * BRIDGE_SIZE.halfSpan,
          BRIDGE_SIZE.pivotY,
          0,
        ]);
    }
  });

  it('is continuous before and after setup and final contact', () => {
    for (const t of [0.3, STRUCTURE_TIMING.bridge])
      expect(sampleBridge(t - 1e-6).angle).toBeCloseTo(sampleBridge(t + 1e-6).angle, 8);
  });
});

describe('radial arch assembly', () => {
  it('seats symmetric side pairs before the central keystone starts moving', () => {
    for (let frame = 0; frame < 150; frame++) {
      const pose = sampleArch(frame / 60);
      expect(pose.seating).toHaveLength(7);
      expect(pose.seating[0]).toBe(pose.seating[6]);
      expect(pose.seating[1]).toBe(pose.seating[5]);
      expect(pose.seating[2]).toBe(pose.seating[4]);
      expect(pose.seating[0]).toBeGreaterThanOrEqual(pose.seating[1]);
      expect(pose.seating[1]).toBeGreaterThanOrEqual(pose.seating[2]);
      if (pose.seating[3] > 0)
        for (const id of [0, 1, 2, 4, 5, 6] as const) expect(pose.seating[id]).toBe(1);
    }
    expect(HERO_CATALOG.arch.impactSec).toBe(STRUCTURE_TIMING.arch);
    expect(sampleArch(STRUCTURE_TIMING.arch).seating).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('keeps all blocks in disjoint authored sectors while they seat', () => {
    const A = ARCH_SIZE;
    const half = (Math.PI / ARCH_BLOCK_IDS.length - A.seamRadians) / 2;
    for (let frame = 0; frame <= 100; frame++) {
      const pose = sampleArch(frame / 60);
      for (const id of ARCH_BLOCK_IDS) {
        const [dx, dy] = archBlockOffset(id, pose.seating[id]);
        const low = (id * Math.PI) / ARCH_BLOCK_IDS.length;
        const high = ((id + 1) * Math.PI) / ARCH_BLOCK_IDS.length;
        for (const r of [A.innerRadius, A.outerRadius]) {
          for (const theta of [archBlockAngle(id) - half, archBlockAngle(id) + half]) {
            const x = dx + r * Math.cos(theta);
            const y = dy + r * Math.sin(theta);
            expect(Math.cos(low) * y - Math.sin(low) * x).toBeGreaterThan(A.bevel);
            expect(Math.sin(high) * x - Math.cos(high) * y).toBeGreaterThan(A.bevel);
          }
        }
      }
    }
  });

  it('leaves only a narrow construction seam between final mating faces', () => {
    for (const r of [ARCH_SIZE.innerRadius, ARCH_SIZE.outerRadius]) {
      const gap = 2 * r * Math.sin(ARCH_SIZE.seamRadians / 2) - 2 * ARCH_SIZE.bevel;
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(0.01);
    }
    for (const id of ARCH_BLOCK_IDS)
      expect(archBlockOffset(id, 1).every((x) => x === 0)).toBe(true);
  });

  it('keeps the keystone directly over its final opening throughout insertion', () => {
    for (let step = 0; step <= 100; step++) {
      const [x, y, z] = archBlockOffset(3, step / 100);
      expect(x).toBeCloseTo(0, 12);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(z).toBe(0);
    }
  });

  it('has continuous part transforms at every phase boundary', () => {
    for (const at of [0.3, 0.48, 0.52, 0.66, 0.7, 0.88, 0.96, STRUCTURE_TIMING.arch]) {
      const a = sampleArch(at - 1e-7);
      const b = sampleArch(at + 1e-7);
      ARCH_BLOCK_IDS.forEach((id) => {
        expect(a.seating[id]).toBeCloseTo(b.seating[id], 5);
      });
    }
  });
});

describe('structure seekability', () => {
  it.each([
    -100,
    -Number.MAX_VALUE,
    Number.NaN,
    Infinity,
    -Infinity,
  ])('rests at finite setup on invalid or pre-action time %s', (t) => {
    expect(sampleBridge(t)).toEqual(sampleBridge(0));
    expect(sampleArch(t)).toEqual(sampleArch(0));
  });
  it('holds exact final transforms indefinitely', () => {
    for (const t of [3, 100, Number.MAX_VALUE]) {
      expect(sampleBridge(t)).toEqual(sampleBridge(STRUCTURE_TIMING.bridge));
      expect(sampleArch(t)).toEqual(sampleArch(STRUCTURE_TIMING.arch));
    }
  });
  it('is independent of reversed and shuffled frame requests', () => {
    const order = [3, 0.4, 0.9, -1, 1.15, 0.5, 1.3];
    const a = order.map((t) => [sampleBridge(t), sampleArch(t)]);
    for (const t of order.slice().reverse()) {
      sampleBridge(t);
      sampleArch(t);
    }
    expect(order.map((t) => [sampleBridge(t), sampleArch(t)])).toEqual(a);
  });
});
