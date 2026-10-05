import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import {
  parseExpansionPareto,
  parseExpansionSieve,
} from '../../../../../ai/explainer/expansion-decisions-sieve-frontier-contract';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionSieveFrontierScene } from './sieve-frontier-types';

export const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/decisions/sieve-frontier.source.json',
    'utf8',
  ),
) as { stories: ExpansionSourceFixture[] };
export function acceptedSieveFrontier(story: ExpansionSourceFixture): ExpansionSieveFrontierScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '25'
      ? parseExpansionSieve(story.proposal, ctx)
      : parseExpansionPareto(story.proposal, ctx);
  expect(ctx.issues, JSON.stringify(story.proposal)).toEqual([]);
  if (!scene) throw new Error('Expected real parser acceptance');
  return scene;
}
/** Real parser maxima: twelve records, both 4x3 and 3x4, all qualified states. */
export function maximumSieveFrontier(
  id: '25' | '26',
  letter: 'W' | 'M',
  fourColumns = false,
  qualified = false,
  conditional = false,
  fourOptions = false,
  reverseValues = false,
  declaredTwelve = true,
  allDisputed = false,
): ExpansionSourceFixture {
  const actors = Array.from(
    { length: declaredTwelve ? (fourColumns ? 3 : 4) : fourOptions ? 4 : fourColumns ? 2 : 3 },
    (_, i) => `${letter.repeat(27)}${i}`,
  );
  const columns = Array.from(
    { length: fourOptions ? 2 : fourColumns ? 4 : 3 },
    (_, i) => `${letter.repeat(27)}${i + 4}`,
  );
  const subject = letter.repeat(34),
    population = `${letter.repeat(39)}P`,
    period = letter.repeat(32),
    content = letter.repeat(64);
  const condition = `If ${letter.repeat(93)}`;
  const scope = `during ${period} among ${population}`;
  const clauses = [
    `${subject}: Options ${actors.join(' and ')} ${id === '25' ? 'face requirements' : 'compare'} ${columns.join(' and ')} ${scope}.`,
  ];
  const columnClauses = columns.map((c, i) => {
    const n = clauses.length;
    clauses.push(
      id === '25'
        ? `Requirement ${c} requires ${content} ${scope}.`
        : `For ${actors.join(' and ')}, ${i % 2 ? 'maximize' : 'minimize'} ${c} ${scope}.`,
    );
    return n;
  });
  const records: Rec[] = [];
  const states = [
    'known',
    'known',
    'unknown',
    'missing',
    'disputed',
    'illustrative',
    'simulated',
  ] as const;
  for (const actor of actors)
    for (const column of columns) {
      const i = records.length;
      const state = allDisputed
        ? 'disputed'
        : conditional && i === 0
          ? 'conditional'
          : qualified
            ? states[i % states.length]
            : 'known';
      const n = clauses.length;
      if (id === '25') {
        const status = i % 2 ? 'fail' : 'pass';
        const body = `${actor} ${status === 'pass' ? 'passes' : 'fails'} requirement ${column} ${scope}.`;
        const qualifier =
          state === 'illustrative'
            ? 'illustrative example'
            : state === 'simulated'
              ? 'simulation'
              : state;
        clauses.push(
          state === 'known'
            ? body
            : state === 'conditional'
              ? `${condition}, ${body}`
              : state === 'illustrative' || state === 'simulated'
                ? `In this ${qualifier}, ${body}`
                : `${actor} ${column} check is ${state === 'disputed' ? 'disputed between pass and fail' : state} ${scope}.`,
        );
        records.push({
          option: actor,
          requirement: column,
          state,
          ...(state === 'disputed'
            ? { qualifier, alternatives: ['pass', 'fail'] }
            : state === 'unknown' || state === 'missing'
              ? { qualifier }
              : state === 'conditional'
                ? { status, condition }
                : state === 'known'
                  ? { status }
                  : { status, qualifier }),
          clause: n,
        });
      } else {
        const values = [
          { numerator: 0, denominator: 1, notation: '0.000000' },
          { numerator: -1000000000, denominator: 1, notation: '-1000000000' },
          { numerator: 1, denominator: 1000000000, notation: '1/1000000000' },
          { numerator: 1000000000, denominator: 1, notation: '1000000000' },
          { numerator: -1, denominator: 1000000000, notation: '-1/1000000000' },
          { numerator: 999999999, denominator: 1000000000, notation: '999999999/1000000000' },
          { numerator: 1000000000, denominator: 999999999, notation: '1000000000/999999999' },
        ];
        const { numerator, denominator, notation } =
          values[reverseValues ? values.length - 1 - (i % values.length) : i % values.length];
        const amount = { kind: 'rational', value: { numerator, denominator } };
        const qualifier =
          state === 'illustrative'
            ? `teaching example ${letter.repeat(79)}`
            : state === 'simulated'
              ? `simulation ${letter.repeat(85)}`
              : state;
        const body = `${actor} ${column} is ${state === 'unknown' || state === 'missing' ? state : state === 'disputed' ? `disputed between ${notation} and 1` : notation} count ${scope} with denominator 1000000000.`;
        clauses.push(
          state === 'conditional'
            ? `${condition}, ${body}`
            : state === 'illustrative' || state === 'simulated'
              ? `In this ${qualifier}, ${body}`
              : body,
        );
        records.push({
          option: actor,
          criterion: column,
          quantity: {
            actor,
            claim: column,
            state,
            basis: {
              unit: 'count',
              period,
              population,
              denominator: { numerator: 1000000000, denominator: 1 },
            },
            ...(state === 'unknown' || state === 'missing'
              ? { qualifier }
              : state === 'disputed'
                ? {
                    qualifier,
                    alternatives: [
                      amount,
                      { kind: 'rational', value: { numerator: 1, denominator: 1 } },
                    ],
                  }
                : state === 'conditional'
                  ? { amount, condition }
                  : state === 'known'
                    ? { amount }
                    : { amount, qualifier }),
          },
          clause: n,
        });
      }
    }
  const check = clauses.length;
  clauses.push(
    id === '25'
      ? `${subject} keeps each stated check in its original scope with no numerical scoring.`
      : `${actors.join(' and ')} share the same ${columns.join(' and ')} measurement bases ${scope}.`,
  );
  const resolve = clauses.length;
  const outcome =
    id === '25'
      ? 'source-stated checks rather than a winner'
      : 'scope-bound tradeoffs rather than a universal winner';
  clauses.push(`${subject} retains ${outcome}.`);
  const speech = expansionFixtureSpeech(clauses, 12);
  const anchors = [
    0,
    speech.spans[1].fromWord,
    speech.spans[columnClauses.length + 1].fromWord,
    speech.spans[check].fromWord,
    speech.spans[resolve].fromWord,
    speech.words.length,
  ];
  const times = [0.25, 2.25, 4.25, 8.25, 10.25, 11.65];
  const words = speech.words.map((w, i) => {
    const segment = anchors.findIndex((a, j) => j < 5 && i >= a && i < anchors[j + 1]);
    const step = (times[segment + 1] - times[segment]) / (anchors[segment + 1] - anchors[segment]);
    return {
      ...w,
      start: times[segment] + (i - anchors[segment]) * step,
      end: times[segment] + (i - anchors[segment] + 1) * step,
    };
  });
  const proposal: Rec = {
    kind: id === '25' ? 'constraint-choice' : 'tradeoff-frontier',
    preset: id === '25' ? 'sieve' : 'pareto',
    visualMode: 'diagram',
    layout: 'stack',
    label: subject,
    subject,
    outcome,
    evidence: qualified ? 'illustrative' : 'source-stated',
    ...(conditional ? { condition } : {}),
    startWord: 0,
    endWord: speech.words.length - 1,
    setupWord: 0,
    actionWord: speech.spans[1].fromWord,
    responseWord: speech.spans[columnClauses.length + 1].fromWord,
    checkWord: speech.spans[check].fromWord,
    resolveWord: speech.spans[resolve].fromWord,
    entities: actors.map((label) => ({ label, evidence: speech.spans[0] })),
    period,
    population,
    records: records.map(({ clause, ...r }) =>
      id === '25'
        ? { ...r, evidence: speech.spans[clause as number] }
        : { ...r, quantity: { ...(r.quantity as Rec), evidence: speech.spans[clause as number] } },
    ),
    ...(id === '25'
      ? {
          requirements: columns.map((label, i) => ({
            label,
            content,
            evidence: speech.spans[columnClauses[i]],
          })),
        }
      : {
          criteria: columns.map((label, i) => ({
            label,
            direction: i % 2 ? 'maximize' : 'minimize',
            evidence: speech.spans[columnClauses[i]],
          })),
          comparisonEvidence: speech.spans[check],
        }),
  };
  return { id, ...speech, words, proposal, negatives: [] };
}
export function sieveFrontierCases(): ExpansionSieveFrontierScene[] {
  return [
    ...packet.stories,
    ...(['25', '26'] as const).flatMap((id) =>
      (['W', 'M'] as const).flatMap((letter) =>
        [false, true].flatMap((four) => [
          maximumSieveFrontier(id, letter, four),
          maximumSieveFrontier(id, letter, four, true),
          maximumSieveFrontier(id, letter, four, true, true),
          maximumSieveFrontier(id, letter, false, false, false, true, false, false),
          maximumSieveFrontier(id, letter, four, false, false, false, false, true, true),
        ]),
      ),
    ),
  ].map(acceptedSieveFrontier);
}
export const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#555' };

