import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionDeviation,
  parseExpansionSmallMultiples,
} from '../../../../../ai/explainer/expansion-quantities-deviation-multiples-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import {
  deviationDomain,
  deviationFields,
  deviationMultiplesPose,
  deviationPages,
  deviationPositions,
  deviationRecords,
} from './deviation-multiples-poses';
import type { ExpansionDeviationMultiplesScene } from './deviation-multiples-types';

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

export function deviationMultiplesCases(): ExpansionDeviationMultiplesScene[] {
  const cases = packet.stories.map(accepted);
  for (const id of ['23', '24'] as const)
    for (const state of [
      'unknown',
      'missing',
      'disputed',
      'conditional',
      'illustrative',
      'simulated',
    ] as const) {
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
        const q = id === '23' ? (p.observation as Rec) : ((p.records as Rec[])[1].quantity as Rec);
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

      cases.push(accepted(f));
    }
  cases.push(maximumMultiples(), maximumDeviation(), maximumDeviation(true));
  return cases;
}

function maximumMultiples(): ExpansionDeviationMultiplesScene {
  const names = ['W'.repeat(28), 'M'.repeat(28), 'WM'.repeat(14), 'MW'.repeat(14)];
  const domain = 'W'.repeat(32),
    period = 'M'.repeat(32),
    population = `${'W'.repeat(39)}P`;
  const label = 'M'.repeat(48),
    list = `${names.slice(0, -1).join(', ')}, and ${names[3]}`;
  const context = `during ${period} among ${population}`;
  const source = [
    `${label} compares ${list} for ${domain} ${context}.`,
    ...names.map(
      (name, i) =>
        `${name} ${domain} is ${i === 3 ? '999999999/999999998' : i % 2 ? '+0.000001' : '-1000.000000'} second ${context}.`,
    ),
    `${list} share the same second basis for ${domain} ${context}.`,
    `For ${domain}, no universal winner is established ${context}.`,
  ];
  return accepted(
    reauthor('24', source, (p) => {
      Object.assign(p, { label, subject: domain, domain });
      const speech = expansionFixtureSpeech(source, 10);
      p.checkWord = speech.spans[5].fromWord;
      (p.comparison as Rec).evidence = speech.spans[5];
      const original = (p.records as Rec[])[0].quantity as Rec;
      p.entities = names.map((name, i) => ({ label: name, evidence: speech.spans[i + 1] }));
      p.records = names.map((name, i) => ({
        entity: name,
        quantity: {
          ...original,
          actor: name,
          claim: domain,
          evidence: speech.spans[i + 1],
          basis: { unit: 'second', period, population },
          amount: {
            kind: 'rational',
            value: {
              numerator: i === 3 ? 999999999 : i % 2 ? 1 : -1000,
              denominator: i === 3 ? 999999998 : i % 2 ? 1000000 : 1,
            },
          },
        },
      }));
    }),
  );
}
function maximumDeviation(maxDenominator = false): ExpansionDeviationMultiplesScene {
  const f = fixture('23'),
    source = clauses(f);
  // Coprime extreme components and source precision go through the real parser.
  const target = maxDenominator ? '-999999999/1000000000' : '-999.999999';
  const observation = maxDenominator ? '+1/1000000000' : '+0.000001';
  source[1] = source[1].replace('10 count', `${target} second`).replace(' with denominator 20', '');
  source[2] = source[2]
    .replace('8 count', `${observation} second`)
    .replace(' with denominator 20', '');
  source[3] = source[3].replace('count basis', 'second basis').replace(' with denominator 20', '');
  source[4] = source[4].replace('in counts', 'in second').replace(' with denominator 20', '');
  return accepted(
    reauthor('23', source, (p) => {
      for (const [field, numerator] of [
        ['target', -999999999],
        ['observation', 1],
      ] as const) {
        const q = p[field] as Rec;
        q.basis = { unit: 'second', period: 'March', population: 'plant runs' };
        q.amount = {
          kind: 'rational',
          value: { numerator, denominator: maxDenominator ? 1000000000 : 1000000 },
        };
      }
    }),
  );
}

