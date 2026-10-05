import { describe, expect, it } from 'vitest';
import type { BusinessClock } from '../motion';
import { type FundAssetsPose, sampleFundAssets } from './funds-poses';

const beats = Object.freeze({
  setupAt: 0.4,
  actionAt: 1.2,
  responseAt: 2.6,
  checkAt: 4.1,
  resolveAt: 5.7,
}) satisfies BusinessClock['beats'];
const initial: FundAssetsPose = {
  open: 0,
  tierReveals: [0, 0, 0, 0],
  maturityReveal: 0,
  separation: 0,
};
const settled: FundAssetsPose = {
  open: 1,
  tierReveals: [1, 1, 1, 1],
  maturityReveal: 1,
  separation: 1,
};

function clock(time: number, fps = 30): BusinessClock {
  return Object.freeze({ frame: time * fps, fps, beats });
}
function expectBounded(pose: FundAssetsPose): void {
  expect(pose.tierReveals).toHaveLength(4);
  for (const value of [pose.open, ...pose.tierReveals, pose.maturityReveal, pose.separation]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
}

const tierDuration = (beats.resolveAt - beats.responseAt) / 4;
const boundaries = [
  ...Object.values(beats),
  ...[0, 1, 2, 3, 4].map((index) => beats.responseAt + index * tierDuration),
];
const times = [
  -10,
  0,
  ...boundaries.flatMap((at) => [at - 0.000001, at, at + 0.000001]),
  ...Array.from({ length: 241 }, (_, frame) => frame / 30),
  1000,
];

describe('fund asset presentation poses (no source facts)', () => {
  it('is unopened and unrevealed before the action', () => {
    for (const time of [-10, 0, beats.setupAt, beats.actionAt]) {
      expect(sampleFundAssets(clock(time))).toEqual(initial);
    }
  });

  it('settles the folio, rights and maturity reveal at their authored boundaries', () => {
    const response = sampleFundAssets(clock(beats.responseAt));
    expect(response.open).toBe(1);
    expect(response.separation).toBe(0);
    expect(response.tierReveals).toEqual([0, 0, 0, 0]);
    const check = sampleFundAssets(clock(beats.checkAt));
    expect(check.separation).toBe(1);
    expect(check.maturityReveal).toBe(0);
    expect(sampleFundAssets(clock(beats.resolveAt))).toEqual(settled);
  });

  it('reveals the four tier slots in order without supplying their fills', () => {
    for (const completed of [0, 1, 2, 3, 4]) {
      const time = beats.responseAt + completed * tierDuration;
      const pose = sampleFundAssets(clock(time));
      pose.tierReveals.forEach((value, index) => {
        expect(value).toBeCloseTo(index < completed ? 1 : 0, 12);
      });
    }
    const halfway = sampleFundAssets(clock(beats.responseAt + tierDuration / 2));
    expect(halfway.tierReveals[0]).toBeCloseTo(0.5, 12);
    expect(halfway.tierReveals.slice(1)).toEqual([0, 0, 0]);
  });

  it.each([
    24, 30, 60,
  ])('is finite and bounded at boundaries and sampled frames at %i fps', (fps) => {
    for (const time of times) expectBounded(sampleFundAssets(clock(time, fps)));
  });

  it('is identical on repeated, backward and deterministically shuffled seeks', () => {
    const reference = new Map(times.map((time) => [time, sampleFundAssets(clock(time))]));
    const shuffled = [
      ...times.filter((_, index) => index % 2 === 1).reverse(),
      ...times.filter((_, index) => index % 2 === 0),
    ];
    for (const order of [times, [...times].reverse(), shuffled]) {
      for (const time of order) {
        expect(sampleFundAssets(clock(time))).toEqual(reference.get(time));
        expect(sampleFundAssets(clock(time))).toEqual(reference.get(time));
      }
    }
  });

  it('has an unchanged final reading hold beginning at resolveAt', () => {
    for (const fps of [24, 30, 60]) {
      for (const time of [beats.resolveAt, beats.resolveAt + 1 / fps, 10, 1000, 1000000]) {
        expect(sampleFundAssets(clock(time, fps))).toEqual(settled);
      }
    }
  });

  it('does not mutate the clock or retain mutable output between calls', () => {
    const input = clock(3);
    const before = { ...input, beats: { ...input.beats } };
    const expected = sampleFundAssets(input);
    const altered = sampleFundAssets(input);
    Reflect.set(altered, 'open', 99);
    Reflect.set(altered.tierReveals, 0, 99);
    expect(input).toEqual(before);
    expect(sampleFundAssets(input)).toEqual(expected);
  });

  it('leaves contributions, exact amounts, dates, focus and liquidity to the source-valid pack', () => {
    for (const time of [-1, 3, 1000]) {
      const pose = sampleFundAssets(clock(time));
      expect(Object.keys(pose).sort()).toEqual([
        'maturityReveal',
        'open',
        'separation',
        'tierReveals',
      ]);
      for (const fact of [
        'contributed',
        'fills',
        'amounts',
        'dates',
        'focus',
        'liquid',
        'fee',
        'irr',
      ]) {
        expect(pose).not.toHaveProperty(fact);
      }
    }
  });

  it('keeps non-finite or invalid clock probes bounded', () => {
    const probes: BusinessClock[] = [
      ...[Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map((frame) => ({
        frame,
        fps: 30,
        beats,
      })),
      ...[0, -30, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map((fps) => ({
        frame: 90,
        fps,
        beats,
      })),
      { frame: Number.MAX_VALUE, fps: Number.MIN_VALUE, beats },
    ];
    for (const input of probes) expectBounded(sampleFundAssets(input));
  });

  it('keeps collapsed, reversed and non-finite beat probes bounded', () => {
    const probes = [
      { setupAt: 2, actionAt: 2, responseAt: 2, checkAt: 2, resolveAt: 2 },
      { setupAt: 5, actionAt: 4, responseAt: 3, checkAt: 2, resolveAt: 1 },
      ...Object.keys(beats).map((key) => ({ ...beats, [key]: Number.NaN })),
      ...Object.keys(beats).map((key) => ({ ...beats, [key]: Number.POSITIVE_INFINITY })),
    ];
    for (const probe of probes) {
      for (const time of [-1, 0, 1, 2, 6, 1000]) {
        expectBounded(sampleFundAssets({ frame: time * 30, fps: 30, beats: probe }));
      }
    }
    expect(sampleFundAssets({ frame: 60, fps: 30, beats: probes[0] })).toEqual(settled);
  });
});
