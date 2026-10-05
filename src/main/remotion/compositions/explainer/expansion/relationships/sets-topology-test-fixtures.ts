import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionSetOperations,
  parseExpansionTopology,
} from '../../../../../ai/explainer/expansion-relationships-sets-topology-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import {
  EXPANSION_TOPOLOGY_TEMPLATES,
  type ExpansionRelationshipStatus,
  type ExpansionSetOperation,
  type ExpansionSetsTopologyScene,
  type ExpansionTopologyTemplate,
} from './sets-topology-types';

export const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/relationships/sets-topology.source.json',
    'utf8',
  ),
) as { stories: ExpansionSourceFixture[] };
export const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#555' };
export function acceptedSetsTopology(story: ExpansionSourceFixture): ExpansionSetsTopologyScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '39'
      ? parseExpansionSetOperations(story.proposal, ctx)
      : parseExpansionTopology(story.proposal, ctx);
  expect(ctx.issues, JSON.stringify(story.proposal)).toEqual([]);
  if (!scene) throw new Error('Expected real source parser acceptance');
  return scene;
}
const namedList = (names: string[]): string =>
  names.length === 1
    ? names[0]
    : names.length === 2
      ? names.join(' and ')
      : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
export function setsTopologyFixture(
  id: '39' | '40',
  state: ExpansionRelationshipStatus['state'] = 'known',
  operation: ExpansionSetOperation = 'intersection',
  template: ExpansionTopologyTemplate = 'ring',
  memberCount = 6,
  missingLinks = false,
  letter = 'W',
  effect = 'failed',
  result = 'continues',
  allIncluded = false,
  allEdgesFailed = false,
): ExpansionSourceFixture {
  const members = Array.from({ length: memberCount }, (_, i) => `${letter.repeat(27)}${i}`);
  const sets = Array.from(
    { length: 8 - memberCount },
    (_, i) => `${letter.repeat(27)}${i + memberCount}`,
  );
  const nodes = Array.from({ length: 4 }, (_, i) => `${letter.repeat(27)}${i}`);
  const entities = id === '39' ? [...members, ...sets] : nodes;
  const label = letter.repeat(34),
    scope = `${letter.repeat(33)}P`,
    period = `${letter.repeat(31)}T`;
  const context = `for ${scope} in ${period}`;
  const condition = `If ${letter.repeat(93)}`;
  const qualifierHead =
    state === 'illustrative' ? 'teaching example' : state === 'simulated' ? 'simulation' : state;
  const qualification = qualifierHead;
  const unknown = ['unknown', 'missing', 'disputed'].includes(state);
  const fact = (body: string): string =>
    state === 'illustrative' || state === 'simulated' ? `In this ${qualification}, ${body}` : body;
  const records: Rec[] = [];
  const bodies: string[] = [];
  if (id === '39') {
    for (const [i, member] of members.entries())
      for (const [j, set] of sets.entries()) {
        if (records.length === 12) break;
        const membership =
          allIncluded || state === 'illustrative' || state === 'simulated' || i % 2 === 0 || j > 0
            ? 'included'
            : 'excluded';
        records.push({
          member,
          set,
          state,
          ...(unknown
            ? { qualification }
            : state === 'conditional'
              ? { membership, condition }
              : state === 'known'
                ? { membership }
                : { membership, qualification }),
        });
        bodies.push(
          fact(
            unknown
              ? `${member} membership in ${set} remains ${qualification}`
              : `${member} ${membership === 'included' ? 'belongs to' : 'does not belong to'} ${set}`,
          ),
        );
      }
  } else {
    const links = EXPANSION_TOPOLOGY_TEMPLATES[template].links;
    for (const [i, [a, b]] of links.entries()) {
      if (missingLinks && i >= 2) continue;
      const role = (['dependency', 'transfer', 'membership'] as const)[i % 3];
      const status = allEdgesFailed ? 'failed' : (['present', 'absent', 'failed'] as const)[i % 3];
      const noun =
        role === 'transfer'
          ? `transfer from ${nodes[a]} to ${nodes[b]}`
          : `${role} of ${nodes[a]} ${role === 'dependency' ? 'on' : 'in'} ${nodes[b]}`;
      records.push({
        from: nodes[a],
        to: nodes[b],
        role,
        state,
        ...(unknown
          ? { qualification }
          : state === 'conditional'
            ? { status, condition }
            : state === 'known'
              ? { status }
              : { status, qualification }),
      });
      bodies.push(fact(`${noun} is ${unknown ? qualification : status}`));
    }
  }
  const split = Math.ceil(records.length / 2);
  if (state === 'conditional') {
    records.forEach((r, i) => {
      if (id === '40' || i >= split) {
        r.state = 'known';
        delete r.condition;
      }
    });
  }
  const relationClause = (start: number, end: number): string =>
    `${state === 'conditional' && id === '39' && start === 0 ? `${condition}, ` : ''}${bodies.slice(start, end).join(' and ')} ${context}.`;
  const operands = `${sets[0]} ${operation === 'exclusion' ? 'minus' : 'and'} ${sets[1]}`;
  const phrase = `the ${operation} of ${operands}`;
  const selected = members.filter(
    (_, i) =>
      operation === 'union' || (operation === 'intersection' && (allIncluded || i % 2 === 0)),
  );
  const complete = state === 'known' && memberCount === 6;
  const resultState = 'known';
  const outcome =
    id === '39'
      ? complete
        ? selected.length
          ? 'contains only'
          : 'contains no members'
        : 'unresolved'
      : result;
  const clauses = [
    id === '39'
      ? `${label} lists members ${namedList(members)} and sets ${namedList(sets)} ${context}.`
      : `${label} tracks ${namedList(nodes)} ${context}.`,
    relationClause(0, split),
    relationClause(split, records.length),
    id === '39'
      ? `${label} selects ${phrase} ${context}.`
      : `${condition}, dependency of ${nodes[0]} on ${nodes[1]} is ${effect} ${context}.`,
    id === '39'
      ? complete
        ? `${phrase} ${selected.length ? `contains only ${namedList(selected)}` : 'contains no members'} ${context}.`
        : `${phrase} remains unresolved ${context}.`
      : `${nodes[3]} delivery ${result === 'unchanged' ? 'remains unchanged' : result} ${context}.`,
  ];
  const speech = expansionFixtureSpeech(clauses, 12);
  const starts = [0.25, 2.55, 4.95, 7.4, 9.7, 11.65];
  const words = speech.words.map((word, i) => {
    const segment = speech.spans.findIndex((s) => i >= s.fromWord && i <= s.toWord);
    const span = speech.spans[segment];
    const step = (starts[segment + 1] - starts[segment] - 0.2) / (span.toWord - span.fromWord + 1);
    return {
      ...word,
      start: starts[segment] + (i - span.fromWord) * step,
      end: starts[segment] + (i - span.fromWord + 1) * step,
    };
  });
  const proposal: Rec = {
    kind: id === '39' ? 'venn' : 'collective-pattern',
    preset: id === '39' ? 'set-operations' : 'topology',
    template: id === '39' ? 'named-sets' : template,
    visualMode: 'diagram',
    layout: 'stack',
    label,
    subject: scope,
    outcome,
    evidence: state === 'illustrative' || state === 'simulated' ? 'illustrative' : 'source-stated',
    ...(id === '40' || state === 'conditional' ? { condition } : {}),
    startWord: 0,
    endWord: words.length - 1,
    setupWord: speech.spans[0].fromWord,
    actionWord: speech.spans[1].fromWord,
    responseWord: speech.spans[2].fromWord,
    checkWord: speech.spans[3].fromWord,
    resolveWord: speech.spans[4].fromWord,
    entities: entities.map((label) => ({ label, evidence: speech.spans[0] })),
    scope,
    period,
    ...(id === '39'
      ? {
          members,
          sets,
          memberships: records.map((r, i) => ({ ...r, evidence: speech.spans[i < split ? 1 : 2] })),
          operation: { kind: operation, left: sets[0], right: sets[1], evidence: speech.spans[3] },
          selection: complete
            ? { state: 'complete', members: selected, evidence: speech.spans[4] }
            : { state: 'unresolved', qualification: 'unresolved', evidence: speech.spans[4] },
        }
      : {
          edges: records.map((r, i) => ({ ...r, evidence: speech.spans[i < split ? 1 : 2] })),
          failure: {
            from: nodes[0],
            to: nodes[1],
            role: 'dependency',
            state: 'conditional',
            condition,
            effect,
            evidence: speech.spans[3],
          },
          result: {
            actor: nodes[3],
            claim: 'delivery',
            state: resultState,
            result,
            evidence: speech.spans[4],
          },
        }),
  };
  return { id, ...speech, words, proposal, negatives: [] };
}
export function setsTopologyCases(): ExpansionSetsTopologyScene[] {
  const stories = [...packet.stories];
  for (const state of [
    'known',
    'conditional',
    'illustrative',
    'simulated',
    'unknown',
    'missing',
    'disputed',
  ] as const) {
    stories.push(setsTopologyFixture('39', state), setsTopologyFixture('40', state));
  }
  for (const count of [1, 2, 3, 4, 5, 6])
    stories.push(setsTopologyFixture('39', 'known', 'union', 'ring', count, false, 'M'));
  for (const operation of ['union', 'exclusion'] as const)
    stories.push(setsTopologyFixture('39', 'known', operation));
  for (const template of ['chain', 'ring', 'diamond'] as const)
    stories.push(
      setsTopologyFixture('40', 'known', 'intersection', template),
      setsTopologyFixture('40', 'known', 'intersection', template, 6, true),
      setsTopologyFixture(
        '40',
        'known',
        'intersection',
        template,
        6,
        false,
        'M',
        'failed',
        'stops',
        false,
        true,
      ),
    );
  for (const effect of ['absent', 'unknown', 'missing', 'disputed'])
    stories.push(
      setsTopologyFixture('40', 'known', 'intersection', 'ring', 6, false, 'M', effect, 'stops'),
    );
  stories.push(
    setsTopologyFixture('39', 'known', 'union', 'ring', 2, false, 'M', 'failed', 'continues', true),
  );
  return stories.map(acceptedSetsTopology);
}

