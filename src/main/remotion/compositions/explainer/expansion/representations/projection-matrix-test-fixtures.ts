import { readFileSync } from 'node:fs';
import { Fragment, isValidElement, type ReactNode } from 'react';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionCoordinateProjection,
  parseExpansionMatrixProduct,
} from '../../../../../ai/explainer/expansion-representations-projection-matrix-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { Clay } from '../../hero-kit';
import { ProjectionMatrixModels } from './projection-matrix-models';
import type { ExpansionProjectionMatrixScene } from './projection-matrix-types';

export const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/representations/projection-matrix.source.json',
    'utf8',
  ),
) as {
  stories: {
    id: string;
    words: Parameters<typeof makeParseContext>[0];
    window: Parameters<typeof makeParseContext>[1];
    proposal: Rec;
  }[];
};
export function accepted(
  story: (typeof packet.stories)[number],
  visualMode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionProjectionMatrixScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene = (
    story.id === '53' ? parseExpansionCoordinateProjection : parseExpansionMatrixProduct
  )({ ...story.proposal, visualMode }, ctx);
  if (!scene || ctx.issues.length)
    throw new Error(
      `${story.id}: ${JSON.stringify(ctx.issues)} setup=${story.words
        .slice(0, story.words.findIndex((w) => w.text.endsWith('.')) + 1)
        .map((w) => w.text)
        .join(' ')}`,
    );
  return scene;
}
/** Independent authoring, with the five phase anchors enclosing all intervening assertions. */
export function maximum(
  id: '53' | '54',
  size = 4,
  state = 'known',
  letter = 'W',
  actorCount = 5,
  qualifiedOperands = false,
) {
  const subject = letter.repeat(34),
    period = letter.repeat(32),
    population = `${letter.repeat(39)}P`;
  const actors = Array.from({ length: actorCount }, (_, i) => `${letter.repeat(27)}${i}`);
  const labels = Array.from(
    { length: 12 },
    (_, i) => `${letter.repeat(26)}${String(i).padStart(2, '0')}`,
  );
  const axes = Array.from({ length: size }, (_, i) => `${letter.repeat(19)}${i}`);
  const frames = labels.slice(0, 8);
  const claim = letter.repeat(96);
  const scope = `during ${period} among ${population}`;
  const condition = `If ${letter.repeat(93)}`;
  const basis = {
    unit: id === '53' ? 'metre' : 'ratio',
    period,
    population,
    denominator: { numerator: 1000000000, denominator: 1 },
  };
  const qualification =
    state === 'known'
      ? { state }
      : state === 'conditional'
        ? { state, condition }
        : {
            state,
            qualifier:
              state === 'illustrative'
                ? 'teaching example'
                : state === 'simulated'
                  ? 'simulation'
                  : state,
          };
  const qualify = (s: string) =>
    state === 'conditional'
      ? `${condition}, ${s}`
      : state === 'illustrative'
        ? `In this teaching example, ${s}`
        : state === 'simulated'
          ? `In this simulation, ${s}`
          : s;
  const absent = ['unknown', 'missing', 'disputed'].includes(state);
  const clauses = [
    id === '53'
      ? `${subject} lists ${actors.join(' and ')} in ${frames.join(' and ')} with rightward x and upward y axes ${scope}.`
      : `${subject} lists ${actors.join(' and ')} ${scope}.`,
  ];
  const records: Rec[] = [];
  for (let i = 0; i < 12; i++) {
    if (id === '53') {
      const a = actors[(i % 8) % actorCount],
        f = frames[i % 8],
        axis = i < 8 ? 'x' : 'y';
      const value =
        i === 0
          ? { numerator: 0, denominator: 1 }
          : i === 1
            ? { numerator: 1, denominator: 1000000000 }
            : { numerator: -1000000000, denominator: 999999999 };
      clauses.push(
        `${a} ${f} ${axis} coordinate is ${value.numerator}/${value.denominator} metres ${scope} with denominator 1000000000.`,
      );
      records.push({
        actor: a,
        frame: f,
        axis,
        quantity: {
          actor: a,
          claim: `${f} ${axis} coordinate`,
          basis,
          state: 'known',
          amount: { kind: 'rational', value },
        },
      });
    } else {
      const values = Array.from({ length: size }, (_, r) =>
        Array.from({ length: size }, (_, c) =>
          i < 4
            ? {
                numerator: r === c ? (letter === 'M' ? -1000000000 : 1) : 0,
                denominator: r === c ? (letter === 'M' ? 999999999 : i === 0 ? 1000000000 : 1) : 1,
              }
            : { numerator: r === c ? 1 : 0, denominator: 1 },
        ),
      );
      const rowAxes = axes.map((a, r) =>
        i < 4
          ? `${letter.repeat(17)}L${i}${r}`
          : i >= 8
            ? `${letter.repeat(17)}T${i.toString(16)}${r}`
            : a,
      );
      const columnAxes = axes.map((a, c) =>
        i >= 4 && i < 8
          ? `${letter.repeat(17)}R${i}${c}`
          : i >= 8
            ? `${letter.repeat(17)}U${i.toString(16)}${c}`
            : a,
      );
      const sourceClaim = i >= 8 ? `${letter.repeat(94)}${String(i).padStart(2, '0')}` : claim;
      const notation = values
        .flat()
        .map((v) => `${v.numerator}/${v.denominator}`)
        .join(', ');
      const operandQualify = absent || qualifiedOperands ? qualify : (text: string) => text;
      clauses.push(
        operandQualify(
          `${actors[0]} ${labels[i]} ${sourceClaim} matrix has rows ${rowAxes.join(' and ')} and columns ${columnAxes.join(' and ')} with values ${absent ? state : notation} ratio ${scope} with denominator 1000000000.`,
        ),
      );
      records.push({
        actor: actors[0],
        label: labels[i],
        claim: sourceClaim,
        basis,
        rows: rowAxes,
        columns: columnAxes,
        ...(absent ? {} : { values }),
        ...(absent || qualifiedOperands ? qualification : { state: 'known' }),
      });
    }
  }
  const relations: Rec[] = [];
  for (let i = 0; i < 16; i++) {
    const a = Math.floor(i / 4),
      b = 4 + (i % 4);
    clauses.push(
      id === '53'
        ? `In this schematic, ${actors[a]} in ${frames[a]} corresponds to ${actors[b % actorCount]} in ${frames[b]} by reference-xy projection ${scope}.`
        : (state === 'conditional' && i > 0 ? (text: string) => text : qualify)(
            `${actors[0]} requests the worked matrix-product calculation for ${claim} using ${labels[a]} times ${labels[b]} ${scope}.`,
          ),
    );
    relations.push(
      id === '53'
        ? {
            fromActor: actors[a],
            fromFrame: frames[a],
            toActor: actors[b % actorCount],
            toFrame: frames[b],
            state: 'illustrative',
            qualifier: 'schematic',
          }
        : {
            actor: actors[0],
            left: labels[a],
            right: labels[b],
            operation: 'matrix-product',
            ...(absent || (state === 'conditional' && i > 0) ? { state: 'known' } : qualification),
          },
    );
  }
  clauses.push(
    `${subject} ${id === '53' ? 'keeps only supplied coordinates' : 'keeps the supplied operands'}.`,
  );
  const speech = expansionFixtureSpeech(clauses, 12);
  const anchors = [0, 1, 2, 13, 29, 30],
    times = [0.25, 2.25, 4.25, 6.75, 10.25, 11.65];
  for (let c = 0; c < 30; c++) {
    const phase = anchors.findIndex((a, j) => j < 5 && c >= a && c < anchors[j + 1]);
    const first = speech.spans[anchors[phase]].fromWord;
    const last = phase === 4 ? speech.words.length : speech.spans[anchors[phase + 1]].fromWord;
    const step = (times[phase + 1] - times[phase]) / (last - first);
    for (let w = speech.spans[c].fromWord; w <= speech.spans[c].toWord; w++) {
      speech.words[w].start = Number((times[phase] + (w - first) * step).toFixed(9));
      speech.words[w].end = Number((times[phase] + (w - first + 1) * step).toFixed(9));
    }
  }
  const proposal: Rec = {
    kind: id === '53' ? 'geometry-projection' : 'linear-algebra',
    preset: id === '53' ? 'coordinates' : 'matrix-product',
    template: id === '53' ? 'reference-xy' : 'row-column-product',
    evidence:
      id === '53' || ['illustrative', 'simulated'].includes(state)
        ? 'illustrative'
        : 'source-stated',
    visualMode: 'diagram',
    label: subject,
    subject,
    outcome: id === '53' ? 'supplied coordinates' : 'supplied operands',
    ...(state === 'conditional' ? { condition } : {}),
    period,
    population,
    startWord: 0,
    endWord: speech.words.length - 1,
    ...Object.fromEntries(
      ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map((key, i) => [
        key,
        speech.spans[anchors[i]].fromWord,
      ]),
    ),
    entities: actors.map((label) => ({ label, evidence: speech.spans[0] })),
    records: records.map((r, i) =>
      id === '53'
        ? { ...r, quantity: { ...(r.quantity as Rec), evidence: speech.spans[i + 1] } }
        : { ...r, evidence: speech.spans[i + 1] },
    ),
    relations: relations.map((r, i) => ({ ...r, evidence: speech.spans[13 + i] })),
    ...(id === '53'
      ? {
          frames: frames.map((label) => ({
            label,
            axes: [
              { axis: 'x', positive: 'right' },
              { axis: 'y', positive: 'up' },
            ],
            evidence: speech.spans[0],
          })),
        }
      : {}),
  };
  return { id, ...speech, proposal };
}
export function cases(): ExpansionProjectionMatrixScene[] {
  return [
    ...packet.stories,
    maximum('53'),
    ...['known', 'unknown', 'missing', 'disputed', 'illustrative', 'simulated', 'conditional'].map(
      (s) => maximum('54', 4, s),
    ),
    maximum('54', 3, 'known', 'M'),
    maximum('53', 4, 'known', 'W', 8),
    maximum('54', 4, 'known', 'W', 8),
  ].flatMap((story) => [accepted(story), accepted(story, 'hybrid')]);
}
export const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };

