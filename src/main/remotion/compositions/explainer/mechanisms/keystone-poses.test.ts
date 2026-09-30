import { describe, expect, it } from 'vitest';
import {
  ARCH_BLOCK_IDS,
  ARCH_SIZE,
  archBlockAngle,
  archBlockOffset,
} from '../hero-props/structures-poses';
import { KEYSTONE_WITHDRAW_SECONDS, type KeystoneScene } from '../types';
import {
  KEYSTONE_INSERT_SECONDS,
  KEYSTONE_SIDE_HOLD_SECONDS,
  KEYSTONE_SUPPORT,
  type KeystonePose,
  sampleKeystone,
} from './keystone-poses';

const scene: KeystoneScene = {
  kind: 'keystone',
  label: 'The final piece',
  supportsAt: 0.3,
  blocksAt: 0.9,
  lockAt: 2.4,
  withdrawAt: 3,
};
const schedules: KeystoneScene[] = [
  { ...scene, supportsAt: 0.2, blocksAt: 0.6, lockAt: 1.5, withdrawAt: 1.95 },
  scene,
  { ...scene, supportsAt: 0.7, blocksAt: 1.3, lockAt: 4.9, withdrawAt: 6.7 },
];
const A = ARCH_SIZE;
const C = KEYSTONE_SUPPORT;
const sideIds = [0, 1, 2, 4, 5, 6] as const;
const allSeated = [1, 1, 1, 1, 1, 1, 1];
const sideSeated = [1, 1, 1, 0, 1, 1, 1];
const sweep = Array.from({ length: 481 }, (_, frame) => sampleKeystone(frame / 60, scene));
const numbers = (pose: KeystonePose): number[] => [
  ...pose.arch.seating,
  pose.supportY,
  pose.strutY,
];

function pairBoundaries(schedule: KeystoneScene): number[] {
  const sidesAt = schedule.lockAt - KEYSTONE_INSERT_SECONDS - KEYSTONE_SIDE_HOLD_SECONDS;
  return Array.from(
    { length: 4 },
    (_, i) => schedule.blocksAt + ((sidesAt - schedule.blocksAt) * i) / 3,
  );
}

