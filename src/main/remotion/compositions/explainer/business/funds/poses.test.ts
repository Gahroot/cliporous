import { describe, expect, it } from 'vitest';
import {
  FUNDS_ACCEPTED_VARIANTS,
  FUNDS_RESOURCE_FIXTURES,
  FUNDS_SOURCE_FIXTURES,
  parseFundsFixture,
} from './fixtures';
import { sampleFundsScene } from './poses';
import { fundsPageAt } from './presentation';
import { fundsAmounts, fundsObserved } from './types';

function finite(value: unknown): void {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}
const fixtures = [...FUNDS_SOURCE_FIXTURES, ...FUNDS_ACCEPTED_VARIANTS, ...FUNDS_RESOURCE_FIXTURES];
describe('source-gated seekable funds poses', () => {
  it.each(
    fixtures,
  )('$id $name preserves every source state/amount/basis on repeat/backward/shuffled seeks and final holds', (fixture) => {
    const { scene, issues } = parseFundsFixture(fixture);
    if (!scene) throw new Error(issues.join('; '));
    const before = structuredClone(scene),
      times = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        fixture.window.endTime,
        -5,
        NaN,
        Infinity,
      ];
    for (const time of [
      scene.resolveAt,
      scene.responseAt,
      scene.setupAt,
      ...times.slice().reverse(),
      ...times,
    ]) {
      const pose = sampleFundsScene(scene, time);
      finite(pose);
      expect(sampleFundsScene(scene, time)).toEqual(pose);
      expect(pose.sourceAmounts).toEqual(fundsAmounts(scene));
      expect(pose.opacity).toBeGreaterThanOrEqual(0);
      expect(pose.opacity).toBeLessThanOrEqual(1);
      pose.tierFills.forEach((fill) => {
        expect(fill).toBeGreaterThanOrEqual(0);
        expect(fill).toBeLessThanOrEqual(1);
      });
      if (scene.preset === 'subscriptions-and-close') expect(pose.folio.contributed).toBe(false);
      if (scene.preset === 'source-periods')
        expect(pose.snapshots.map((snapshot) => [snapshot.id, snapshot.date])).toEqual(
          scene.periods.map((period) => [period.identity.id, period.date]),
        );
      if (scene.preset === 'valuation-cash-distinction') {
        expect(pose.conserved).toBeNull();
        expect(pose.tierFills).toEqual([0, 0, 0, 0]);
      }
      if (scene.preset === 'stated-priority-tiers' && !fundsAmounts(scene).every(fundsObserved))
        expect(pose.tierFills).toEqual([0, 0, 0, 0]);
      if (
        scene.preset === 'retained-follow-on-capital' &&
        scene.allocated.state !== 'source-stated'
      ) {
        expect(pose.clamp?.gate).toBe(0);
        expect(pose.tierFills).toEqual([0, 0, 0, 0]);
      }
      if (scene.preset === 'periodic-repurchase')
        expect(pose.trolleyPending).toBe(
          scene.requests.some((request) => request.state !== 'fulfilled'),
        );
    }
    const final = sampleFundsScene(scene, scene.resolveAt);
    expect(final.holding).toBe(true);
    expect(final.page).toEqual(fundsPageAt(scene, scene.resolveAt));
    expect(sampleFundsScene(scene, fixture.window.endTime)).toEqual(final);
    expect(sampleFundsScene(scene, fixture.window.endTime + 100)).toEqual(final);
    expect(scene).toEqual(before);
    final.sourceAmounts[0].basis.subjectId = 'unrelated-output-owner';
    expect(scene).toEqual(before);
    final.sourceAmounts[0].source.fromWord += 1;
    expect(scene).toEqual(before);
    final.sourceAmounts[0].basis.source.fromWord += 1;
    expect(scene).toEqual(before);
    if (final.sourceAmounts[0].amount) {
      final.sourceAmounts[0].amount.minorUnits = 1;
      expect(scene).toEqual(before);
    }
    expect(sampleFundsScene(scene, scene.resolveAt).sourceAmounts).toEqual(fundsAmounts(scene));
  });
  it('uses fixed M10 zero-cap eligibility without inventing zero or settlement', () => {
    const fixture = FUNDS_ACCEPTED_VARIANTS.find(
      (item) => item.name === 'zero ceiling followed by paid tier',
    );
    if (!fixture) throw new Error('Missing accepted zero-cap source');
    const { scene, issues } = parseFundsFixture(fixture);
    if (!scene || scene.preset !== 'stated-priority-tiers') throw new Error(issues.join('; '));
    expect(sampleFundsScene(scene, scene.resolveAt).tierFills).toEqual([0, 1, 0, 0]);
    expect(sampleFundsScene(scene, fixture.window.endTime).tierFills).toEqual([0, 1, 0, 0]);
    expect(scene.tiers[0].allocation.amount?.minorUnits).toBe(0);
  });
  it('keeps M02 exact source total and parts unchanged while only visual weights reveal', () => {
    const { scene, issues } = parseFundsFixture(FUNDS_SOURCE_FIXTURES[3]);
    if (!scene || scene.preset !== 'gross-to-net') throw new Error(issues.join('; '));
    for (const time of [scene.setupAt, scene.actionAt, scene.responseAt, scene.resolveAt]) {
      const conserved = sampleFundsScene(scene, time).conserved;
      expect(conserved?.total).toBe(scene.gross.amount?.minorUnits);
      expect(conserved?.parts.map((part) => part.amount)).toEqual([
        ...scene.costs.map((cost) => cost.amount.amount?.minorUnits),
        scene.net.amount?.minorUnits,
        scene.remainder.amount?.minorUnits,
      ]);
    }
  });
});
