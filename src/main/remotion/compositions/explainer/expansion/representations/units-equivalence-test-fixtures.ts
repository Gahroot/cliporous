import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import type { ExpansionSourceFixture } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionEquivalence,
  parseExpansionUnitConversion,
} from '../../../../../ai/explainer/expansion-representations-units-equivalence-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionUnitsEquivalenceScene } from './units-equivalence-types';

export const unitsEquivalencePacket = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/representations/units-equivalence.source.json',
    'utf8',
  ),
) as { stories: ExpansionSourceFixture[] };
export function acceptedUnitsEquivalence(
  story: ExpansionSourceFixture,
): ExpansionUnitsEquivalenceScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '49'
      ? parseExpansionUnitConversion(story.proposal, ctx)
      : parseExpansionEquivalence(story.proposal, ctx);
  expect(ctx.issues, story.sourceText).toEqual([]);
  if (!scene) throw new Error('Expected real representation parser acceptance');
  return scene;
}
/** Reauthor five full clauses at fixed beat windows; remap all source spans, not domain quantities. */
export function unitsEquivalenceSpeech(
  story: ExpansionSourceFixture,
  clauses: readonly string[],
  proposal: Rec,
): ExpansionSourceFixture {
  const oldStarts = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map(
    (k) => Number(story.proposal[k]),
  );
  const starts = [0.25, 2, 3.75, 5.5, 7.25],
    ends = [1.5, 3.25, 5, 6.75, 9.5];
  const words: { text: string; start: number; end: number }[] = [];
  const spans = clauses.map((clause, i) => {
    const tokens = clause.split(/\s+/),
      fromWord = words.length;
    tokens.forEach((text, j) => {
      words.push({
        text,
        start: starts[i] + (j / tokens.length) * (ends[i] - starts[i]),
        end: starts[i] + ((j + 1) / tokens.length) * (ends[i] - starts[i]),
      });
    });
    return { fromWord, toWord: words.length - 1 };
  });
  function remap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(remap);
    if (value !== null && typeof value === 'object') {
      const object = value as Rec;
      if ('fromWord' in object && 'toWord' in object) {
        const index = oldStarts.indexOf(Number(object.fromWord));
        if (index < 0) throw new Error('Only complete fixture clauses supported');
        return spans[index];
      }
      return Object.fromEntries(Object.entries(object).map(([k, v]) => [k, remap(v)]));
    }
    return value;
  }
  const raw = remap(proposal) as Rec;
  ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].forEach((k, i) => {
    raw[k] = spans[i].fromWord;
  });
  raw.startWord = 0;
  raw.endWord = words.length - 1;
  return {
    ...story,
    sourceText: clauses.join(' '),
    words,
    window: { startWord: 0, endWord: words.length - 1, startTime: 0, endTime: 10 },
    proposal: raw,
  };
}
export function maximumUnitsEquivalence(
  id: '49' | '50',
  letter: 'W' | 'M',
  views: 2 | 3 = 3,
): ExpansionSourceFixture {
  const base = unitsEquivalencePacket.stories.find((s) => s.id === id);
  if (!base) throw new Error('Missing frozen fixture');
  const identity = letter.repeat(28),
    population = letter.repeat(40),
    period = `${letter.repeat(31)}A`;
  const actors = Array.from({ length: 8 }, (_, i) => `${letter.repeat(27)}${i}`),
    actor = actors[0];
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string')
      return value
        .replaceAll('Ada', actor)
        .replaceAll(id === '49' ? 'Span' : 'Survey', identity)
        .replaceAll('Harbor', population)
        .replaceAll('May', period);
    if (Array.isArray(value)) return value.map(replace);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
    return value;
  };
  const raw = replace(structuredClone(base.proposal)) as Rec;
  raw.actors = actors.map((label) => ({
    label,
    evidence: { fromWord: 0, toWord: Number(base.proposal.actionWord) - 1 },
  }));
  const setup = `${identity} lists ${actors.slice(0, -1).join(', ')} and ${actors.at(-1)} as actors for ${population} during ${period}.`;
  const names = views === 2 ? 'set and area' : 'set, area and length';
  const marks = views === 2 ? 50 : 33;
  const total = marks * 20;
  const clauses =
    id === '49'
      ? [
          setup,
          `${actor} ${identity} is 1000000000/999999999 metres during ${period} among ${population} with denominator 1000000000.`,
          `${actor} requests ${identity} conversion from metre to centimetre for ${population} during ${period}.`,
          `${actor} confirms ${identity} conversion preserves amount for ${population} during ${period}.`,
          `${actor} requests ${identity} conversion for ${population} during ${period}.`,
        ]
      : [
          setup,
          `${actor} ${identity} selected is 40 count during ${period} among ${population} with denominator ${total}.`,
          `${actor} ${identity} total is ${total} count during ${period} among ${population} with denominator ${total}.`,
          `${actor} states ${identity} views are ${names} with ${marks} marks each representing 20 count for ${population} during ${period}.`,
          `${actor} requests ${identity} equivalent views for ${population} during ${period}.`,
        ];
  if (id === '49') {
    // Exact conversion must stay inside the frozen result component cap.
    clauses[1] = `${actor} ${identity} is 999999999/1000000000 metres during ${period} among ${population} with denominator 1000000000.`;
    const q = raw.quantity as Rec;
    q.amount = { kind: 'rational', value: { numerator: 999999999, denominator: 1000000000 } };
    (q.basis as Rec).denominator = { numerator: 1000000000, denominator: 1 };
  } else {
    const qs = raw.quantities as Rec[];
    qs.forEach((q, i) => {
      q.amount = { kind: 'rational', value: { numerator: i === 0 ? 40 : total, denominator: 1 } };
      (q.basis as Rec).denominator = { numerator: total, denominator: 1 };
    });
    raw.views = ['set', 'area', 'length'].slice(0, views);
    (raw.aggregation as Rec).marks = marks;
  }
  const condition = `If ${letter.repeat(93)}`;
  const quantities = id === '49' ? [raw.quantity as Rec] : (raw.quantities as Rec[]);
  quantities.forEach((q, i) => {
    q.state = 'conditional';
    q.condition = condition;
    clauses[i + 1] = `${condition}, ${clauses[i + 1]}`;
  });
  return unitsEquivalenceSpeech(base, clauses, raw);
}
export function unitsEquivalenceCases(): ExpansionUnitsEquivalenceScene[] {
  return [
    ...unitsEquivalencePacket.stories,
    ...(['W', 'M'] as const).flatMap((letter) => [
      maximumUnitsEquivalence('49', letter),
      ...([2, 3] as const).map((v) => maximumUnitsEquivalence('50', letter, v)),
    ]),
  ].flatMap((story) =>
    (['diagram', 'hybrid'] as const).map((visualMode) =>
      acceptedUnitsEquivalence({ ...story, proposal: { ...story.proposal, visualMode } }),
    ),
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
export function unitsEquivalenceGlyphExtent(text: string, size: number): number[] {
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
