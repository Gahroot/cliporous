import { readFileSync } from 'node:fs';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionCapacityMatch,
  parseExpansionMatrixLinks,
} from '../../../../../ai/explainer/expansion-relationships-matrix-matching-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionMatrixMatchingScene } from './matrix-matching-types';

export const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/relationships/matrix-matching.source.json',
    'utf8',
  ),
) as { stories: ExpansionSourceFixture[] };
export function acceptedMatrixMatching(
  story: ExpansionSourceFixture,
): ExpansionMatrixMatchingScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '37'
      ? parseExpansionMatrixLinks(story.proposal, ctx)
      : parseExpansionCapacityMatch(story.proposal, ctx);
  if (!scene || ctx.issues.length) throw new Error(`${story.id}: ${JSON.stringify(ctx.issues)}`);
  return scene;
}
export function maximumMatrixMatching(
  id: '37' | '38',
  rowCount = 4,
  columnCount = 4,
  variant = 0,
  letter = 'W',
): ExpansionSourceFixture {
  const rows = Array.from({ length: rowCount }, (_, i) => `${letter.repeat(27)}${i}`);
  const columns = Array.from(
    { length: columnCount },
    (_, i) => `${letter.repeat(27)}${i + rowCount}`,
  );
  const subject = letter.repeat(34),
    period = letter.repeat(32),
    population = `${letter.repeat(39)}P`,
    condition = `If ${letter.repeat(93)}`;
  const scope = `during ${period} among ${population}`;
  const clauses = [
    id === '37'
      ? `${subject}: Matrix rows list ${rows.join(' and ')} and columns list ${columns.join(' and ')} ${scope}.`
      : `${subject}: Candidates ${rows.join(' and ')} seek destinations ${columns.join(' and ')} ${scope}.`,
  ];
  const relations: Rec[] = [],
    eligibility: Rec[] = [],
    records: Rec[] = [];
  const states = [
    'known',
    'unknown',
    'missing',
    'disputed',
    'illustrative',
    'simulated',
    'conditional',
  ] as const;
  const qualified = (i: number): (typeof states)[number] =>
    variant === 0 || variant === 3
      ? 'known'
      : variant === 2
        ? states[i % 4]
        : i === 6
          ? 'conditional'
          : states[i % 6];
  const qualification = (state: (typeof states)[number]): Rec =>
    state === 'known'
      ? { state }
      : state === 'conditional'
        ? { state, condition }
        : {
            state,
            qualifier:
              state === 'illustrative'
                ? 'illustrative example'
                : state === 'simulated'
                  ? 'simulation'
                  : state,
          };
  const assertion = (state: (typeof states)[number], body: string): string =>
    state === 'conditional'
      ? `${condition}, ${body}`
      : state === 'illustrative'
        ? `In this illustrative example, ${body}`
        : state === 'simulated'
          ? `In this simulation, ${body}`
          : body;
  if (id === '38')
    for (const [i, destination] of columns.entries()) {
      const state = qualified(i),
        unknown = state === 'unknown' || state === 'missing',
        disputed = state === 'disputed';
      const value = variant === 2 ? (i === 0 ? 0 : i === 3 ? 999999999 : 1000000000) : i + 7;
      const qualifier =
        state === 'illustrative'
          ? `teaching example ${letter.repeat(79)}`
          : state === 'simulated'
            ? `simulation ${letter.repeat(85)}`
            : state;
      const clause = clauses.length;
      const body = `${destination} capacity is ${unknown ? state : disputed ? `disputed between ${value} and 1000000000` : value} count ${scope} with denominator 1000000000.`;
      clauses.push(
        state === 'conditional'
          ? `${condition}, ${body}`
          : state === 'illustrative' || state === 'simulated'
            ? `In this ${qualifier}, ${body}`
            : body,
      );
      const amount = { kind: 'rational', value: { numerator: value, denominator: 1 } };
      records.push({
        type: 'capacity',
        destination,
        clause,
        quantity: {
          actor: destination,
          claim: 'capacity',
          state,
          basis: {
            unit: 'count',
            period,
            population,
            denominator: { numerator: 1000000000, denominator: 1 },
          },
          ...(unknown
            ? { qualifier }
            : disputed
              ? {
                  qualifier,
                  alternatives: [
                    amount,
                    { kind: 'rational', value: { numerator: 1000000000, denominator: 1 } },
                  ],
                }
              : state === 'conditional'
                ? { amount, condition }
                : state === 'known'
                  ? { amount }
                  : { amount, qualifier }),
        },
      });
    }
  const pairStart = clauses.length;
  for (const row of rows)
    for (const column of columns) {
      const i = id === '37' ? relations.length : eligibility.length;
      const from = id === '37' && variant === 3 ? rows[Math.floor(i / 12)] : row;
      const to =
        id === '37' && variant === 3 ? columns[Math.floor(i / 3) % columns.length] : column;
      const state = qualified(id === '38' ? i + columns.length : i),
        unresolved = state === 'unknown' || state === 'missing' || state === 'disputed';
      const clause = clauses.length;
      if (id === '37') {
        const role = (['association', 'dependency', 'transfer'] as const)[i % 3];
        const body =
          role === 'association'
            ? `${from} is associated with ${to} ${scope}.`
            : role === 'dependency'
              ? `${from} depends on ${to} ${scope}.`
              : `${from} transfers work to ${to} ${scope}.`;
        clauses.push(
          unresolved
            ? `${from} ${role === 'association' ? 'and' : 'to'} ${to} ${role} is ${state} ${scope}.`
            : assertion(state, body),
        );
        relations.push({
          from,
          to,
          role,
          direction: role === 'association' ? 'undirected' : 'from-to',
          ...qualification(state),
          clause,
        });
      } else {
        const denied = variant === 2 || i % 3 === 1;
        clauses.push(
          unresolved
            ? `${from} eligibility for ${to} is ${state} ${scope}.`
            : assertion(
                state,
                `${from} is ${denied ? 'ineligible' : 'eligible'} for ${to} ${scope}.`,
              ),
        );
        eligibility.push({
          candidate: from,
          destination: to,
          ...qualification(state),
          ...(unresolved ? {} : { status: denied ? 'denied' : 'eligible' }),
          clause,
        });
      }
    }
  const check = clauses.length;
  if (id === '37') clauses.push(`Unrecorded cells in ${subject} remain unspecified ${scope}.`);
  else
    for (const [i, candidate] of rows.entries()) {
      const clause = clauses.length;
      // Unresolved source-owned candidates are not solved even with known eligible destinations.
      const state = (['unknown', 'missing', 'disputed'] as const)[i % 3];
      clauses.push(`${candidate} match is ${state} ${scope}.`);
      records.push({
        type: 'match',
        candidate,
        state,
        qualifier: state,
        status: 'unresolved',
        clause,
      });
    }
  const resolve = clauses.length;
  const outcome =
    id === '37'
      ? `${subject} preserves only stated pairs`
      : `${subject} retains supplied matches and unresolved candidates`;
  clauses.push(`${outcome}.`);
  const speech = expansionFixtureSpeech(clauses, 12);
  const action = id === '37' ? pairStart : 1,
    response = id === '37' ? pairStart + 1 : pairStart;
  const anchors = [
    0,
    speech.spans[action].fromWord,
    speech.spans[response].fromWord,
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
      start: Math.round((times[segment] + (i - anchors[segment]) * step) * 1e9) / 1e9,
      end: Math.round((times[segment] + (i - anchors[segment] + 1) * step) * 1e9) / 1e9,
    };
  });
  const evidenceRecords = (entries: Rec[], quantity: boolean): Rec[] =>
    entries.map(({ clause, ...r }) =>
      quantity && r.type === 'capacity'
        ? { ...r, quantity: { ...(r.quantity as Rec), evidence: speech.spans[clause as number] } }
        : { ...r, evidence: speech.spans[clause as number] },
    );
  const proposal: Rec = {
    kind: id === '37' ? 'relation-structure' : 'semantic-sort',
    preset: id === '37' ? 'matrix-links' : 'capacity-match',
    visualMode: 'diagram',
    layout: 'stack',
    label: subject,
    subject,
    outcome: id === '37' ? 'preserves only stated pairs' : 'retains supplied matches',
    evidence: variant !== 1 ? 'source-stated' : 'illustrative',
    ...(variant === 1 ? { condition } : {}),
    startWord: 0,
    endWord: words.length - 1,
    setupWord: 0,
    actionWord: anchors[1],
    responseWord: anchors[2],
    checkWord: anchors[3],
    resolveWord: anchors[4],
    entities: [...rows, ...columns].map((label) => ({ label, evidence: speech.spans[0] })),
    period,
    population,
    ...(id === '37'
      ? { matrix: { rows, columns }, relations: evidenceRecords(relations, false) }
      : {
          candidates: rows,
          destinations: columns,
          eligibility: evidenceRecords(eligibility, false),
          records: evidenceRecords(records, true),
        }),
  };
  return { id, ...speech, words, proposal, negatives: [] };
}
export function matrixMatchingCases(): ExpansionMatrixMatchingScene[] {
  return [
    ...packet.stories,
    ...(['W', 'M'] as const).flatMap((letter) => [
      maximumMatrixMatching('37', 4, 4, 0, letter),
      maximumMatrixMatching('37', 4, 4, 3, letter),
      maximumMatrixMatching('37', 4, 3, 1, letter),
      maximumMatrixMatching('37', 3, 4, 1, letter),
      maximumMatrixMatching('38', 4, 4, 0, letter),
      maximumMatrixMatching('38', 4, 4, 2, letter),
      maximumMatrixMatching('38', 4, 4, 1, letter),
      maximumMatrixMatching('38', 7, 1, 2, letter),
      maximumMatrixMatching('38', 1, 7, 1, letter),
    ]),
  ].map(acceptedMatrixMatching);
}
export function selfMatrixMatching(
  role: 'association' | 'dependency' | 'transfer',
  self = true,
): ExpansionSourceFixture {
  const destination = self ? 'Aster' : 'Beacon';
  const speech = expansionFixtureSpeech(
    [
      'Roster: Matrix rows list Aster and Beacon and columns list Aster and Beacon during May among teams.',
      role === 'association'
        ? `Aster is associated with ${destination} during May among teams.`
        : role === 'dependency'
          ? `Aster depends on ${destination} during May among teams.`
          : `Aster transfers work to ${destination} during May among teams.`,
      'Beacon depends on Aster during May among teams.',
      'Unrecorded cells in Roster remain unspecified during May among teams.',
      'Roster preserves only stated pairs.',
    ],
    12,
  );
  const words = speech.words.map((w, index) => {
    const clause = speech.spans.findIndex((s) => index >= s.fromWord && index <= s.toWord);
    const span = speech.spans[clause];
    const step = 1.6 / (span.toWord - span.fromWord + 1);
    return {
      ...w,
      start: 0.25 + clause * 2 + (index - span.fromWord) * step,
      end: 0.25 + clause * 2 + (index - span.fromWord + 1) * step,
    };
  });
  return {
    id: '37',
    ...speech,
    words,
    negatives: [],
    proposal: {
      kind: 'relation-structure',
      preset: 'matrix-links',
      visualMode: 'diagram',
      layout: 'stack',
      label: 'Roster',
      subject: 'Roster',
      outcome: 'preserves only stated pairs',
      evidence: 'source-stated',
      setupWord: speech.spans[0].fromWord,
      actionWord: speech.spans[1].fromWord,
      responseWord: speech.spans[2].fromWord,
      checkWord: speech.spans[3].fromWord,
      resolveWord: speech.spans[4].fromWord,
      entities: ['Aster', 'Beacon'].map((label) => ({ label, evidence: speech.spans[0] })),
      period: 'May',
      population: 'teams',
      matrix: { rows: ['Aster', 'Beacon'], columns: ['Aster', 'Beacon'] },
      relations: [
        {
          from: 'Aster',
          to: destination,
          role,
          direction: role === 'association' ? 'undirected' : 'from-to',
          state: 'known',
          evidence: speech.spans[1],
        },
        {
          from: 'Beacon',
          to: 'Aster',
          role: 'dependency',
          direction: 'from-to',
          state: 'known',
          evidence: speech.spans[2],
        },
      ],
    },
  };
}
export const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#555' };

