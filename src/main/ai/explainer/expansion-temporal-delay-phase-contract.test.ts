import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONCEPT_FIXTURE_PADDING } from '../../remotion/compositions/explainer/concepts/fixture-words';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionDelayPhaseScene } from '../../remotion/compositions/explainer/expansion/temporal/delay-phase-types';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionDelayThroughput,
  parseExpansionPeriodicPhase,
} from './expansion-temporal-delay-phase-contract';
import { isRec, makeParseContext, type Rec } from './kind-spec';

type Id = '45' | '46';
type Source = Omit<ExpansionSourceFixture, 'id' | 'negatives'> & { id: Id };
interface Fixture extends Source {
  paraphrases: { name: string; clauses: string[]; outcome: string }[];
  /** Compact test-authoring patches. Each becomes a complete raw proposal before parsing. */
  negatives: { name: string; path: string; value: unknown }[];
}
const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/temporal/delay-phase.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: Fixture[] };
const modes = ['diagram', 'hybrid'] as const;
const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected fixture record');
  return value;
}
function rows(value: unknown): Rec[] {
  if (!Array.isArray(value)) throw new Error('Expected fixture record array');
  return value.map(rec);
}
function fixture(id: Id): Fixture {
  const result = packet.stories.find((story) => story.id === id);
  if (!result) throw new Error(`Missing temporal story ${id}`);
  return result;
}
function set(raw: Rec, path: string, value: unknown) {
  const keys = path.split('.');
  let target: Rec | unknown[] = raw;
  for (const key of keys.slice(0, -1)) {
    const next: unknown = Array.isArray(target) ? target[Number(key)] : target[key];
    if (!isRec(next) && !Array.isArray(next)) throw new Error(`Invalid test path ${path}`);
    target = next;
  }
  const last = keys.at(-1);
  if (!last) throw new Error('Empty path');
  if (Array.isArray(target)) target[Number(last)] = value;
  else target[last] = value;
}
function parse(source: Source, mode: (typeof modes)[number], proposal = source.proposal) {
  const ctx = makeParseContext(source.words, source.window);
  const raw = {
    ...proposal,
    visualMode: modes.some((value) => value === proposal.visualMode) ? mode : proposal.visualMode,
  };
  const scene =
    source.id === '45'
      ? parseExpansionDelayThroughput(raw, ctx)
      : parseExpansionPeriodicPhase(raw, ctx);
  return { scene, issues: ctx.issues };
}
function accepted(source: Source, mode: (typeof modes)[number]): ExpansionDelayPhaseScene {
  const { scene, issues } = parse(source, mode);
  expect(scene, issues.join('; ')).not.toBeNull();
  expect(issues).toEqual([]);
  if (!scene) throw new Error(issues.join('; '));
  return scene;
}
function sourceClauses(source: Source) {
  const clauses: string[] = [],
    spans: ExpansionEvidenceSpan[] = [];
  let fromWord = 0;
  for (const [index, word] of source.words.entries()) {
    if (/[.!?;]$/.test(word.text)) {
      spans.push({ fromWord, toWord: index });
      clauses.push(
        source.words
          .slice(fromWord, index + 1)
          .map((entry) => entry.text)
          .join(' '),
      );
      fromWord = index + 1;
    }
  }
  if (fromWord !== source.words.length) throw new Error('Incomplete authored clause');
  return { clauses, spans };
}
/** Test-only authored pauses: never add repeated speech or relax production beat gaps. */
function authored(source: Source): Source {
  const starts = phases.map((phase) => source.proposal[`${phase}Word`] as number);
  const times = [0.25, 2.25, 4.25, 8.25, 10.25, 11.65];
  const ends = [...starts.slice(1), source.words.length];
  const words = source.words.map((word, index) => {
    const section = starts.findIndex((start, i) => start <= index && index < ends[i]);
    if (section < 0) throw new Error('Word outside authored phase');
    const count = ends[section] - starts[section];
    const available = (times[section + 1] - times[section]) / count;
    const step = section === 4 ? available : Math.min(section === 2 ? 0.075 : 0.1, available);
    const seconds = (i: number) =>
      Number((times[section] + (i - starts[section]) * step).toFixed(9));
    return { ...word, start: seconds(index), end: seconds(index + 1) };
  });
  return { ...source, words };
}
function rewrite(source: Source, clauses: readonly string[], proposal = source.proposal): Source {
  const old = sourceClauses(source),
    speech = expansionFixtureSpeech(clauses, 12);
  if (old.clauses.length !== clauses.length)
    throw new Error('Rewrite must retain clause identities');
  function remap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(remap);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const index = old.spans.findIndex(
        (span) => span.fromWord === value.fromWord && span.toWord === value.toWord,
      );
      if (!speech.spans[index])
        throw new Error('Evidence must identify a complete original clause');
      return { ...speech.spans[index] };
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remap(entry)]));
  }
  const raw = rec(remap(proposal));
  for (const phase of phases) {
    const index = old.spans.findIndex((span) => span.fromWord === proposal[`${phase}Word`]);
    if (!speech.spans[index]) throw new Error('Beat must start a complete original clause');
    raw[`${phase}Word`] = speech.spans[index].fromWord;
  }
  raw.startWord = 0;
  raw.endWord = speech.window.endWord;
  return authored({ id: source.id, ...speech, proposal: raw });
}
function timing(source: Source, scene: ExpansionDelayPhaseScene) {
  expect(source.sourceText).toBe(source.words.map((word) => word.text).join(' '));
  expect(source.window.endTime - source.window.startTime).toBeGreaterThanOrEqual(5);
  expect(source.window.endTime - source.window.startTime).toBeLessThanOrEqual(12);
  expect(source.words[0]?.start).toBe(source.window.startTime + CONCEPT_FIXTURE_PADDING.leadInSec);
  expect(source.words.at(-1)?.end).toBe(source.window.endTime - CONCEPT_FIXTURE_PADDING.tailSec);
  source.words.forEach((word, index) => {
    expect(Number.isFinite(word.start) && Number.isFinite(word.end)).toBe(true);
    expect(word.end).toBeGreaterThan(word.start);
    expect(word.start).toBeGreaterThanOrEqual(source.window.startTime);
    expect(word.end).toBeLessThanOrEqual(source.window.endTime);
    if (index) expect(word.start).toBeGreaterThanOrEqual(source.words[index - 1].end - 1e-7);
  });
  expect(new Set(Object.values(scene.sourceSpans).map((span) => span.fromWord)).size).toBe(5);
  for (const [index, phase] of phases.entries()) {
    const span = scene.sourceSpans[phase];
    expect(sourceClauses(source).spans).toContainEqual(span);
    expect(span.fromWord).toBe(source.proposal[`${phase}Word`]);
    const word = source.words[span.fromWord];
    expect(scene[`${phase}At`]).toBe(
      index === 0 ? Math.max(source.window.startTime + 0.3, word.start) : word.start,
    );
    const previous = phases[index - 1];
    if (previous)
      expect(scene[`${phase}At`] - scene[`${previous}At`]).toBeGreaterThanOrEqual(1 - 1e-6);
  }
  expect(scene.resolveAt).toBeLessThanOrEqual(source.window.endTime - 0.8 + 1e-6);
}
function noDerivations(scene: ExpansionDelayPhaseScene) {
  const encoded = JSON.stringify(scene);
  expect(encoded).not.toContain('"derived"');
  for (const field of [
    'result',
    'winner',
    'frequency',
    'operation',
    'reciprocal',
    'expression',
    'curve',
    'coordinates',
  ])
    expect(scene).not.toHaveProperty(field);
  function visit(value: unknown, root = false): void {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!isRec(value)) return;
    for (const [key, entry] of Object.entries(value)) {
      if (!root) expect(key === 'at' || key.endsWith('At')).toBe(false);
      visit(entry);
    }
  }
  visit(scene, true);
}
function parity(source: Source) {
  const before = structuredClone(source);
  const diagram = accepted(source, 'diagram'),
    hybrid = accepted(source, 'hybrid');
  expect({ ...hybrid, visualMode: 'diagram' }).toEqual(diagram);
  expect(accepted(source, 'diagram')).toEqual(diagram);
  expect(source).toEqual(before);
  timing(source, diagram);
  noDerivations(diagram);
  const identities = [
    ...diagram.entities,
    ...diagram.records,
    ...diagram.relations,
    ...(diagram.storyId === '46' ? diagram.signals : []),
  ].map((entry) => entry.id);
  expect(new Set(identities).size).toBe(identities.length);
  expect(diagram.entities.map((entry) => entry.id)).toEqual(
    diagram.entities.map((_, index) => expansionEntityId(source.id, index)),
  );
  return diagram;
}
function quantitySource(
  source: Source,
  index: number,
  state: string,
  numerator = 2,
  denominator = 1,
  unit?: string,
): Source {
  const raw = structuredClone(source.proposal),
    record = rows(raw.records)[index],
    q = rec(record.quantity);
  const span = rec(q.evidence),
    current = sourceClauses(source);
  const clauseIndex = current.spans.findIndex(
    (entry) => entry.fromWord === span.fromWord && entry.toWord === span.toWord,
  );
  if (clauseIndex < 0) throw new Error('Quantity must bind a full clause');
  const basis = rec(q.basis);
  if (unit) basis.unit = unit;
  const notation = denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
  const units: Record<string, string> = {
    second: 'seconds',
    minute: 'minutes',
    hour: 'hours',
    day: 'days',
    'item/second': 'items per second',
    degree: 'degrees',
    radian: 'radians',
    hertz: 'hertz',
    count: 'items',
  };
  q.state = state;
  for (const field of ['amount', 'alternatives', 'qualifier', 'condition']) delete q[field];
  let value = notation,
    prefix = '';
  if (state === 'unknown' || state === 'missing') {
    q.qualifier = state;
    value = state;
  } else if (state === 'disputed') {
    q.qualifier = state;
    q.alternatives = [numerator, numerator + 1].map((n) => ({
      kind: 'rational',
      value: { numerator: n, denominator },
    }));
    value = `disputed between ${notation} and ${denominator === 1 ? numerator + 1 : `${numerator + 1}/${denominator}`}`;
  } else {
    q.amount = { kind: 'rational', value: { numerator, denominator } };
    if (state === 'conditional') {
      q.condition = 'if demand rises';
      raw.condition = q.condition;
      prefix = 'if demand rises, ';
    }
    if (state === 'illustrative' || state === 'simulated') {
      q.qualifier = state === 'illustrative' ? 'teaching example' : 'simulation';
      raw.evidence = 'illustrative';
      prefix = `In this ${q.qualifier}, `;
    }
  }
  const population = basis.denominator
    ? ` with denominator ${rec(basis.denominator).numerator}`
    : '';
  current.clauses[clauseIndex] =
    `${prefix}${q.actor} ${q.claim} is ${value} ${units[String(basis.unit)]} during ${basis.period} among ${basis.population}${population}.`;
  return rewrite(source, current.clauses, raw);
}
function negative(name: string, source: Source, mutate: (raw: Rec) => void) {
  for (const mode of modes)
    it(`${source.id} rejects ${name} (${mode})`, () => {
      const raw = structuredClone(source.proposal);
      mutate(raw);
      expect(parse(source, mode, raw).scene).toBeNull();
    });
}

