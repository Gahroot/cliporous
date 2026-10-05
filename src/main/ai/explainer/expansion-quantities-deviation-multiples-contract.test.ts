import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type { ExpansionDeviationMultiplesScene } from '../../remotion/compositions/explainer/expansion/quantities/deviation-multiples-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionDeviation,
  parseExpansionSmallMultiples,
} from './expansion-quantities-deviation-multiples-contract';
import { makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/quantities/deviation-multiples.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
function fixture(id: '23' | '24'): ExpansionSourceFixture {
  const value = packet.stories.find((entry) => entry.id === id);
  if (!value) throw new Error(`Missing actual JSON ${id}`);
  return value;
}
function parse(f: ExpansionSourceFixture, proposal: Rec = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const scene =
    f.id === '23'
      ? parseExpansionDeviation(proposal, ctx)
      : parseExpansionSmallMultiples(proposal, ctx);
  return { scene, issues: ctx.issues };
}
function accepted(f: ExpansionSourceFixture): ExpansionDeviationMultiplesScene {
  const result = parse(f);
  expect(result.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  if (!result.scene) throw new Error('Rejected positive');
  const hybrid = parse(f, { ...f.proposal, visualMode: 'hybrid' });
  expect(hybrid.issues).toEqual([]);
  expect(hybrid.scene).toEqual({ ...result.scene, visualMode: 'hybrid' });
  return result.scene;
}
function clauses(f: ExpansionSourceFixture): string[] {
  return f.sourceText.split(/(?<=\.)\s+(?=[A-Z])/);
}
function reauthor(
  id: '23' | '24',
  source: string[],
  mutate: (proposal: Rec) => void,
): ExpansionSourceFixture {
  const speech = expansionFixtureSpeech(source, 10),
    proposal = structuredClone(fixture(id).proposal),
    s = speech.spans;
  const [setup, action, response, check] = s,
    resolve = s.at(-1);
  if (!setup || !action || !response || !check || !resolve) throw new Error('Five beats required');
  Object.assign(proposal, {
    endWord: speech.window.endWord,
    setupWord: setup.fromWord,
    actionWord: action.fromWord,
    responseWord: response.fromWord,
    checkWord: check.fromWord,
    resolveWord: resolve.fromWord,
  });
  (proposal.comparison as Rec).evidence = check;
  if (id === '23') {
    (proposal.entities as Rec[])[0].evidence = setup;
    (proposal.target as Rec).evidence = action;
    (proposal.observation as Rec).evidence = response;
    (proposal.result as Rec).evidence = resolve;
  } else {
    for (const [index, record] of (proposal.records as Rec[]).entries()) {
      (record.quantity as Rec).evidence = s[index + 1];
      (proposal.entities as Rec[])[index].evidence = s[index + 1];
    }
    (proposal.conclusion as Rec).evidence = resolve;
  }
  mutate(proposal);
  return {
    id,
    sourceText: speech.sourceText,
    words: speech.words,
    window: speech.window,
    proposal,
    negatives: [],
  };
}

describe('step10 source-owned deviations and comparable small multiples', () => {
  it('reads real versioned packets and concrete production-padded words', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('quantities');
    expect(packet.stories.map((f) => f.id)).toEqual(['23', '24']);
    for (const f of packet.stories) {
      expect(f.words.map((word) => word.text).join(' ')).toBe(f.sourceText);
      expect(f.words).toEqual(conceptFixtureWords(f.sourceText, 10));
      expect(f.window).toEqual({
        startWord: 0,
        endWord: f.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(f.negatives.length).toBeGreaterThan(45);
    }
  });
  for (const f of packet.stories) {
    it(`${f.id}: exact both-mode fact/ID/time parity, immutable deterministic repeats and portrait layouts`, () => {
      const before = structuredClone(f),
        scene = accepted(f);
      expect(parse(f).scene).toEqual(scene);
      expect(parse(f, structuredClone(f.proposal)).scene).toEqual(scene);
      expect(f).toEqual(before);
      expect(scene.entities.map((entity) => entity.id)).toEqual(
        scene.entities.map((_, index) => `expansion-${f.id}-entity-${index}`),
      );
      const expected = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map(
        (key, index) => {
          const time = f.words[f.proposal[key] as number]?.start;
          return index === 0 ? Math.max(0.3, time ?? -1) : time;
        },
      );
      const times = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
      ];
      expect(times).toEqual(expected);
      expect(
        times.every(
          (time, index) =>
            Number.isFinite(time) && (index === 0 || time > (times[index - 1] ?? Infinity)),
        ),
      ).toBe(true);
      expect(10 - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      expect(parse(f, { ...f.proposal, layout: 'stack-flipped' }).scene).toEqual(scene);
      expect(scene).not.toHaveProperty('treatment');
    });
    for (const negative of f.negatives)
      it(`${f.id}: rejects JSON ${negative.name} with diagnostics`, () => {
        const local = {
          ...f,
          words: negative.words ?? f.words,
          window: negative.window ?? f.window,
          sourceText: negative.sourceText ?? f.sourceText,
        };
        const modes =
          negative.proposal.visualMode === 'diagram'
            ? ['diagram', 'hybrid']
            : [negative.proposal.visualMode];
        for (const visualMode of modes) {
          const result = parse(local, { ...negative.proposal, visualMode });
          expect(result.scene, negative.name).toBeNull();
          expect(result.issues.length, negative.name).toBeGreaterThan(0);
        }
      });
  }
  it('derives signed known-only observation minus target from the actual subtraction relation, without a model number', () => {
    const scene = accepted(fixture('23'));
    if (scene.storyId !== '23') throw new Error('Expected deviation');
    expect(scene.result).toMatchObject({
      state: 'derived',
      operation: 'difference',
      operands: [
        { numerator: 8, denominator: 1 },
        { numerator: 10, denominator: 1 },
      ],
      result: { numerator: -2, denominator: 1 },
      basis: scene.target.basis,
    });
    expect(scene.result).not.toHaveProperty('source');
    expect(scene.outcome).toBe('output observation minus output target');
    expect(fixture('23').proposal.result).not.toHaveProperty('quantity');
    expect(scene.result).not.toHaveProperty('confidence');
  });
  it('accepts an independently supplied result only when its signed exact value agrees', () => {
    const source = clauses(fixture('23'));
    source[4] =
      'Acme output deviation is -2 count during March among plant runs with denominator 20.';
    const f = reauthor('23', source, (p) => {
      const result = p.result as Rec;
      p.outcome = 'output deviation is -2';
      result.quantity = {
        ...(p.observation as Rec),
        claim: 'output deviation',
        amount: { kind: 'rational', value: { numerator: -2, denominator: 1 } },
        evidence: result.evidence,
      };
      delete result.evidence;
    });
    expect(accepted(f)).toMatchObject({
      result: {
        state: 'derived',
        source: { state: 'known' },
        result: { numerator: -2, denominator: 1 },
      },
    });
    const bad = structuredClone(f.proposal);
    (((bad.result as Rec).quantity as Rec).amount as Rec).value = { numerator: 2, denominator: 1 };
    expect(parse(f, bad).scene).toBeNull();
    expect(parse(f, bad).issues.length).toBeGreaterThan(0);
  });
  it('does not fabricate a numeric outcome for relation-only derivation', () => {
    const p = structuredClone(fixture('23').proposal);
    p.outcome = 'output deviation is -2';
    expect(parse(fixture('23'), p).scene).toBeNull();
    expect(parse(fixture('23'), p).issues.length).toBeGreaterThan(0);
  });
  it('retains actual comparable domain values and a source-grounded no-winner conclusion', () => {
    const scene = accepted(fixture('24'));
    if (scene.storyId !== '24') throw new Error('Expected multiples');
    expect(scene.records.map((record) => record.id)).toEqual([
      'expansion-24-record-0',
      'expansion-24-record-1',
    ]);
    expect(scene.records.map((record) => record.quantity)).toMatchObject([
      { actor: 'Option A', state: 'known', amount: { value: { numerator: 4, denominator: 1 } } },
      { actor: 'Option B', state: 'known', amount: { value: { numerator: 6, denominator: 1 } } },
    ]);
    expect(scene.records[0]?.quantity.basis).toEqual(scene.records[1]?.quantity.basis);
    expect(scene.conclusion.qualification).toBe('no universal winner is established');
    expect(scene).not.toHaveProperty('winner');
  });
  it('accepts an independent small-multiples paraphrase with source-scoped shared basis and no inferred winner', () => {
    const f = reauthor(
      '24',
      [
        'Parallel note examines North team and South team for throughput in April for local teams.',
        'North team reported throughput of 3 items in April for local teams with denominator 12.',
        'South team observed throughput as 9 records in April for local teams with denominator 12.',
        'North team and South team use a common count basis for throughput in April for local teams with denominator 12.',
        'For throughput, comparisons remain descriptive in April for local teams.',
      ],
      (p) => {
        Object.assign(p, {
          label: 'Parallel note',
          subject: 'throughput',
          domain: 'throughput',
          outcome: 'comparisons remain descriptive',
        });
        (p.conclusion as Rec).qualification = 'comparisons remain descriptive';
        for (const [index, [actor, numerator]] of [
          ['North team', 3],
          ['South team', 9],
        ].entries()) {
          (p.entities as Rec[])[index].label = actor;
          const record = (p.records as Rec[])[index];
          record.entity = actor;
          Object.assign(record.quantity as Rec, {
            actor,
            claim: 'throughput',
            amount: { kind: 'rational', value: { numerator, denominator: 1 } },
            basis: {
              unit: 'count',
              period: 'April',
              population: 'local teams',
              denominator: { numerator: 12, denominator: 1 },
            },
          });
        }
      },
    );
    const scene = accepted(f);
    if (scene.storyId !== '24') throw new Error('Expected actual small multiples');
    expect(scene.records.map(({ quantity }) => quantity.actor)).toEqual([
      'North team',
      'South team',
    ]);
    expect(scene.records.map(({ quantity }) => quantity)).toMatchObject([
      { amount: { value: { numerator: 3, denominator: 1 } } },
      { amount: { value: { numerator: 9, denominator: 1 } } },
    ]);
    expect(scene.conclusion.qualification).toBe('comparisons remain descriptive');
    expect(scene).not.toHaveProperty('winner');
  });

  it('accepts an independent natural subtraction paraphrase with complete source basis', () => {
    const f = reauthor(
      '23',
      [
        'Deviation note reviews North team throughput target and throughput observation in April for local teams.',
        'North team throughput target is 7 count in April for local teams with denominator 12.',
        'North team throughput observation is 10 count in April for local teams with denominator 12.',
        'North team throughput target and throughput observation use a common count basis for throughput in April for local teams with denominator 12.',
        'North team throughput deviation equals throughput observation minus throughput target using count in April for local teams with denominator 12.',
      ],
      (p) => {
        Object.assign(p, {
          label: 'Deviation note',
          subject: 'North team',
          actor: 'North team',
          domain: 'throughput',
          outcome: 'throughput observation minus throughput target',
        });
        (p.entities as Rec[])[0].label = 'North team';
        for (const [field, n] of [
          ['target', 7],
          ['observation', 10],
        ] as const)
          Object.assign(p[field] as Rec, {
            actor: 'North team',
            claim: `throughput ${field}`,
            amount: { kind: 'rational', value: { numerator: n, denominator: 1 } },
            basis: {
              unit: 'count',
              period: 'April',
              population: 'local teams',
              denominator: { numerator: 12, denominator: 1 },
            },
          });
      },
    );
    expect(accepted(f)).toMatchObject({
      result: { state: 'derived', result: { numerator: 3, denominator: 1 } },
    });
  });
  for (const id of ['23', '24'] as const)
    for (const state of [
      'unknown',
      'missing',
      'disputed',
      'conditional',
      'illustrative',
      'simulated',
    ] as const) {
      it(`${id}: preserves source-${state} without treating it as measured zero or deriving from it`, () => {
        const source = clauses(fixture(id));
        const teaching = state === 'illustrative' || state === 'simulated';
        const qualifier = state === 'illustrative' ? 'illustrative example' : 'simulated example';
        const word =
          state === 'disputed'
            ? 'disputed between 8 and 12'
            : state === 'unknown' || state === 'missing'
              ? state
              : id === '23'
                ? '8'
                : '6';
        source[2] = (source[2] ?? '').replace(id === '23' ? '8 count' : '6 count', `${word} count`);
        if (state === 'conditional')
          source[2] = (source[2] ?? '').replace(/\.$/, ' if shifts change.');
        if (teaching) source[2] = `In this ${qualifier}, ${source[2]}`;
        if (id === '23')
          source[4] =
            'Acme output deviation is unknown count during March among plant runs with denominator 20.';
        const f = reauthor(id, source, (p) => {
          const q =
            id === '23' ? (p.observation as Rec) : ((p.records as Rec[])[1].quantity as Rec);
          q.state = state;
          if (state === 'unknown' || state === 'missing') {
            q.qualifier = state;
            delete q.amount;
          }
          if (state === 'disputed') {
            q.qualifier = state;
            q.alternatives = [8, 12].map((n) => ({
              kind: 'rational',
              value: { numerator: n, denominator: 1 },
            }));
            delete q.amount;
          }
          if (state === 'conditional') {
            q.condition = 'if shifts change';
            p.condition = 'if shifts change';
          }
          if (teaching) {
            q.qualifier = qualifier;
            p.evidence = 'illustrative';
          }
          if (id === '23') {
            const result = p.result as Rec;
            p.outcome = 'output deviation is unknown';
            result.state = 'source-qualified';
            result.quantity = {
              ...(p.target as Rec),
              claim: 'output deviation',
              state: 'unknown',
              qualifier: 'unknown',
              evidence: result.evidence,
            };
            delete (result.quantity as Rec).amount;
            delete result.evidence;
            delete result.operation;
          }
        });
        const scene = accepted(f);
        const q = scene.storyId === '23' ? scene.observation : scene.records[1]?.quantity;
        expect(q?.state).toBe(state);
        if (state === 'unknown' || state === 'missing' || state === 'disputed')
          expect(q).not.toHaveProperty('amount');
        if (scene.storyId === '23')
          expect(scene.result).toMatchObject({
            state: 'source-qualified',
            quantity: { state: 'unknown' },
          });
        if (state === 'conditional') expect(q).toMatchObject({ condition: 'if shifts change' });
        if (teaching) expect(q).toMatchObject({ qualifier });
      });
    }
});
