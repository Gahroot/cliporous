import { describe, expect, it } from 'vitest';
import { lerpPoint, sampleBezier, samplePolyline, transferPoint, type Vec3 } from './paths';

const curve = [
  [0, 0, 0],
  [0, 2, 0],
  [2, 2, 0],
  [2, 0, 0],
] as const;
const line = [
  [0, 0, 0],
  [3, 0, 0],
  [3, 9, 0],
] as const;
const from: Vec3 = [1, 2, 3];
const to: Vec3 = [5, 8, 9];

function expectUnit(tangent: Vec3): void {
  expect(tangent.every(Number.isFinite)).toBe(true);
  expect(Math.hypot(...tangent)).toBeCloseTo(1, 12);
}

describe('fixed authored paths', () => {
  it('interpolates all three coordinates with exact endpoints', () => {
    expect(lerpPoint(from, to, 0)).toEqual(from);
    expect(lerpPoint(from, to, 1)).toEqual(to);
    expect(lerpPoint(from, to, 0.5)).toEqual([3, 5, 6]);
    expect(lerpPoint(from, to, 2)).toEqual([9, 14, 15]);
  });

  it('samples a cubic with exact endpoints and the analytic midpoint', () => {
    expect(sampleBezier(curve, 0).position).toEqual(curve[0]);
    expect(sampleBezier(curve, 1).position).toEqual(curve[3]);
    expect(sampleBezier(curve, 0.5)).toEqual({ position: [1, 1.5, 0], tangent: [1, 0, 0] });
    expect(sampleBezier(curve, 0).tangent).toEqual([0, 1, 0]);
    expect(sampleBezier(curve, 1).tangent).toEqual([0, -1, 0]);
  });

  it('samples polylines by length rather than point index', () => {
    expect(samplePolyline(line, 0).position).toEqual(line[0]);
    expect(samplePolyline(line, 1).position).toEqual(line[2]);
    expect(samplePolyline(line, 0.5)).toEqual({ position: [3, 3, 0], tangent: [0, 1, 0] });
    expect(samplePolyline(line, 0.25).tangent).toEqual([1, 0, 0]);
    expect(
      samplePolyline(
        [
          [0, 0, 0],
          [0, 0, 2],
          [0, 6, 2],
        ],
        0.5,
      ).position,
    ).toEqual([0, 2, 2]);
  });

  it('normalizes tangents throughout 3D paths', () => {
    for (const t of [0, 0.01, 0.2, 0.5, 0.9, 1]) {
      expectUnit(sampleBezier([from, [3, -4, 5], [8, 2, 7], to], t).tangent);
      expectUnit(samplePolyline([from, [4, 6, 15], to], t).tangent);
    }
  });

  it('clamps finite path progress to exact endpoints', () => {
    expect(sampleBezier(curve, -1)).toEqual(sampleBezier(curve, 0));
    expect(sampleBezier(curve, 2)).toEqual(sampleBezier(curve, 1));
    expect(samplePolyline(line, -1)).toEqual(samplePolyline(line, 0));
    expect(samplePolyline(line, 2)).toEqual(samplePolyline(line, 1));
    expect(transferPoint(from, to, -1, 3)).toEqual(from);
    expect(transferPoint(from, to, 2, 3)).toEqual(to);
  });

  it('uses a deterministic finite +X tangent for coincident controls', () => {
    for (const t of [0, 0.2, 0.5, 1]) {
      for (const sample of [
        sampleBezier([from, from, from, from], t),
        samplePolyline([from, from], t),
      ]) {
        expect(sample).toEqual({ position: from, tangent: [1, 0, 0] });
        expectUnit(sample.tangent);
      }
    }
    expect(sampleBezier([from, from, to, to], 0).tangent).toEqual([1, 0, 0]);
    expect(sampleBezier([from, from, to, to], 1).tangent).toEqual([1, 0, 0]);
  });

  it('skips zero-length segments, including at both ends', () => {
    const repeated = [line[0], line[0], line[1], line[1], line[2], line[2]];
    for (const t of [0, 0.25, 0.5, 1]) {
      expect(samplePolyline(repeated, t)).toEqual(samplePolyline(line, t));
    }
  });

  it('enforces the 2..64 authored polyline bound and four cubic controls', () => {
    for (const count of [0, 1, 65]) {
      expect(() =>
        samplePolyline(
          Array.from({ length: count }, () => from),
          0,
        ),
      ).toThrow(RangeError);
    }
    const maximum = Array.from({ length: 64 }, (_, i): Vec3 => [i, 0, 0]);
    expect(samplePolyline(maximum, 0.5).position).toEqual([31.5, 0, 0]);
    for (const malformed of [[], [from, to], [...curve, to], null, new Array(4)]) {
      expect(() => sampleBezier(malformed as unknown as typeof curve, 0)).toThrow(RangeError);
    }
  });

  it('rejects malformed or nonfinite coordinates, even in unused controls', () => {
    const malformed: unknown[] = [null, [1, 2], [1, 2, 3, 4], ['1', 2, 3], new Array(3)];
    for (const value of [NaN, Infinity, -Infinity]) {
      malformed.push([value, 0, 0], [0, value, 0], [0, 0, value]);
    }
    for (const value of malformed) {
      const bad = value as Vec3;
      expect(() => lerpPoint(from, bad, 0)).toThrow(RangeError);
      expect(() => sampleBezier([from, from, bad, to], 0)).toThrow(RangeError);
      expect(() => samplePolyline([from, bad, to], 0)).toThrow(RangeError);
      expect(() => transferPoint(from, bad, 0)).toThrow(RangeError);
    }
  });

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite progress or lift: %s', (value) => {
    expect(() => lerpPoint(from, to, value)).toThrow(RangeError);
    expect(() => sampleBezier(curve, value)).toThrow(RangeError);
    expect(() => samplePolyline(line, value)).toThrow(RangeError);
    expect(() => transferPoint(from, to, value)).toThrow(RangeError);
    expect(() => transferPoint(from, to, 0, value)).toThrow(RangeError);
  });

  it('is seekable in shuffled order without modifying authored inputs', () => {
    for (const point of [...curve, ...line, from, to]) Object.freeze(point);
    Object.freeze(curve);
    Object.freeze(line);
    for (const sample of [
      (t: number) => sampleBezier(curve, t),
      (t: number) => samplePolyline(line, t),
      (t: number) => transferPoint(from, to, t, 3),
      (t: number) => lerpPoint(from, to, t),
    ]) {
      const expected = new Map([0, 0.25, 0.5, 0.75, 1].map((t) => [t, sample(t)]));
      for (const t of [0.75, 0, 1, 0.25, 0.5, 0.75]) expect(sample(t)).toEqual(expected.get(t));
    }
  });

  it('transfers on a continuous quadratic +Y arc with exact endpoints', () => {
    expect(transferPoint(from, to, 0, 3)).toEqual(from);
    expect(transferPoint(from, to, 1, 3)).toEqual(to);
    expect(transferPoint(from, to, 0.5, 3)).toEqual([3, 8, 6]);
    expect(transferPoint(from, to, 0.25, 3)).toEqual([2, 5.75, 4.5]);
    expect(transferPoint(from, to, 0.75, 3)).toEqual([4, 8.75, 7.5]);
    expect(transferPoint(from, to, 0.3)).toEqual(lerpPoint(from, to, 0.3));
    expect(() => transferPoint(from, to, 0.5, -1)).toThrow(RangeError);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const point = transferPoint(from, to, t, 3);
      for (const neighbor of [t - 1e-8, t + 1e-8]) {
        const nearby = transferPoint(from, to, neighbor, 3);
        nearby.forEach((coordinate, i) => {
          expect(coordinate).toBeCloseTo(point[i], 6);
        });
      }
    }
  });
});
