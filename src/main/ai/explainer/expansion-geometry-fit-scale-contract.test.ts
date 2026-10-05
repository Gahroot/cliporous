import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionFitScaleScene } from '../../remotion/compositions/explainer/expansion/geometry/fit-scale-types';
import {
  parseExpansionLinkedScale,
  parseExpansionPackingClearance,
} from './expansion-geometry-fit-scale-contract';
import { temporalSourceFixtures } from './expansion-temporal-fixtures';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/geometry/fit-scale.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const fixtures = temporalSourceFixtures(packet.stories);
const MODES = ['diagram', 'hybrid'] as const;
const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
type Fixture = (typeof fixtures)[number];
function object(v: unknown): Rec {
  if (!isRec(v)) throw new Error('raw object required');
  return v;
}
function rows(v: unknown): Rec[] {
  if (!Array.isArray(v) || !v.every(isRec)) throw new Error('raw rows required');
  return v;
}
function parse(f: Fixture, p = f.proposal, offset = 0) {
  const ctx = makeParseContext(
    f.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })),
    { ...f.window, startTime: f.window.startTime + offset, endTime: f.window.endTime + offset },
  );
  return {
    scene:
      f.id === '59' ? parseExpansionPackingClearance(p, ctx) : parseExpansionLinkedScale(p, ctx),
    ctx,
  };
}
function good(f: Fixture): ExpansionFitScaleScene {
  const before = structuredClone(f);
  const a = parse(f, { ...f.proposal, visualMode: 'diagram' }),
    b = parse(f, { ...f.proposal, visualMode: 'hybrid' });
  expect(a.ctx.issues).toEqual([]);
  expect(b.ctx.issues).toEqual([]);
  expect(a.scene).not.toBeNull();
  expect(b.scene).toEqual({ ...a.scene, visualMode: 'hybrid' });
  expect(f).toEqual(before);
  if (!a.scene) throw new Error('scene required');
  return a.scene;
}
function facts(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(facts);
  if (!isRec(v)) return v;
  return Object.fromEntries(
    Object.entries(v)
      .filter(
        ([k]) =>
          !['visualMode', 'sourceSpans', 'evidence', 'notation'].includes(k) &&
          !PHASES.some((p) => k === `${p}At`),
      )
      .map(([k, v]) => [k, facts(v)]),
  );
}
it('persists complete version1 geometry scenes and hydrates existing compact negatives', () => {
  expect([packet.version, packet.pack]).toEqual([1, 'geometry']);
  expect(fixtures).toHaveLength(4);
  for (const f of fixtures) {
    expect(expansionEntry(f.proposal.kind, f.proposal.preset)?.allowedDerivations).toEqual([]);
    expect(f.words[0].start).toBe(0.25);
    expect(f.window.endTime - f.words[f.words.length - 1].end).toBeCloseTo(0.35, 9);
  }
});
for (const f of fixtures) {
  it(`${f.id}: parses exact source facts/IDs/qualifications in both modes`, () => {
    const s = good(f);
    expect(s.records.map((r) => r.id)).toEqual(
      s.records.map((_, i) => `expansion-${f.id}-record-${i}`),
    );
    rows(f.proposal.records).forEach((r, i) => {
      expect([s.records[i].label, s.records[i].state, s.records[i].evidence]).toEqual([
        r.label,
        r.state,
        r.evidence,
      ]);
    });
    s.dimensions.forEach((d, i) => {
      const raw = rows(f.proposal.dimensions)[i],
        q = object(raw.quantity);
      expect(d.id).toBe(`expansion-${f.id}-dimension-${i}`);
      expect(s.records.find((r) => r.id === d.recordId)?.label).toBe(raw.record);
      expect([
        d.axis,
        d.quantity.actor,
        d.quantity.claim,
        d.quantity.basis,
        d.quantity.state,
        d.quantity.evidence,
      ]).toEqual([raw.axis, q.actor, q.claim, q.basis, q.state, q.evidence]);
      if ('amount' in d.quantity)
        expect(d.quantity.amount).toEqual({
          ...object(q.amount),
          notation: d.quantity.amount.notation,
        });
      if ('qualifier' in d.quantity) expect(d.quantity.qualifier).toBe(q.qualifier);
    });
    s.relations.forEach((r, i) => {
      const raw = rows(f.proposal.relations)[i];
      expect(r.id).toBe(`expansion-${f.id}-relation-${i}`);
      expect([r.type, r.state, r.evidence]).toEqual([raw.type, raw.state, raw.evidence]);
      expect(s.records.find((record) => record.id === r.fromId)?.label).toBe(raw.from);
      expect(s.records.find((record) => record.id === r.toId)?.label).toBe(raw.to);
      expect(r.identityId).toBe(s.identityId);
    });
    expect(s.result.id).toBe(`expansion-${f.id}-result`);
    expect(new Set(Object.values(s.sourceSpans).map((v) => v.fromWord)).size).toBe(5);
    PHASES.forEach((p, i) => {
      expect(s.sourceSpans[p].fromWord).toBe(f.proposal[`${p}Word`]);
      expect(s[`${p}At`]).toBe(
        i === 0
          ? Math.max(0.3, f.words[Number(f.proposal[`${p}Word`])].start)
          : f.words[Number(f.proposal[`${p}Word`])].start,
      );
      if (i) expect(s[`${p}At`] - s[`${PHASES[i - 1]}At`]).toBeGreaterThanOrEqual(1);
    });
    expect(f.window.endTime - s.resolveAt).toBeGreaterThanOrEqual(0.8);
    for (const mode of MODES) {
      const shifted = parse(f, { ...f.proposal, visualMode: mode }, 40);
      expect(shifted.ctx.issues).toEqual([]);
      expect(facts(shifted.scene)).toEqual(facts(s));
      if (!shifted.scene) throw new Error('shifted scene required');
      PHASES.forEach((p) => {
        expect(shifted.scene?.[`${p}At`]).toBeCloseTo(s[`${p}At`] + 40, 9);
      });
    }
    if (s.storyId === '60') {
      expect(s.representation).toBe('schematic');
      expect(s.records.map((r) => r.identityId)).toEqual([
        s.identityId,
        s.identityId,
        s.identityId,
      ]);
      expect(s.result.levelIds).toEqual(s.records.map((r) => r.id));
      expect(s.dimensions).toEqual([]);
    } else {
      expect(object(s).representation).toBe('schematic');
      expect(s.result.verdict).toBe(object(f.proposal.result).verdict);
      expect(s.result.state).toBe('conditional');
      expect('condition' in s.result ? s.result.condition : undefined).toBe('if rotated');
      expect(s.dimensions[2].quantity.state).toBe('unknown');
      expect('amount' in s.dimensions[2].quantity).toBe(false);
    }
    expect(parse(f).scene).toEqual(s);
  });
  for (const bad of f.negatives)
    for (const mode of MODES)
      it(`${f.id}: ${bad.name} rejects in ${mode} with diagnostics`, () => {
        const p = {
          ...bad.proposal,
          visualMode: MODES.some((m) => m === bad.proposal.visualMode)
            ? mode
            : bad.proposal.visualMode,
        };
        const input = { ...f, words: bad.words ?? f.words, window: bad.window ?? f.window };
        const before = structuredClone({ p, words: input.words });
        const result = parse(input, p);
        expect(result.scene).toBeNull();
        expect(result.ctx.issues.length).toBeGreaterThan(0);
        expect({ p, words: input.words }).toEqual(before);
      });
  it(`${f.id}: rejects invalid intervals and arbitrary domain/animation fields`, () => {
    for (const value of [NaN, Infinity, -1, f.words[2].start]) {
      const words = structuredClone(f.words);
      words[2].end = value;
      for (const mode of MODES) {
        const result = parse({ ...f, words }, { ...f.proposal, visualMode: mode });
        expect(result.scene).toBeNull();
        expect(result.ctx.issues.length).toBeGreaterThan(0);
      }
    }
    for (const key of [
      'at',
      'camera',
      'coords',
      'world',
      'morph',
      'ratio',
      'derived',
      'recovery',
      'treatment',
    ]) {
      const result = parse(f, { ...f.proposal, [key]: {} });
      expect(result.scene).toBeNull();
      expect(result.ctx.issues.length).toBeGreaterThan(0);
    }
  });
}
function rewrite(f: Fixture, clauses: readonly string[]): Fixture {
  const hydrated = temporalSourceFixtures([
    {
      ...f,
      negatives: [],
      paraphrases: [{ name: 'qualified source', clauses, outcome: String(f.proposal.outcome) }],
    },
  ]);
  if (hydrated.length !== 2) throw new Error('Complete source rewrite required');
  return hydrated[1];
}
for (const state of [
  'unknown',
  'missing',
  'disputed',
  'conditional',
  'simulated',
  'illustrative',
] as const) {
  it(`59: preserves ${state} supplied dimensions independently of schematic geometry and fit`, () => {
    const f = fixtures[0],
      clauses = f.sourceText.split(/(?<=[.!?;])\s+/u);
    const number =
      state === 'unknown' || state === 'missing'
        ? state
        : state === 'disputed'
          ? 'disputed between 10 and 11'
          : '10';
    const prefix =
      state === 'simulated'
        ? 'In this simulation, '
        : state === 'illustrative'
          ? 'In this illustrative example, '
          : '';
    clauses[3] = `${prefix}Ava Tray width is ${number} centimetres during Trial for Bench${state === 'conditional' ? ' if the gauge is ready' : ''}.`;
    const edited = rewrite(f, clauses),
      q = object(rows(edited.proposal.dimensions)[0].quantity);
    q.state = state;
    if (state === 'unknown' || state === 'missing') {
      delete q.amount;
      q.qualifier = state;
    }
    if (state === 'disputed') {
      q.alternatives = [q.amount, { kind: 'rational', value: { numerator: 11, denominator: 1 } }];
      delete q.amount;
      q.qualifier = state;
    }
    if (state === 'conditional') q.condition = 'if the gauge is ready';
    if (state === 'simulated' || state === 'illustrative') {
      q.qualifier = state === 'simulated' ? 'simulation' : 'illustrative example';
      edited.proposal.evidence = 'illustrative';
    }
    const s = good(edited);
    expect(s.dimensions[0].quantity.state).toBe(state);
    expect(object(s).representation).toBe('schematic');
    if (s.storyId !== '59') throw new Error('Packing scene required');
    expect([s.result.verdict, s.result.state]).toEqual(['fits', 'conditional']);
    if ('qualifier' in s.dimensions[0].quantity)
      expect(s.dimensions[0].quantity.qualifier).toBe(q.qualifier);
    if ('condition' in s.dimensions[0].quantity)
      expect(s.dimensions[0].quantity.condition).toBe(q.condition);
    if (state === 'unknown' || state === 'missing')
      expect('amount' in s.dimensions[0].quantity).toBe(false);
    if (s.dimensions[0].quantity.state === 'disputed')
      expect(
        s.dimensions[0].quantity.alternatives.map((a) =>
          a.kind === 'rational' ? a.value : undefined,
        ),
      ).toEqual([
        { numerator: 10, denominator: 1 },
        { numerator: 11, denominator: 1 },
      ]);
  });
}
it('59: unknown source verdict is not inferred from dimensions or schematic clearance', () => {
  const f = fixtures[0],
    clauses = f.sourceText.split(/(?<=[.!?;])\s+/u);
  clauses[7] = 'Ava reports fit of Crate in Tray is unknown for Bench during Trial.';
  const edited = rewrite(f, clauses),
    result = object(edited.proposal.result);
  Object.assign(result, { state: 'unknown', qualifier: 'unknown', verdict: 'unknown' });
  delete result.condition;
  edited.proposal.outcome = 'unknown';
  const s = good(edited);
  if (s.storyId !== '59') throw new Error('Packing scene required');
  expect(s.result.verdict).toBe('unknown');
  expect(s.dimensions[2].quantity.state).toBe('unknown');
});
for (const id of ['59', '60'] as const)
  it(`${id}: independent paraphrase preserves domain facts and stable identities`, () => {
    const variants = fixtures.filter((f) => f.id === id);
    expect(variants).toHaveLength(2);
    expect(variants[0].sourceText).not.toBe(variants[1].sourceText);
    expect(facts(good(variants[0]))).toEqual(facts(good(variants[1])));
  });
