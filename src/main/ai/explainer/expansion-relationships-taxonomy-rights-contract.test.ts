import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionDualRightsScene,
  ExpansionTaxonomyRightsScene,
} from '../../remotion/compositions/explainer/expansion/relationships/taxonomy-rights-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { isDerivationAllowed } from '../../remotion/compositions/explainer/expansion/value-logic';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionDualRights,
  parseExpansionTaxonomy,
} from './expansion-relationships-taxonomy-rights-contract';
import { isRec, makeParseContext, type Rec } from './kind-spec';

interface Fixture extends ExpansionSourceFixture {
  readonly paraphrases?: readonly ExpansionSourceFixture[];
}
const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/relationships/taxonomy-rights.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: Fixture[] };
const MODES = ['diagram', 'hybrid'] as const;
const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
function fixture(id: '33' | '34'): Fixture {
  const found = packet.stories.find((story) => story.id === id);
  if (!found) throw new Error(`Missing raw relationship story ${id}`);
  return found;
}
const taxonomy = fixture('33');
const rights = fixture('34');
function object(raw: unknown): Rec {
  if (!isRec(raw)) throw new Error('Expected a raw object');
  return raw;
}
function rows(raw: unknown): Rec[] {
  if (!Array.isArray(raw) || !raw.every(isRec)) throw new Error('Expected raw object rows');
  return raw;
}
function relation(story: ExpansionSourceFixture, index: number): Rec {
  const found = rows(story.proposal.relations)[index];
  if (!found) throw new Error('Missing raw relation');
  return found;
}
function quantity(story: ExpansionSourceFixture): Rec {
  return object(object(relation(story, 0).share).quantity);
}
function parse(story: ExpansionSourceFixture, proposal = story.proposal) {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '33'
      ? parseExpansionTaxonomy(proposal, ctx)
      : parseExpansionDualRights(proposal, ctx);
  return { scene, ctx };
}
function parity(story: ExpansionSourceFixture): ExpansionTaxonomyRightsScene {
  const before = structuredClone(story);
  const diagram = parse(story, { ...story.proposal, visualMode: 'diagram' });
  expect(diagram.ctx.issues).toEqual([]);
  if (!diagram.scene) throw new Error(`Valid story ${story.id} rejected`);
  const hybrid = parse(story, { ...story.proposal, visualMode: 'hybrid' });
  expect(hybrid.ctx.issues).toEqual([]);
  expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
  expect(parse(story, { ...story.proposal, layout: 'stack-flipped' }).scene).toEqual(diagram.scene);
  expect(parse(story, structuredClone(story.proposal)).scene).toEqual(diagram.scene);
  expect(story).toEqual(before);
  return diagram.scene;
}
function rejectBoth(story: ExpansionSourceFixture) {
  for (const visualMode of MODES) {
    const result = parse(story, { ...story.proposal, visualMode });
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.length).toBeGreaterThan(0);
    expect(result.ctx.issues.length).toBeLessThanOrEqual(4);
  }
}
function source(story: ExpansionSourceFixture, span: ExpansionEvidenceSpan): string {
  return story.words
    .slice(span.fromWord, span.toWord + 1)
    .map((word) => word.text)
    .join(' ');
}
function clauses(story: ExpansionSourceFixture) {
  const spans: ExpansionEvidenceSpan[] = [];
  let fromWord = 0;
  for (const [i, word] of story.words.entries()) {
    if (/[.!?;][”"’')\]]*$/.test(word.text)) {
      spans.push({ fromWord, toWord: i });
      fromWord = i + 1;
    }
  }
  if (fromWord !== story.words.length) throw new Error('Incomplete fixture source clause');
  return { spans, text: spans.map((span) => source(story, span)) };
}
/** Keep authored clause pauses and production padding, even when a clause changes length. */
function rewrite(story: ExpansionSourceFixture, texts: readonly string[]): ExpansionSourceFixture {
  const old = clauses(story);
  const speech = expansionFixtureSpeech(texts, story.window.endTime - story.window.startTime);
  if (texts.length !== old.spans.length) throw new Error('Rewrite preserves clause count');
  for (const [i, span] of speech.spans.entries()) {
    const previous = old.spans[i];
    if (!previous) throw new Error('Missing authored timing');
    const first = story.words[previous.fromWord];
    const last = story.words[previous.toWord];
    if (!first || !last) throw new Error('Missing source word');
    const count = span.toWord - span.fromWord + 1;
    const step = (last.end - first.start) / count;
    for (let j = 0; j < count; j++) {
      const word = speech.words[span.fromWord + j];
      if (!word) throw new Error('Missing rewritten word');
      word.start = first.start + j * step;
      word.end = first.start + (j + 1) * step;
    }
  }
  function remap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(remap);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const i = old.spans.findIndex(
        (span) => span.fromWord === value.fromWord && span.toWord === value.toWord,
      );
      const span = speech.spans[i];
      if (!span) throw new Error('Evidence must quote a complete authored clause');
      return { ...span };
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remap(entry)]));
  }
  const proposal = object(remap(story.proposal));
  for (const phase of PHASES) {
    const i = old.spans.findIndex((span) => span.fromWord === story.proposal[`${phase}Word`]);
    const span = speech.spans[i];
    if (!span) throw new Error('Beat must retain its original complete source clause');
    proposal[`${phase}Word`] = span.fromWord;
  }
  proposal.startWord = 0;
  proposal.endWord = speech.window.endWord;
  return { ...story, ...speech, proposal };
}
function rewritten(story: ExpansionSourceFixture, index: number, text: string) {
  const texts = clauses(story).text;
  texts[index] = text;
  return rewrite(story, texts);
}
function amount(numerator: number, denominator = 1) {
  return { kind: 'rational', value: { numerator, denominator } };
}
function dual(story: ExpansionSourceFixture): ExpansionDualRightsScene {
  const scene = parity(story);
  if (scene.storyId !== '34') throw new Error('Expected dual rights');
  return scene;
}
function facts(scene: ExpansionTaxonomyRightsScene): unknown {
  function omit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(omit);
    if (!isRec(value)) return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            key !== 'evidence' &&
            key !== 'basisEvidence' &&
            key !== 'sourceSpans' &&
            key !== 'visualMode' &&
            !TIMES.some((time) => time === key),
        )
        .map(([key, entry]) => [key, omit(entry)]),
    );
  }
  return omit(scene);
}

