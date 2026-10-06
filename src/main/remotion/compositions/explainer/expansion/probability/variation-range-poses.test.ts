import { describe, expect, it } from 'vitest';
import { parseExpansionQualifiedInterval } from '../../../../../ai/explainer/expansion-probability-variation-range-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import {
  variationRangeDomain,
  variationRangeMagnitude,
  variationRangePose,
  variationRangeRecords,
} from './variation-range-poses';
import {
  fixtures,
  variationRangeInterval,
  variationRangeMaximum,
  variationRangeSourceScenes,
  variationRangeTestScenes,
  variationRangeTimes,
} from './variation-range-poses.fixtures';

describe('variation/range pure source-bound poses', () => {
  it('accepts canonical and maximum, decimal, equal, teaching and conditional real-parser cases', () => {
    expect(variationRangeTestScenes()).toHaveLength(17);
    const max = variationRangeMaximum();
    expect(max.entities).toHaveLength(8);
    if (max.storyId !== '13') throw new Error('samples');
    expect(max.samples).toHaveLength(7);
    expect(
      max.samples.reduce(
        (sum, sample) => sum + (sample.quantity.basis.denominator?.numerator ?? 0),
        0,
      ),
    ).toBe(98);
    const decimal = variationRangeInterval();
    if (decimal.storyId !== '14' || !('amount' in decimal.lower)) throw new Error('interval');
    expect(decimal.lower.amount.notation).toBe('2.500');
  });
  it('is finite, bounded, all-frame seekable, immutable, shuffled/repeated and stable through final hold', () => {
    for (const scene of variationRangeTestScenes()) {
      const before = structuredClone(scene),
        times = variationRangeTimes(scene);
      const sequential = times.map((t) => variationRangePose(scene, t));
      for (const i of times.map((_, i) => i).reverse()) {
        const pose = variationRangePose(scene, times[i]);
        expect(pose).toEqual(sequential[i]);
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          expect(pose[key]).toBeGreaterThanOrEqual(0);
          expect(pose[key]).toBeLessThanOrEqual(1);
        }
        expect(pose.records.map((r) => r.id)).toEqual(
          variationRangeRecords(scene).map((r) => r.id),
        );
      }
      expect(variationRangePose(scene, scene.resolveAt + 0.2)).toEqual(
        variationRangePose(scene, scene.resolveAt + 100),
      );
      for (const t of [NaN, Infinity, -Infinity, -100])
        expect(variationRangePose(scene, t)).toEqual(variationRangePose(scene, 0));
      expect(variationRangeDomain(scene)).toEqual(variationRangeDomain(scene));
      expect(scene).toEqual(before);
    }
  });
  it('does not map unknown/missing/disputed quantities to zero; contracts reject these states', () => {
    for (const state of ['unknown', 'missing', 'disputed'] as const) {
      const fixture = structuredClone(fixtures[1]);
      const q = fixture.proposal.lower as Rec;
      delete q.amount;
      Object.assign(q, { state, qualifier: 'not supplied' });
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionQualifiedInterval(fixture.proposal, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
      const scene = variationRangeSourceScenes()[1];
      if (scene.storyId !== '14') throw new Error('interval');
      const { actor, claim, basis, evidence } = scene.lower;
      expect(
        variationRangeMagnitude({
          actor,
          claim,
          basis,
          evidence,
          state: 'unknown',
          qualifier: 'not supplied',
        }),
      ).toBeUndefined();
    }
  });
});