describe('STEP13 local temporal raw packet', () => {
  it('freezes version 1 routes, independent paraphrases and no numeric derivations', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('temporal');
    expect(packet.stories.map((story) => story.id)).toEqual(['45', '46']);
    for (const source of packet.stories) {
      expect(expansionStory(source.id).allowedDerivations).toEqual([]);
      expect(source.paraphrases.length).toBeGreaterThan(0);
      for (const p of source.paraphrases)
        expect(
          p.clauses.every((clause, index) => clause !== sourceClauses(source).clauses[index]),
        ).toBe(true);
    }
  });
  for (const f of packet.stories) {
    const positives = [
      { name: 'canonical', source: f },
      ...f.paraphrases.map((p) => {
        const raw = structuredClone(f.proposal);
        raw.outcome = p.outcome;
        return { name: p.name, source: rewrite(f, p.clauses, raw) };
      }),
    ];
    for (const positive of positives) {
      for (const mode of modes)
        it(`${f.id} ${positive.name} accepts in ${mode}`, () =>
          timing(positive.source, accepted(positive.source, mode)));
      it(`${f.id} ${positive.name} full fact/state/identity/source/time parity and pure parsing`, () =>
        parity(positive.source));
    }
    it(`${f.id} canonical speech has authored pauses with production helper tokens/padding`, () => {
      const speech = expansionFixtureSpeech(sourceClauses(f).clauses, 12);
      expect(speech.words.map((word) => word.text)).toEqual(f.words.map((word) => word.text));
      expect(authored(f).words).toEqual(f.words);
      expect(
        f.words.some((word, index) => index && word.start - f.words[index - 1].end > 0.5),
      ).toBe(true);
    });
    for (const n of f.negatives) negative(n.name, f, (raw) => set(raw, n.path, n.value));
    for (const [name, field, cap] of [
      ['entity cap', 'entities', 8],
      ['record cap', 'records', 12],
      ['relation cap', 'relations', 16],
    ] as const) {
      negative(name, f, (raw) => {
        const first = rows(raw[field])[0];
        raw[field] = Array.from({ length: cap + 1 }, () => structuredClone(first));
      });
    }
    for (const field of [
      'svg',
      'html',
      'url',
      'file',
      'coordinates',
      'function',
      'storyId',
      'latencyAt',
      'periodAt',
    ])
      negative(`extra ${field}`, f, (raw) => {
        raw[field] = 'untrusted';
      });
    for (const [name, mutation] of [
      [
        'same clause beats',
        (raw: Rec) => {
          raw.responseWord = raw.actionWord;
        },
      ],
      [
        'duplicate record',
        (raw: Rec) => {
          raw.records = [...rows(raw.records), structuredClone(rows(raw.records)[0])];
        },
      ],
      [
        'duplicate relation',
        (raw: Rec) => {
          raw.relations = [...rows(raw.relations), structuredClone(rows(raw.relations)[0])];
        },
      ],
      [
        'wrong result/outcome',
        (raw: Rec) => {
          raw.outcome = 'winner';
        },
      ],
    ] as const)
      negative(name, f, mutation);
    for (const mode of modes) {
      it(`${f.id} source timestamps reject finite/positive/overlap/window violations (${mode})`, () => {
        for (const change of [
          { start: Number.NaN },
          { end: Number.POSITIVE_INFINITY },
          { start: 0.34 },
          { end: 0.35 },
          { end: 0.34 },
          { start: -1 },
          { end: 13 },
        ]) {
          const words = f.words.map((word) => ({ ...word }));
          words[1] = { ...words[1], ...change };
          expect(parse({ ...f, words }, mode).scene).toBeNull();
        }
        for (const endTime of [4.99, 12.01, Number.NaN])
          expect(parse({ ...f, window: { ...f.window, endTime } }, mode).scene).toBeNull();
      });
      it(`${f.id} source pauses cannot excuse compressed phases or short final hold (${mode})`, () => {
        const shortGap = {
          ...f,
          words: f.words.map((word) => ({ ...word, start: word.start / 4, end: word.end / 4 })),
        };
        expect(parse(shortGap, mode).scene).toBeNull();
        const late = {
          ...f,
          words: f.words.map((word, index) =>
            index < Number(f.proposal.resolveWord)
              ? word
              : {
                  ...word,
                  start: 11.3 + (word.start - 10.25) / 4,
                  end: 11.3 + (word.end - 10.25) / 4,
                },
          ),
        };
        expect(parse(late, mode).scene).toBeNull();
      });
    }
    it(`${f.id} shifted source seconds leave domain facts/IDs/source spans unchanged`, () => {
      for (const mode of modes) {
        const original = accepted(f, mode);
        const shifted = accepted(
          {
            ...f,
            words: f.words.map((word) => ({ ...word, start: word.start + 30, end: word.end + 30 })),
            window: { ...f.window, startTime: 30, endTime: 42 },
          },
          mode,
        );
        for (const phase of phases) {
          expect(shifted[`${phase}At`]).toBe(original[`${phase}At`] + 30);
          shifted[`${phase}At`] = original[`${phase}At`];
        }
        expect(shifted).toEqual(original);
      }
    });
  }
});

