import { describe, expect, it } from 'vitest';
import {
  parseExpansionPareto,
  parseExpansionSieve,
} from '../../../../../ai/explainer/expansion-decisions-sieve-frontier-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { compare, rationalPosition } from '../value-logic';
import {
  frontierDomain,
  frontierMarks,
  sieveFrontierFields,
  sieveFrontierPages,
  sieveFrontierPose,
  sieveOptionStatus,
} from './sieve-frontier-poses';
import { maximumSieveFrontier, sieveFrontierCases } from './sieve-frontier-test-fixtures';

describe('sieve/frontier production source facts and pure five-beat poses', () => {
  it('accepts real raw and maximum matrices, retains all states, IDs and exact notation', () => {
    const scenes = sieveFrontierCases();
    const states = new Set<string>();
    for (const scene of scenes) {
      expect(scene.records.length).toBeLessThanOrEqual(12);
      expect(new Set(scene.records.map((r) => r.id)).size).toBe(scene.records.length);
      const pages = sieveFrontierPages(scene);
      scene.records.forEach((r, i) => {
        const fields = sieveFrontierFields(scene, i);
        expect(
          pages
            .filter((p) => p.record === i)
            .flatMap((p) => p.lines)
            .join(''),
        ).toBe(fields.join(''));
        states.add('quantity' in r ? r.quantity.state : r.state);
      });
      if (scene.storyId === '25')
        for (const e of scene.entities) {
          const status = sieveOptionStatus(scene, e.id);
          expect(status.fail).toBe(
            scene.records.some(
              (r) => r.optionId === e.id && r.state === 'known' && r.status === 'fail',
            ),
          );
          expect(status.qualified).toBe(
            !!scene.condition ||
              scene.evidence !== 'source-stated' ||
              scene.records.some((r) => r.optionId === e.id && r.state !== 'known'),
          );
        }
      if (scene.storyId === '26') {
        for (const c of scene.criteria) {
          const domain = frontierDomain(scene, c.id);
          const marks = frontierMarks(scene, c.id);
          for (const m of marks) {
            expect(m.positions).toHaveLength(
              m.state === 'disputed' ? 2 : m.state === 'unknown' || m.state === 'missing' ? 0 : 1,
            );
          }
          const ordered = scene.records.filter(
            (r) => r.criterionId === c.id && r.quantity.state === 'known',
          );
          for (const a of ordered)
            for (const b of ordered) {
              if (
                a.quantity.state !== 'known' ||
                b.quantity.state !== 'known' ||
                a.quantity.amount.kind !== 'rational' ||
                b.quantity.amount.kind !== 'rational'
              )
                throw new Error('Expected scalars');
              const cmp = compare(a.quantity.amount.value, b.quantity.amount.value);
              if (!cmp.ok) throw new Error('Invalid source comparison');
              const pa = marks.find((m) => m.id === a.id)?.positions[0];
              const pb = marks.find((m) => m.id === b.id)?.positions[0];
              if (pa === undefined || pb === undefined) throw new Error('Missing plotted scalar');
              if (cmp.value < 0) expect(pa).toBeLessThanOrEqual(pb);
              if (cmp.value === 0) expect(pa).toBe(pb);
            }
          expect(rationalPosition({ numerator: 0, denominator: 1 }, ...domain).ok).toBe(true);
          for (const r of scene.records.filter((r) => r.criterionId === c.id)) {
            const q = r.quantity;
            const values =
              q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : [];
            for (const a of values)
              if (a.kind === 'rational') {
                expect(rationalPosition(a.value, ...domain).ok).toBe(true);
                const low = compare(a.value, domain[0]),
                  high = compare(a.value, domain[1]);
                if (!low.ok || !high.ok) throw new Error('Invalid source domain');
                expect(low.value).toBeGreaterThanOrEqual(0);
                expect(high.value).toBeLessThanOrEqual(0);
              }
            const zero = { numerator: 0, denominator: 1 };
            const sourceValues = scene.records
              .filter((r) => r.criterionId === c.id)
              .flatMap((r) =>
                r.quantity.state === 'disputed'
                  ? r.quantity.alternatives
                  : 'amount' in r.quantity
                    ? [r.quantity.amount]
                    : [],
              )
              .flatMap((a) => (a.kind === 'rational' ? [a.value] : []));
            expect(
              [zero, ...sourceValues].some((v) => {
                const cmp = compare(v, domain[0]);
                return cmp.ok && cmp.value === 0;
              }),
            ).toBe(true);
            expect(
              [zero, ...sourceValues].some((v) => {
                const cmp = compare(v, domain[1]);
                return cmp.ok && cmp.value === 0;
              }) ||
                (domain[1].numerator === 1 && sourceValues.every((v) => v.numerator === 0)),
            ).toBe(true);
          }
        }
        if (scene.condition || scene.records.some((r) => r.quantity.state !== 'known'))
          expect(scene.result.state).toBe('source-qualified');
        if (scene.result.state === 'derived')
          for (const d of scene.result.dominations) {
            let strict = false;
            for (const c of scene.criteria) {
              const a = scene.result.operands.find(
                (o) => o.optionId === d.fromId && o.criterionId === c.id,
              );
              const b = scene.result.operands.find(
                (o) => o.optionId === d.toId && o.criterionId === c.id,
              );
              if (!a || !b) throw new Error('Missing operand');
              const result = compare(a.value, b.value);
              if (!result.ok) throw new Error('Invalid comparison');
              const directed = result.value * (c.direction === 'minimize' ? -1 : 1);
              expect(directed).toBeGreaterThanOrEqual(0);
              strict ||= directed > 0;
            }
            expect(strict).toBe(true);
          }
      }
    }
    expect([...states].sort()).toEqual([
      'conditional',
      'disputed',
      'illustrative',
      'known',
      'missing',
      'simulated',
      'unknown',
    ]);
    expect(scenes.some((s) => s.records.length === 8 && s.entities.length === 4)).toBe(true);
    expect(scenes.some((s) => s.records.length === 12 && s.entities.length === 3)).toBe(true);
    expect(scenes.some((s) => s.records.length === 12 && s.entities.length === 4)).toBe(true);
    const disputed = scenes.filter(
      (s) =>
        s.storyId === '26' &&
        s.records.length === 12 &&
        s.records.every((r) => r.quantity.state === 'disputed'),
    );
    expect(disputed.length).toBeGreaterThan(0);
    for (const scene of disputed)
      if (scene.storyId === '26')
        expect(
          scene.criteria
            .flatMap((c) => frontierMarks(scene, c.id))
            .reduce((n, m) => n + m.positions.length, 0),
        ).toBe(24);
  });
  it('rejects sixteen records and beyond-cap option/criterion counts', () => {
    for (const id of ['25', '26'] as const)
      for (const invalid of ['records', 'entities', 'columns']) {
        const story = maximumSieveFrontier(id, 'M');
        const raw = structuredClone(story.proposal);
        if (invalid === 'records')
          raw.records = [...(raw.records as unknown[]), ...(raw.records as unknown[]).slice(0, 4)];
        if (invalid === 'entities')
          raw.entities = [...(raw.entities as unknown[]), (raw.entities as unknown[])[0]];
        if (invalid === 'columns') {
          const key = id === '25' ? 'requirements' : 'criteria';
          raw[key] = Array.from({ length: 5 }, () => (raw[key] as unknown[])[0]);
        }
        const ctx = makeParseContext(story.words, story.window);
        const parsed = id === '25' ? parseExpansionSieve(raw, ctx) : parseExpansionPareto(raw, ctx);
        expect(parsed).toBeNull();
        expect(ctx.issues.length).toBeGreaterThan(0);
      }
  });
  it('repeats/shuffles finite and nonfinite seeks, visits every page and holds resolve', () => {
    for (const scene of sieveFrontierCases()) {
      const pages = sieveFrontierPages(scene);
      const times = [
        -100,
        scene.resolveAt + 100,
        scene.checkAt,
        scene.setupAt,
        scene.responseAt,
        scene.actionAt,
        scene.resolveAt,
        NaN,
        Infinity,
        -Infinity,
        ...pages.map(
          (_, i) => scene.setupAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt),
        ),
      ];
      const before = JSON.stringify(scene);
      const poses = times.map((t) => sieveFrontierPose(scene, t));
      for (let i = times.length - 1; i >= 0; i--) {
        const p = sieveFrontierPose(scene, times[i]);
        expect(p).toEqual(poses[i]);
        for (const key of [
          'reveal',
          'action',
          'response',
          'check',
          'resolve',
          'turn',
          'page',
        ] as const)
          expect(Number.isFinite(p[key])).toBe(true);
      }
      expect(new Set(poses.map((p) => p.page)).size).toBe(pages.length);
      expect(sieveFrontierPose(scene, scene.resolveAt + 0.5)).toEqual(
        sieveFrontierPose(scene, scene.resolveAt + 100),
      );
      expect(JSON.stringify(scene)).toBe(before);
    }
  });
});