// Actual shipped Inter cmap/advance/ink boxes. CPU evidence, not native shaping.
const font = readFileSync('resources/fonts/Inter.ttf');
const tables = new Map<string, number>();
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const p = 12 + i * 16;
  tables.set(font.toString('ascii', p, p + 4), font.readUInt32BE(p + 8));
}
function table(name: string): number {
  const p = tables.get(name);
  if (p === undefined) throw new Error(`Missing ${name}`);
  return p;
}
const units = font.readUInt16BE(table('head') + 18);
const metrics = font.readUInt16BE(table('hhea') + 34);
const longLoca = font.readInt16BE(table('head') + 50) === 1;
const cmap = table('cmap');
let mapping = 0;
for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
  const p = cmap + font.readUInt32BE(cmap + 8 + i * 8);
  if (font.readUInt16BE(p) === 12) mapping = p;
}
export function interExtent(text: string, size: number): number[] {
  let pen = 0,
    left = 0,
    right = 0,
    top = 0,
    bottom = 0;
  for (const character of text) {
    let glyph = 0;
    const code = character.codePointAt(0) ?? 0;
    for (let i = 0; i < font.readUInt32BE(mapping + 12); i++) {
      const p = mapping + 16 + i * 12;
      if (code >= font.readUInt32BE(p) && code <= font.readUInt32BE(p + 4)) {
        glyph = font.readUInt32BE(p + 8) + code - font.readUInt32BE(p);
        break;
      }
    }
    expect(glyph, character).toBeGreaterThan(0);
    const offset = (id: number) =>
      longLoca
        ? font.readUInt32BE(table('loca') + id * 4)
        : font.readUInt16BE(table('loca') + id * 2) * 2;
    if (offset(glyph + 1) > offset(glyph)) {
      const p = table('glyf') + offset(glyph);
      left = Math.min(left, pen + font.readInt16BE(p + 2));
      right = Math.max(right, pen + font.readInt16BE(p + 6));
      top = Math.min(top, -font.readInt16BE(p + 8));
      bottom = Math.max(bottom, -font.readInt16BE(p + 4));
    }
    pen += font.readUInt16BE(table('hmtx') + Math.min(glyph, metrics - 1) * 4);
  }
  return [left, top, right, bottom].map((v) => (v * size) / units);
}
