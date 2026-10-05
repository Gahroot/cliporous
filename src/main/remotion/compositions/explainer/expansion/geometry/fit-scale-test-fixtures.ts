import { readFileSync } from 'node:fs';
import { Fragment, isValidElement, type ReactNode } from 'react';
import {
  parseExpansionLinkedScale,
  parseExpansionPackingClearance,
} from '../../../../../ai/explainer/expansion-geometry-fit-scale-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { Clay } from '../../hero-kit';
import { FitScaleModels } from './fit-scale-models';
import type { ExpansionFitScaleScene } from './fit-scale-types';
export const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/geometry/fit-scale.source.json',
    'utf8',
  ),
) as {
  stories: {
    id: string;
    words: Parameters<typeof makeParseContext>[0];
    window: Parameters<typeof makeParseContext>[1];
    proposal: Rec;
    negatives: {
      name: string;
      edits: { path: (string | number)[]; value?: unknown; remove?: boolean }[];
    }[];
    paraphrases: {
      id: string;
      words: Parameters<typeof makeParseContext>[0];
      window: Parameters<typeof makeParseContext>[1];
      proposal: Rec;
    }[];
  }[];
};
export function accepted(
  story: Pick<(typeof packet.stories)[number], 'id' | 'words' | 'window' | 'proposal'>,
  mode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionFitScaleScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene = (story.id === '59' ? parseExpansionPackingClearance : parseExpansionLinkedScale)(
    { ...story.proposal, visualMode: mode },
    ctx,
  );
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
export function qualifiedResult(
  id: '59' | '60',
  state: 'unknown' | 'missing' | 'disputed' | 'blocked',
) {
  const source = structuredClone(packet.stories[id === '59' ? 0 : 1]);
  const result = source.proposal.result as Rec;
  const span = result.evidence as { fromWord: number; toWord: number };
  const text =
    id === '60'
      ? `Ava reports Crate identity across Parcel, Studio, and Hall is ${state} for Bench during Trial.`
      : state === 'blocked'
        ? 'Ava reports Crate is blocked in Tray for Bench during Trial if rotated.'
        : `Ava reports fit of Crate in Tray is ${state} for Bench during Trial.`;
  const tokens = text.split(' '),
    start = source.words[span.fromWord].start;
  const end = source.words[span.toWord].end;
  source.words = [
    ...source.words.slice(0, span.fromWord),
    ...tokens.map((text, i) => ({
      text,
      start: start + ((end - start) * i) / tokens.length,
      end: start + ((end - start) * (i + 1)) / tokens.length,
    })),
  ];
  span.toWord = source.words.length - 1;
  source.window.endWord = span.toWord;
  source.proposal.endWord = span.toWord;
  if (state !== 'blocked') {
    result.state = state;
    result.qualifier = state;
    delete result.condition;
  }
  if (id === '59') result.verdict = state === 'blocked' ? 'blocked' : 'unknown';
  source.proposal.outcome = state;
  return source;
}
/** Independent author-fixed hierarchy, exact dimensions never determine projections. */
export function linkedFixture(representation: 'measured' | 'schematic', unresolved = false) {
  const proposal = structuredClone(packet.stories[1].proposal);
  const clauses = [
    `Scale guide tracks Ava's Crate ${representation === 'measured' ? 'with supplied measurements' : 'schematically'} for Bench during Trial.`,
    'Ava shows Crate in Parcel object level for Bench during Trial if inspected.',
    'Ava shows Crate in Studio room level for Bench during Trial.',
    'Ava shows Crate in Hall building level for Bench during Trial.',
    'Ava Parcel width is 999999999/1000000000 metres during Trial for Bench.',
    'Ava Studio width is 20 centimetres during Trial for Bench.',
    'Ava Hall width is 30 millimetres during Trial for Bench.',
    'Ava tracks Crate from Parcel into Studio for Bench during Trial.',
    'Ava tracks Crate from Studio into Hall for Bench during Trial.',
    unresolved
      ? 'Ava reports Crate identity across Parcel, Studio, and Hall is unknown for Bench during Trial.'
      : 'Ava reports Crate identity across Parcel, Studio, and Hall is retained for Bench during Trial if inspected.',
  ];
  let cursor = 0;
  const spans: { fromWord: number; toWord: number }[] = [],
    words: { text: string; start: number; end: number }[] = [];
  clauses.forEach((clause, i) => {
    const tokens = clause.split(' ');
    const start = 0.25 + i * 1.05;
    spans.push({ fromWord: cursor, toWord: cursor + tokens.length - 1 });
    tokens.forEach((text, j) => {
      words.push({
        text,
        start: start + (j * 0.6) / tokens.length,
        end: start + ((j + 1) * 0.6) / tokens.length,
      });
    });
    cursor += tokens.length;
  });
  const records = proposal.records as Rec[];
  records.forEach((r, i) => {
    r.evidence = spans[i + 1];
  });
  records[0].state = 'conditional';
  records[0].condition = 'if inspected';
  const relations = proposal.relations as Rec[];
  relations.forEach((r, i) => {
    r.evidence = spans[7 + i];
  });
  const values = [
    { numerator: 999999999, denominator: 1000000000 },
    { numerator: 20, denominator: 1 },
    { numerator: 30, denominator: 1 },
  ];
  const dimensions = ['Parcel', 'Studio', 'Hall'].map((record, i) => ({
    record,
    axis: 'width',
    quantity: {
      actor: 'Ava',
      claim: `${record} width`,
      state: 'known',
      basis: {
        unit: ['metre', 'centimetre', 'millimetre'][i],
        period: 'Trial',
        population: 'Bench',
      },
      amount: { kind: 'rational', value: values[i] },
      evidence: spans[4 + i],
    },
  }));
  const result = proposal.result as Rec;
  result.evidence = spans[9];
  result.state = unresolved ? 'unknown' : 'conditional';
  delete result.condition;
  if (unresolved) result.qualifier = 'unknown';
  else result.condition = 'if inspected';
  Object.assign(proposal, {
    label: 'Scale guide',
    representation,
    dimensions,
    outcome: unresolved ? 'unknown' : 'retained',
    setupWord: 0,
    actionWord: spans[1].fromWord,
    responseWord: spans[2].fromWord,
    checkWord: spans[7].fromWord,
    resolveWord: spans[9].fromWord,
    endWord: cursor - 1,
  });
  (proposal.entities as Rec[]).forEach((e) => {
    e.evidence = spans[0];
  });
  return {
    id: '60',
    proposal,
    words,
    window: { startWord: 0, endWord: cursor - 1, startTime: 0, endTime: 12 },
  };
}
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
    else if (value.type === FitScaleModels || value.type === Clay) {
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

/** Complete independently authored maximum packing facts: 10 records + dimension + result, 9 unique candidates. */
export function maximumPacking() {
  const source = packet.stories[0];
  const proposal = structuredClone(source.proposal);
  const actor = 'A'.repeat(28),
    identity = 'I'.repeat(28),
    scope = 'S'.repeat(40),
    period = 'P'.repeat(32);
  const labels = [
    'T'.repeat(28),
    identity,
    ...Array.from({ length: 8 }, (_, i) => 'W'.repeat(27) + i),
  ];
  const title = 'Fit guide';
  const clauses = [
    `${title} tracks ${actor}'s ${identity} schematically for ${scope} during ${period}.`,
    ...labels.map(
      (name, i) =>
        `${actor} supplies ${name} as ${i === 0 ? 'tray container' : 'block part'} for ${scope} during ${period}.`,
    ),
    `${actor} ${identity} width is 10 centimetres during ${period} for ${scope}.`,
    ...labels
      .slice(1)
      .map((name) => `${actor} pairs ${name} with ${labels[0]} for ${scope} during ${period}.`),
    `${actor} reports ${identity} fits in ${labels[0]} for ${scope} during ${period} if rotated.`,
  ];
  let cursor = 0;
  const spans: { fromWord: number; toWord: number }[] = [];
  const words: { text: string; start: number; end: number }[] = [];
  clauses.forEach((clause, i) => {
    const tokens = clause.split(' ');
    const start = 0.25 + (i * 10.7) / (clauses.length - 1);
    const step = 0.35 / tokens.length;
    spans.push({ fromWord: cursor, toWord: cursor + tokens.length - 1 });
    tokens.forEach((text, j) => {
      words.push({ text, start: start + j * step, end: start + (j + 1) * step });
    });
    cursor += tokens.length;
  });
  const common = { actor, scope, period, state: 'known' };
  Object.assign(proposal, {
    label: title,
    actor,
    identity,
    subject: identity,
    scope,
    period,
    entities: [
      { label: actor, evidence: spans[0] },
      { label: identity, evidence: spans[0] },
    ],
    records: labels.map((label, i) => ({
      ...common,
      label,
      role: i === 0 ? 'container' : 'part',
      template: i === 0 ? 'tray' : 'block',
      evidence: spans[i + 1],
    })),
    dimensions: [
      {
        record: identity,
        axis: 'width',
        quantity: {
          actor,
          claim: `${identity} width`,
          state: 'known',
          basis: { unit: 'centimetre', period, population: scope },
          amount: { kind: 'rational', value: { numerator: 10, denominator: 1 } },
          evidence: spans[11],
        },
      },
    ],
    relations: labels.slice(1).map((from, i) => ({
      ...common,
      type: 'candidate',
      from,
      to: labels[0],
      identity,
      evidence: spans[12 + i],
    })),
    result: {
      ...common,
      part: identity,
      container: labels[0],
      verdict: 'fits',
      state: 'conditional',
      condition: 'if rotated',
      evidence: spans[21],
    },
    setupWord: 0,
    actionWord: spans[5].fromWord,
    responseWord: spans[9].fromWord,
    checkWord: spans[16].fromWord,
    resolveWord: spans[21].fromWord,
    endWord: cursor - 1,
  });
  return {
    id: '59',
    proposal,
    words,
    window: { startWord: 0, endWord: cursor - 1, startTime: 0, endTime: 12 },
  };
}
