import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type {
  ExpansionFrontierRouteScene,
  ExpansionLocalGlobalScene,
} from '../../remotion/compositions/explainer/expansion/decisions/search-landscape-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import {
  parseExpansionFrontierRoute,
  parseExpansionLocalGlobal,
} from './expansion-decisions-search-landscape-contract';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import { isRec, makeParseContext, type Rec } from './kind-spec';

type Scene = ExpansionFrontierRouteScene | ExpansionLocalGlobalScene;
interface Fixture extends ExpansionSourceFixture {
  readonly paraphrases: readonly ExpansionSourceFixture[];
}
const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/decisions/search-landscape.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: Fixture[] };
function fixture(id: '29' | '30'): Fixture {
  const story = packet.stories.find((s) => s.id === id);
  if (!story) throw new Error(`Missing approved decision story ${id}`);
  return story;
}
const search = fixture('29'),
  landscape = fixture('30');
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
function object(raw: unknown): Rec {
  if (!isRec(raw)) throw new Error('Raw fixture object required');
  return raw;
}
function rows(raw: unknown): Rec[] {
  if (!Array.isArray(raw) || !raw.every(isRec))
    throw new Error('Raw fixture object array required');
  return raw;
}
function parse(story: ExpansionSourceFixture, proposal = story.proposal) {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '29'
      ? parseExpansionFrontierRoute(proposal, ctx)
      : parseExpansionLocalGlobal(proposal, ctx);
  return { scene, ctx };
}
function positive(story: ExpansionSourceFixture): Scene {
  const result = parse(story);
  expect(result.ctx.issues).toEqual([]);
  if (!result.scene) throw new Error(`Complete positive ${story.id} rejected`);
  return result.scene;
}
function text(story: ExpansionSourceFixture, span: ExpansionEvidenceSpan): string {
  return story.words
    .slice(span.fromWord, span.toWord + 1)
    .map((w) => w.text)
    .join(' ');
}
function sourceClauses(story: ExpansionSourceFixture) {
  const spans: ExpansionEvidenceSpan[] = [];
  let fromWord = 0;
  for (const [i, word] of story.words.entries()) {
    if (/[.!?;][”"’')\]]*$/.test(word.text)) {
      spans.push({ fromWord, toWord: i });
      fromWord = i + 1;
    }
  }
  if (fromWord !== story.words.length) throw new Error('Full fixture clauses required');
  return { spans, clauses: spans.map((span) => text(story, span)) };
}
function rewrite(
  story: ExpansionSourceFixture,
  clauses: readonly string[],
): ExpansionSourceFixture {
  const old = sourceClauses(story),
    speech = expansionFixtureSpeech(clauses, story.window.endTime);
  function remap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(remap);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const i = old.spans.findIndex(
        (s) => s.fromWord === value.fromWord && s.toWord === value.toWord,
      );
      if (!speech.spans[i]) throw new Error('Evidence must identify its exact full clause');
      return { ...speech.spans[i] };
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remap(entry)]));
  }
  const proposal = object(remap(story.proposal));
  for (const beat of BEATS) {
    const i = old.spans.findIndex((s) => s.fromWord === story.proposal[beat]);
    if (!speech.spans[i])
      throw new Error('Source beat must remain in its original complete clause');
    proposal[beat] = speech.spans[i].fromWord;
  }
  proposal.startWord = 0;
  proposal.endWord = speech.window.endWord;
  return authoredBeatTiming({ ...story, ...speech, proposal });
}

