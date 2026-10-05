import { readFileSync } from 'node:fs';
import { Fragment, isValidElement, type ReactNode } from 'react';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionReachability,
  parseExpansionViewpointOcclusion,
} from '../../../../../ai/explainer/expansion-geometry-visibility-access-contract';
import { expansionStoryBase } from '../../../../../ai/explainer/expansion-source-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { Clay } from '../../hero-kit';
import { VisibilityAccessDiagramBody } from './visibility-access-Diagram';
import { VisibilityAccessModels } from './visibility-access-models';
import type { ExpansionVisibilityAccessScene } from './visibility-access-types';

export const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };
export interface SourceCase {
  id: string;
  words: Parameters<typeof makeParseContext>[0];
  window: Parameters<typeof makeParseContext>[1];
  proposal: Rec;
}
export const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/geometry/visibility-access.source.json',
    'utf8',
  ),
) as { stories: SourceCase[] };
export function accepted(
  story: SourceCase,
  visualMode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionVisibilityAccessScene {
  const ctx = makeParseContext(story.words, story.window);
  const result = (
    story.id === '61' ? parseExpansionViewpointOcclusion : parseExpansionReachability
  )({ ...story.proposal, visualMode }, ctx);
  if (!result || ctx.issues.length)
    throw new Error(
      `${story.id}: ${JSON.stringify(ctx.issues)} base=${JSON.stringify(expansionStoryBase(story.proposal, makeParseContext(story.words, story.window), story.id as '61' | '62', ['template', 'entities', 'records', 'relations', 'scope', 'period', ...(story.id === '61' ? ['viewpoint'] : [])]))}`,
    );
  return result;
}
/** Independent complete source clauses at the actual minimum five-beat twelve-second window. */
export function maximum(id: '61' | '62', state = 'known', alternate = false): SourceCase {
  const entities = Array.from({ length: 8 }, (_, i) => `${'W'.repeat(27)}${i}`);
  const subject = 'W'.repeat(34),
    scope = 'W'.repeat(40),
    period = `${'W'.repeat(31)}P`,
    condition = `If ${'W'.repeat(93)}`;
  const qualified = (value: string, conditional: boolean) =>
    state === 'conditional'
      ? conditional
        ? { state, value, condition }
        : { state: 'known', value }
      : state === 'known'
        ? { state, value }
        : state === 'illustrative' || state === 'simulated'
          ? {
              state,
              value,
              qualifier: state === 'illustrative' ? 'teaching example' : 'simulation',
            }
          : { state, qualifier: state };
  const clause = (body: string, conditional: boolean) =>
    `${state === 'conditional' && conditional ? `${condition}, ` : state === 'illustrative' ? 'In this teaching example, ' : state === 'simulated' ? 'In this simulation, ' : ''}${body} at ${scope} during ${period}.`;
  const tuples: number[][] = [];
  for (let a = 0; a < 8; a++)
    for (let t = 0; t < 8; t++)
      for (let o = 0; o < 8; o++) {
        if (new Set([a, t, o]).size === 3) tuples.push([a, t, o]);
      }
  const groups: { fact: Rec; text: string }[][] = [[], [], []];
  for (let g = 0; g < 3; g++)
    for (let i = 0; i < (g === 2 && id === '61' ? 16 : 6); i++) {
      // Visibility pairs share six unique observer-target identities, each with independent existence.
      const tuple = id === '61' && g < 2 ? [0, i + 1, i === 5 ? 1 : 7] : tuples[i];
      const [a, t, o] = tuple;
      const role =
        id === '61'
          ? ['existence', 'visibility', 'occlusion'][g]
          : ['route', 'permission', 'reachability'][g];
      const value = ['unknown', 'missing', 'disputed'].includes(state)
        ? state
        : id === '61'
          ? ['present', 'hidden', 'blocked'][g]
          : ['connected', 'allowed', 'reachable'][g];
      let fact: Rec, body: string;
      if (id === '61') {
        fact = {
          role,
          actor: entities[a],
          target: entities[t],
          scope,
          period,
          ...qualified(value, g === 2 && i === 0),
          ...(g ? { occluder: entities[o], viewpoint: alternate ? 'isometric' : 'front' } : {}),
        };
        body = `${entities[a]} reports ${entities[t]} ${role} as ${value}${g ? ` by ${entities[o]} from ${alternate ? 'isometric' : 'front'} viewpoint` : ''}`;
      } else {
        const r = [0, 1, 2, 3, 4, 5, 6, 7].find((n) => !tuple.includes(n)) ?? 7;
        fact = {
          role,
          actor: entities[a],
          from: entities[t],
          to: entities[o],
          route: entities[r],
          scope,
          period,
          ...qualified(value, g === 2 && i === 0),
        };
        body = `${entities[a]} reports ${role} on ${entities[r]} from ${entities[t]} to ${entities[o]} as ${value}`;
      }
      groups[g].push({ fact, text: clause(body, g === 2 && i === 0) });
    }
  const setup = `${subject} lists ${entities.join(' and ')}${id === '61' ? ` from ${alternate ? 'isometric' : 'front'} viewpoint` : ''} at ${scope} during ${period}.`;
  const resolve = `${subject} keeps ${id === '61' ? 'existence separate from visibility' : 'stated reachability separate from permission'}.`;
  const speech = expansionFixtureSpeech(
    [setup, ...groups.flatMap((g) => g.map((f) => f.text)), resolve],
    12,
  );
  const phaseClauses = [0, 1, 7, 13, id === '61' ? 29 : 19];
  const starts = [0.25, 2.25, 4.25, 6.75, 10.25],
    ends = [1.75, 3.75, 5.75, 9.75, 11.65];
  for (let phase = 0; phase < 5; phase++) {
    const from = speech.spans[phaseClauses[phase]].fromWord;
    const to = speech.spans[(phaseClauses[phase + 1] ?? speech.spans.length) - 1].toWord;
    for (let w = from; w <= to; w++) {
      speech.words[w].start =
        starts[phase] + ((w - from) * (ends[phase] - starts[phase])) / (to - from + 1);
      speech.words[w].end =
        starts[phase] + ((w - from + 1) * (ends[phase] - starts[phase])) / (to - from + 1);
    }
  }
  groups.flat().forEach((f, i) => {
    f.fact.evidence = speech.spans[i + 1];
  });
  return {
    id,
    words: speech.words,
    window: speech.window,
    proposal: {
      kind: id === '61' ? 'robot-perception' : 'property-access',
      preset: id === '61' ? 'viewpoint-occlusion' : 'reachability',
      visualMode: 'diagram',
      template:
        id === '61'
          ? alternate
            ? 'robot-box'
            : 'robot-panel'
          : alternate
            ? 'courtyard-route'
            : 'gate-route',
      ...(id === '61' ? { viewpoint: alternate ? 'isometric' : 'front' } : {}),
      evidence:
        state === 'illustrative' || state === 'simulated' ? 'illustrative' : 'source-stated',
      label: subject,
      subject,
      outcome: id === '61' ? 'existence separate from visibility' : 'stated reachability',
      ...(state === 'conditional' ? { condition } : {}),
      startWord: 0,
      endWord: speech.words.length - 1,
      ...Object.fromEntries(
        ['setup', 'action', 'response', 'check', 'resolve'].map((p, i) => [
          `${p}Word`,
          speech.spans[phaseClauses[i]].fromWord,
        ]),
      ),
      scope,
      period,
      entities: entities.map((label) => ({ label, evidence: speech.spans[0] })),
      records: [...groups[0], ...groups[1]].map((f) => f.fact),
      relations: groups[2].map((f) => f.fact),
    },
  };
}
export const sources = [
  ...packet.stories,
  ...(['61', '62'] as const).flatMap((id) =>
    ['known', 'conditional', 'illustrative', 'simulated', 'unknown', 'missing', 'disputed'].map(
      (s, i) => maximum(id, s, i % 2 === 1),
    ),
  ),
];
export interface ComposedHost {
  type: string;
  props: Record<string, unknown>;
}
/** Closed allowlist of audited hook-free functions. No provider or hook emulation. */
export function composedHosts(node: ReactNode): ComposedHost[] {
  const hosts: ComposedHost[] = [];
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
    else if (
      value.type === VisibilityAccessModels ||
      value.type === VisibilityAccessDiagramBody ||
      value.type === Clay
    )
      walk((value.type as unknown as (props: Record<string, unknown>) => ReactNode)(value.props));
    else throw new Error('Unaudited component in composed-host walk');
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
