import { readFileSync } from 'node:fs';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionFactorization,
  parseExpansionVectorBasis,
} from '../../../../../ai/explainer/expansion-representations-vector-factorization-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionVectorFactorizationScene } from './vector-factorization-types';

export const vectorFactorizationColors = {
  surface: '#f6ecd9',
  text: '#23100c',
  accent: '#9f75ff',
  muted: '#81706a',
};
export const vectorFactorizationPacket = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/representations/vector-factorization.source.json',
    'utf8',
  ),
) as { stories: TemporalFixtureSeed[]; paraphrases: TemporalFixtureSeed[] };
export function vectorFactorizationFixtures(): ExpansionSourceFixture[] {
  return [
    ...temporalSourceFixtures([
      ...vectorFactorizationPacket.stories,
      ...vectorFactorizationPacket.paraphrases,
    ]),
    spatialMaximumFixture(),
    factorMaximumFixture(false),
    factorMaximumFixture(true),
    factorMaximumFixture(true),
    factorMaximumFixture(false, false, 'unknown'),
    factorMaximumFixture(false, false, 'missing'),
    factorMaximumFixture(false, false, 'disputed'),
  ];
}
export function parseVectorFactorization(
  fixture: Pick<ExpansionSourceFixture, 'id' | 'words' | 'window' | 'proposal'>,
  mode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionVectorFactorizationScene {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const raw: Rec = { ...fixture.proposal, visualMode: mode };
  const scene =
    fixture.id === '55'
      ? parseExpansionVectorBasis(raw, ctx)
      : parseExpansionFactorization(raw, ctx);
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}

function finishFixture(
  id: '55' | '56',
  clauses: string[],
  raw: Rec,
  phases: number[],
  entities: { label: string; clause: number }[],
): ExpansionSourceFixture {
  const speech = expansionFixtureSpeech(clauses, 12);
  const times = [0.25, 1.5, 3, 8.5, 10.5, 11.65];
  for (let phase = 0; phase < 5; phase++) {
    const from = speech.spans[phases[phase]].fromWord;
    const to = phase === 4 ? speech.words.length : speech.spans[phases[phase + 1]].fromWord;
    for (let i = from; i < to; i++) {
      speech.words[i].start =
        times[phase] + ((times[phase + 1] - times[phase]) * (i - from)) / (to - from);
      speech.words[i].end =
        times[phase] + ((times[phase + 1] - times[phase]) * (i + 1 - from)) / (to - from);
    }
  }
  function bind(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(bind);
    if (!value || typeof value !== 'object') return value;
    const record = value as Rec;
    const { clause, ...rest } = record;
    return {
      ...Object.fromEntries(Object.entries(rest).map(([key, v]) => [key, bind(v)])),
      ...(typeof clause === 'number' ? { evidence: speech.spans[clause] } : {}),
    };
  }
  const proposal = bind(raw) as Rec;
  Object.assign(proposal, {
    entities: entities.map((e) => ({ label: e.label, evidence: speech.spans[e.clause] })),
    startWord: 0,
    endWord: speech.words.length - 1,
  });
  for (const [i, field] of [
    'setupWord',
    'actionWord',
    'responseWord',
    'checkWord',
    'resolveWord',
  ].entries())
    proposal[field] = speech.spans[phases[i]].fromWord;
  return { id, ...speech, proposal, negatives: [] };
}
const actor = 'Actor'.padEnd(28, 'W');
const scope = 'Scope'.padEnd(40, 'W');
const period = 'Period'.padEnd(32, 'M');
const heading = 'Lesson'.padEnd(48, 'W');
function sourceQuantity(
  claim: string,
  value: number,
  denominator: number,
  clause: number,
  state = 'known',
): Rec {
  return {
    actor,
    claim,
    state,
    ...(state === 'known'
      ? { amount: { kind: 'rational', value: { numerator: value, denominator } } }
      : state === 'disputed'
        ? {
            alternatives: [0, 1].map((numerator) => ({
              kind: 'rational',
              value: { numerator, denominator: 1 },
            })),
            qualifier: 'disputed',
          }
        : { qualifier: state }),
    basis: {
      unit: 'ratio',
      population: scope,
      period,
      denominator: { numerator: 1, denominator: 1 },
    },
    clause,
  };
}
function spatialMaximumFixture(): ExpansionSourceFixture {
  const labels = ['Vector', 'BasisOne', 'BasisTwo', 'BasisThree'].map((s) => s.padEnd(28, 'W'));
  const frame = 'Frame'.padEnd(32, 'W');
  const clauses = [
    `${actor} ${heading} presents ${labels[0]} with basis ${labels[1]}, ${labels[2]} and ${labels[3]} in ${frame} for ${scope} during ${period}.`,
  ];
  const axes = ['x', 'y', 'z'];
  const vectors = labels.map((label, index) => ({
    label,
    components: axes.map((axis, j) => {
      const state = index === 0 && j === 2 ? 'unknown' : 'known';
      const value = j === 0 ? -1 : j === 1 ? 0 : 1;
      const denominator = j === 0 ? 1000000 : 1;
      const direction =
        state === 'unknown'
          ? 'unknown'
          : value < 0
            ? 'negative'
            : value === 0
              ? 'zero'
              : 'positive';
      const claim = `${label} ${axis} ${direction} component`;
      const clause = clauses.length;
      clauses.push(
        `${actor} ${claim} is ${state === 'unknown' ? 'unknown' : j === 0 ? '-0.000001' : value} ratio during ${period} for ${scope} with denominator 1.`,
      );
      return {
        axis,
        direction,
        quantity: sourceQuantity(claim, value, denominator, clause, state),
      };
    }),
  }));
  const check = clauses.length;
  clauses.push(
    `${actor} corresponds ${labels[0]}, ${labels[1]}, ${labels[2]} and ${labels[3]} to ${frame} for ${scope} during ${period}.`,
  );
  const resolve = clauses.length;
  clauses.push(
    `${actor} component display preserves supplied components for ${scope} during ${period}.`,
  );
  return finishFixture(
    '55',
    clauses,
    {
      kind: 'linear-algebra',
      preset: 'vector-basis',
      template: 'spatial-components',
      visualMode: 'diagram',
      evidence: 'source-stated',
      label: heading,
      subject: actor,
      actor,
      scope,
      period,
      frame,
      axes,
      vector: vectors[0],
      basis: vectors.slice(1),
      correspondence: { actor, frame, vector: labels[0], basis: labels.slice(1), clause: check },
      result: { actor, claim: 'component display', clause: resolve },
      outcome: 'preserves supplied components',
    },
    [0, 1, 4, check, resolve],
    labels.map((label) => ({ label, clause: 0 })).concat([{ label: actor, clause: 0 }]),
  );
}
function factorMaximumFixture(
  squares: boolean,
  signed = false,
  absent?: 'unknown' | 'missing' | 'disputed',
): ExpansionSourceFixture {
  const roles = squares
    ? ['square coefficient', 'constant term', 'first base', 'second base']
    : [
        'linear coefficient',
        'constant term',
        'common factor',
        'inner coefficient',
        'inner constant',
      ];
  const values = squares
    ? [999950884, -999950884, 31622, 31622]
    : signed
      ? [-1000000000, 1000000000, -1000000000, 1, -1]
      : [1000000000, -1000000000, 1000000000, 1, -1];
  const clauses = [
    `${actor} ${heading} uses x for ${squares ? 'integer difference of squares' : 'common factor'} for ${scope} during ${period}.`,
  ];
  const operands = roles.map((role, i) => {
    const clause = clauses.length;
    const state = absent && i === 2 ? absent : 'known';
    const text =
      state === 'disputed'
        ? 'disputed between 0 and 1'
        : state === 'known'
          ? String(values[i])
          : state;
    clauses.push(
      `${actor} ${role} is ${text} ratio during ${period} for ${scope} with denominator 1.`,
    );
    return { role, quantity: sourceQuantity(role, values[i], 1, clause, state) };
  });
  const check = clauses.length;
  clauses.push(
    `${actor} requests a worked factorization using x and all supplied operands for ${scope} during ${period}.`,
  );
  const resolve = clauses.length;
  clauses.push(
    absent
      ? `${actor} factorization remains ${absent} for ${scope} during ${period}.`
      : `${actor} reports worked factorization for ${scope} during ${period}.`,
  );
  return finishFixture(
    '56',
    clauses,
    {
      kind: 'equation',
      preset: 'factorization',
      template: squares ? 'integer-difference-of-squares' : 'common-factor',
      visualMode: 'diagram',
      evidence: 'source-stated',
      label: heading,
      subject: actor,
      actor,
      scope,
      period,
      symbol: 'x',
      operation: 'factorization',
      operands,
      request: { actor, operation: 'factorization', clause: check },
      result: {
        actor,
        state: absent ?? 'known',
        ...(absent ? { qualifier: absent } : {}),
        clause: resolve,
      },
      outcome: absent ? `remains ${absent}` : 'worked factorization',
    },
    [0, 1, 3, check, resolve],
    [{ label: actor, clause: 0 }],
  );
}

const font = readFileSync('resources/fonts/Inter.ttf');
const tables = new Map<string, number>();
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const p = 12 + i * 16;
  tables.set(font.toString('ascii', p, p + 4), font.readUInt32BE(p + 8));
}
function table(name: string): number {
  const p = tables.get(name);
  if (p === undefined) throw new Error(`Missing Inter table ${name}`);
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
interface Glyph {
  advance: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}
// Bounded local cache. Missing glyphs fail, rather than being certified as zero-width.
const cache = new Map<number, Glyph>();
function glyphMetric(code: number): Glyph {
  const cached = cache.get(code);
  if (cached) return cached;
  let glyph = 0;
  for (let i = 0; i < font.readUInt32BE(mapping + 12); i++) {
    const p = mapping + 16 + i * 12;
    if (code >= font.readUInt32BE(p) && code <= font.readUInt32BE(p + 4)) {
      glyph = font.readUInt32BE(p + 8) + code - font.readUInt32BE(p);
      break;
    }
  }
  if (!glyph) throw new Error(`Missing Inter glyph ${code}`);
  const offset = (id: number): number =>
    longLoca
      ? font.readUInt32BE(table('loca') + id * 4)
      : font.readUInt16BE(table('loca') + id * 2) * 2;
  const value: Glyph = {
    advance: font.readUInt16BE(table('hmtx') + Math.min(glyph, metrics - 1) * 4),
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  };
  if (offset(glyph + 1) > offset(glyph)) {
    const p = table('glyf') + offset(glyph);
    value.left = font.readInt16BE(p + 2);
    value.right = font.readInt16BE(p + 6);
    value.top = -font.readInt16BE(p + 8);
    value.bottom = -font.readInt16BE(p + 4);
  }
  if (cache.size < 512) cache.set(code, value);
  return value;
}
export function vectorFactorizationGlyphBounds(
  text: string,
  size: number,
): readonly [number, number, number, number] {
  let pen = 0,
    left = 0,
    right = 0,
    top = 0,
    bottom = 0;
  for (const char of text) {
    const g = glyphMetric(char.codePointAt(0) ?? 0);
    left = Math.min(left, pen + g.left);
    right = Math.max(right, pen + g.right);
    top = Math.min(top, g.top);
    bottom = Math.max(bottom, g.bottom);
    pen += g.advance;
  }
  return [
    (left * size) / units,
    (top * size) / units,
    (right * size) / units,
    (bottom * size) / units,
  ];
}