describe('keystone causal assembly', () => {
  it.each(schedules)('holds the already-present centering through supportsAt ($lockAt)', (s) => {
    const initial = sampleKeystone(0, s);
    expect(initial.arch.seating).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(initial.supportY).toBe(A.baseY);
    for (const t of [-100, 0, s.supportsAt, (s.supportsAt + s.blocksAt) / 2, s.blocksAt]) {
      expect(sampleKeystone(t, s)).toEqual(initial);
    }
  });

  it.each(schedules)('seats exactly the bottom, middle, then upper pair ($lockAt)', (s) => {
    const boundaries = pairBoundaries(s);
    for (const pair of [0, 1, 2]) {
      const halfway = sampleKeystone((boundaries[pair] + boundaries[pair + 1]) / 2, s);
      for (const id of ARCH_BLOCK_IDS) {
        const rank = Math.min(id, 6 - id);
        expect(halfway.arch.seating[id]).toBeCloseTo(rank < pair ? 1 : rank === pair ? 0.5 : 0, 12);
      }
      const seated = sampleKeystone(boundaries[pair + 1], s);
      expect(seated.arch.seating[pair]).toBeCloseTo(1, 12);
      expect(seated.arch.seating[6 - pair]).toBe(seated.arch.seating[pair]);
    }
    const keyAt = s.lockAt - 0.3;
    expect(KEYSTONE_INSERT_SECONDS).toBe(0.3);
    expect(KEYSTONE_SIDE_HOLD_SECONDS).toBeGreaterThan(0);
    expect(sampleKeystone(keyAt - KEYSTONE_SIDE_HOLD_SECONDS / 2, s).arch.seating).toEqual(
      sideSeated,
    );
    expect(sampleKeystone(keyAt, s).arch.seating).toEqual(sideSeated);
  });

  it.each(
    schedules,
  )('lowers the center only during the last 0.3s and contacts at lockAt ($lockAt)', (s) => {
    expect(sampleKeystone(s.lockAt - 0.3, s).arch.seating[3]).toBe(0);
    const half = sampleKeystone(s.lockAt - 0.15, s);
    expect(half.arch.seating[3]).toBeCloseTo(0.5, 12);
    expect(archBlockOffset(3, half.arch.seating[3])[1]).toBeCloseTo(0.325, 12);
    for (const t of [s.lockAt - 0.299, s.lockAt - 0.15, s.lockAt - 1e-6]) {
      const pose = sampleKeystone(t, s);
      expect(pose.arch.seating[3]).toBeGreaterThan(0);
      expect(pose.arch.seating[3]).toBeLessThan(1);
      const [x, y, z] = archBlockOffset(3, pose.arch.seating[3]);
      expect(x).toBeCloseTo(0, 12);
      expect(y).toBeGreaterThan(0);
      expect(z).toBe(0);
      for (const id of sideIds) expect(pose.arch.seating[id]).toBe(1);
      expect(pose.supportY).toBe(A.baseY);
    }
    expect(sampleKeystone(s.lockAt, s).arch.seating).toEqual(allSeated);
    for (const id of ARCH_BLOCK_IDS) {
      // A zero radial offset can carry a negative sign on the left half of the arch.
      expect(archBlockOffset(id, 1).every((coordinate) => coordinate === 0)).toBe(true);
    }
  });

  it.each(schedules)('has bounded monotone, symmetric seating at 24/30/60fps ($lockAt)', (s) => {
    for (const fps of [24, 30, 60]) {
      let previous = sampleKeystone(0, s);
      for (let frame = 0; frame <= 8 * fps; frame++) {
        const pose = sampleKeystone(frame / fps, s);
        expect(numbers(pose).every(Number.isFinite)).toBe(true);
        for (const id of ARCH_BLOCK_IDS) {
          expect(pose.arch.seating[id]).toBeGreaterThanOrEqual(previous.arch.seating[id]);
          expect(pose.arch.seating[id]).toBeLessThanOrEqual(1);
          expect(pose.arch.seating[id]).toBe(pose.arch.seating[6 - id]);
        }
        expect(pose.arch.seating[0]).toBeGreaterThanOrEqual(pose.arch.seating[1]);
        expect(pose.arch.seating[1]).toBeGreaterThanOrEqual(pose.arch.seating[2]);
        if (pose.arch.seating[3] > 0) {
          for (const id of sideIds) expect(pose.arch.seating[id]).toBe(1);
        }
        expect(pose.supportY).toBeLessThanOrEqual(previous.supportY);
        expect(pose.supportY).toBeGreaterThanOrEqual(A.baseY - C.drop);
        if (pose.supportY < A.baseY) expect(pose.arch.seating).toEqual(allSeated);
        previous = pose;
      }
    }
  });

  it.each([
    0, 2.3, 2.4, 2.6, 2.85, 3, 4,
  ])('interlocks direct withdrawAt=%s until lock + 0.45 AND the requested beat', (withdrawAt) => {
    const s = { ...scene, withdrawAt };
    const releaseAt = Math.max(withdrawAt, s.lockAt + 0.45);
    for (const t of [0, s.supportsAt, s.blocksAt, s.lockAt, s.lockAt + 0.44, releaseAt]) {
      const pose = sampleKeystone(t, s);
      expect(pose.supportY).toBe(A.baseY);
      expect(pose.strutY).toBe(sampleKeystone(0, s).strutY);
    }
    expect(sampleKeystone(releaseAt + 0.01, s).supportY).toBeLessThan(A.baseY);
    expect(KEYSTONE_WITHDRAW_SECONDS).toBe(0.45);
    expect(sampleKeystone(releaseAt + 0.225, s).supportY).toBeCloseTo(A.baseY - C.drop / 2, 12);
    expect(sampleKeystone(releaseAt + 0.45 - 1e-6, s).supportY).toBeGreaterThan(A.baseY - C.drop);
    expect(sampleKeystone(releaseAt + 0.45, s).supportY).toBe(A.baseY - C.drop);
  });
});

