import { expect, it } from 'vitest';
import {
  supplyIncentivesAmount,
  supplyIncentivesPages,
  supplyIncentivesPose,
  supplyIncentivesWrap,
} from './supply-incentives-poses';
import { supplyIncentivesCases } from './supply-incentives-test-fixtures';

const cases = supplyIncentivesCases();
it('real parser accepts maxima, all states and independent paraphrases for both stories', () => {
  expect(cases).toHaveLength(44);

  for (const id of ['73', '74']) {
    const scenes = cases.filter((s) => s.storyId === id);
    expect(new Set(scenes.flatMap((s) => s.records.map((r) => r.state)))).toEqual(
      new Set([
        'stated',
        'unknown',
        'missing',
        'disputed',
        'conditional',
        'simulated',
        'illustrative',
      ]),
    );
    const max = scenes.filter((s) => s.quantities.length === 7);
    expect(max).toHaveLength(4);
    for (const s of max) {
      expect(s.entities).toHaveLength(4);
      expect(s.relations).toHaveLength(5);
      expect(s.records).toHaveLength(5);
      expect(s.entities.every((e) => e.label.length === 28)).toBe(true);
      expect(
        s.records.every(
          (r) =>
            r.stage.length === 32 &&
            r.scope.length === 40 &&
            r.period.length === 32 &&
            r.claim.length === 48 &&
            r.condition?.length === 64,
        ),
      ).toBe(true);
      expect(s.quantities.every((q) => q.claim.length === 96)).toBe(true);
    }
    expect(new Set(max.flatMap((s) => s.quantities.map((q) => q.state)))).toEqual(
      new Set([
        'known',
        'unknown',
        'missing',
        'disputed',
        'conditional',
        'simulated',
        'illustrative',
      ]),
    );
    expect(scenes[2].records[0].claim).toBe('route details');
    expect(scenes[2].records[0].value).toBe('scheduled locally');
    expect(scenes[0].records[0].claim).not.toBe(scenes[2].records[0].claim);
  }
});
for (const [index, scene] of cases.entries())
  it(`source ${index}: immutable repeat/shuffle/holds/boundaries and every actual setup..resolve 30fps page`, () => {
    const before = structuredClone(scene),
      pages = supplyIncentivesPages(scene),
      seen = new Set<number>();
    const frames = Array.from(
      { length: Math.floor(scene.resolveAt * 30) - Math.ceil(scene.setupAt * 30) + 1 },
      (_, i) => (Math.ceil(scene.setupAt * 30) + i) / 30,
    );
    const baseline = frames.map((t) => supplyIncentivesPose(scene, t));
    for (const i of frames
      .map((_, i) => i)
      .sort((a, b) => ((a * 37) % frames.length) - ((b * 37) % frames.length))) {
      const p = supplyIncentivesPose(scene, frames[i]);
      expect(p).toEqual(baseline[i]);
      expect(supplyIncentivesPose(scene, frames[i])).toEqual(p);
      seen.add(p.page);
      expect(
        [p.reveal, p.action, p.response, p.check, p.resolve].every(
          (v) => Number.isFinite(v) && v >= 0 && v <= 1,
        ),
      ).toBe(true);
      expect(p.travel).toBeGreaterThanOrEqual(-0.8);
      expect(p.travel).toBeLessThanOrEqual(0.8);
    }
    expect(seen.size).toBe(pages.length);
    for (const t of [NaN, Infinity, -Infinity])
      expect(supplyIncentivesPose(scene, t)).toEqual(supplyIncentivesPose(scene, scene.setupAt));
    for (const t of [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
    ])
      for (const d of [-1e-7, 0, 1e-7])
        expect(supplyIncentivesPose(scene, t + d).page).toBeGreaterThanOrEqual(0);
    expect(supplyIncentivesPose(scene, scene.setupAt - 100).page).toBe(0);
    expect(supplyIncentivesPose(scene, scene.resolveAt + 0.8)).toEqual(
      supplyIncentivesPose(scene, scene.resolveAt + 100),
    );
    for (const id of new Set(pages.map((p) => p.id))) {
      const continuation = pages.filter((p) => p.id === id),
        first = continuation[0];
      expect(continuation.flatMap((p) => p.lines).join('')).toBe(first.fields.join(''));
      for (const p of continuation) {
        expect(p.state).toBe(first.state);
        expect(p.qualification).toEqual(first.qualification);
        expect(p.lines.length).toBeLessThanOrEqual(6);
        expect(p.qualification.length).toBeLessThanOrEqual(6);
      }
    }
    for (const r of scene.records) {
      const ps = pages.filter((p) => p.id === r.id);
      expect(ps.length).toBeGreaterThan(0);
      for (const p of ps) {
        expect(p.state).toBe(r.state);
        expect(p.qualification.join('')).toBe(r.condition ?? r.qualifier ?? '');
      }
      expect(ps[0].fields).toContain(r.value);
    }
    for (const [i, q] of scene.quantities.entries()) {
      const ps = pages.filter((p) => p.quantityIndex === i);
      expect(ps.length).toBeGreaterThan(0);
      for (const p of ps) {
        expect(p.quantityState).toBe(q.state);
        expect(p.state).toBe(q.state);
        expect(p.qualification.join('')).toBe(
          'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : '',
        );
      }
      if ('amount' in q) expect(ps[0].fields).toContain(supplyIncentivesAmount(q.amount));
      else if (q.state === 'unknown' || q.state === 'missing') {
        expect(ps[0].fields).toEqual([
          q.actor,
          q.claim,
          q.state,
          q.qualifier,
          `Unit: ${q.basis.unit}`,
          `Period: ${q.basis.period}`,
          `Population: ${q.basis.population}`,
          ...(q.basis.denominator
            ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
            : []),
        ]);
        expect(ps[0].fields).not.toContain('0/1');
        expect(ps[0].fields).not.toContain('0 = 0/1');
      }
    }
    expect(scene).toEqual(before);
  });
it('wrap preserves whitespace and exact rational notation without rounding', () => {
  expect(supplyIncentivesWrap('Exact  source text').join('')).toBe('Exact  source text');
  expect(
    supplyIncentivesAmount({
      kind: 'rational',
      value: { numerator: 999999999, denominator: 1000000000 },
      notation: '999999999/1000000000',
    }),
  ).toBe('999999999/1000000000 = 999999999/1000000000');
});
