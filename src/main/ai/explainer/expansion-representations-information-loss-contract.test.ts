import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionInformationLossScene } from '../../remotion/compositions/explainer/expansion/representations/information-loss-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  parseExpansionAggregationLoss,
  parseExpansionCompressionLoss,
} from './expansion-representations-information-loss-contract';
import { temporalSourceFixtures } from './expansion-temporal-fixtures';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/representations/information-loss.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const fixtures = temporalSourceFixtures(packet.stories);
const MODES = ['diagram', 'hybrid'] as const;
const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function object(raw: unknown): Rec {
  if (!isRec(raw)) throw new Error('Expected complete raw object');
  return raw;
}
function rows(raw: unknown): Rec[] {
  if (!Array.isArray(raw) || !raw.every(isRec)) throw new Error('Expected raw rows');
  return raw;
}
type Fixture = (typeof fixtures)[number];
function parse(f: Fixture, proposal = f.proposal, offset = 0) {
  const words = f.words.map((word) => ({
    ...word,
    start: word.start + offset,
    end: word.end + offset,
  }));
  const win = {
    ...f.window,
    startTime: f.window.startTime + offset,
    endTime: f.window.endTime + offset,
  };
  const ctx = makeParseContext(words, win);
  const scene =
    f.id === '51'
      ? parseExpansionAggregationLoss(proposal, ctx)
      : parseExpansionCompressionLoss(proposal, ctx);
  return { scene, ctx };
}
function positive(f: Fixture, proposal = f.proposal, offset = 0): ExpansionInformationLossScene {
  const before = structuredClone({ proposal, words: f.words, window: f.window });
  const diagram = parse(f, { ...proposal, visualMode: 'diagram' }, offset);
  const hybrid = parse(f, { ...proposal, visualMode: 'hybrid' }, offset);
  expect(diagram.ctx.issues).toEqual([]);
  expect(hybrid.ctx.issues).toEqual([]);
  expect(diagram.scene).not.toBeNull();
  expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
  expect({ proposal, words: f.words, window: f.window }).toEqual(before);
  if (!diagram.scene) throw new Error('Expected source-bound scene');
  return diagram.scene;
}
function reject(f: Fixture, proposal = f.proposal) {
  for (const mode of MODES) {
    const result = parse(f, {
      ...proposal,
      visualMode: MODES.some((m) => m === proposal.visualMode) ? mode : proposal.visualMode,
    });
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.length).toBeGreaterThan(0);
  }
}
function rewrite(f: Fixture, texts: readonly string[]): Fixture {
  const result = temporalSourceFixtures([
    {
      ...f,
      negatives: [],
      paraphrases: [
        { name: 'qualified source', clauses: texts, outcome: String(f.proposal.outcome) },
      ],
    },
  ]);
  if (result.length !== 2) throw new Error('Expected exact complete-source rewrite');
  return result[1];
}
function sourceClauses(f: Fixture): string[] {
  return f.sourceText.split(/(?<=[.!?;])\s+/u);
}
function canonical(id: '51' | '52'): Fixture {
  const f = fixtures.find((entry) => entry.id === id);
  if (!f) throw new Error('Missing canonical scene');
  return f;
}
function facts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(facts);
  if (!isRec(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !['visualMode', 'sourceSpans', 'evidence', 'notation'].includes(key) &&
          !PHASES.some((phase) => key === `${phase}At`),
      )
      .map(([key, entry]) => [key, facts(entry)]),
  );
}
it('hydrates the existing compact packet without inferring facts', () => {
  expect([packet.version, packet.pack]).toEqual([1, 'representations']);
  expect(packet.stories.map((f: Rec) => f.id)).toEqual(['51', '52']);
  expect(
    packet.stories.reduce((total: number, f: Rec) => total + rows(f.negatives).length, 0),
  ).toBe(57);
  for (const f of fixtures) {
    expect(f.words[0].start - f.window.startTime).toBe(0.25);
    expect(f.window.endTime - f.words[f.words.length - 1].end).toBeCloseTo(0.35, 9);
    expect(expansionEntry(f.proposal.kind, f.proposal.preset)?.allowedDerivations).toEqual([]);
  }
});
for (const id of ['51', '52'] as const) {
  it(`${id}: independent paraphrase preserves all identities and supplied facts`, () => {
    const variants = fixtures.filter((f) => f.id === id);
    expect(variants).toHaveLength(2);
    expect(variants[1].sourceText).not.toBe(variants[0].sourceText);
    expect(facts(positive(variants[1]))).toEqual(facts(positive(variants[0])));
  });
}
for (const f of fixtures) {
  describe(`story ${f.id}`, () => {
    it('parses complete source facts in both modes, with stable identity and no numeric derivation', () => {
      const scene = positive(f);
      expect(scene.entities.map((e) => e.id)).toEqual(
        scene.entities.map((_, i) => expansionEntityId(f.id, i)),
      );
      expect(scene.records.map((r) => r.id)).toEqual(
        scene.records.map((_, i) => `expansion-${f.id}-record-${i}`),
      );
      const rawRecords = rows(f.proposal.records);
      scene.records.forEach((r, i) => {
        expect([r.label, r.stage, r.details, r.state, r.evidence]).toEqual([
          rawRecords[i].label,
          rawRecords[i].stage,
          rawRecords[i].details,
          rawRecords[i].state,
          rawRecords[i].evidence,
        ]);
      });
      const rawRelations = rows(f.proposal.relations);
      scene.relations.forEach((r, i) => {
        expect(r.id).toBe(`expansion-${f.id}-relation-${i}`);
        expect([r.type, r.state, r.detail, r.evidence]).toEqual([
          rawRelations[i].type,
          rawRelations[i].state,
          rawRelations[i].detail,
          rawRelations[i].evidence,
        ]);
        expect(scene.records.find((record) => record.id === r.fromId)?.label).toBe(
          rawRelations[i].from,
        );
        expect(scene.records.find((record) => record.id === r.toId)?.label).toBe(
          rawRelations[i].to,
        );
        if ('qualifier' in r) expect(r.qualifier).toBe(rawRelations[i].qualifier);
        if ('condition' in r) expect(r.condition).toBe(rawRelations[i].condition);
      });
      const rawValues = rows(f.proposal.quantities);
      scene.quantities.forEach((value, i) => {
        const raw = object(rawValues[i].quantity),
          q = value.quantity;
        expect(value.id).toBe(`expansion-${f.id}-value-${i}`);
        expect(scene.records.find((r) => r.id === value.recordId)?.label).toBe(rawValues[i].record);
        expect([value.detail, q.actor, q.claim, q.state, q.basis, q.evidence]).toEqual([
          rawValues[i].detail,
          raw.actor,
          raw.claim,
          raw.state,
          raw.basis,
          raw.evidence,
        ]);
        if ('amount' in q)
          expect(q.amount).toEqual({ ...object(raw.amount), notation: q.amount.notation });
        if ('qualifier' in q) expect(q.qualifier).toBe(raw.qualifier);
        if ('condition' in q) expect(q.condition).toBe(raw.condition);
      });
      expect(scene.result.id).toBe(`expansion-${f.id}-result`);
      expect([scene.result.behavior, scene.result.state, scene.result.evidence]).toEqual([
        object(f.proposal.result).behavior,
        object(f.proposal.result).state,
        object(f.proposal.result).evidence,
      ]);
      expect(
        scene.relations.some((r) => r.type === (f.id === '51' ? 'grouping' : 'correspondence')),
      ).toBe(true);
      expect(scene.relations.some((r) => r.type === 'retained')).toBe(true);
      expect(new Set(Object.values(scene.sourceSpans).map((span) => span.fromWord)).size).toBe(5);
      PHASES.forEach((phase, i) => {
        expect(scene.sourceSpans[phase].fromWord).toBe(f.proposal[`${phase}Word`]);
        const index = Number(f.proposal[`${phase}Word`]);
        expect(scene[`${phase}At`]).toBe(
          i === 0 ? Math.max(0.3, f.words[index].start) : f.words[index].start,
        );
        if (i > 0)
          expect(scene[`${phase}At`] - scene[`${PHASES[i - 1]}At`]).toBeGreaterThanOrEqual(1);
      });
      expect(f.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      const shifted = positive(f, f.proposal, 40);
      expect(facts(shifted)).toEqual(facts(scene));
      PHASES.forEach((phase) => {
        expect(shifted[`${phase}At`]).toBeCloseTo(scene[`${phase}At`] + 40, 9);
      });
      expect(parse(f).scene).toEqual(scene);
    });
    for (const bad of f.negatives)
      for (const mode of MODES) {
        it(`rejects ${bad.name} in ${mode} with diagnostics`, () => {
          const proposal = {
            ...bad.proposal,
            visualMode: MODES.some((m) => m === bad.proposal.visualMode)
              ? mode
              : bad.proposal.visualMode,
          };
          const input = { ...f, words: bad.words ?? f.words, window: bad.window ?? f.window };
          const before = structuredClone({ proposal, words: input.words });
          const result = parse(input, proposal);
          expect(result.scene).toBeNull();
          expect(result.ctx.issues.length).toBeGreaterThan(0);
          expect({ proposal, words: input.words }).toEqual(before);
        });
      }
    it('rejects finite/positive/nonoverlap word defects, arbitrary geometry and executable input', () => {
      for (const value of [NaN, Infinity, -1, f.words[2].start]) {
        const words = structuredClone(f.words);
        words[2].end = value;
        reject({ ...f, words });
      }
      const words = structuredClone(f.words);
      words[2].start = words[1].end - 2e-7;
      reject({ ...f, words });
      for (const field of [
        'at',
        'camera',
        'geometry',
        'html',
        'svg',
        'pixels',
        'recovery',
        'ratio',
      ])
        reject(f, { ...f.proposal, [field]: {} });
      reject(f, {
        ...f.proposal,
        label: () => {
          throw new Error('Untrusted functions must not execute');
        },
      });
    });
  });
}

for (const state of [
  'known',
  'unknown',
  'missing',
  'disputed',
  'conditional',
  'simulated',
  'illustrative',
] as const) {
  it(`retains ${state} supplied numeric facts without calculating any output`, () => {
    const f = canonical('51'),
      texts = sourceClauses(f);
    const value =
      state === 'unknown' || state === 'missing'
        ? state
        : state === 'disputed'
          ? 'disputed between 4 and 7'
          : '4';
    const prefix =
      state === 'simulated'
        ? 'In this simulation, '
        : state === 'illustrative'
          ? 'In this illustrative example, '
          : '';
    texts[3] = `${prefix}Ada Batch tone is ${value} bytes during Morning for Clinic${state === 'conditional' ? ' if the review passes' : ''}.`;
    const edited = rewrite(f, texts),
      q = object(rows(edited.proposal.quantities)[0].quantity);
    q.state = state;
    delete q.qualifier;
    delete q.condition;
    if (state === 'unknown' || state === 'missing') {
      delete q.amount;
      q.qualifier = state;
    }
    if (state === 'disputed') {
      q.qualifier = state;
      q.alternatives = [q.amount, { kind: 'rational', value: { numerator: 7, denominator: 1 } }];
      delete q.amount;
    }
    if (state === 'conditional') q.condition = 'if the review passes';
    if (state === 'simulated' || state === 'illustrative') {
      q.qualifier = state === 'simulated' ? 'simulation' : 'illustrative example';
      edited.proposal.evidence = 'illustrative';
    }
    const scene = positive(edited),
      actual = scene.quantities[0].quantity;
    expect(actual.state).toBe(state);
    expect(scene.result.behavior).toBe('lossy');
    if ('qualifier' in actual) expect(actual.qualifier).toBe(q.qualifier);
    if ('condition' in actual) expect(actual.condition).toBe(q.condition);
    if (state === 'unknown' || state === 'missing') expect('amount' in actual).toBe(false);
    if (actual.state === 'disputed')
      expect(actual.alternatives.map((a) => (a.kind === 'rational' ? a.value : undefined))).toEqual(
        [
          { numerator: 4, denominator: 1 },
          { numerator: 7, denominator: 1 },
        ],
      );
    if (state !== 'known') {
      const stripped = structuredClone(edited.proposal);
      object(rows(stripped.quantities)[0].quantity).state = 'known';
      reject(edited, stripped);
    }
  });
}

for (const state of [
  'unknown',
  'missing',
  'disputed',
  'conditional',
  'simulated',
  'illustrative',
] as const) {
  it(`preserves ${state} record and same-record grouping qualifications independently of supplied loss`, () => {
    const f = canonical('51'),
      texts = sourceClauses(f);
    const prefix =
      state === 'simulated'
        ? 'In this simulation, '
        : state === 'illustrative'
          ? 'In this illustrative example, '
          : '';
    const absent = ['unknown', 'missing', 'disputed'].includes(state);
    const suffix = state === 'conditional' ? ' if the review passes' : '';
    texts[1] = `${prefix}${absent ? `Ada reports Batch input with zone and tone is ${state}` : 'Ada supplies Batch input with zone and tone'} for Clinic during Morning${suffix}.`;
    texts[5] = `${prefix}${absent ? `Ada reports Batch grouping into Overview is ${state}` : 'Ada groups Batch into Overview'} for Clinic during Morning${suffix}.`;
    const edited = rewrite(f, texts);
    for (const value of [rows(edited.proposal.records)[0], rows(edited.proposal.relations)[0]]) {
      value.state = state;
      if (state === 'conditional') value.condition = 'if the review passes';
      else
        value.qualifier =
          state === 'simulated'
            ? 'simulation'
            : state === 'illustrative'
              ? 'illustrative example'
              : state;
    }
    if (state === 'simulated' || state === 'illustrative')
      edited.proposal.evidence = 'illustrative';
    const scene = positive(edited);
    expect([scene.records[0].state, scene.relations[0].state]).toEqual([state, state]);
    expect(scene.relations[0].fromId).toBe(scene.records[0].id);
    expect(scene.result.behavior).toBe('lossy');
  });
}

for (const state of ['unknown', 'conditional', 'simulated'] as const) {
  it(`preserves explicitly supplied ${state} behavior instead of deriving loss or recovery`, () => {
    const f = canonical('51'),
      texts = sourceClauses(f);
    const behavior = state === 'unknown' ? 'unknown' : 'lossy';
    texts[9] = `${state === 'simulated' ? 'In this simulation, ' : ''}Ada reports transformation of Batch into Overview is ${behavior} for Clinic during Morning${state === 'conditional' ? ' if the review passes' : ''}.`;
    const edited = rewrite(f, texts),
      result = object(edited.proposal.result);
    edited.proposal.outcome = behavior;
    Object.assign(result, { state, behavior });
    if (state === 'conditional') result.condition = 'if the review passes';
    else result.qualifier = state === 'simulated' ? 'simulation' : 'unknown';
    if (state === 'simulated') edited.proposal.evidence = 'illustrative';
    const scene = positive(edited);
    expect([scene.result.state, scene.result.behavior]).toEqual([state, behavior]);
    expect('recovery' in scene.result).toBe(false);
    expect('derived' in scene.result).toBe(false);
  });
}

it('rejects a qualified omission contradicting that exact qualified output record', () => {
  const f = canonical('52'),
    texts = sourceClauses(f);
  texts[5] = texts[5].replace('retains', 'omits').replace('in Packed', 'from Packed');
  const edited = rewrite(f, texts);
  rows(edited.proposal.relations)[1].type = 'omitted';
  reject(edited);
});

for (const id of ['51', '52'] as const) {
  it(`${id}: strictly enforces 1s gaps and 0.8s hold, including at nonzero source time`, () => {
    const f = canonical(id);
    for (const defect of ['gap', 'hold'] as const) {
      const words = structuredClone(f.words);
      const index = Number(f.proposal[defect === 'gap' ? 'actionWord' : 'resolveWord']);
      const start = defect === 'gap' ? 1.3 - 5e-7 : f.window.endTime - 0.8 + 5e-7;
      const span = object(
        defect === 'gap'
          ? rows(f.proposal.records)[0].evidence
          : object(f.proposal.result).evidence,
      );
      const end = defect === 'gap' ? words[Number(span.toWord)].end : f.window.endTime - 0.35;
      if (defect === 'gap') {
        const firstSpan = object(rows(f.proposal.entities)[0].evidence),
          count = Number(firstSpan.toWord) + 1;
        for (let j = 0; j < count; j++) {
          words[j].start = 0.25 + (j * 0.75) / count;
          words[j].end = 0.25 + ((j + 1) * 0.75) / count;
        }
      }
      const count = Number(span.toWord) - index + 1;
      for (let j = 0; j < count; j++) {
        words[index + j].start = start + (j * (end - start)) / count;
        words[index + j].end = start + ((j + 1) * (end - start)) / count;
      }
      for (const offset of [0, 40])
        for (const mode of MODES) {
          const result = parse({ ...f, words }, { ...f.proposal, visualMode: mode }, offset);
          expect(result.scene).toBeNull();
          expect(result.ctx.issues.length).toBeGreaterThan(0);
        }
    }
  });
}
