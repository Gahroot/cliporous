import { readFileSync } from 'node:fs';
import { Fragment, isValidElement, type ReactNode } from 'react';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionDimensionalScaling,
  parseExpansionRegionOverlap,
} from '../../../../../ai/explainer/expansion-geometry-regions-dimensions-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { Clay } from '../../hero-kit';
import { RegionsDimensionsModels } from './regions-dimensions-models';
import type { ExpansionRegionsDimensionsScene } from './regions-dimensions-types';
export interface Story {
  id: string;
  words: Parameters<typeof makeParseContext>[0];
  window: Parameters<typeof makeParseContext>[1];
  proposal: Rec;
}
export const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/geometry/regions-dimensions.source.json',
    'utf8',
  ),
) as { stories: Story[]; paraphrases: Story[] };
export function accepted(
  story: Story,
  visualMode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionRegionsDimensionsScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene = (
    story.id === '63' ? parseExpansionRegionOverlap : parseExpansionDimensionalScaling
  )({ ...story.proposal, visualMode }, ctx);
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
/** Maximum labels, exact authored relations and the parser's five full clauses. */
export function maximumRegion(
  state = 'known',
  relation = 'overlap',
  membership = 'inside',
  overlapState = state,
): Story {
  const actor = 'W'.repeat(28),
    member = 'M'.repeat(28),
    left = 'L'.repeat(28),
    right = 'R'.repeat(28),
    label = 'B'.repeat(48),
    scope = 'S'.repeat(40),
    period = 'P'.repeat(32),
    condition = `If ${'C'.repeat(93)}`;
  const qualifier =
    state === 'simulated' ? 'simulation' : state === 'illustrative' ? 'teaching example' : state;
  const absent = ['unknown', 'missing', 'disputed'].includes(state);
  const qualify = (body: string) =>
    state === 'conditional'
      ? `${condition}, ${body}`
      : state === 'simulated' || state === 'illustrative'
        ? `In this ${qualifier}, ${body}`
        : body;
  const tail = `for ${scope} during ${period}`;
  const clauses = [
    `${state === 'conditional' ? `${condition}, ` : ''}${actor} ${label} tracks ${member} and regions ${left} and ${right} ${tail}.`,
    `${qualify(absent ? `${actor} membership for ${member} in ${left} remains ${state}` : `${actor} places ${member} ${membership} ${left}`)} ${tail}.`,
    `${qualify(absent ? `${actor} restriction for ${right} remains ${state}` : `${actor} restricts ${right} to ${'A'.repeat(40)}`)} ${tail}.`,
    `${qualify(['unknown', 'missing', 'disputed'].includes(overlapState) ? `${actor} overlap for ${left} and ${right} remains ${overlapState}` : `${actor} states ${left} ${relation === 'overlap' ? 'overlaps' : 'is disjoint from'} ${right}`)} ${tail}.`,
    `${state === 'conditional' ? `${condition}, ` : ''}${actor} region summary retains supplied facts ${tail}.`,
  ];
  const speech = expansionFixtureSpeech(clauses);
  const q = (value: string) => ({
    state,
    ...(absent ? { qualifier } : { value }),
    ...(state === 'conditional'
      ? { condition }
      : state === 'simulated' || state === 'illustrative'
        ? { qualifier }
        : {}),
  });
  const proposal: Rec = {
    ...packet.stories[0].proposal,
    actor,
    subject: actor,
    label,
    scope,
    period,
    evidence: state === 'simulated' || state === 'illustrative' ? 'illustrative' : 'source-stated',
    ...(state === 'conditional' ? { condition } : {}),
    member,
    regions: [left, right],
    startWord: 0,
    endWord: speech.window.endWord,
    entities: [actor, member, left, right].map((label) => ({ label, evidence: speech.spans[0] })),
    membership: { actor, member, region: left, ...q(membership), evidence: speech.spans[1] },
    restriction: { actor, region: right, ...q('A'.repeat(40)), evidence: speech.spans[2] },
    overlap: {
      actor,
      left,
      right,
      ...(overlapState === state ? q(relation) : { state: overlapState, qualifier: overlapState }),
      evidence: speech.spans[3],
    },
    result: { actor, claim: 'region summary', evidence: speech.spans[4] },
  };
  ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].forEach((key, i) => {
    proposal[key] = speech.spans[i].fromWord;
  });
  return { id: '63', ...speech, proposal };
}
export function maximumDimension(
  template = 'square-area',
  state = 'known',
  base = '1000000000/999999999',
  scale = '1',
): Story {
  const actor = 'W'.repeat(28),
    label = 'B'.repeat(48),
    scope = 'S'.repeat(40),
    period = 'P'.repeat(32),
    condition = `If ${'C'.repeat(93)}`;
  const shape =
    template === 'line-length' ? 'line' : template === 'square-area' ? 'square' : 'cube';
  const noun = shape === 'line' ? 'length' : shape === 'square' ? 'area' : 'volume';
  const unit = shape === 'line' ? 'metre' : shape === 'square' ? 'square-metre' : 'cubic-metre';
  const qualifier =
    state === 'simulated' ? 'simulation' : state === 'illustrative' ? 'teaching example' : state;
  const absent = ['unknown', 'missing', 'disputed'].includes(state);
  const qualify = (s: string) =>
    state === 'conditional'
      ? `${condition}, ${s}`
      : state === 'simulated' || state === 'illustrative'
        ? `In this ${qualifier}, ${s}`
        : s;
  const tail = `for ${scope} during ${period}`;
  const prefix = state === 'conditional' ? `${condition}, ` : '';
  const value = absent ? (state === 'disputed' ? `disputed between ${base} and 0` : state) : base;
  const clauses = [
    `${prefix}${actor} ${label} scales a ${shape} ${noun} ${tail}.`,
    `${qualify(`${actor} scale factor is ${scale} ratio during ${period} for ${scope} with denominator 1`)}.`,
    `${qualify(`${actor} original ${noun} is ${value} ${unit} during ${period} for ${scope}`)}.`,
    `${prefix}${actor} requests a worked ${shape} scaling using scale factor and original ${noun} ${tail}.`,
    `${absent ? `${actor} scaling remains ${state}` : qualify(`${actor} reports worked scaling`)} ${tail}.`,
  ];
  const speech = expansionFixtureSpeech(clauses);
  const rational = (text: string) => {
    const [n, d = '1'] = text.split('/');
    return { kind: 'rational', value: { numerator: Number(n), denominator: Number(d) } };
  };
  const qualification = {
    state,
    ...(state === 'conditional' ? { condition } : state !== 'known' ? { qualifier } : {}),
  };
  const scaleQualification = absent ? { state: 'known' } : qualification;
  const proposal: Rec = {
    ...packet.stories[1].proposal,
    template,
    actor,
    subject: actor,
    label,
    scope,
    period,
    evidence: state === 'simulated' || state === 'illustrative' ? 'illustrative' : 'source-stated',
    ...(state === 'conditional' ? { condition } : {}),
    outcome: absent ? `remains ${state}` : 'worked scaling',
    startWord: 0,
    endWord: speech.window.endWord,
    entities: [{ label: actor, evidence: speech.spans[0] }],
    scale: {
      actor,
      claim: 'scale factor',
      ...scaleQualification,
      amount: rational(scale),
      basis: {
        unit: 'ratio',
        population: scope,
        period,
        denominator: { numerator: 1, denominator: 1 },
      },
      evidence: speech.spans[1],
    },
    original: {
      actor,
      claim: `original ${noun}`,
      ...qualification,
      ...(absent
        ? state === 'disputed'
          ? { alternatives: [rational(base), rational('0')] }
          : {}
        : { amount: rational(base) }),
      basis: { unit, population: scope, period },
      evidence: speech.spans[2],
    },
    request: { actor, operation: 'dimensional-scaling', evidence: speech.spans[3] },
    result: { actor, ...qualification, evidence: speech.spans[4] },
  };
  ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].forEach((key, i) => {
    proposal[key] = speech.spans[i].fromWord;
  });
  return { id: '64', ...speech, proposal };
}
export function cases(): ExpansionRegionsDimensionsScene[] {
  return [
    ...packet.stories,
    ...packet.paraphrases,
    ...['known', 'conditional', 'simulated', 'illustrative', 'unknown', 'missing', 'disputed'].map(
      (state) => maximumRegion(state),
    ),
    ...['line-length', 'square-area', 'cube-volume'].flatMap((template) =>
      ['known', 'conditional', 'simulated', 'illustrative', 'unknown', 'missing', 'disputed'].map(
        (state) => maximumDimension(template, state),
      ),
    ),
    maximumRegion('known', 'disjoint', 'inside'),
    maximumRegion('known', 'overlap', 'outside'),
    maximumRegion('known', 'overlap', 'inside', 'unknown'),
    maximumRegion('known', 'overlap', 'inside', 'missing'),
    maximumRegion('known', 'overlap', 'inside', 'disputed'),
    maximumDimension('line-length', 'known', '1', '1000000000/999999999'),
    maximumDimension('cube-volume', 'known', '1', '999/1000'),
    maximumDimension('square-area', 'known', '0', '1000000000'),
  ].flatMap((story) => [accepted(story), accepted(story, 'hybrid')]);
}
export const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };
export function composedHosts(node: ReactNode): { type: string; props: Record<string, unknown> }[] {
  const hosts: { type: string; props: Record<string, unknown> }[] = [];
  const walk = (value: ReactNode): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!isValidElement<Record<string, unknown>>(value)) return;
    if (typeof value.type === 'string') {
      hosts.push({ type: value.type, props: value.props });
      walk(value.props.children as ReactNode);
    } else if (value.type === Fragment) walk(value.props.children as ReactNode);
    else if (value.type === RegionsDimensionsModels || value.type === Clay)
      walk((value.type as unknown as (props: Record<string, unknown>) => ReactNode)(value.props));
    else throw new Error('Unaudited component');
  };
  walk(node);
  return hosts;
}

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
  return [l, t, r, b, pen].map((v) => (v * 22) / units);
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

export const interAscent = font.readInt16BE(table('hhea') + 4) / units;
export const interDescent = font.readInt16BE(table('hhea') + 6) / units;