// The 100 saved negatives are full raw proposals, not patches or aliases of other packs.
describe('version1 relationships raw source packet', () => {
  it('contains both approved stories, independent paraphrases and 100 distinct explicit negatives', () => {
    expect([packet.version, packet.pack]).toEqual([1, 'relationships']);
    expect(packet.stories.map((story) => story.id)).toEqual(['33', '34']);
    expect(packet.stories.map((story) => story.negatives.length)).toEqual([41, 59]);
    for (const story of packet.stories) {
      expect(story.paraphrases?.length).toBe(1);
      expect(new Set(story.negatives.map((negative) => negative.name)).size).toBe(
        story.negatives.length,
      );
      expect(
        new Set(
          story.negatives.map((negative) =>
            JSON.stringify({
              proposal: negative.proposal,
              sourceText: negative.sourceText ?? story.sourceText,
              words: negative.words ?? story.words,
              window: negative.window ?? story.window,
            }),
          ),
        ).size,
      ).toBe(story.negatives.length);
    }
  });
  for (const story of packet.stories) {
    for (const [index, positive] of [story, ...(story.paraphrases ?? [])].entries()) {
      it(`${story.id} ${index === 0 ? 'canonical' : 'independently worded paraphrase'} has full fact/ID/condition/time parity`, () => {
        const scene = parity({ ...positive, id: story.id });
        expect(scene.storyId).toBe(story.id);
        expect(scene.entities.map((entity) => entity.id)).toEqual(
          scene.entities.map((_, i) => expansionEntityId(story.id, i)),
        );
        expect(scene.records.map((record) => record.id)).toEqual(
          scene.records.map((_, i) => expansionEntityId(story.id, scene.entities.length + i)),
        );
        expect(scene.relations.map((edge) => edge.id)).toEqual(
          scene.relations.map((_, i) =>
            expansionEntityId(story.id, scene.entities.length + scene.records.length + i),
          ),
        );
        expect(
          new Set([...scene.entities, ...scene.records, ...scene.relations].map((item) => item.id))
            .size,
        ).toBe(scene.entities.length + scene.records.length + scene.relations.length);
        const local = clauses(positive);
        expect(local.spans.length).toBeGreaterThan(5);
        expect(new Set(Object.values(scene.sourceSpans).map((span) => span.fromWord)).size).toBe(5);
        for (const [i, phase] of PHASES.entries()) {
          expect(local.spans).toContainEqual(scene.sourceSpans[phase]);
          const beat = positive.words[Number(positive.proposal[`${phase}Word`])];
          expect(beat).toBeDefined();
          expect(scene[`${phase}At`]).toBeCloseTo(
            i === 0 ? Math.max(0.3, beat?.start ?? 0) : (beat?.start ?? 0),
          );
          if (i > 0) {
            const previous = TIMES[i - 1];
            if (!previous) throw new Error('Missing prior phase');
            expect(scene[`${phase}At`] - scene[previous]).toBeGreaterThanOrEqual(1);
          }
        }
        expect(positive.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
        expect(positive.words[0]?.start - positive.window.startTime).toBeCloseTo(0.25);
        expect(positive.window.endTime - (positive.words.at(-1)?.end ?? 0)).toBeCloseTo(0.35);
        expect(positive.words.map((word) => word.text).join(' ')).toBe(positive.sourceText);
        for (const [i, word] of positive.words.entries()) {
          expect(Number.isFinite(word.start) && Number.isFinite(word.end)).toBe(true);
          expect(word.end).toBeGreaterThan(word.start);
          expect(word.start).toBeGreaterThanOrEqual(positive.window.startTime);
          expect(word.end).toBeLessThanOrEqual(positive.window.endTime);
          if (i > 0)
            expect(word.start + 1e-8).toBeGreaterThanOrEqual(positive.words[i - 1]?.end ?? 0);
        }
      });
    }
    it(`${story.id} paraphrase preserves classifications, supplied shares, qualifications and stable IDs`, () => {
      const other = story.paraphrases?.[0];
      if (!other) throw new Error('Missing independently authored source');
      expect(other.sourceText).not.toBe(story.sourceText);
      expect(facts(parity({ ...other, id: story.id }))).toEqual(facts(parity(story)));
    });
    for (const negative of story.negatives) {
      for (const visualMode of MODES) {
        it(`${story.id} ${visualMode} rejects saved negative: ${negative.name}`, () => {
          const bad = {
            ...story,
            sourceText: negative.sourceText ?? story.sourceText,
            words: negative.words ?? story.words,
            window: negative.window ?? story.window,
            // Keep an explicitly invalid mode invalid; never repair the raw negative.
            proposal: {
              ...negative.proposal,
              visualMode:
                negative.proposal.visualMode === 'diagram' ||
                negative.proposal.visualMode === 'hybrid'
                  ? visualMode
                  : negative.proposal.visualMode,
            },
          };
          const result = parse(bad);
          expect(result.scene).toBeNull();
          expect(result.ctx.issues.length).toBeGreaterThan(0);
        });
      }
    }
  }
});

describe('relationship state and hierarchy contracts', () => {
  for (const story of [taxonomy, rights]) {
    const isTax = story.id === '33';
    const index = isTax ? 3 : 5;
    const unresolved = isTax
      ? 'Thermometer membership in Equipment'
      : 'Birch control rights over Studio';
    const scope = isTax ? 'lab stock' : 'leases';
    const verb = isTax ? 'is' : 'are';
    for (const state of ['unknown', 'missing', 'disputed'] as const) {
      it(`${story.id} keeps ${state} distinct in both modes`, () => {
        const suffix =
          state === 'disputed'
            ? `disputed between ${isTax ? 'included and excluded' : 'granted and denied'}`
            : state;
        const f = rewritten(
          story,
          index,
          `${unresolved} ${verb} ${suffix} for ${scope} during May.`,
        );
        const edge = relation(f, 2);
        edge.state = state;
        edge.qualifier = state;
        if (state === 'disputed')
          edge.alternatives = isTax ? ['included', 'excluded'] : ['granted', 'denied'];
        const scene = parity(f);
        expect(scene.relations[2]?.state).toBe(state);
        expect(scene.relations[2]).not.toHaveProperty('status');
        const bad = structuredClone(f);
        relation(bad, 2).status = isTax ? 'included' : 'granted';
        rejectBoth(bad);
      });
    }
    for (const state of ['known', 'conditional', 'illustrative', 'simulated'] as const) {
      it(`${story.id} preserves ${state} asserted links without inventing results`, () => {
        const body = isTax
          ? 'Thermometer is a member of Sensors for lab stock during May'
          : 'Birch has voting rights over Studio for leases during May';
        const condition = 'if consent arrives';
        const qualifier = state === 'simulated' ? 'simulation' : 'illustrative example';
        const sentence =
          state === 'conditional'
            ? `If consent arrives, ${body}.`
            : state === 'illustrative' || state === 'simulated'
              ? `In this ${qualifier}, ${body}.`
              : `${body}.`;
        const f = rewritten(story, isTax ? 2 : 4, sentence);
        const edge = relation(f, 1);
        edge.state = state;
        if (state === 'conditional') {
          f.proposal.condition = condition;
          edge.condition = condition;
        }
        if (state === 'illustrative' || state === 'simulated') {
          f.proposal.evidence = 'illustrative';
          edge.qualifier = qualifier;
        }
        const scene = parity(f);
        expect(scene.relations[1]?.state).toBe(state);
        if (state === 'conditional') {
          expect(scene.condition).toBe(condition);
          expect(scene.relations[1]).toHaveProperty('condition', condition);
          const bad = structuredClone(f);
          delete relation(bad, 1).condition;
          rejectBoth(bad);
        }
        if (state === 'illustrative' || state === 'simulated') {
          const bad = structuredClone(f);
          delete relation(bad, 1).qualifier;
          rejectBoth(bad);
        }
      });
    }
    it(`${story.id} preserves explicitly excluded/denied relationships`, () => {
      const f = rewritten(
        story,
        isTax ? 2 : 4,
        isTax
          ? 'Thermometer is not a member of Sensors for lab stock during May.'
          : 'Birch does not hold voting rights over Studio for leases during May.',
      );
      relation(f, 1).status = isTax ? 'excluded' : 'denied';
      expect(parity(f).relations[1]).toHaveProperty('status', isTax ? 'excluded' : 'denied');
    });
  }
  it('rejects an explicit two-category cycle even with a disputed closing edge', () => {
    for (const disputed of [false, true]) {
      const f = rewritten(
        taxonomy,
        4,
        disputed
          ? 'Equipment parent link to Sensors is disputed between included and excluded for lab stock during May.'
          : 'Equipment is a subcategory of Sensors for lab stock during May.',
      );
      const span = clauses(f).spans[4];
      rows(f.proposal.relations).push({
        from: 'Equipment',
        to: 'Sensors',
        role: 'parent',
        scope: 'lab stock',
        period: 'May',
        evidence: span,
        ...(disputed
          ? { state: 'disputed', qualifier: 'disputed', alternatives: ['included', 'excluded'] }
          : { state: 'known', status: 'included' }),
      });
      rejectBoth(f);
    }
  });
  it('rejects duplicate or contradictory direct edges without silently collapsing them', () => {
    const f = structuredClone(taxonomy);
    rows(f.proposal.relations).push({ ...relation(f, 1), status: 'excluded' });
    rejectBoth(f);
  });
  it('does not infer transitive membership or ownership from topology or exact shares', () => {
    const tax = parity(taxonomy);
    expect(tax.relations).toHaveLength(3);
    expect(tax.relations[2]).toMatchObject({ state: 'unknown', qualifier: 'unknown' });
    const scene = dual(rights);
    expect(scene.relations[2]).toMatchObject({
      state: 'unknown',
      qualifier: 'unknown',
      right: 'control',
    });
    for (const forbidden of ['owner', 'winner', 'aggregate', 'total', 'result', 'derived']) {
      expect(tax).not.toHaveProperty(forbidden);
      expect(scene).not.toHaveProperty(forbidden);
    }
    for (const id of ['33', '34'] as const) {
      expect(expansionStory(id)?.allowedDerivations).toEqual([]);
      for (const operation of ['ratio', 'difference', 'subgroup-total', 'percent-change'] as const)
        expect(isDerivationAllowed(id, operation)).toBe(false);
    }
  });
});

function numericShare(
  unit: 'count' | 'percent' | 'ratio',
  notation: string,
  value: ReturnType<typeof amount>,
  denominator: number,
) {
  const texts = clauses(rights).text;
  texts[2] = `Cedar Studio economic share is ${notation} ${unit} during May for leases with denominator ${denominator}.`;
  texts[3] = `Cedar Studio economic share denominator is ${denominator} ${unit} during May for leases.`;
  const f = rewrite(rights, texts);
  const q = quantity(f);
  q.amount = value;
  object(q.basis).unit = unit;
  object(q.basis).denominator = { numerator: denominator, denominator: 1 };
  object(relation(f, 0).share).denominatorUnit = unit;
  return f;
}
describe('supplied share quantities and explicit denominator units', () => {
  for (const test of [
    { unit: 'percent', notation: '0', value: amount(0), denominator: 100 },
    { unit: 'percent', notation: '100', value: amount(100), denominator: 100 },
    { unit: 'percent', notation: '30.25', value: amount(121, 4), denominator: 100 },
    {
      unit: 'count',
      notation: '1000000000',
      value: amount(1_000_000_000),
      denominator: 1_000_000_000,
    },
    { unit: 'ratio', notation: '1/3', value: amount(1, 3), denominator: 1 },
    { unit: 'ratio', notation: '1', value: amount(1), denominator: 1 },
  ] as const) {
    it(`retains exact ${test.notation} ${test.unit} operands and explicit denominator`, () => {
      const scene = dual(numericShare(test.unit, test.notation, test.value, test.denominator));
      expect(scene.relations[0]?.share?.quantity).toMatchObject({
        state: 'known',
        amount: {
          ...test.value,
          notation: test.notation,
        },
      });
      expect(scene.relations[0]?.share?.quantity.basis.denominator).toEqual({
        numerator: test.denominator,
        denominator: 1,
      });
      expect(scene.relations[0]?.share?.denominatorUnit).toBe(test.unit);
    });
  }
  for (const test of [
    {
      name: 'negative exact count',
      unit: 'count',
      notation: '-1',
      value: amount(-1),
      denominator: 100,
    },
    {
      name: 'fractional count',
      unit: 'count',
      notation: '1/2',
      value: amount(1, 2),
      denominator: 100,
    },
    {
      name: 'count exceeds represented denominator',
      unit: 'count',
      notation: '101',
      value: amount(101),
      denominator: 100,
    },
    { name: 'ratio exceeds one', unit: 'ratio', notation: '2', value: amount(2), denominator: 1 },
    {
      name: 'ratio denominator other than one',
      unit: 'ratio',
      notation: '1',
      value: amount(1),
      denominator: 2,
    },
    {
      name: 'percent denominator other than 100',
      unit: 'percent',
      notation: '30',
      value: amount(30),
      denominator: 99,
    },
    {
      name: 'source count overflows component bound',
      unit: 'count',
      notation: '1000000001',
      value: amount(1_000_000_001),
      denominator: 1_000_000_001,
    },
    {
      name: 'source denominator is zero',
      unit: 'count',
      notation: '0',
      value: amount(0),
      denominator: 0,
    },
  ] as const) {
    it(`rejects ${test.name} in both modes even when source and proposal agree`, () => {
      rejectBoth(numericShare(test.unit, test.notation, test.value, test.denominator));
    });
  }
  for (const state of [
    'unknown',
    'missing',
    'disputed',
    'conditional',
    'illustrative',
    'simulated',
  ] as const) {
    it(`preserves ${state} share values independently of a known economic grant`, () => {
      const texts = clauses(rights).text;
      const qualifier = state === 'simulated' ? 'simulation' : 'illustrative example';
      const prefix =
        state === 'illustrative' || state === 'simulated' ? `In this ${qualifier}, ` : '';
      const value =
        state === 'unknown' || state === 'missing'
          ? state
          : state === 'disputed'
            ? 'disputed between 30 and 40'
            : '30';
      texts[2] = `${prefix}Cedar Studio economic share is ${value} percent during May for leases with denominator 100${state === 'conditional' ? ', if consent arrives' : ''}.`;
      if (prefix) texts[3] = `${prefix}${texts[3]}`;
      const f = rewrite(rights, texts);
      const q = quantity(f);
      q.state = state;
      if (state === 'unknown' || state === 'missing' || state === 'disputed') {
        q.qualifier = state;
        delete q.amount;
      }
      if (state === 'disputed') q.alternatives = [amount(30), amount(40)];
      if (state === 'conditional') {
        q.condition = 'if consent arrives';
        f.proposal.condition = 'if consent arrives';
      }
      if (prefix) {
        q.qualifier = qualifier;
        f.proposal.evidence = 'illustrative';
      }
      const scene = dual(f);
      expect(scene.relations[0]).toMatchObject({ state: 'known', status: 'granted' });
      expect(scene.relations[0]?.share?.quantity.state).toBe(state);
      if (state === 'unknown' || state === 'missing')
        expect(scene.relations[0]?.share?.quantity).not.toHaveProperty('amount');
      if (state === 'disputed')
        expect(scene.relations[0]?.share?.quantity).toHaveProperty('alternatives', [
          { ...amount(30), notation: '30' },
          { ...amount(40), notation: '40' },
        ]);
      const bad = structuredClone(f);
      if (state === 'conditional') delete quantity(bad).condition;
      else delete quantity(bad).qualifier;
      rejectBoth(bad);
    });
  }
  it('rejects numeric values on unknown rights, denied grants and control statements', () => {
    const texts = clauses(rights).text;
    texts[1] = 'Cedar economic rights over Studio are unknown for leases during May.';
    let f = rewrite(rights, texts);
    relation(f, 0).state = 'unknown';
    relation(f, 0).qualifier = 'unknown';
    delete relation(f, 0).status;
    rejectBoth(f);
    texts[1] = 'Cedar does not hold economic rights over Studio for leases during May.';
    f = rewrite(rights, texts);
    relation(f, 0).status = 'denied';
    rejectBoth(f);
  });
  it('rejects incompatible actor-owned share denominators without aggregating or converting', () => {
    const texts = clauses(rights).text;
    texts[1] = 'Cedar holds economic rights over Studio for leases during May.';
    texts[4] = 'Birch holds economic rights over Studio for leases during May.';
    const f = rewrite(rights, texts);
    // Add separately timed complete numeric clauses before the final resolve.
    const original = clauses(f);
    const extra = expansionFixtureSpeech(
      [
        ...original.text.slice(0, 5),
        'Birch Studio economic share is 10 count during May for leases with denominator 20.',
        'Birch Studio economic share denominator is 20 count during May for leases.',
        'Cedar holds voting rights over Studio for leases during May.',
        original.text[5] ?? '',
        original.text[6] ?? '',
      ],
      12,
    );
    const setupSpan = extra.spans[0];
    const economicSpan = extra.spans[1];
    const votingSpan = extra.spans[4];
    const controlSpan = extra.spans[8];
    if (!setupSpan || !economicSpan || !votingSpan || !controlSpan)
      throw new Error('Missing extra source spans');
    // Ten honest clause intervals, with gaps at all five beat clauses.
    const intervals = [
      [0.25, 1.35],
      [1.5, 2.35],
      [2.5, 3.3],
      [3.45, 4.25],
      [4.4, 5.25],
      [5.4, 6.25],
      [6.4, 7.25],
      [7.4, 8.2],
      [8.5, 9.65],
      [10.05, 11.65],
    ];
    for (const [i, span] of extra.spans.entries()) {
      const interval = intervals[i];
      if (!interval) throw new Error('Missing authored interval');
      const [start, end] = interval;
      if (start === undefined || end === undefined) throw new Error('Incomplete interval');
      const count = span.toWord - span.fromWord + 1;
      for (let j = 0; j < count; j++) {
        const word = extra.words[span.fromWord + j];
        if (!word) throw new Error('Missing authored word');
        word.start = start + ((end - start) * j) / count;
        word.end = start + ((end - start) * (j + 1)) / count;
      }
    }
    const p = structuredClone(f.proposal);
    p.endWord = extra.window.endWord;
    for (const entity of rows(p.entities)) entity.evidence = setupSpan;
    for (const record of rows(p.records)) record.evidence = setupSpan;
    const edges = rows(p.relations);
    const first = edges[0],
      second = edges[1],
      third = edges[2];
    if (!first || !second || !third) throw new Error('Missing source rights');
    first.evidence = economicSpan;
    const firstShare = object(first.share);
    object(firstShare.quantity).evidence = extra.spans[2];
    firstShare.basisEvidence = extra.spans[3];
    second.right = 'economic';
    second.evidence = votingSpan;
    second.share = {
      quantity: {
        actor: 'Birch',
        claim: 'Studio economic share',
        basis: {
          unit: 'count',
          period: 'May',
          population: 'leases',
          denominator: { numerator: 20, denominator: 1 },
        },
        evidence: extra.spans[5],
        state: 'known',
        amount: amount(10),
      },
      denominatorUnit: 'count',
      basisEvidence: extra.spans[6],
    };
    third.evidence = controlSpan;
    // Preserve an explicit voting assertion; it cannot be inferred from either share.
    edges.push({
      actor: 'Cedar',
      resource: 'Studio',
      right: 'voting',
      scope: 'leases',
      period: 'May',
      evidence: extra.spans[7],
      state: 'known',
      status: 'granted',
    });
    for (const [i, phase] of PHASES.entries())
      p[`${phase}Word`] = extra.spans[[0, 1, 4, 8, 9][i] ?? -1]?.fromWord;
    const bad = { ...f, ...extra, proposal: p };
    const result = parse(bad);
    expect(result.scene).toBeNull();
    expect(result.ctx.issues).toContain(
      'shares of the same resource/right must use explicit compatible units and denominators',
    );
    rejectBoth(bad);
    // Prove this fixture is otherwise valid and accepts explicit compatible shares.
    const textsCompatible = clauses(bad).text;
    textsCompatible[5] =
      'Birch Studio economic share is 10 percent during May for leases with denominator 100.';
    textsCompatible[6] =
      'Birch Studio economic share denominator is 100 percent during May for leases.';
    const compatible = rewrite(bad, textsCompatible);
    const compatibleShare = object(relation(compatible, 1).share);
    compatibleShare.denominatorUnit = 'percent';
    object(object(compatibleShare.quantity).basis).unit = 'percent';
    object(object(compatibleShare.quantity).basis).denominator = { numerator: 100, denominator: 1 };
    const accepted = dual(compatible);
    expect(accepted.relations[0]?.share?.quantity.basis).toEqual(
      accepted.relations[1]?.share?.quantity.basis,
    );
    expect(accepted.relations[2]).toMatchObject({ right: 'control', state: 'unknown' });
    expect(accepted.relations).toHaveLength(4);
  });
});

describe('strict complete source times and beat bounds', () => {
  for (const story of [taxonomy, rights]) {
    for (const kind of [
      'nan',
      'infinity',
      'reversed',
      'zero',
      'overlap',
      'before-window',
      'after-window',
    ] as const) {
      it(`${story.id} rejects ${kind} word timing in both modes`, () => {
        const f = structuredClone(story);
        const word = f.words[1];
        const first = f.words[0];
        if (!word || !first) throw new Error('Missing authored words');
        if (kind === 'nan') word.start = Number.NaN;
        if (kind === 'infinity') word.end = Number.POSITIVE_INFINITY;
        if (kind === 'reversed') word.end = word.start - 0.1;
        if (kind === 'zero') word.end = word.start;
        if (kind === 'overlap') word.start = first.end - 0.1;
        if (kind === 'before-window') word.start = -0.1;
        if (kind === 'after-window') word.end = f.window.endTime + 0.1;
        rejectBoth(f);
      });
    }
    for (const phase of ['action', 'response', 'check', 'resolve'] as const) {
      it(`${story.id} rejects sub-one-second ${phase} gaps without repairing source times`, () => {
        const f = structuredClone(story);
        const position = PHASES.indexOf(phase);
        const prior = PHASES[position - 1];
        if (!prior) throw new Error('Missing prior beat');
        const beatIndex = Number(f.proposal[`${phase}Word`]);
        const old = f.words[beatIndex]?.start;
        const before = prior === 'setup' ? 0.3 : f.words[Number(f.proposal[`${prior}Word`])]?.start;
        if (old === undefined || before === undefined) throw new Error('Missing phase words');
        const shift = before + 0.999 - old;
        const priorIndex = Number(f.proposal[`${prior}Word`]);
        const anchor = f.words[priorIndex]?.start;
        if (anchor === undefined) throw new Error('Missing prior source time');
        // Compress intervening words, rather than creating an overlap that masks the gap guard.
        const scale = (before + 0.999 - anchor) / (old - anchor);
        for (let i = priorIndex; i < beatIndex; i++) {
          const word = f.words[i];
          if (!word) throw new Error('Missing compressed source');
          word.start = anchor + (word.start - anchor) * scale;
          word.end = anchor + (word.end - anchor) * scale;
        }
        for (let i = beatIndex; i < f.words.length; i++) {
          const word = f.words[i];
          if (!word) throw new Error('Missing shifted source');
          word.start += shift;
          word.end += shift;
        }
        for (const [i, word] of f.words.entries()) {
          expect(word.end).toBeGreaterThan(word.start);
          if (i > 0) expect(word.start + 1e-8).toBeGreaterThanOrEqual(f.words[i - 1]?.end ?? 0);
        }
        rejectBoth(f);
      });
    }
    it(`${story.id} rejects interior overlap beyond 1e-7 rounding tolerance, including unquoted clauses`, () => {
      const f = structuredClone(story);
      const span = clauses(f).spans[story.id === '33' ? 4 : 2];
      if (!span) throw new Error('Missing complete interior clause');
      const word = f.words[span.fromWord + 1];
      const previous = f.words[span.fromWord];
      if (!word || !previous) throw new Error('Missing interior words');
      word.start = previous.end - 5e-7;
      rejectBoth(f);
    });
    it(`${story.id} rejects final hold below 0.8s even with otherwise valid source timing`, () => {
      const f = structuredClone(story);
      const resolveIndex = Number(f.proposal.resolveWord);
      const span = clauses(f).spans.at(-1);
      if (!span) throw new Error('Missing resolve');
      const start = f.window.endTime - 0.799;
      const end = f.window.endTime - 0.35;
      const count = span.toWord - span.fromWord + 1;
      for (let i = resolveIndex; i <= span.toWord; i++) {
        const word = f.words[i];
        if (!word) throw new Error('Missing resolve source');
        word.start = start + ((end - start) * (i - resolveIndex)) / count;
        word.end = start + ((end - start) * (i - resolveIndex + 1)) / count;
      }
      rejectBoth(f);
    });
    it(`${story.id} rejects repeated clause beats even with different ordered source indices`, () => {
      const f = structuredClone(story);
      f.proposal.responseWord = Number(f.proposal.actionWord) + 1;
      rejectBoth(f);
    });
    for (const duration of [4.999, 12.001]) {
      it(`${story.id} rejects ${duration}s envelopes`, () => {
        const f = structuredClone(story);
        f.window.endTime = duration;
        rejectBoth(f);
      });
    }
  }
});