// Bound the expensive shipped glyph scan once per character, rather than per SVG/page.
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
const units = font.readUInt16BE(table('head') + 18),
  metrics = font.readUInt16BE(table('hhea') + 34),
  longLoca = font.readInt16BE(table('head') + 50) === 1;
const cmap = table('cmap');
let mapping = 0;
for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
  const p = cmap + font.readUInt32BE(cmap + 8 + i * 8);
  if (font.readUInt16BE(p) === 12) mapping = p;
}
const glyphs = new Map<string, number[]>();
export function interExtent(text: string, size = 22): number[] {
  let pen = 0,
    left = 0,
    right = 0,
    top = 0,
    bottom = 0;
  for (const character of text) {
    let metric = glyphs.get(character);
    if (!metric) {
      let glyph = 0;
      const code = character.codePointAt(0) ?? 0;
      for (let i = 0; i < font.readUInt32BE(mapping + 12); i++) {
        const p = mapping + 16 + i * 12;
        if (code >= font.readUInt32BE(p) && code <= font.readUInt32BE(p + 4)) {
          glyph = font.readUInt32BE(p + 8) + code - font.readUInt32BE(p);
          break;
        }
      }
      if (!glyph) throw new Error(`Missing shipped glyph ${character}`);
      const offset = (id: number): number =>
        longLoca
          ? font.readUInt32BE(table('loca') + id * 4)
          : font.readUInt16BE(table('loca') + id * 2) * 2;
      const p = table('glyf') + offset(glyph);
      metric =
        offset(glyph + 1) > offset(glyph)
          ? [
              font.readInt16BE(p + 2),
              -font.readInt16BE(p + 8),
              font.readInt16BE(p + 6),
              -font.readInt16BE(p + 4),
            ]
          : [0, 0, 0, 0];
      metric.push(font.readUInt16BE(table('hmtx') + Math.min(glyph, metrics - 1) * 4));
      glyphs.set(character, metric);
    }
    left = Math.min(left, pen + metric[0]);
    right = Math.max(right, pen + metric[2]);
    top = Math.min(top, metric[1]);
    bottom = Math.max(bottom, metric[3]);
    pen += metric[4];
  }
  return [left, top, right, bottom].map((v) => (v * size) / units);
}
