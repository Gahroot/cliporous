import { describe, expect, it } from 'vitest';
import type { BusinessClock } from '../motion';
import { RETAIL_ASSET_IDS, type RetailAssetParams, sampleRetailAssets } from './retail-poses';

const beats = Object.freeze({
  setupAt: 0.25,
  actionAt: 1.25,
  responseAt: 3.25,
  checkAt: 5.25,
  resolveAt: 7.25,
});
const clock = (t: number): BusinessClock => ({ frame: t * 30, fps: 30, beats });
const boundaryTimes = Object.values(beats).flatMap((at) => [at - 1 / 30, at, at + 1 / 30]);
const times = [-3, 0, ...boundaryTimes, 2.25, 4.25, 8, 20];

function opens(pose: RetailAssetParams): number[] {
  return [pose['A-01'].open, pose['A-03'].open];
}

function expectBounded(pose: RetailAssetParams): void {
  expect(Object.keys(pose)).toEqual(RETAIL_ASSET_IDS);
  for (const value of opens(pose)) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
  expect(typeof pose['A-02'].occupied).toBe('boolean');
  expect(typeof pose['A-04'].pending).toBe('boolean');
}

describe('retail pure frame-seekable asset parameters', () => {
  it('starts closed and conservatively retains omitted occupancy/pending facts', () => {
    for (const t of [-3, 0, beats.setupAt, beats.actionAt]) {
      expect(sampleRetailAssets(clock(t))).toEqual({
        'A-01': { open: 0 },
        'A-02': { occupied: false },
        'A-03': { open: 0 },
        'A-04': { pending: true },
      });
    }
  });

  it('uses the authored smooth reveal intervals rather than converting inspection into success', () => {
    expect(opens(sampleRetailAssets(clock(beats.responseAt)))).toEqual([0.5, 0]);
    expect(opens(sampleRetailAssets(clock(4.25)))).toEqual([0.84375, 0.5]);
    expect(opens(sampleRetailAssets(clock(beats.checkAt)))).toEqual([1, 1]);
    for (let frame = -30; frame <= 300; frame++) {
      const before = sampleRetailAssets({ ...clock(0), frame });
      const after = sampleRetailAssets({ ...clock(0), frame: frame + 1 });
      expectBounded(before);
      opens(after).forEach((value, index) => {
        expect(value).toBeGreaterThanOrEqual(opens(before)[index]);
      });
    }
  });

  it('is identical on repeated, backward and deterministic shuffled seeks', () => {
    const states = Object.freeze({ occupied: true, pending: true });
    const original = new Map(times.map((t) => [t, sampleRetailAssets(clock(t), states)]));
    const shuffled = [
      ...times.filter((_, index) => index % 2 === 1),
      ...times.filter((_, index) => index % 2 === 0).reverse(),
    ];
    for (const t of [...times, ...[...times].reverse(), ...shuffled, ...times]) {
      const actual = sampleRetailAssets(clock(t), states);
      expect(actual).toEqual(original.get(t));
      expectBounded(actual);
    }
  });

  it('stays continuous and bounded immediately around every exact beat', () => {
    for (const at of Object.values(beats)) {
      const before = sampleRetailAssets(clock(at - 1e-7));
      const exact = sampleRetailAssets(clock(at));
      const after = sampleRetailAssets(clock(at + 1e-7));
      for (const pose of [before, exact, after]) expectBounded(pose);
      opens(before).forEach((value, index) => {
        expect(Math.abs(value - opens(after)[index])).toBeLessThan(1e-5);
      });
    }
  });

  it('settles by resolveAt and remains unchanged throughout the final reading hold', () => {
    for (const occupied of [false, true]) {
      for (const pending of [false, true]) {
        const states = Object.freeze({ occupied, pending });
        const resolved = sampleRetailAssets(clock(beats.resolveAt), states);
        expect(opens(resolved)).toEqual([1, 1]);
        for (const t of [beats.resolveAt + 1 / 30, 8, 12, 20, 100_000]) {
          expect(sampleRetailAssets(clock(t), states)).toEqual(resolved);
        }
      }
    }
  });

  it('preserves every supplied state and never mutates source facts or beats', () => {
    for (const occupied of [false, true]) {
      for (const pending of [false, true]) {
        const states = Object.freeze({ occupied, pending });
        for (const t of times) {
          const input = Object.freeze(clock(t));
          const original = structuredClone({ input, states });
          const actual = sampleRetailAssets(input, states);
          expect(actual['A-02']).toEqual({ occupied });
          expect(actual['A-04']).toEqual({ pending });
          expect({ input, states }).toEqual(original);
        }
      }
    }
  });

  it('returns independent model parameter objects without mutable output aliases', () => {
    const states = Object.freeze({ occupied: false, pending: true });
    const expected = sampleRetailAssets(clock(4.25), states);
    const changed = sampleRetailAssets(clock(4.25), states);
    changed['A-01'].open = 99;
    changed['A-02'].occupied = true;
    changed['A-03'].open = -99;
    changed['A-04'].pending = false;
    expect(sampleRetailAssets(clock(4.25), states)).toEqual(expected);
    expect(states).toEqual({ occupied: false, pending: true });
  });

  it('keeps nonfinite clocks, overflow and malformed beat probes finite and bounded', () => {
    const probes: BusinessClock[] = [
      { ...clock(8), fps: 0 },
      { ...clock(8), fps: -30 },
      { ...clock(8), frame: Number.MAX_VALUE, fps: Number.MIN_VALUE },
    ];
    for (const bad of [NaN, Infinity, -Infinity]) {
      probes.push({ ...clock(8), frame: bad }, { ...clock(8), fps: bad });
      for (const key of Object.keys(beats) as (keyof typeof beats)[]) {
        probes.push({ ...clock(8), beats: { ...beats, [key]: bad } });
      }
    }
    probes.push({ ...clock(8), beats: { ...beats, checkAt: beats.responseAt } });
    for (const probe of probes) {
      const actual = sampleRetailAssets(probe, { occupied: false, pending: true });
      expectBounded(actual);
      expect(actual['A-02'].occupied).toBe(false);
      expect(actual['A-04'].pending).toBe(true);
      expect(sampleRetailAssets(probe, { occupied: false, pending: true })).toEqual(actual);
    }
  });
});
