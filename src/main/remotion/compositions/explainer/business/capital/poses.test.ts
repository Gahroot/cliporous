import { describe, expect, it } from 'vitest';
import { diagramPose } from '../../diagrams/motion';
import { CAPITAL_SOURCE_FIXTURES, capitalFixtureContext, capitalRoundsFixture } from './fixtures';
import { capitalAssembly, sampleCapital } from './poses';
import { capitalPages } from './presentation';
import {
  CAPITAL_LABEL_FIXTURES,
  CAPITAL_RENDER_VARIANTS,
  parsedCapital,
} from './render-test-fixtures';
import { capitalHoldCount, capitalIdentities } from './types';

function freeze(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  Object.values(value).forEach(freeze);
  Object.freeze(value);
}
function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  return value === null || typeof value !== 'object' || Object.values(value).every(finite);
}
const fixtures = [
  ...CAPITAL_SOURCE_FIXTURES,
  ...CAPITAL_RENDER_VARIANTS,
  ...CAPITAL_LABEL_FIXTURES,
];
describe('CAPITAL pure seekable inspection, never simulated financial events', () => {
  it.each(
    fixtures.map((fixture, probe) => ({ fixture, probe })),
  )('$fixture.id source probe $probe is finite, repeated/backward/shuffled immutable and completely settled', ({
    fixture,
  }) => {
    const scene = parsedCapital(fixture),
      ctx = capitalFixtureContext(fixture);
    const snapshot = structuredClone(scene);
    freeze(scene);
    const beats = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
    const first = Math.ceil(ctx.win.startTime * 30);
    const frames = Array.from(
      { length: Math.floor(ctx.win.endTime * 30) - first + 1 },
      (_, i) => (first + i) / 30,
    );
    const shuffled = [...frames.filter((_, i) => i % 2), ...frames.filter((_, i) => !(i % 2))];
    const times = [
      ...frames,
      ...[...frames].reverse(),
      ...shuffled,
      ...beats,
      ...[...beats].reverse(),
      Number.NaN,
      Infinity,
      -Infinity,
    ];
    const final = sampleCapital(scene, scene.resolveAt);
    for (const t of times) {
      const pose = sampleCapital(scene, t);
      expect(finite(pose)).toBe(true);
      expect(sampleCapital(scene, t)).toEqual(pose);
      expect(pose.entityIds).toEqual(capitalIdentities(scene).map((a) => a.id));
      expect(pose.holds).toBe(capitalHoldCount(scene));
      expect(pose.contributed).toBe(false);
      expect(pose.rackActivity).toBe(0);
      for (const field of ['separation', 'folioOpen', 'focus'] as const) {
        expect(pose[field]).toBeGreaterThanOrEqual(0);
        expect(pose[field]).toBeLessThanOrEqual(1);
      }
      if (Number.isFinite(t) && t >= scene.resolveAt) expect(pose).toEqual(final);
      if (!Number.isFinite(t)) expect(pose).toEqual(sampleCapital(scene, scene.setupAt));
    }
    expect(sampleCapital(scene, ctx.win.endTime)).toEqual(final);
    expect(final.modelTurn).toBe(diagramPose(scene.resolveAt, scene).modelTurn);
    const damaged = sampleCapital(scene, scene.resolveAt);
    damaged.entityIds.push('not-a-source-id');
    damaged.maturityLabels.push('not-a-date');
    if (damaged.observedOwnership) damaged.observedOwnership.total = 999;
    expect(sampleCapital(scene, scene.resolveAt)).toEqual(final);
    expect(scene).toEqual(snapshot);
    const expectedAssets =
      fixture.id === 'OP-59'
        ? []
        : fixture.id === 'OP-60'
          ? ['A-09', 'A-12']
          : fixture.id === 'OP-61'
            ? ['A-11', 'A-13']
            : fixture.id === 'OP-62'
              ? ['A-11']
              : ['A-12'];
    expect(capitalAssembly(scene).map((a) => a.asset)).toEqual(expectedAssets);
    expect(finite(capitalAssembly(scene))).toBe(true);
    for (const page of capitalPages(scene)) {
      expect(sampleCapital(scene, page.start + 0.00001).pageId).toBe(page.id);
      expect(sampleCapital(scene, page.start + 1.5 - 0.00001).pageId).toBe(page.id);
    }
  });
  it('M-12 keeps known conditional/proposed commitments and denominators separate from observed issuance at every beat', () => {
    const scene = parsedCapital(capitalRoundsFixture());
    for (const t of [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
    ]) {
      const pose = sampleCapital(scene, t);
      expect(pose.treatment).toBe('M-12');
      expect(pose.folioOpen).toBeLessThanOrEqual(0.32);
      expect(pose.observedOwnership).toEqual({ shares: 40, total: 100, percent: 40 });
      expect(pose.rounds.map((r) => [r.status, r.currentTotal, r.proposedTotal])).toEqual([
        ['pending', 100, 120],
        ['conditional', 100, 120],
      ]);
      expect(pose.contributed).toBe(false);
    }
  });
  it('M-08 source loss, zero, unknown and supplied rational probabilities retain equal frequency/geometry, no numeric interpolation', () => {
    for (const fixture of fixtures.filter((f) => f.id === 'OP-59')) {
      const scene = parsedCapital(fixture);
      if (scene.kind !== 'investment-outcomes') throw new Error('Wrong kind');
      for (const t of [scene.setupAt, scene.responseAt, scene.resolveAt]) {
        const p = sampleCapital(scene, t);
        expect(p.treatment).toBe('M-08');
        expect(
          p.outcomes.map((o) => [o.measure, o.minorUnits, o.equalArea, o.equalFrequency]),
        ).toEqual(scene.outcomes.map((o) => [o.measure, o.amount.money?.minorUnits ?? null, 1, 1]));
      }
    }
  });
  it('M-06 focuses authored source slots by source beat, never by a parsed maturity-date clock', () => {
    const scene = parsedCapital(CAPITAL_SOURCE_FIXTURES[4]);
    expect(sampleCapital(scene, scene.actionAt).maturityFocus).toBe(0);
    expect(sampleCapital(scene, scene.resolveAt).maturityFocus).toBe(1);
    expect(sampleCapital(scene, scene.resolveAt).maturityLabels).toEqual([
      '2030-06-30',
      '2031-06-30',
    ]);
  });
});
