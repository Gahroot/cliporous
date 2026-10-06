import { describe, expect, it } from 'vitest';
import {
  deviationDomain,
  deviationFields,
  deviationMultiplesPose,
  deviationPages,
  deviationPositions,
  deviationRecords,
} from './deviation-multiples-poses';
import { deviationMultiplesCases } from './deviation-multiples-poses.fixtures';

describe('deviation/multiples seekable source facts', () => {
  it('accepts both stories, all qualified/absent states and four maximum-label aligned records through real parsers', () => {
    const cases = deviationMultiplesCases();
    expect(cases).toHaveLength(17);
    expect(cases.at(-3)).toMatchObject({ storyId: '24', records: [{}, {}, {}, {}] });
    expect(cases.at(-2)).toMatchObject({
      target: { amount: { value: { numerator: -999999999, denominator: 1000000 } } },
    });
    expect(cases.at(-1)).toMatchObject({
      target: { amount: { value: { numerator: -999999999, denominator: 1000000000 } } },
    });
    for (const scene of cases) {
      const before = structuredClone(scene),
        pages = deviationPages(scene);
      for (const [record, r] of deviationRecords(scene).entries()) {
        expect(
          pages
            .filter((p) => p.id === r.id)
            .flatMap((p) => p.lines)
            .join(''),
        ).toBe(deviationFields(scene, record).join(''));
      }
      const seen = new Set<number>(),
        poses = Array.from({ length: 361 }, (_, frame) => {
          const pose = deviationMultiplesPose(scene, frame / 30);
          seen.add(pose.page);
          for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
            expect(pose[key]).toBeGreaterThanOrEqual(0);
            expect(pose[key]).toBeLessThanOrEqual(1);
          }
          return pose;
        });
      expect(seen.size).toBe(pages.length);
      for (let frame = 360; frame >= 0; frame -= 7)
        expect(deviationMultiplesPose(scene, frame / 30)).toEqual(poses[frame]);
      for (let i = 0; i < 361; i++) {
        const frame = (i * 137) % 361;
        expect(deviationMultiplesPose(scene, frame / 30)).toEqual(poses[frame]);
      }
      for (const t of [NaN, Infinity, -Infinity])
        expect(deviationMultiplesPose(scene, t)).toMatchObject({
          page: 0,
          reveal: 0,
          action: 0,
          response: 0,
          check: 0,
          resolve: 0,
        });
      expect(deviationMultiplesPose(scene, 10)).toEqual(deviationMultiplesPose(scene, 12));
      expect(scene).toEqual(before);
      for (const [i, r] of deviationRecords(scene).entries()) {
        if (r.quantity.state === 'unknown' || r.quantity.state === 'missing')
          expect(deviationPositions(scene)[i]).toEqual([]);
      }
    }
  });
  it('retains signed subtraction and source precision instead of a profit, winner, or derived rate', () => {
    const [deviation, multiples] = deviationMultiplesCases();
    expect(deviation).toMatchObject({ result: { result: { numerator: -2, denominator: 1 } } });
    expect(deviationFields(deviation, 0)).toEqual(
      expect.arrayContaining([
        'derived: -2',
        'Observation: 8/1',
        'Target: 10/1',
        'Signed result: -2/1',
      ]),
    );
    expect(deviationDomain(deviation)).toEqual([
      { numerator: 0, denominator: 1 },
      { numerator: 20, denominator: 1 },
    ]);
    expect(deviationPositions(deviation)[0][0]).toBeCloseTo(0.5);
    expect(deviationPositions(deviation)[1][0]).toBeCloseTo(0.4);
    const max = deviationMultiplesCases().at(-1);
    if (!max) throw new Error('Missing maximum');
    expect(deviationFields(max, 0)).toEqual(
      expect.arrayContaining([
        '-999999999/1000000000',
        'Observation: 1/1000000000',
        'Target: -999999999/1000000000',
        'Signed result: 1/1',
      ]),
    );
    expect(deviationFields(max, 1)).toContain('+1/1000000000');
    expect(multiples).not.toHaveProperty('winner');
    expect(deviation).not.toHaveProperty('relative');
  });
});
