import { describe, expect, it } from 'vitest';
import { businessEvidenceText } from '../../../../../ai/explainer/business-contract';
import { parsePortfolioExposure } from '../../../../../ai/explainer/kinds-finance';
import { diagramPose } from '../../diagrams/motion';
import { businessPhases, sampleConstraintFocus } from '../motion';
import {
  SHARED_DEPENDENCY_SOURCE_FIXTURES,
  type SharedDependencySourceFixture,
  sharedDependencyFixture,
  sharedDependencyFixtureContext,
} from './dependency-fixtures';
import { sampleCapitalDependency } from './dependency-poses';
import {
  capitalDependencyFacts,
  capitalDependencyPages,
  capitalDependencyReadingFits,
  capitalDependencyReadingStart,
  capitalDependencySemanticIds,
  CAPITAL_DEPENDENCY_READING as R,
} from './dependency-presentation';

function freeze(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  Object.values(value).forEach(freeze);
  Object.freeze(value);
}
function parsed(fixture: SharedDependencySourceFixture, mode: 'diagram' | 'hybrid') {
  const copy = structuredClone(fixture);
  copy.raw.visualMode = mode;
  const before = structuredClone(copy);
  freeze(copy);
  const ctx = sharedDependencyFixtureContext(copy);
  const scene = parsePortfolioExposure(copy.raw, ctx);
  if (!scene?.dependencyLens)
    throw new Error(`Actual source parse failed: ${ctx.issues.join('; ')}`);
  expect(copy).toEqual(before);
  return { scene, lens: scene.dependencyLens, ctx };
}
function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object') return true;
  return Object.values(value).every(finite);
}

const probes = SHARED_DEPENDENCY_SOURCE_FIXTURES.flatMap((fixture, probe) =>
  (['diagram', 'hybrid'] as const).map((mode) => ({ fixture, probe, mode })),
);

