import { describe, expect, it } from 'vitest';
import { parseExpansionSubgroupReversal } from '../../../../../ai/explainer/expansion-quantities-distribution-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import {
  distributionDomain,
  distributionFields,
  distributionHistogram,
  distributionPages,
  distributionPose,
  distributionTable,
} from './distribution-poses';
import {
  distributionCases,
  maximumHistogram,
  maximumSubgroups,
  parseDistribution,
} from './distribution-poses.fixtures';

describe('distribution pure source poses', () => {
  it('uses exact comparisons when distinct source rationals collide as Numbers, including typed negative minima', () => {
    const small = { numerator: 999999999, denominator: 999999998 };
    const large = { numerator: 999999998, denominator: 999999997 };
    expect(small.numerator / small.denominator).toBe(large.numerator / large.denominator);
    const scene = parseDistribution(maximumHistogram(false, 'known', true));
    if (scene.storyId !== '17') throw new Error('Expected histogram');
    expect(distributionDomain(scene)?.high).toEqual(large);
    const typed = {
      ...scene,
      records: scene.records.map((r) => {
        if (
          r.role !== 'observation' ||
          r.quantity.state !== 'known' ||
          r.quantity.amount.kind !== 'rational'
        )
          throw new Error('Expected exact known observations');
        const q = r.quantity;
        return {
          ...r,
          quantity: {
            ...q,
            amount: {
              kind: 'rational' as const,
              value: {
                numerator: -r.quantity.amount.value.numerator,
                denominator: r.quantity.amount.value.denominator,
              },
            },
          },
        };
      }),
    };
    expect(distributionDomain(typed)?.low).toEqual({
      numerator: -large.numerator,
      denominator: large.denominator,
    });
    expect(distributionDomain(typed)?.high).toEqual({ numerator: 0, denominator: 1 });
  });
  it('parses twelve disputed observations and twelve disputed bins without sampled membership', () => {
    for (const bins of [false, true]) {
      const scene = parseDistribution(maximumHistogram(bins, 'disputed'));
      expect(scene.records).toHaveLength(12);
      const plots = distributionHistogram(scene);
      expect(plots.map((p) => p.positions.length)).toEqual(Array(12).fill(2));
      expect(plots.reduce((sum, p) => sum + p.positions.length, 0)).toBe(24);
      expect(plots.every((p) => p.state === 'disputed')).toBe(true);
    }
  });
  it('parses the declared maximum of four complete subgroups and rejects a valid-shape fifth group', () => {
    const scene = parseDistribution(maximumSubgroups(false));
    expect(scene.records).toHaveLength(8);
    if (scene.storyId !== '18') throw new Error('Expected subgroup scene');
    expect(scene.groupIds).toHaveLength(4);
    expect(scene.result.state).toBe('derived');
    expect(distributionTable(scene)).toHaveLength(5);
    // Timing and source shape are valid; the fifth group must reach the actual group-count gate.
    const beyondCap = maximumSubgroups(false, 5),
      capCtx = makeParseContext(beyondCap.words, beyondCap.window);
    expect(parseExpansionSubgroupReversal(beyondCap.proposal, capCtx)).toBeNull();
    expect(capCtx.issues, JSON.stringify(capCtx.issues)).toContain(
      'reversal needs two actors and the same two to four complete subgroups',
    );
  });
  it('compares grounded actor rates across the same subgroup and aggregate identities, with no qualified inference', () => {
    let longest = 0;
    for (const scene of distributionCases()) {
      if (scene.storyId === '17') {
        const domain = distributionDomain(scene);
        const hasNumbers = distributionHistogram(scene).some((r) => r.positions.length > 0);
        expect(domain !== null).toBe(hasNumbers);
        for (const row of distributionFields(scene)) {
          expect(row.fields).toContain('Equal slots are ordered categories, not interval widths');
          expect(row.fields.some((v) => v.startsWith('Axis lower exact:'))).toBe(hasNumbers);
          expect(row.fields.some((v) => v.startsWith('Axis upper exact:'))).toBe(hasNumbers);
          if (!hasNumbers) expect(row.fields).toContain('No supplied numeric domain');
        }
        for (const record of distributionHistogram(scene))
          for (const p of record.positions) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
          }
        continue;
      }
      const rows = distributionTable(scene);
      expect(rows.map((r) => r.scopeId)).toEqual([...scene.groupIds, 'aggregate']);
      for (const row of rows) {
        expect(row.actorIds).toEqual(scene.actorIds);
        if (scene.result.state === 'source-qualified') {
          expect(row.values).toEqual(['No computed rate', 'No computed rate']);
          expect(row.relation).toBe('—');
        } else {
          const high =
            row.scopeId === 'aggregate'
              ? scene.aggregateHigherActorId
              : scene.subgroupHigherActorId;
          expect(row.relation).toBe(high === scene.actorIds[0] ? '>' : '<');
          row.values.forEach((value) => {
            longest = Math.max(longest, value.length);
            expect(value).toMatch(/^\d+\/\d+$/);
          });
        }
      }
    }
    expect(longest).toBe(20); // Nine-digit numerator / ten-digit denominator, rendered on three fixed-size lines.
  });
  it('parses source states and maximum records; retains all strings, values and identities on bounded pages', () => {
    for (const scene of distributionCases()) {
      const before = JSON.stringify(scene),
        pages = distributionPages(scene);
      for (const row of distributionFields(scene)) {
        const emitted = pages
          .filter((p) => p.id === row.id)
          .flatMap((p) => p.lines)
          .join('');
        expect(emitted).toBe(row.fields.join(''));
      }
      expect(new Set(pages.flatMap((p) => p.lineIds)).size).toBe(
        pages.flatMap((p) => p.lines).length,
      );
      const visited = new Set<number>();
      const poses = new Map<number, string>();
      for (let frame = 0; frame <= 420; frame++) {
        const p = distributionPose(scene, frame / 30);
        visited.add(p.page);
        poses.set(frame, JSON.stringify(p));
        expect(p.pages[p.page].lines.length).toBeLessThanOrEqual(14);
        for (const v of [p.reveal, p.action, p.response, p.check, p.resolve]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
      for (let frame = 420; frame >= 0; frame -= 7)
        expect(JSON.stringify(distributionPose(scene, frame / 30))).toBe(poses.get(frame));
      for (const frame of [91, 4, 377, 22, 198, 91])
        expect(JSON.stringify(distributionPose(scene, frame / 30))).toBe(poses.get(frame));
      for (const t of [NaN, Infinity, -Infinity]) expect(distributionPose(scene, t).page).toBe(0);
      for (const [key, at] of [
        ['reveal', scene.setupAt],
        ['action', scene.actionAt],
        ['response', scene.responseAt],
        ['check', scene.checkAt],
        ['resolve', scene.resolveAt],
      ] as const)
        expect(distributionPose(scene, at + 0.7)[key]).toBe(1);
      expect(visited.size).toBe(pages.length);
      expect(distributionPose(scene, scene.resolveAt + 2).page).toBe(pages.length - 1);
      expect(JSON.stringify(scene)).toBe(before);
      if (scene.storyId === '17')
        expect(distributionHistogram(scene).map((r) => r.id)).toEqual(
          scene.records.map((r) => r.id),
        );
    }
  });
});
