import { expect, it } from 'vitest';
import { signalWaveValue } from '../kits/signals';
import {
  interferenceCycleEligibility,
  interferenceCyclePages,
  interferenceCyclePose,
  interferenceCycleTraces,
  interferenceCycleWaves,
} from './interference-cycle-poses';
import {
  interferenceCycleCases,
  interferenceCycleParameterNames,
} from './interference-cycle-test-fixtures';

const cases = interferenceCycleCases();
for (const [index, scene] of cases.entries()) {
  it(`source ${index}/${scene.visualMode}: complete pages, shuffled/repeated/nonfinite/boundary/final holds`, () => {
    const pages = interferenceCyclePages(scene);
    const reached = new Set<number>();
    for (
      let frame = Math.ceil(scene.setupAt * 30);
      frame <= Math.floor(scene.resolveAt * 30);
      frame++
    )
      reached.add(interferenceCyclePose(scene, frame / 30).page);
    expect([...reached]).toEqual(pages.map((_, i) => i));
    const times = [
      scene.setupAt - 1,
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      scene.resolveAt + 1,
      NaN,
      Infinity,
      -Infinity,
    ];
    const baseline = times.map((t) => interferenceCyclePose(scene, t));
    for (const i of [7, 0, 9, 3, 2, 6, 8, 1, 5, 4, 3, 7]) {
      const pose = interferenceCyclePose(scene, times[i]);
      expect(pose).toEqual(baseline[i]);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const)
        expect(pose[key]).toBeGreaterThanOrEqual(0);
    }
    expect(interferenceCyclePose(scene, scene.resolveAt + 2).page).toBe(pages.length - 1);
    for (const page of pages) {
      expect(page.lines.length).toBeLessThanOrEqual(8);
      expect(page.lines.every((line) => Array.from(line).length <= 36)).toBe(true);
      expect(page.lines[0]).toContain(page.state);
      if (page.state === 'conditional') expect(page.lines.join('')).toContain(scene.condition);
    }
    for (const r of [...scene.records, ...scene.relations]) {
      const sourcePages = pages.filter((p) => p.id.startsWith(`${r.id}/`));
      expect(sourcePages.length).toBeGreaterThan(0);
      for (const page of sourcePages)
        expect(page.lines.join('')).toContain(
          [r.state, r.condition ?? r.qualifier].filter(Boolean).join('; '),
        );
      const header = [r.state, r.condition ?? r.qualifier].filter(Boolean).join('; ');
      const all = sourcePages
        .flatMap((p) => p.lines.slice(Math.ceil(Array.from(header).length / 36)))
        .join('');
      for (const exact of [r.value, r.scope, r.period]) if (exact) expect(all).toContain(exact);
    }
    if (scene.storyId === '77')
      for (const w of scene.waves)
        for (const name of interferenceCycleParameterNames) {
          const q = w[name];
          const key =
            name === 'phaseData' ? 'phase' : name === 'domainDuration' ? 'duration' : name;
          const sourcePages = pages.filter((p) => p.id.startsWith(`${w.id}/${key}/`));
          for (const page of sourcePages)
            expect(page.lines.join('')).toContain(
              [q.state, 'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : undefined]
                .filter(Boolean)
                .join('; '),
            );
          const header = [
            q.state,
            'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : undefined,
          ]
            .filter(Boolean)
            .join('; ');
          const all = sourcePages
            .flatMap((p) => p.lines.slice(Math.ceil(Array.from(header).length / 36)))
            .join('');
          for (const exact of [q.actor, q.claim, q.basis.unit, q.basis.period, q.basis.population])
            expect(all).toContain(exact);
          if ('amount' in q) expect(all).toContain(q.amount.notation);
          if (q.state === 'disputed')
            for (const alternative of q.alternatives) expect(all).toContain(alternative.notation);
        }
  });
  it(`source ${index}/${scene.visualMode}: exact analytic evaluation or genuinely unavailable (not zero)`, () => {
    const waves = interferenceCycleWaves(scene);
    if (!waves) {
      expect(interferenceCycleTraces(scene)).toBeNull();
      return;
    }
    const traces = interferenceCycleTraces(scene);
    const expectedSupported = waves.every(
      (w) => w.frequency * (w.domain[1] - w.domain[0]) * 8 <= 63,
    );
    expect(interferenceCycleEligibility(scene)).toBe(
      expectedSupported ? 'supported' : 'resolution-unavailable',
    );
    if (!expectedSupported) {
      expect(traces).toBeNull();
      if (scene.storyId !== '77') throw new Error('Missing source waves');
      for (const wave of scene.waves)
        for (const q of [wave.amplitude, wave.frequency, wave.phaseData, wave.domainDuration])
          expect(q.state).toBe('known');
      expect(waves[0].frequency).toBe(1000);
      expect(waves[0].domain[1]).toBe(10000);
      return;
    }
    expect(traces?.length).toBe(waves[0].domain[1] === waves[1].domain[1] ? 3 : 2);
    for (const wave of waves)
      for (const u of [0, wave.domain[1] / 3, wave.domain[1]])
        expect(signalWaveValue(wave, u)).toBe(
          wave.amplitude * Math.sin(2 * Math.PI * wave.frequency * u + wave.phase),
        );
    if (!traces) throw new Error('Missing curves');
    const parsed = traces.map((trace) =>
      trace.split(' ').map((point) => point.split(',').map(Number)),
    );
    for (const trace of parsed) {
      expect(trace).toHaveLength(64);
      expect(trace.flat().every(Number.isFinite)).toBe(true);
      expect(trace[0][0]).toBe(100);
      expect(trace[63][0]).toBe(800);
    }
    if (parsed.length === 3)
      for (let i = 0; i < 64; i++)
        expect(parsed[2][i][1]).toBeCloseTo(parsed[0][i][1] + parsed[1][i][1] - 145, 10);
  });
}
it('stress inventory includes each parameter and each fact in all seven states, exact near-bound/fractional/zero domains', () => {
  for (const wi of [0, 1])
    for (const name of interferenceCycleParameterNames)
      expect(
        new Set(
          cases
            .filter((s) => s.storyId === '77')
            .map((s) => (s.storyId === '77' ? s.waves[wi][name].state : null)),
        ),
      ).toEqual(
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
  for (const id of ['77', '78'])
    for (let i = 0; i < (id === '77' ? 2 : 4); i++)
      expect(
        new Set(
          cases.filter((s) => s.storyId === id).map((s) => [...s.records, ...s.relations][i].state),
        ),
      ).toEqual(
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
  const text = cases
    .flatMap(interferenceCyclePages)
    .flatMap((p) => p.lines)
    .join('');
  for (const exact of [
    '999999.999',
    '1000.000',
    '6.283185',
    '10000.000',
    '1/1000000000',
    'denominator 1/3',
  ])
    expect(text).toContain(exact);
});