describe('exact quantities and analytic domains, not evaluators', () => {
  for (const f of packet.stories) {
    for (const state of [
      'known',
      'unknown',
      'missing',
      'disputed',
      'conditional',
      'illustrative',
      'simulated',
    ]) {
      it(`${f.id} retains ${state} quantity without treating absence as zero (both modes)`, () => {
        const source = quantitySource(f, 0, state),
          scene = parity(source),
          q = scene.records[0].quantity;
        expect(q.state).toBe(state);
        if (state === 'unknown' || state === 'missing') {
          expect(q).not.toHaveProperty('amount');
          expect(q).not.toHaveProperty('alternatives');
        }
        if (state === 'disputed')
          expect(q).toMatchObject({
            qualifier: 'disputed',
            alternatives: [
              { value: { numerator: 2, denominator: 1 } },
              { value: { numerator: 3, denominator: 1 } },
            ],
          });
        if (state === 'conditional') expect(q).toMatchObject({ condition: 'if demand rises' });
        if (state === 'illustrative' || state === 'simulated')
          expect(q).toMatchObject({
            qualifier: state === 'illustrative' ? 'teaching example' : 'simulation',
          });
      });
    }
    for (const mode of modes)
      it(`${f.id} preserves exact source fraction, not a numeric output derivation (${mode})`, () => {
        const source = quantitySource(f, 0, 'known', 5, 2);
        const scene = accepted(source, mode);
        expect(scene.records[0].quantity).toMatchObject({
          amount: { kind: 'rational', value: { numerator: 5, denominator: 2 }, notation: '5/2' },
        });
        noDerivations(scene);
      });
  }
  const delay = fixture('45'),
    phase = fixture('46');
  it('latency and throughput retain supplied independent values, including unknown and explicit zero', () => {
    const scene = parity(delay);
    expect(scene.records.map((record) => record.dimension)).toEqual([
      'latency',
      'throughput',
      'latency',
      'throughput',
    ]);
    expect(scene.records[0].quantity).toMatchObject({
      amount: { value: { numerator: 2, denominator: 1 }, notation: '2' },
    });
    expect(scene.records[1].quantity).toMatchObject({
      amount: { value: { numerator: 3, denominator: 1 }, notation: '3' },
    });
    expect(scene.records[3].quantity).toMatchObject({ state: 'unknown', qualifier: 'unknown' });
    expect(scene.records[3].quantity).not.toHaveProperty('amount');
    const zero = parity(quantitySource(delay, 3, 'known', 0));
    expect(zero.records[3].quantity).toMatchObject({
      state: 'known',
      amount: { value: { numerator: 0, denominator: 1 } },
    });
  });
  for (const [id, index, value, unit] of [
    ['45', 0, -1, 'second'],
    ['45', 0, 86401, 'second'],
    ['45', 1, -1, 'item/second'],
    ['45', 1, 1000001, 'item/second'],
    ['46', 0, 0, 'second'],
    ['46', 0, -1, 'second'],
    ['46', 0, 61, 'second'],
    ['46', 2, 361, 'degree'],
    ['46', 2, -361, 'degree'],
    ['46', 2, 9, 'radian'],
  ] as const) {
    const source = quantitySource(fixture(id), index, 'known', value, 1, unit);
    for (const mode of modes)
      it(`${id} rejects sourced out-of-domain ${unit} ${value} (${mode})`, () =>
        expect(parse(source, mode).scene).toBeNull());
  }
  for (const [id, index, numerator, denominator, unit] of [
    ['45', 0, 0, 1, 'second'],
    ['45', 1, 1000000, 1, 'item/second'],
    ['46', 0, 1, 10, 'second'],
    ['46', 0, 60, 1, 'second'],
    ['46', 2, 360, 1, 'degree'],
    ['46', 2, 8, 1, 'radian'],
  ] as const)
    it(`${id} retains analytic-domain boundary ${numerator}/${denominator} ${unit}`, () => {
      const scene = parity(
        quantitySource(fixture(id), index, 'known', numerator, denominator, unit),
      );
      expect(scene.records[index].quantity).toMatchObject({
        amount: { value: { numerator, denominator } },
      });
    });
  it('phase sign and direction are supplied, never converted or wrapped', () => {
    let source = quantitySource(phase, 2, 'known', -90);
    const clauses = sourceClauses(source).clauses,
      raw = structuredClone(source.proposal);
    clauses[6] = 'Aster lags behind Beacon during May among clocks.';
    rows(raw.relations)[0].relationship = 'lags';
    source = rewrite(source, clauses, raw);
    const scene = parity(source);
    expect(scene.records[2].quantity).toMatchObject({
      amount: { value: { numerator: -90, denominator: 1 } },
    });
    if (scene.storyId !== '46') throw new Error('Wrong route');
    expect(scene.signals.map((signal) => signal.direction)).toEqual(['clockwise', 'clockwise']);
    expect(scene.relations[0]).toMatchObject({ relationship: 'lags' });
  });
});
