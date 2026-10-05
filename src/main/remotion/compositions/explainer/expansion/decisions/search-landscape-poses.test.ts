import { expect, it } from 'vitest';
import { compare } from '../value-logic';
import { searchPages, searchPose, searchQuantityText } from './search-landscape-poses';
import {
  parseSearch,
  quantityStates,
  searchCases,
  searchMaximumSeed,
  searchRawFixtures,
  searchStressSeed,
} from './search-landscape-test-fixtures';

it('real raw parsers, both modes, every authored frame and repeated shuffled/nonfinite seeks', () => {
  for (const fixture of searchRawFixtures)
    expect(parseSearch(fixture, 'diagram')).toEqual({
      ...parseSearch(fixture, 'hybrid'),
      visualMode: 'diagram',
    });
  for (const scene of searchCases()) {
    const frames = Array.from({ length: 361 }, (_, i) => i / 30);
    const baseline = frames.map((t) => searchPose(scene, t));
    const visited = new Set<number>();
    for (const i of [...frames.keys()].sort((a, b) => ((a * 73) % 361) - ((b * 73) % 361))) {
      const p = searchPose(scene, frames[i]);
      expect(p).toEqual(baseline[i]);
      expect(searchPose(scene, frames[i])).toEqual(p);
      visited.add(p.page);
      for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
        expect(Number.isFinite(p[key])).toBe(true);
        expect(p[key]).toBeGreaterThanOrEqual(0);
        expect(p[key]).toBeLessThanOrEqual(1);
      }
    }
    expect(visited.size).toBe(searchPages(scene).length);
    for (const t of [NaN, Infinity, -Infinity])
      expect(searchPose(scene, t)).toEqual(searchPose(scene, scene.setupAt - 1));
    expect(searchPose(scene, scene.resolveAt + 1)).toEqual(searchPose(scene, 100));
    expect(searchPages(scene).at(-1)?.text).toContain(scene.result.status);
  }
});
it('accepted maximum quantity caps and all map qualifications/statuses remain distinct from zero', () => {
  for (const state of quantityStates)
    for (const id of ['29', '30'] as const) {
      const scene = parseSearch(searchStressSeed(id, state));
      const q = scene.storyId === '29' ? scene.links[0].cost : scene.wells[0].value;
      if (!q) throw new Error('Lost supplied value');
      expect(q.state).toBe(state);
      expect(q.basis.period.length).toBe(32);
      expect(q.basis.population.length).toBe(40);
      expect(scene.entities.every((e) => e.label.length === 28)).toBe(true);
      expect(
        searchPages(scene)
          .map((p) => p.lines.join(''))
          .join(''),
      ).toContain(searchQuantityText(q));
      if (state === 'unknown' || state === 'missing') expect(q).not.toHaveProperty('amount');
      if ('qualifier' in q && (state === 'simulated' || state === 'illustrative'))
        expect(q.qualifier.length).toBe(96);
    }
  const maximum = parseSearch(searchMaximumSeed());
  if (maximum.storyId !== '29') throw new Error('Wrong story');
  expect(maximum.links).toHaveLength(4);
  expect(maximum.frontier.nodeIds).toHaveLength(4);
  expect(maximum.links[3].condition?.length).toBe(96);
  const exact = [
    { numerator: 0, denominator: 1 },
    { numerator: 1000000000, denominator: 1 },
    { numerator: 1, denominator: 1000000000 },
    { numerator: 1000000000, denominator: 1 },
  ];
  maximum.links.forEach((link, i) => {
    if (!link.cost || !('amount' in link.cost) || link.cost.amount.kind !== 'rational')
      throw new Error('Lost exact source operand');
    expect(compare(link.cost.amount.value, exact[i])).toEqual({ ok: true, value: 0 });
    expect(searchQuantityText(link.cost)).toContain(
      link.cost.amount.notation ?? String(exact[i].numerator),
    );
  });
  for (const qualification of ['illustrative', 'simulated'] as const)
    for (const state of quantityStates)
      for (const unresolved of [false, true]) {
        const seed = searchStressSeed('30', state, qualification, 'blocked', unresolved);
        const diagram = parseSearch(seed),
          hybrid = parseSearch(seed, 'hybrid');
        expect(diagram).toEqual({ ...hybrid, visualMode: 'diagram' });
        if (diagram.storyId === '30') expect(diagram.objective.label.length).toBe(28);
      }
  for (const qualification of ['source', 'illustrative', 'simulated'] as const)
    for (const status of ['open', 'blocked', 'unknown', 'missing', 'disputed']) {
      const scene = parseSearch(searchStressSeed('29', 'known', qualification, status));
      expect(scene.qualification).toBe(qualification);
      if (scene.storyId === '29')
        expect(scene.nodes.find((n) => n.slot === 'lower')?.status).toBe(status);
    }
});