// Shipped Inter cmap/hmtx/glyf ink bounds, cached by glyph rather than source string.
const font = readFileSync('resources/fonts/Inter.ttf'),
  tables = new Map<string, number>();
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const p = 12 + i * 16;
  tables.set(font.toString('ascii', p, p + 4), font.readUInt32BE(p + 8));
}
function table(name: string): number {
  const value = tables.get(name);
  if (value === undefined) throw new Error(name);
  return value;
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
const ranges = Array.from({ length: font.readUInt32BE(mapping + 12) }, (_, i) => {
  const p = mapping + 16 + i * 12;
  return [font.readUInt32BE(p), font.readUInt32BE(p + 4), font.readUInt32BE(p + 8)];
});
const glyphCache = new Map<number, number[]>();
function rawInterBounds(text: string): number[] {
  let pen = 0,
    l = 0,
    t = 0,
    r = 0,
    b = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    let g = glyphCache.get(code);
    if (!g) {
      const range = ranges.find((v) => code >= v[0] && code <= v[1]);
      if (!range) throw new Error(`Missing Inter glyph: ${character}`);
      const id = range[2] + code - range[0];
      if (!id) throw new Error('Missing glyph');
      const offset = (n: number) =>
        longLoca
          ? font.readUInt32BE(table('loca') + n * 4)
          : font.readUInt16BE(table('loca') + n * 2) * 2;
      const p = table('glyf') + offset(id),
        ink = offset(id + 1) > offset(id);
      g = [
        ink ? font.readInt16BE(p + 2) : 0,
        ink ? -font.readInt16BE(p + 8) : 0,
        ink ? font.readInt16BE(p + 6) : 0,
        ink ? -font.readInt16BE(p + 4) : 0,
        font.readUInt16BE(table('hmtx') + Math.min(id, metrics - 1) * 4),
      ];
      if (glyphCache.size === 256) glyphCache.clear();
      glyphCache.set(code, g);
    }
    l = Math.min(l, pen + g[0]);
    t = Math.min(t, g[1]);
    r = Math.max(r, pen + g[2]);
    b = Math.max(b, g[3]);
    pen += g[4];
  }
  return [l, t, r, b].map((v) => (v * 22) / units);
}
const lineCache = new Map<string, number[]>();
export function interBounds(text: string): number[] {
  let bounds = lineCache.get(text);
  if (!bounds) {
    bounds = rawInterBounds(text);
    if (lineCache.size === 512) lineCache.clear();
    lineCache.set(text, bounds);
  }
  return bounds;
}
export interface ComposedHost {
  type: string;
  props: Record<string, unknown>;
}
/** Only these two audited hook-free components may be evaluated; no hooks/contexts are faked. */
export function composedHosts(node: ReactNode): ComposedHost[] {
  const hosts: ComposedHost[] = [];
  const walk = (value: ReactNode): void => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    if (!isValidElement<Record<string, unknown>>(value)) return;
    if (typeof value.type === 'string') {
      hosts.push({ type: value.type, props: value.props });
      walk(value.props.children as ReactNode);
    } else if (value.type === Fragment) walk(value.props.children as ReactNode);
    else if (value.type === ProjectionMatrixModels || value.type === Clay) {
      walk((value.type as unknown as (props: Record<string, unknown>) => ReactNode)(value.props));
    } else throw new Error('Unaudited component in composed-host walk');
  };
  walk(node);
  return hosts;
}
export function decode(text: string): string {
  return text.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[k] ?? k,
  );
}