describe('keystone part clearance in ArchRig coordinates', () => {
  // These fixed pillar/foot dimensions are the RoundedBlocks in structures.tsx:117-125.
  const pillarInnerX = (A.innerRadius + A.outerRadius) / 2 - 0.344 / 2;
  const foundationInnerX = (A.innerRadius + A.outerRadius) / 2 - 0.55 / 2;
  const foundationTopY = A.baseY - 0.7 + 0.12 / 2;
  const halfWedge = (Math.PI / ARCH_BLOCK_IDS.length - A.seamRadians) / 2;
  // Conservative allowance for inner-arc facets and mitered bevel corners.
  const bevelEnvelope = A.bevel / Math.cos(halfWedge);
  const openingRadius = A.innerRadius * Math.cos(halfWedge / 8) - bevelEnvelope;
  const inner = C.outerRadius - C.thickness;
  // Bound both curved edges and the flat-bottomed shoes used by KeystoneScene's Shape.
  const supportBoundary: [number, number][] = [C.outerRadius, inner].flatMap((radius) =>
    Array.from({ length: 65 }, (_, i): [number, number] => {
      const angle = C.endAngle + ((Math.PI - 2 * C.endAngle) * i) / 64;
      return [radius * Math.cos(angle), radius * Math.sin(angle)];
    }),
  );
  for (const side of [-1, 1]) {
    for (const edge of [-1, 1]) {
      const x = side * C.strutX + edge * C.shoeHalfWidth;
      supportBoundary.push([x, C.shoeBottom], [x, Math.sqrt(inner ** 2 - x ** 2)]);
    }
  }

  it('keeps all seven moving wedges in disjoint sectors and above the pillars', () => {
    for (const pose of sweep) {
      for (const id of ARCH_BLOCK_IDS) {
        const [dx, dy] = archBlockOffset(id, pose.arch.seating[id]);
        const low = (id * Math.PI) / 7;
        const high = ((id + 1) * Math.PI) / 7;
        for (const radius of [A.innerRadius, A.outerRadius]) {
          for (const angle of [archBlockAngle(id) - halfWedge, archBlockAngle(id) + halfWedge]) {
            const x = dx + radius * Math.cos(angle);
            const y = dy + radius * Math.sin(angle);
            expect(Math.cos(low) * y - Math.sin(low) * x).toBeGreaterThan(bevelEnvelope);
            expect(Math.sin(high) * x - Math.cos(high) * y).toBeGreaterThan(bevelEnvelope);
            expect(y - bevelEnvelope).toBeGreaterThan(0);
          }
        }
      }
    }
    // The seated key has the rig's narrow construction seam, not literal solid overlap.
    const seam = 2 * A.innerRadius * Math.sin(A.seamRadians / 2) - 2 * A.bevel;
    expect(seam).toBeGreaterThan(0);
    expect(seam).toBeLessThan(0.01);
  });

  it('keeps the curved centering and shoes inside the arch, between pillars and above their bases', () => {
    expect(C.thickness).toBeGreaterThan(0);
    expect(C.depth).toBeGreaterThan(2 * C.strutRadius);
    // For every arc angle, radius is largest at an end. Squared distance is convex
    // in vertical travel, so these endpoint bounds cover the continuous sweep too.
    for (const radius of [inner, C.outerRadius]) {
      const loweredEnd = Math.hypot(
        radius * Math.cos(C.endAngle),
        radius * Math.sin(C.endAngle) - C.drop,
      );
      expect(Math.max(radius, loweredEnd)).toBeLessThan(openingRadius);
    }
    expect(A.baseY - C.drop + Math.min(inner * Math.sin(C.endAngle), C.shoeBottom)).toBeGreaterThan(
      foundationTopY,
    );
    expect(Math.max(C.outerRadius * Math.cos(C.endAngle), C.strutX + C.shoeHalfWidth)).toBeLessThan(
      pillarInnerX,
    );
    expect(C.strutX + C.shoeHalfWidth).toBeLessThan(inner);
    expect(C.shoeBottom).toBeLessThan(Math.sqrt(inner ** 2 - (C.strutX + C.shoeHalfWidth) ** 2));
    for (const pose of sweep) {
      for (const [x, localY] of supportBoundary) {
        const y = pose.supportY + localY;
        // Chords and shoe interiors are convex combinations of these boundary points.
        expect(Math.hypot(x, y - A.baseY)).toBeLessThan(openingRadius);
        expect(Math.abs(x)).toBeLessThan(pillarInnerX);
        expect(y).toBeGreaterThan(foundationTopY);
      }
    }
    const final = sweep[sweep.length - 1];
    expect(final.supportY + C.outerRadius).toBeGreaterThan(foundationTopY);
    expect(A.baseY + A.innerRadius - (final.supportY + C.outerRadius)).toBeGreaterThan(0.4);
  });

  it('keeps rigid struts engaged in hollow sleeves, touching shoes but never crossing the foot plates', () => {
    expect(C.strutRadius).toBeLessThan(C.sleeveBore * Math.cos(Math.PI / 24));
    expect(C.sleeveBore).toBeLessThan(C.sleeveRadius);
    expect(C.strutRadius).toBeLessThan(C.shoeHalfWidth);
    expect(C.sleeveRadius).toBeLessThanOrEqual(C.shoeHalfWidth);
    expect(C.strutX + C.sleeveRadius).toBeLessThan(pillarInnerX);
    expect(C.strutX + C.footWidth / 2).toBeLessThan(foundationInnerX);
    expect(C.sleeveBottomY).toBeGreaterThan(C.footBottomY);
    expect(C.footBottomY).toBeCloseTo(A.baseY - 0.7 - 0.12 / 2, 12);
    expect(C.sleeveTopY).toBeLessThan(A.baseY); // Sleeves stay below every wedge.
    for (const pose of sweep) {
      const top = pose.strutY + C.strutLength / 2;
      const bottom = pose.strutY - C.strutLength / 2;
      expect(top - bottom).toBeCloseTo(C.strutLength, 12);
      expect(top).toBeCloseTo(pose.supportY + C.shoeBottom, 12);
      expect(top).toBeGreaterThan(C.sleeveTopY);
      expect(bottom).toBeLessThan(C.sleeveTopY);
      expect(bottom).toBeGreaterThan(C.sleeveBottomY);
      // Even the rods' outer corners above springline stay inside the stone opening.
      if (top > A.baseY) {
        expect(Math.hypot(C.strutX + C.strutRadius, top - A.baseY)).toBeLessThan(openingRadius);
      }
    }
  });
});