describe('OP-58 source-bound pure dependency poses', () => {
  it.each(
    probes,
  )('source probe $probe $mode retains five identities, four qualitative paths and independent model evidence at every 30fps/critical/backward/shuffled seek', ({
    fixture,
    mode,
  }) => {
    const { scene, lens, ctx } = parsed(fixture, mode);
    const before = structuredClone(scene);
    freeze(scene);
    const ids = capitalDependencySemanticIds(scene.funds, scene.exposure, lens);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(scene.holdings).toEqual([]);
    expect(lens.version).toBe(1);
    expect(lens.firms).toHaveLength(2);
    expect(lens.finalHoldSeconds).toBeGreaterThanOrEqual(0.8);
    const facts = capitalDependencyFacts(scene.funds, scene.exposure, lens);
    expect(facts).toHaveLength(6);
    expect(facts.filter((fact) => fact.fromId !== null)).toHaveLength(4);
    for (const fund of scene.funds) {
      const firm = lens.firms.find((entry) => entry.fundId === fund.id);
      if (!firm) throw new Error('Missing source-held firm');
      expect(businessEvidenceText(firm.holdingSource, ctx)).toBe(
        `${fund.label} holds ${firm.identity.label}.`,
      );
      expect(businessEvidenceText(firm.driverSource, ctx)).toBe(
        `${firm.identity.label} depends on ${scene.exposure.label}.`,
      );
      expect(facts.find((fact) => fact.id === `${fund.id}:holds:${firm.identity.id}`)).toEqual({
        id: `${fund.id}:holds:${firm.identity.id}`,
        kind: 'holding',
        text: `Fund ${fund.label} holds firm ${firm.identity.label}.`,
        entityIds: [fund.id, firm.identity.id],
        fromId: fund.id,
        toId: firm.identity.id,
        source: firm.holdingSource,
      });
    }
    expect(businessEvidenceText(lens.modelSource, ctx)).toBe(
      `${scene.funds[0].label} and ${scene.funds[1].label} maintain asset ownership and economic claim records.`,
    );
    expect(facts.find((fact) => fact.kind === 'scope')?.text).toBe(
      'Qualitative dependency; no correlation, risk, numeric weights or payout inferred. Record separation is inspection only, not money or rights movement. Other exposures: not represented in this lens.',
    );
    const pages = capitalDependencyPages(scene, scene.funds, scene.exposure, lens);
    const end = scene.resolveAt + lens.finalHoldSeconds;
    const frames = Array.from({ length: Math.floor(end * 30) + 1 }, (_, index) => index / 30);
    const critical = [
      scene.setupAt,
      scene.actionAt,
      scene.actionAt + 1,
      scene.responseAt,
      capitalDependencyReadingStart(scene),
      scene.checkAt,
      scene.resolveAt,
      end,
      ...pages.flatMap((page) => [page.start, page.end]),
    ].flatMap((seconds) => [seconds - 0.000001, seconds, seconds + 0.000001]);
    const times = [...new Set([...frames, ...critical])];
    const snapshots = new Map(
      times.map((seconds) => {
        const pose = sampleCapitalDependency(scene, lens, seconds);
        const clock = { frame: pose.time * 30, fps: 30, beats: scene };
        expect(finite(pose)).toBe(true);
        expect(pose.sourceLens).toEqual(lens);
        expect(pose.sourceLens).not.toBe(lens);
        expect(pose.semanticIds).toEqual(ids);
        expect(pose.opacity).toBe(businessPhases(clock).setup);
        expect(pose.separation).toBe(businessPhases(clock).action);
        expect(pose.focus).toEqual(sampleConstraintFocus(clock, ids, scene.exposure.id));
        expect(pose.modelTurn).toBe(diagramPose(pose.time, scene).modelTurn);
        expect(
          pose.focus
            .filter((entry) => entry.id !== scene.exposure.id)
            .every((entry) => entry.focus === 0),
        ).toBe(true);
        expect(pose.records.map((record) => [record.fundId, record.firmId])).toEqual(
          scene.funds.map((fund) => [
            fund.id,
            lens.firms.find((firm) => firm.fundId === fund.id)?.identity.id,
          ]),
        );
        expect(pages.map((page) => page.id)).toContain(pose.page.id);
        for (const layout of pose.page.facts)
          expect(layout.fact).toEqual(facts.find((fact) => fact.id === layout.fact.id));
        return [seconds, pose] as const;
      }),
    );
    const shuffled = times
      .filter((_, index) => index % 3 === 2)
      .reverse()
      .concat(
        times.filter((_, index) => index % 3 === 0),
        times.filter((_, index) => index % 3 === 1).reverse(),
      );
    for (const seconds of [...times.slice().reverse(), ...shuffled, ...critical, ...times])
      expect(sampleCapitalDependency(scene, lens, seconds)).toEqual(snapshots.get(seconds));
    const settled = sampleCapitalDependency(scene, lens, scene.resolveAt);
    expect(settled.holding).toBe(true);
    expect(settled.focus.find((entry) => entry.id === scene.exposure.id)?.focus).toBe(1);
    expect(sampleCapitalDependency(scene, lens, scene.resolveAt - 0.001).holding).toBe(false);
    for (const seconds of [scene.resolveAt + 0.8, end, end + 10])
      expect(sampleCapitalDependency(scene, lens, seconds)).toEqual(settled);
    for (const seconds of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const pose = sampleCapitalDependency(scene, lens, seconds);
      expect(finite(pose)).toBe(true);
      expect(pose).toEqual(sampleCapitalDependency(scene, lens, scene.setupAt - 1));
    }
    expect(scene).toEqual(before);
  });

  it('mutable returned pages, source spans, records and focus cannot mutate frozen parsed source or another sample', () => {
    const { scene, lens } = parsed(sharedDependencyFixture({ maxLabels: true }), 'hybrid');
    const before = structuredClone(scene);
    freeze(scene);
    const expected = sampleCapitalDependency(scene, lens, scene.resolveAt);
    const output = sampleCapitalDependency(scene, lens, scene.resolveAt);
    expect(output.sourceLens.firms[0].identity.source).not.toBe(lens.firms[0].identity.source);
    expect(output.sourceLens.modelSource).not.toBe(lens.modelSource);
    output.sourceLens.firms[0].identity.label = 'mutated';
    output.sourceLens.firms[0].identity.source.fromWord = -1;
    output.sourceLens.firms[0].holdingSource.fromWord = -2;
    output.sourceLens.firms[0].driverSource.fromWord = -3;
    output.sourceLens.modelSource.fromWord = -4;
    output.records[0].position[0] = 99;
    output.records[0].fundId = 'mutated';
    output.focus[0].id = 'mutated';
    output.semanticIds[0] = 'mutated';
    output.page.titleLines[0] = 'mutated';
    output.page.facts[0].lines[0] = 'mutated';
    output.page.facts[0].fact.entityIds[0] = 'mutated';
    output.page.facts[0].fact.text = 'mutated';
    if (output.page.facts[0].fact.source) output.page.facts[0].fact.source.fromWord = -5;
    expect(scene).toEqual(before);
    expect(sampleCapitalDependency(scene, lens, scene.resolveAt)).toEqual(expected);
    expect(sampleCapitalDependency(scene, lens, scene.setupAt).sourceLens).toEqual(lens);
  });

  it('source-built maximum 28-character labels and every complete fact use identical pages/IDs/timing in both modes', () => {
    const fixture = sharedDependencyFixture({ maxLabels: true });
    const a = parsed(fixture, 'diagram');
    const b = parsed(fixture, 'hybrid');
    for (const actor of [
      ...a.scene.funds,
      ...a.lens.firms.map((firm) => firm.identity),
      a.scene.exposure,
    ])
      expect(actor.label).toHaveLength(28);
    const pages = capitalDependencyPages(a.scene, a.scene.funds, a.scene.exposure, a.lens);
    expect(pages).toEqual(capitalDependencyPages(b.scene, b.scene.funds, b.scene.exposure, b.lens));
    expect(pages.flatMap((page) => page.facts.map((layout) => layout.fact))).toEqual(
      capitalDependencyFacts(a.scene.funds, a.scene.exposure, a.lens),
    );
    for (const page of pages) {
      expect(page.end - page.start).toBeGreaterThanOrEqual(R.pageHold);
      expect(page.start).toBeGreaterThanOrEqual(capitalDependencyReadingStart(a.scene));
      for (const layout of page.facts) expect(layout.lines.join(' ')).toBe(layout.fact.text);
    }
  });

  it('actual parser rejects a source-retimed complete five-beat story whose post-handoff reading budget is <1.5s', () => {
    const fixture = sharedDependencyFixture({ maxLabels: true });
    const fields = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'];
    const offsets = fields.map((field) => {
      const word = fixture.raw[field];
      if (typeof word !== 'number') throw new Error('Missing source beat');
      return word;
    });
    const intervals = [
      [0.3, 1.05],
      [1.3, 2.4],
      [2.7, 3.65],
      [3.7, 4.8],
      [4.89, 5.65],
    ];
    for (const [phase, from] of offsets.entries()) {
      const to = offsets[phase + 1] ?? fixture.words.length;
      const [start, end] = intervals[phase];
      const step = (end - start) / (to - from);
      for (let word = from; word < to; word++) {
        fixture.words[word].start = start + (word - from) * step;
        fixture.words[word].end = start + (word - from + 1) * step;
      }
    }
    const ctx = sharedDependencyFixtureContext(fixture);
    expect(parsePortfolioExposure(fixture.raw, ctx)).toBeNull();
    expect(ctx.issues.join('; ')).toContain(
      'complete dependency facts must fit fixed-font rails and >=1.5s reading time after the actual handoff',
    );
    const { scene, lens } = parsed(sharedDependencyFixture(), 'hybrid');
    expect(capitalDependencyReadingFits(scene, scene.funds, scene.exposure, lens)).toBe(true);
    expect(
      capitalDependencyReadingFits(scene, scene.funds, scene.exposure, {
        ...lens,
        finalHoldSeconds: 0.799,
      }),
    ).toBe(false);
    expect(
      capitalDependencyReadingFits(
        { ...scene, resolveAt: Number.NaN },
        scene.funds,
        scene.exposure,
        lens,
      ),
    ).toBe(false);
  });
});
