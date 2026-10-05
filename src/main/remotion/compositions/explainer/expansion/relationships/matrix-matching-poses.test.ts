import { describe, expect, it } from 'vitest';
import { parseExpansionMatrixLinks } from '../../../../../ai/explainer/expansion-relationships-matrix-matching-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { compare, rationalPosition } from '../value-logic';
import {
  capacityPositions,
  matrixMatchingFields,
  matrixMatchingPages,
  matrixMatchingPose,
} from './matrix-matching-poses';
import {
  acceptedMatrixMatching,
  matrixMatchingCases,
  packet,
  selfMatrixMatching,
} from './matrix-matching-test-fixtures';

describe('stories 37–38 real source poses', () => {
  it('accepts raw fixtures and maximum rectangular matrices / seven-to-one partitions in both modes', () => {
    const scenes = matrixMatchingCases();
    expect(Math.max(...scenes.map((s) => s.entities.length))).toBe(8);
    expect(
      Math.max(
        ...scenes.map((s) => (s.storyId === '37' ? s.relations.length : s.eligibility.length)),
      ),
    ).toBe(16);
  });
  for (const [caseIndex, s] of matrixMatchingCases().entries())
    it(`seeks all 361 frames repeatedly in both modes: ${caseIndex}`, () => {
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const scene = { ...s, visualMode };
        const times = [
          NaN,
          Infinity,
          -Infinity,
          -1,
          scene.setupAt,
          scene.actionAt,
          scene.responseAt,
          scene.checkAt,
          scene.resolveAt,
          100,
          ...Array.from({ length: 361 }, (_, i) => i / 30),
        ];
        const poses = times.map((t) => matrixMatchingPose(scene, t));
        for (const [i, t] of [...times.entries()].reverse()) {
          const pose = matrixMatchingPose(scene, t);
          expect(pose).toEqual(poses[i]);
          expect(
            [
              pose.reveal,
              pose.action,
              pose.response,
              pose.check,
              pose.resolve,
              pose.turn,
              pose.page,
            ].every(Number.isFinite),
          ).toBe(true);
        }
        expect(matrixMatchingPose(scene, 100)).toEqual(matrixMatchingPose(scene, 101));
        expect(matrixMatchingPose(scene, NaN)).toEqual(matrixMatchingPose(scene, scene.setupAt));
        const pages = matrixMatchingPages(scene);
        for (const index of new Set(pages.map((p) => p.index))) {
          expect(
            pages
              .filter((p) => p.index === index)
              .flatMap((p) => p.lines)
              .join(''),
          ).toBe(matrixMatchingFields(scene, index).join(''));
        }
      }
    });
  it('keeps zero distinct from absence, eligibility distinct from supplied matches, and all exact qualifiers', () => {
    for (const scene of matrixMatchingCases()) {
      const fields = matrixMatchingPages(scene)
        .flatMap((p) => p.lines)
        .join('');
      if (scene.storyId === '37') {
        expect(scene.graph.entityIds).toEqual(scene.entities.map((e) => e.id));
        expect(scene.graph.relationIds).toEqual(scene.relations.map((r) => r.id));
        for (const r of scene.relations) {
          expect(r.direction).toBe(r.role === 'association' ? 'undirected' : 'from-to');
          if ('condition' in r) expect(fields).toContain(r.condition);
          if ('qualifier' in r) expect(fields).toContain(r.qualifier);
        }
      } else
        for (const r of scene.records) {
          if (r.type === 'capacity') {
            const q = r.quantity;
            const positions = capacityPositions(scene, r.id);
            expect(positions.length).toBe(q.state === 'disputed' ? 2 : 'amount' in q ? 1 : 0);
            if ('amount' in q && q.amount.kind === 'rational' && q.amount.value.numerator === 0)
              expect(positions).toEqual([0]);
            if ('qualifier' in q) expect(fields).toContain(q.qualifier);
            if ('condition' in q) expect(fields).toContain(q.condition);
            expect(positions.every((p) => Number.isFinite(p) && p >= 0 && p <= 1)).toBe(true);
          } else if (r.status === 'unresolved') expect('destinationId' in r).toBe(false);
        }
    }
    const raw = packet.stories.map(acceptedMatrixMatching).find((s) => s.storyId === '38');
    if (!raw || raw.storyId !== '38') throw new Error('Missing raw supplied matches');
    expect(raw.records.some((r) => r.type === 'match' && r.status === 'matched')).toBe(true);
  });
  it('checks the real parser self-pair contract for all three typed roles', () => {
    for (const role of ['association', 'dependency', 'transfer'] as const) {
      expect(acceptedMatrixMatching(selfMatrixMatching(role, false)).storyId).toBe('37');
      const story = selfMatrixMatching(role);
      const ctx = makeParseContext(story.words, story.window);
      expect(parseExpansionMatrixLinks(story.proposal, ctx)).toBeNull();
      expect(ctx.issues).toContain(
        'each pair needs distinct supplied endpoints and an authored typed relation',
      );
    }
  });
  it('uses exact comparison/positions at component limits including close fractions', () => {
    const low = { numerator: 999999998, denominator: 999999999 };
    const high = { numerator: 999999999, denominator: 1000000000 };
    expect(compare(low, high)).toEqual({ ok: true, value: -1 });
    expect(rationalPosition(low, low, high)).toEqual({ ok: true, value: 0 });
    expect(rationalPosition(high, low, high)).toEqual({ ok: true, value: 1 });
  });
});