describe('keystone seekability and exact final hold', () => {
  it.each(schedules)('has continuous transforms at every causal boundary ($lockAt)', (s) => {
    const boundaries = [
      s.supportsAt,
      ...pairBoundaries(s),
      s.lockAt - 0.3,
      s.lockAt,
      s.withdrawAt,
      s.withdrawAt + 0.45,
    ];
    for (const t of boundaries) {
      const before = numbers(sampleKeystone(t - 1e-7, s));
      const after = numbers(sampleKeystone(t + 1e-7, s));
      after.forEach((value, i) => {
        expect(value).toBeCloseTo(before[i], 8);
      });
    }
  });

  it.each(
    schedules,
  )('holds the exact settled arch and still-visible lowered support indefinitely ($lockAt)', (s) => {
    const settledAt = s.withdrawAt + KEYSTONE_WITHDRAW_SECONDS;
    const final = sampleKeystone(settledAt, s);
    expect(final).toEqual({
      arch: { seating: allSeated },
      supportY: A.baseY - C.drop,
      strutY: A.baseY - C.drop + C.shoeBottom - C.strutLength / 2,
    });
    for (const t of [settledAt, settledAt + 0.25, s.withdrawAt + 0.95, 8, 100, Number.MAX_VALUE]) {
      expect(sampleKeystone(t, s)).toEqual(final);
    }
  });

  it('returns identical finite poses for shuffled, repeated and reversed frame requests', () => {
    const times = [
      -Number.MAX_VALUE,
      -1,
      0,
      0.3,
      0.9,
      1.1,
      1.7,
      2.1,
      2.25,
      2.4,
      3,
      3.225,
      3.45,
      8,
      Number.MAX_VALUE,
    ];
    const expected = times.map((t) => sampleKeystone(t, scene));
    for (const i of [14, 0, 8, 3, 11, 1, 13, 5, 9, 7, 12, 4, 10, 2, 6, 8, 11]) {
      const actual = sampleKeystone(times[i], scene);
      expect(actual).toEqual(expected[i]);
      expect(numbers(actual).every(Number.isFinite)).toBe(true);
    }
    for (let i = times.length - 1; i >= 0; i--)
      expect(sampleKeystone(times[i], scene)).toEqual(expected[i]);
  });

  it.each([
    Number.NaN,
    Infinity,
    -Infinity,
  ])('rests at finite setup for invalid time or beat %s', (bad) => {
    const initial = sampleKeystone(0, scene);
    expect(sampleKeystone(bad, scene)).toEqual(initial);
    for (const field of ['supportsAt', 'blocksAt', 'lockAt', 'withdrawAt'] as const) {
      expect(sampleKeystone(4, { ...scene, [field]: bad })).toEqual(initial);
    }
  });

  it('fails closed for reversed/compressed assembly and negative withdrawal beats', () => {
    for (const patch of [
      { supportsAt: -0.1 },
      { blocksAt: scene.supportsAt },
      { lockAt: scene.blocksAt + 0.3 },
      { withdrawAt: -0.1 },
    ]) {
      expect(sampleKeystone(8, { ...scene, ...patch })).toEqual(sampleKeystone(0, scene));
    }
  });
});
