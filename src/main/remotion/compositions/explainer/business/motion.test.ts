import { describe, expect, it } from 'vitest';
import { diagramPose } from '../diagrams/motion';
import {
  type BusinessClock,
  businessPhases,
  sampleAlternatives,
  sampleBusinessHandoff,
  sampleConditionClamp,
  sampleConservedParts,
  sampleConstraintFocus,
  sampleHandshake,
  sampleObservationOverlay,
  samplePriorityFill,
  sampleProvenance,
  sampleScaleLens,
  sampleSnapshots,
  sampleTaskSplit,
} from './motion';

const beats = { setupAt: 0, actionAt: 1, responseAt: 3, checkAt: 5, resolveAt: 7 };
const clock = (frame: number): BusinessClock => ({ frame, fps: 30, beats });
const ids = ['review', 'book', 'deliver'];
const parts = [
  { id: 'operator', amount: 60 },
  { id: 'supplier', amount: 30 },
  { id: 'retained', amount: 10 },
];
const snapshots = [
  { id: 'one', date: 'January' },
  { id: 'two', date: 'March' },
  { id: 'three', date: 'May' },
];
const tiers = [
  { id: 'first', amount: 60, ceiling: 60 },
  { id: 'second', amount: 20, ceiling: 40 },
];

function samples(c: BusinessClock): unknown[] {
  return [
    businessPhases(c),
    sampleTaskSplit(c, ids),
    sampleConservedParts(c, 100, parts),
    sampleConstraintFocus(c, ids, 'book'),
    sampleBusinessHandoff(c),
    sampleObservationOverlay(c),
    sampleSnapshots(c, snapshots),
    sampleScaleLens(c, ids),
    sampleAlternatives(c, ids),
    sampleHandshake(c, 'pending'),
    sampleHandshake(c, 'approved'),
    sampleHandshake(c, 'denied'),
    samplePriorityFill(c, tiers),
    sampleProvenance(c, ids),
    sampleConditionClamp(c, 'satisfied'),
    sampleConditionClamp(c, 'blocked'),
    sampleConditionClamp(c, 'unknown'),
  ];
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

describe('all twelve pure business treatment samples', () => {
  it('is finite, repeatable and independent of forward, backward and shuffled seek order', () => {
    const frames = [-30, 0, 1, 29, 30, 31, 89, 90, 91, 149, 150, 151, 209, 210, 211, 239, 240, 600];
    const original = new Map(frames.map((frame) => [frame, samples(clock(frame))]));
    for (const frame of [...frames, ...[...frames].reverse(), 90, 0, 210, 30, 211, 89]) {
      const actual = samples(clock(frame));
      expect(actual).toEqual(original.get(frame));
      expect(numbers(actual).every(Number.isFinite)).toBe(true);
    }
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(numbers(samples(clock(bad))).every(Number.isFinite)).toBe(true);
      expect(numbers(samples({ ...clock(90), fps: bad })).every(Number.isFinite)).toBe(true);
    }
    expect(
      numbers(samples({ ...clock(Number.MAX_VALUE), fps: Number.MIN_VALUE })).every(
        Number.isFinite,
      ),
    ).toBe(true);
  });
  it('settles by the resolution for the whole final reading hold', () => {
    const after = samples(clock(210));
    for (const frame of [211, 240, 300, 600]) {
      // The time itself advances, but the presentation and fixed facts must not.
      expect(samples(clock(frame)).slice(1)).toEqual(after.slice(1));
      expect(businessPhases(clock(frame)).holding).toBe(true);
    }
    expect(businessPhases(clock(209)).holding).toBe(false);
  });
  it('M-01 retains task identity and bounds fan-out without inventing or changing labels', () => {
    for (let frame = 0; frame <= 240; frame++) {
      const split = sampleTaskSplit(clock(frame), ids);
      expect(split.map((entry) => entry.id)).toEqual(ids);
      for (const item of split) {
        expect(Math.abs(item.x)).toBeLessThanOrEqual(1);
        expect(item.y).toBeGreaterThanOrEqual(0);
        expect(item.y).toBeLessThanOrEqual(0.7);
        expect(item.opacity).toBeGreaterThanOrEqual(0);
        expect(item.opacity).toBeLessThanOrEqual(1);
      }
    }
    expect(
      sampleTaskSplit(
        clock(240),
        Array.from({ length: 20 }, (_, i) => `t-${i}`),
      ),
    ).toHaveLength(8);
  });
  it('M-02 conserves visual mass while exact allocated/remainder amounts stay unchanged', () => {
    for (let frame = 0; frame <= 240; frame++) {
      const value = sampleConservedParts(clock(frame), 100, parts);
      expect(value.total).toBe(100);
      expect(value.parts.map(({ id, amount }) => ({ id, amount }))).toEqual(parts);
      expect(
        value.originWeight + value.parts.reduce((sum, part) => sum + part.visualWeight, 0),
      ).toBeCloseTo(1, 12);
    }
  });
  it('M-03 focuses a condition without fading away the other stated constraints', () => {
    const value = sampleConstraintFocus(clock(240), ids, 'book');
    expect(value.map((entry) => entry.opacity)).toEqual([1, 1, 1]);
    expect(value.map((entry) => entry.focus)).toEqual([0, 1, 0]);
  });
  it('M-04 matches the existing same-subject hybrid handoff', () => {
    for (const frame of [0, 60, 95, 110, 150, 240]) {
      const { modelOpacity, diagramOpacity, modelTurn } = diagramPose(frame / 30, beats);
      expect(sampleBusinessHandoff(clock(frame))).toEqual({
        modelOpacity,
        diagramOpacity,
        modelTurn,
      });
    }
  });
  it('M-05 keeps planned and observed layers together instead of replacing configured state', () => {
    expect(sampleObservationOverlay(clock(240))).toEqual({
      planOpacity: 1,
      observationOpacity: 1,
      comparisonOpacity: 1,
    });
    expect(sampleObservationOverlay(clock(30)).observationOpacity).toBe(0);
  });
  it('M-06 retains dated discrete snapshots without interpolating values or rewriting dates', () => {
    for (const frame of [0, 60, 75, 90, 180, 240]) {
      const value = sampleSnapshots(clock(frame), snapshots);
      expect(value.map(({ id, date }) => ({ id, date }))).toEqual(snapshots);
      expect(value.filter((entry) => entry.focused)).toHaveLength(1);
    }
    expect(sampleSnapshots(clock(240), snapshots).every((entry) => entry.visible)).toBe(true);
  });
  it('M-07 preserves distinct units while the nested lens changes scope', () => {
    expect(sampleScaleLens(clock(0), ids).units.map((entry) => entry.id)).toEqual(ids);
    expect(sampleScaleLens(clock(240), ids).units.map((entry) => entry.id)).toEqual(ids);
    expect(sampleScaleLens(clock(240), ids).lens).toBe(1);
  });
  it('M-08 gives qualitative alternatives equal area, reveal, baseline and duration', () => {
    for (let frame = 0; frame <= 240; frame += 3) {
      const value = sampleAlternatives(clock(frame), ids);
      expect(value.map((entry) => entry.id)).toEqual(ids);
      expect(new Set(value.map((entry) => entry.opacity)).size).toBe(1);
      expect(value.every((entry) => entry.area === 1 && entry.baseline === 0)).toBe(true);
    }
  });
  it('M-09 never animates a pending or denied gate into an accepted action', () => {
    for (let frame = 0; frame <= 300; frame++) {
      expect(sampleHandshake(clock(frame), 'pending').accepted).toBe(0);
      expect(sampleHandshake(clock(frame), 'denied').accepted).toBe(0);
    }
    expect(sampleHandshake(clock(240), 'approved').accepted).toBe(1);
  });
  it('M-10 orders priorities, stops at partial tiers and leaves unknown amounts unfilled', () => {
    const value = samplePriorityFill(clock(240), [
      ...tiers,
      { id: 'third', amount: 0, ceiling: 50 },
    ]);
    expect(value.map((entry) => entry.fill)).toEqual([1, 0.5, 0]);
    expect(samplePriorityFill(clock(105), tiers)[1]?.fill).toBe(0);
    const unknown = samplePriorityFill(clock(240), [
      { id: 'first', amount: null, ceiling: null },
      { id: 'second', amount: null, ceiling: null },
    ]);
    expect(unknown.every((entry) => entry.fill === 0 && entry.reveal === 1)).toBe(true);
  });
  it('M-10 keeps an explicit zero-cap tier empty without blocking the next stated priority', () => {
    const zeroCap = [
      { id: 'zero-cap', amount: 0, ceiling: 0 },
      { id: 'paid', amount: 20, ceiling: 20 },
    ];
    for (const frame of [240, 0, 315, 210, 240]) {
      const result = samplePriorityFill(clock(frame), zeroCap);
      expect(result[0]?.fill).toBe(0);
      expect(result[1]?.fill).toBe(frame === 0 ? 0 : 1);
      expect(result.map((tier) => tier.id)).toEqual(['zero-cap', 'paid']);
    }
    for (const amount of [null, 1]) {
      const unresolved = samplePriorityFill(clock(240), [
        { id: 'not-established-zero', amount, ceiling: 0 },
        { id: 'later', amount: 20, ceiling: 20 },
      ]);
      expect(unresolved.map((tier) => tier.fill)).toEqual([0, 0]);
    }
  });
  it('M-11 reveals only the supplied version/source identities in deterministic order', () => {
    expect(sampleProvenance(clock(240), ids)).toEqual(
      ids.map((id) => ({ id, opacity: 1, linkProgress: 1 })),
    );
    const mid = sampleProvenance(clock(95), ids);
    expect(mid[0]?.linkProgress).toBeGreaterThan(mid[2]?.linkProgress ?? 0);
  });
  it('M-12 clamps blocked/unknown conditions instead of manufacturing readiness', () => {
    for (const state of ['blocked', 'unknown'] as const) {
      expect(sampleConditionClamp(clock(240), state)).toEqual({ progress: 0.55, gate: 0, state });
    }
    expect(sampleConditionClamp(clock(240), 'satisfied')).toEqual({
      progress: 1,
      gate: 1,
      state: 'satisfied',
    });
  });
});
