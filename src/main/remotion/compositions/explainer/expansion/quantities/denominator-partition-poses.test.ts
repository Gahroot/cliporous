import { describe, expect, it } from 'vitest';
import {
  denominatorDomain,
  denominatorFields,
  denominatorPartitionPages,
  denominatorPartitionPose,
  denominatorPositions,
  denominatorRelative,
} from './denominator-partition-poses';
import {
  clauses,
  denominator,
  denominatorPartitionCases,
  paraphrase,
  positive19,
  rationalAmount,
  rows,
} from './denominator-partition-test-fixtures';

describe('denominator/partition pure five-beat poses', () => {
  it('orders close positive and negative source fractions and derived ratios exactly despite identical Numbers', () => {
    const first = { numerator: 999999999, denominator: 999999998 };
    const second = { numerator: 999999998, denominator: 999999997 };
    expect(first.numerator / first.denominator).toBe(second.numerator / second.denominator);
    for (const sign of [1, -1]) {
      const values = [first, second].map((r) => ({ ...r, numerator: r.numerator * sign }));
      const source = clauses(denominator);
      for (const [row, value] of values.entries()) {
        const i = 1 + row * 2;
        source[i] = source[i].replace(
          /(?:20|40) count/,
          `${value.numerator}/${value.denominator} count`,
        );
        source[i + 1] = source[i + 1].replace(/(?:100|400) count/, '1 count');
      }
      const next = paraphrase(denominator, source);
      for (const [row, value] of values.entries()) {
        rows(next.proposal)[row].amount.amount = { kind: 'rational', value };
        rows(next.proposal)[row].reference.amount = rationalAmount(1);
      }
      next.proposal.derive = [
        { operation: 'ratio', row: 'Alpha' },
        { operation: 'ratio', row: 'Beta' },
      ];
      const scene = positive19(next.proposal, next.words, next.window);
      const expected =
        sign > 0
          ? [{ numerator: 0, denominator: 1 }, values[1]]
          : [values[1], { numerator: 1, denominator: 1 }];
      expect(denominatorDomain(scene)).toEqual(expected);
      for (const row of scene.comparisons) {
        const position = denominatorPositions(scene, row.amount)[0];
        expect(Number.isFinite(position)).toBe(true);
        expect(position).toBeGreaterThanOrEqual(0);
        expect(position).toBeLessThanOrEqual(1);
      }
      expect(denominatorPositions(scene, scene.comparisons[1].amount)[0]).toBe(sign > 0 ? 1 : 0);
      expect(scene.derived.map((d) => d.result)).toEqual(values);
      const relative = denominatorRelative(scene);
      expect(relative).toHaveLength(2);
      for (const row of relative) {
        expect([row.low, row.high]).toEqual(expected);
        expect(Number.isFinite(row.position)).toBe(true);
        expect(row.position).toBeGreaterThanOrEqual(0);
        expect(row.position).toBeLessThanOrEqual(1);
      }
      expect(relative[1].position).toBe(sign > 0 ? 1 : 0);
    }
  });
  it('retains every field and stable ID in bounded pages; repeated/shuffled seeks and final holds are exact', () => {
    for (const scene of denominatorPartitionCases()) {
      const original = JSON.stringify(scene),
        pages = denominatorPartitionPages(scene),
        visited = new Set<number>();
      const snapshots = Array.from({ length: 301 }, (_, frame) =>
        denominatorPartitionPose(scene, frame / 30),
      );
      for (let frame = 300; frame >= 0; frame--) {
        const pose = denominatorPartitionPose(scene, frame / 30);
        expect(pose).toEqual(snapshots[frame]);
        visited.add(pose.page);
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          expect(pose[key]).toBeGreaterThanOrEqual(0);
          expect(pose[key]).toBeLessThanOrEqual(1);
        }
      }
      for (const frame of [19, 3, 292, 110, 0, 77, 110])
        expect(denominatorPartitionPose(scene, frame / 30)).toEqual(snapshots[frame]);
      expect(visited.size).toBe(pages.length);
      for (
        let record = 0;
        record < (scene.storyId === '19' ? scene.comparisons.length : scene.parts.length);
        record++
      )
        expect(
          pages
            .filter((p) => p.record === record)
            .flatMap((p) => p.lines)
            .join(''),
        ).toBe(denominatorFields(scene, record).join(''));
      expect(new Set(pages.flatMap((p) => p.lineIds)).size).toBe(
        pages.flatMap((p) => p.lineIds).length,
      );
      expect(denominatorPartitionPose(scene, 10)).toEqual(denominatorPartitionPose(scene, 100));
      for (const t of [NaN, Infinity, -Infinity])
        expect(denominatorPartitionPose(scene, t)).toEqual(
          denominatorPartitionPose(scene, scene.setupAt),
        );
      expect(JSON.stringify(scene)).toBe(original);
      if (scene.storyId === '20')
        for (const part of scene.parts)
          if (part.quantity.state === 'unknown' || part.quantity.state === 'missing')
            expect(denominatorPositions(scene, part.quantity)).toEqual([]);
    }
  });
});