describe('deviation/multiples seekable source facts', () => {
  it('accepts both stories, all qualified/absent states and four maximum-label aligned records through real parsers', () => {
    const cases = deviationMultiplesCases();
    expect(cases).toHaveLength(17);
    expect(cases.at(-3)).toMatchObject({ storyId: '24', records: [{}, {}, {}, {}] });
    expect(cases.at(-2)).toMatchObject({
      target: { amount: { value: { numerator: -999999999, denominator: 1000000 } } },
    });
    expect(cases.at(-1)).toMatchObject({
      target: { amount: { value: { numerator: -999999999, denominator: 1000000000 } } },
    });
    for (const scene of cases) {
      const before = structuredClone(scene),
        pages = deviationPages(scene);
      for (const [record, r] of deviationRecords(scene).entries()) {
        expect(
          pages
            .filter((p) => p.id === r.id)
            .flatMap((p) => p.lines)
            .join(''),
        ).toBe(deviationFields(scene, record).join(''));
      }
      const seen = new Set<number>(),
        poses = Array.from({ length: 361 }, (_, frame) => {
          const pose = deviationMultiplesPose(scene, frame / 30);
          seen.add(pose.page);
          for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
            expect(pose[key]).toBeGreaterThanOrEqual(0);
            expect(pose[key]).toBeLessThanOrEqual(1);
          }
          return pose;
        });
      expect(seen.size).toBe(pages.length);
      for (let frame = 360; frame >= 0; frame -= 7)
        expect(deviationMultiplesPose(scene, frame / 30)).toEqual(poses[frame]);
      for (let i = 0; i < 361; i++) {
        const frame = (i * 137) % 361;
        expect(deviationMultiplesPose(scene, frame / 30)).toEqual(poses[frame]);
      }
      for (const t of [NaN, Infinity, -Infinity])
        expect(deviationMultiplesPose(scene, t)).toMatchObject({
          page: 0,
          reveal: 0,
          action: 0,
          response: 0,
          check: 0,
          resolve: 0,
        });
      expect(deviationMultiplesPose(scene, 10)).toEqual(deviationMultiplesPose(scene, 12));
      expect(scene).toEqual(before);
      for (const [i, r] of deviationRecords(scene).entries()) {
        if (r.quantity.state === 'unknown' || r.quantity.state === 'missing')
          expect(deviationPositions(scene)[i]).toEqual([]);
      }
    }
  });
  it('retains signed subtraction and source precision instead of a profit, winner, or derived rate', () => {
    const [deviation, multiples] = deviationMultiplesCases();
    expect(deviation).toMatchObject({ result: { result: { numerator: -2, denominator: 1 } } });
    expect(deviationFields(deviation, 0)).toEqual(
      expect.arrayContaining([
        'derived: -2',
        'Observation: 8/1',
        'Target: 10/1',
        'Signed result: -2/1',
      ]),
    );
    expect(deviationDomain(deviation)).toEqual([
      { numerator: 0, denominator: 1 },
      { numerator: 20, denominator: 1 },
    ]);
    expect(deviationPositions(deviation)[0][0]).toBeCloseTo(0.5);
    expect(deviationPositions(deviation)[1][0]).toBeCloseTo(0.4);
    const max = deviationMultiplesCases().at(-1);
    if (!max) throw new Error('Missing maximum');
    expect(deviationFields(max, 0)).toEqual(
      expect.arrayContaining([
        '-999999999/1000000000',
        'Observation: 1/1000000000',
        'Target: -999999999/1000000000',
        'Signed result: 1/1',
      ]),
    );
    expect(deviationFields(max, 1)).toContain('+1/1000000000');
    expect(multiples).not.toHaveProperty('winner');
    expect(deviation).not.toHaveProperty('relative');
  });
});