// Actual shipped Inter ink bounds. Cache glyph metrics once; never scan cmap per rendered glyph.
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
if (!mapping) throw new Error('Missing Inter cmap12');
const groups = Array.from({ length: font.readUInt32BE(mapping + 12) }, (_, i) => {
  const p = mapping + 16 + i * 12;
  return [font.readUInt32BE(p), font.readUInt32BE(p + 4), font.readUInt32BE(p + 8)];
});
const glyphCache = new Map<number, number[]>();
function glyphMetrics(code: number): number[] {
  const cached = glyphCache.get(code);
  if (cached) return cached;
  let low = 0,
    high = groups.length - 1,
    glyph = 0;
  while (low <= high) {
    const middle = (low + high) >>> 1,
      g = groups[middle];
    if (code < g[0]) high = middle - 1;
    else if (code > g[1]) low = middle + 1;
    else {
      glyph = g[2] + code - g[0];
      break;
    }
  }
  if (!glyph) throw new Error(`Missing Inter glyph ${code}`);
  const offset = (id: number): number =>
    longLoca
      ? font.readUInt32BE(table('loca') + id * 4)
      : font.readUInt16BE(table('loca') + id * 2) * 2;
  const p = table('glyf') + offset(glyph);
  const advance = font.readUInt16BE(table('hmtx') + Math.min(glyph, metrics - 1) * 4);
  const result =
    offset(glyph + 1) > offset(glyph)
      ? [
          advance,
          font.readInt16BE(p + 2),
          -font.readInt16BE(p + 8),
          font.readInt16BE(p + 6),
          -font.readInt16BE(p + 4),
        ]
      : [advance, 0, 0, 0, 0];
  if (glyphCache.size < 512) glyphCache.set(code, result);
  return result;
}
export function interExtent(text: string, size: number): number[] {
  let pen = 0,
    left = 0,
    top = 0,
    right = 0,
    bottom = 0;
  for (const character of text) {
    const [advance, l, t, r, b] = glyphMetrics(character.codePointAt(0) ?? 0);
    left = Math.min(left, pen + l);
    right = Math.max(right, pen + r);
    top = Math.min(top, t);
    bottom = Math.max(bottom, b);
    pen += advance;
  }
  return [left, top, right, bottom].map((v) => (v * size) / units);
}