/** Test-only source pauses isolate semantic rejection from unrelated uniform-speech gaps. */
function authoredBeatTiming(story: ExpansionSourceFixture): ExpansionSourceFixture {
  const anchors = BEATS.map((beat, index) => {
    const word = story.proposal[beat];
    if (typeof word !== 'number' || !Number.isInteger(word) || word < 0)
      throw new Error('Authored source beat index required');
    return { word, time: 0.25 + index * 2 };
  });
  anchors.push({ word: story.words.length, time: story.window.endTime - 0.35 });
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].word <= anchors[i - 1].word || anchors[i].time <= anchors[i - 1].time)
      throw new Error('Authored source anchors must be strictly ordered');
  }
  function seconds(index: number): number {
    const last = anchors.at(-1);
    if (index === story.words.length && last) return last.time;
    const section = anchors.findIndex(
      (anchor, i) => i + 1 < anchors.length && anchor.word <= index && index < anchors[i + 1].word,
    );
    const left = anchors[section],
      right = anchors[section + 1];
    if (!left || !right) throw new Error('Source word outside its authored timing interval');
    return Number(
      (
        left.time +
        ((right.time - left.time) * (index - left.word)) / (right.word - left.word)
      ).toFixed(9),
    );
  }
  return {
    ...story,
    words: story.words.map((word, i) => ({ ...word, start: seconds(i), end: seconds(i + 1) })),
  };
}
function parity(story: ExpansionSourceFixture): Scene {
  const before = structuredClone(story.proposal),
    scene = positive(story);
  for (const visualMode of ['diagram', 'hybrid'] as const) {
    const result = parse(story, { ...story.proposal, visualMode });
    expect(result.ctx.issues).toEqual([]);
    expect(result.scene).toEqual({ ...scene, visualMode });
  }
  expect(parse(story, { ...story.proposal, layout: 'stack-flipped' }).scene).toEqual(scene);
  expect(parse(story, structuredClone(story.proposal)).scene).toEqual(scene);
  expect(story.proposal).toEqual(before);
  return scene;
}
function timing(story: ExpansionSourceFixture, scene: Scene) {
  const source = sourceClauses(story);
  const duration = story.window.endTime;
  expect(duration).toBeGreaterThanOrEqual(5);
  expect(duration).toBeLessThanOrEqual(12);
  expect(story.sourceText).toBe(story.words.map((w) => w.text).join(' '));
  expect(story.words).toEqual(conceptFixtureWords(story.sourceText, duration));
  expect(expansionFixtureSpeech(source.clauses, duration).words).toEqual(story.words);
  expect(story.words[0].start).toBe(0.25);
  expect(story.words.at(-1)?.end).toBe(Number((duration - 0.35).toFixed(9)));
  expect(story.window).toEqual({
    startWord: 0,
    endWord: story.words.length - 1,
    startTime: 0,
    endTime: duration,
  });
  for (const [i, phase] of PHASES.entries()) {
    const span = scene.sourceSpans[phase];
    expect(source.spans).toContainEqual(span);
    expect(story.proposal[BEATS[i]]).toBe(span.fromWord);
    expect(scene[TIMES[i]]).toBe(i === 0 ? 0.3 : story.words[span.fromWord].start);
    if (i > 0) expect(scene[TIMES[i]] - scene[TIMES[i - 1]]).toBeGreaterThanOrEqual(1);
  }
  expect(story.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
}

function quantity(
  actor: string,
  claim: string,
  value: number,
  evidence: ExpansionEvidenceSpan,
  population: string,
): Rec {
  return {
    actor,
    claim,
    state: 'illustrative',
    qualifier: 'illustrative',
    basis: { unit: 'count', period: 'Trial', population },
    amount: { kind: 'rational', value: { numerator: value * 100, denominator: 100 } },
    evidence,
  };
}
function numericSearch(total = 5): ExpansionSourceFixture {
  const clauses = [...sourceClauses(search).clauses];
  clauses[7] = 'Every used link on the illustrative grid has its own supplied cost.';
  clauses.push(
    'In this illustrative, Gate Ridge link cost is 2 count in Trial for grid.',
    'In this illustrative, Ridge Harbor link cost is 3 count in Trial for grid.',
    `In this illustrative, Gate route cost is ${total} count in Trial for grid.`,
  );
  const story = rewrite(search, clauses),
    spans = sourceClauses(story).spans;
  const links = rows(story.proposal.links);
  links[0].cost = quantity('Gate', 'Ridge link cost', 2, spans[11], 'grid');
  links[1].cost = quantity('Ridge', 'Harbor link cost', 3, spans[12], 'grid');
  object(story.proposal.rule).kind = 'supplied-cost';
  object(story.proposal.route).cost = quantity('Gate', 'route cost', total, spans[13], 'grid');
  return story;
}
function numericLandscape(
  localValue = 10.25,
  globalValue = 4.75,
  unit = 'count',
): ExpansionSourceFixture {
  const clauses = [
    ...sourceClauses(landscape).clauses,
    `In this illustrative, Hollow effort objective is ${localValue} count in Trial for landscape.`,
    `In this illustrative, Basin effort objective is ${globalValue} ${unit} in Trial for landscape.`,
  ];
  const story = rewrite(landscape, clauses),
    spans = sourceClauses(story).spans;
  const wells = rows(story.proposal.wells);
  wells[0].value = quantity('Hollow', 'effort objective', localValue, spans[6], 'landscape');
  wells[1].value = quantity('Basin', 'effort objective', globalValue, spans[7], 'landscape');
  object(object(wells[1].value).basis).unit = unit === 'seconds' ? 'second' : unit;
  return story;
}

describe('decision search/landscape source packet (real local contracts)', () => {
  it('persists approved stories 29–30, two complete paraphrases and all 144 explicit negatives', () => {
    expect([packet.version, packet.pack]).toEqual([1, 'decisions']);
    expect(packet.stories.map((s) => s.id)).toEqual(['29', '30']);
    expect(packet.stories.map((s) => s.negatives.length)).toEqual([79, 65]);
    expect(packet.stories.map((s) => s.paraphrases.length)).toEqual([1, 1]);
    for (const story of packet.stories) {
      expect(new Set(story.negatives.map((n) => n.name)).size).toBe(story.negatives.length);
      for (const negative of story.negatives) {
        expect(isRec(negative.proposal)).toBe(true);
        if (negative.words) {
          expect(negative.sourceText).toBe(negative.words.map((w) => w.text).join(' '));
          expect(negative.words).toEqual(conceptFixtureWords(negative.sourceText ?? '', 10));
        }
      }
    }
  });
  for (const story of packet.stories) {
    for (const [i, wording] of [story, ...story.paraphrases].entries())
      it(`${story.id}: canonical/persisted wording ${i} retains facts, identities, full window, five source beats and final hold in both modes`, () => {
        const scene = parity(wording);
        timing(wording, scene);
        expect(scene.storyId).toBe(story.id);
        expect(scene.entities).toEqual(
          rows(wording.proposal.entities).map((e, index) => ({
            id: expansionEntityId(story.id, index),
            label: e.label,
            evidence: e.evidence,
          })),
        );
        for (const field of ['treatment', 'winner', 'derived', 'geometry', 'function'])
          expect(scene).not.toHaveProperty(field);
      });
    for (const negative of story.negatives)
      for (const mode of ['diagram', 'hybrid'] as const)
        it(`${story.id}: rejects ${negative.name} (${mode}) with bounded diagnostics`, () => {
          const proposal = structuredClone(negative.proposal);
          if (proposal.visualMode === 'diagram' || proposal.visualMode === 'hybrid')
            proposal.visualMode = mode;
          const result = parse(
            {
              ...story,
              words: negative.words ?? story.words,
              window: negative.window ?? story.window,
            },
            proposal,
          );
          expect(result.scene, `${story.id}/${negative.name}/${mode}`).toBeNull();
          expect(result.ctx.issues.length).toBeGreaterThan(0);
          expect(result.ctx.issues.length).toBeLessThanOrEqual(4);
          // Custom-source semantic negatives must also reject after removing timing as a cause.
          if (negative.words && negative.window === undefined) {
            const timed = authoredBeatTiming({ ...story, words: negative.words, proposal });
            const semantic = parse(timed);
            expect(semantic.scene, `${negative.name}/authored-source-pauses`).toBeNull();
            expect(semantic.ctx.issues.length).toBeGreaterThan(0);
            expect(semantic.ctx.issues.join(' ')).not.toContain('at least 1s');
          }
        });
  }
  it('retains only the supplied route on the frozen four-slot grid, not a shortest-path derivation', () => {
    const scene = positive(search);
    if (scene.storyId !== '29') throw new Error('Expected authored grid-route');
    expect([scene.kind, scene.preset, scene.template, scene.qualification]).toEqual([
      'spatial-search',
      'frontier-route',
      'grid-route',
      'illustrative',
    ]);
    expect(scene.nodes.map((n) => [n.slot, n.status])).toEqual([
      ['start', 'open'],
      ['upper', 'open'],
      ['lower', 'blocked'],
      ['goal', 'open'],
    ]);
    expect(scene.route.nodeIds).toEqual([scene.nodes[0].id, scene.nodes[1].id, scene.nodes[3].id]);
    expect(scene.result.status).toBe('supplied');
    expect(scene.route).not.toHaveProperty('cost');
    expect(scene.result).not.toHaveProperty('value');
  });
  it('retains a source-qualified conditional node and route under the same global condition', () => {
    const clauses = [...sourceClauses(search).clauses];
    clauses[1] = `If the gate is unlocked, ${clauses[1]}`;
    const story = rewrite(search, clauses);
    rows(story.proposal.nodes)[0].condition = 'If the gate is unlocked';
    story.proposal.condition = 'If the gate is unlocked';
    const scene = parity(story);
    if (scene.storyId !== '29') throw new Error('Expected authored grid route');
    expect(scene.condition).toBe('If the gate is unlocked');
    expect(scene.nodes[0].condition).toBe(scene.condition);
    expect(scene.result.status).toBe('supplied');
    const unqualified = structuredClone(story.proposal);
    delete unqualified.condition;
    expect(parse(story, unqualified).scene).toBeNull();
  });
  for (const state of ['unknown', 'missing', 'disputed'] as const) {
    it(`retains a ${state} node with an explicitly unresolved route, never a failed/zero node`, () => {
      const clauses = [...sourceClauses(search).clauses];
      clauses[2] = clauses[2].replace('open upper', `${state} upper`);
      clauses[9] = 'No route from Gate to Harbor is supplied on the illustrative grid.';
      clauses[10] = 'The Gate to Harbor route remains unresolved on the illustrative grid.';
      const story = rewrite(search, clauses);
      rows(story.proposal.nodes)[1].status = state;
      object(story.proposal.route).nodes = [];
      object(story.proposal.result).status = 'unresolved';
      story.proposal.outcome = 'unresolved';
      const scene = parity(story);
      if (scene.storyId !== '29') throw new Error('Expected grid route');
      expect(scene.nodes[1].status).toBe(state);
      expect(scene.result.status).toBe('unresolved');
      expect(scene.route.nodeIds).toEqual([]);
    });
  }
  it('retains supplied link and route costs without emitting a computed total', () => {
    const scene = parity(numericSearch());
    if (scene.storyId !== '29') throw new Error('Expected grid route');
    expect(scene.route.cost).toMatchObject({
      state: 'illustrative',
      qualifier: 'illustrative',
      amount: { kind: 'rational', value: { numerator: 5, denominator: 1 }, notation: '5' },
    });
    expect(scene.links.map((link) => link.cost?.state)).toEqual(['illustrative', 'illustrative']);
    expect(scene.route).not.toHaveProperty('derived');
    expect(parse(numericSearch(6)).scene).toBeNull();
  });
  for (const state of ['unknown', 'missing', 'disputed'] as const) {
    it(`retains a ${state} source total even when link operands would permit a sum`, () => {
      const original = numericSearch(),
        clauses = [...sourceClauses(original).clauses];
      clauses[13] = `Gate route cost is ${state === 'disputed' ? 'disputed between 2 and 8' : state} count in Trial for grid.`;
      const story = rewrite(original, clauses),
        cost = object(object(story.proposal.route).cost);
      cost.state = state;
      cost.qualifier = state;
      delete cost.amount;
      if (state === 'disputed')
        cost.alternatives = [
          { kind: 'rational', value: { numerator: 2, denominator: 1 } },
          { kind: 'rational', value: { numerator: 8, denominator: 1 } },
        ];
      const scene = parity(story);
      if (scene.storyId !== '29') throw new Error('Expected grid route');
      expect(scene.route.cost?.state).toBe(state);
      expect(scene.route.cost).not.toHaveProperty('amount');
      expect(scene.route).not.toHaveProperty('derived');
      if (state === 'disputed') expect(scene.route.cost).toHaveProperty('alternatives');
    });
  }
  it('retains exact supplied objective values and rejects incompatible or contradictory minimizing values', () => {
    const scene = parity(numericLandscape());
    if (scene.storyId !== '30') throw new Error('Expected qualified landscape');
    expect(scene.wells[0].value).toMatchObject({
      state: 'illustrative',
      amount: { value: { numerator: 41, denominator: 4 }, notation: '10.25' },
    });
    expect(scene.wells[1].value).toMatchObject({
      state: 'illustrative',
      amount: { value: { numerator: 19, denominator: 4 }, notation: '4.75' },
    });
    expect(parse(numericLandscape(-10.25, 4.75)).scene).toBeNull();
    expect(parse(numericLandscape(10.25, 4.75, 'seconds')).scene).toBeNull();
    expect(scene.result).not.toHaveProperty('value');
  });
  for (const patch of [
    { actor: 'Gate' },
    { claim: 'invented objective' },
    { basis: { unit: 'percentage-point', period: 'Trial', population: 'landscape' } },
    { basis: { unit: 'count', period: 'Other Trial', population: 'landscape' } },
    { basis: { unit: 'count', period: 'Trial', population: 'other population' } },
    { amount: { kind: 'rational', value: { numerator: -1025, denominator: 100 } } },
    { amount: { kind: 'rational', value: { numerator: 102, denominator: 10 } } },
    { amount: { kind: 'rational', value: { numerator: 1025, denominator: 0 } } },
    {
      amount: {
        kind: 'rational',
        value: { numerator: Number.MAX_SAFE_INTEGER + 1, denominator: 1 },
      },
    },
    { amount: { kind: 'rational', value: { numerator: Infinity, denominator: 1 } } },
  ])
    it(`rejects objective quantity mutation ${JSON.stringify(patch)}`, () => {
      const story = numericLandscape();
      const well = rows(story.proposal.wells)[0];
      well.value = { ...object(well.value), ...patch };
      for (const mode of ['diagram', 'hybrid'] as const) {
        const result = parse(story, { ...story.proposal, visualMode: mode });
        expect(result.scene).toBeNull();
        expect(result.ctx.issues.length).toBeGreaterThan(0);
      }
    });
  it('retains qualified two-well roles and supplied branch, never a real-world optimum', () => {
    const scene = positive(landscape);
    if (scene.storyId !== '30') throw new Error('Expected authored two-well');
    expect([scene.kind, scene.preset, scene.template, scene.qualification]).toEqual([
      'optimization-landscape',
      'local-global',
      'two-well',
      'illustrative',
    ]);
    expect(scene.wells.map((w) => w.role)).toEqual(['local', 'global']);
    expect(scene.objective.direction).toBe('minimize');
    expect(scene.branch.status).toBe('supplied');
    expect(scene.result.status).toBe('scoped');
    for (const well of scene.wells) expect(well).not.toHaveProperty('value');
    expect(scene.result).not.toHaveProperty('value');
  });
});
