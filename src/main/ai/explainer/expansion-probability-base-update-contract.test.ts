import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionBaseRate,
  parseExpansionBayesUpdate,
} from './expansion-probability-base-update-contract';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/probability/base-update.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
const baseRate = packet.stories.find(({ id }) => id === '09');
const update = packet.stories.find(({ id }) => id === '10');
if (!baseRate || !update)
  throw new Error('Both source-owned base-rate/update fixtures are required');
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
function parse(story: ExpansionSourceFixture, proposal: Rec = story.proposal) {
  const ctx = makeParseContext(story.words, story.window);
  return {
    ctx,
    scene:
      story.id === '09'
        ? parseExpansionBaseRate(proposal, ctx)
        : parseExpansionBayesUpdate(proposal, ctx),
  };
}
function clauses(story: ExpansionSourceFixture) {
  const spans: { fromWord: number; toWord: number }[] = [];
  let start = 0;
  for (const [index, word] of story.words.entries()) {
    if (/[.!?;][”"’')\]]*$/.test(word.text)) {
      spans.push({ fromWord: start, toWord: index });
      start = index + 1;
    }
  }
  if (start !== story.words.length) throw new Error('Source fixtures must retain full clauses');
  return {
    spans,
    text: spans.map(({ fromWord, toWord }) =>
      story.words
        .slice(fromWord, toWord + 1)
        .map(({ text }) => text)
        .join(' '),
    ),
  };
}
function rewrite(story: ExpansionSourceFixture, text: readonly string[]): ExpansionSourceFixture {
  const previous = clauses(story);
  const speech = expansionFixtureSpeech(text, 10);
  function remap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(remap);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const index = previous.spans.findIndex(
        ({ fromWord, toWord }) => fromWord === value.fromWord && toWord === value.toWord,
      );
      if (index < 0 || !speech.spans[index])
        throw new Error('Fixture evidence must retain an entire clause');
      return { ...speech.spans[index] };
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remap(entry)]));
  }
  const proposal = remap(story.proposal);
  if (!isRec(proposal)) throw new Error('Expected a raw proposal');
  for (const beat of BEATS) {
    const index = previous.spans.findIndex(({ fromWord }) => fromWord === story.proposal[beat]);
    if (!speech.spans[index]) throw new Error('Beat must identify a complete source clause');
    proposal[beat] = speech.spans[index].fromWord;
  }
  return {
    ...story,
    ...speech,
    proposal: { ...proposal, startWord: 0, endWord: speech.window.endWord },
  };
}
function records(proposal: Rec): { role: string; quantity: Rec }[] {
  if (!Array.isArray(proposal.records)) throw new Error('Expected raw quantity records');
  return proposal.records.map((entry) => {
    if (!isRec(entry) || typeof entry.role !== 'string' || !isRec(entry.quantity))
      throw new Error('Expected an owned quantity record');
    return { role: entry.role, quantity: entry.quantity };
  });
}
function positive(story: ExpansionSourceFixture) {
  const result = parse(story);
  expect(result.ctx.issues).toEqual([]);
  if (!result.scene) throw new Error('Expected a real source-grounded probability story');
  return result.scene;
}

describe('source-owned base-rate and Bayes update (real parsers)', () => {
  it('reads only approved routes, production-padded source words and explicit negative proposals', () => {
    expect([packet.version, packet.pack]).toEqual([1, 'probability']);
    expect(packet.stories.map(({ id }) => id)).toEqual(['09', '10']);
    for (const story of packet.stories) {
      expect(story.words.map(({ text }) => text).join(' ')).toBe(story.sourceText);
      expect(story.words).toEqual(conceptFixtureWords(story.sourceText, 10));
      expect(expansionFixtureSpeech(clauses(story).text, 10).words).toEqual(story.words);
      expect(story.words[0].start).toBe(0.25);
      expect(story.words.at(-1)?.end).toBe(9.65);
      expect(story.window).toEqual({
        startWord: 0,
        endWord: story.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(new Set(story.negatives.map(({ name }) => name)).size).toBe(story.negatives.length);
      expect(story.negatives.length).toBeGreaterThanOrEqual(50);
    }
  });
  for (const story of packet.stories) {
    it(`${story.id}: modes/layouts/repeated parses retain factual identity and all five beat times`, () => {
      const diagram = positive(story);
      const hybrid = parse(story, { ...story.proposal, visualMode: 'hybrid' });
      expect(hybrid.ctx.issues).toEqual([]);
      expect(hybrid.scene).toEqual({ ...diagram, visualMode: 'hybrid' });
      expect(positive({ ...story, proposal: structuredClone(story.proposal) })).toEqual(diagram);
      expect(parse(story, { ...story.proposal, layout: 'stack-flipped' }).scene).toEqual(diagram);
      expect(diagram.entities.map(({ id }) => id)).toEqual(
        diagram.entities.map((_, index) => expansionEntityId(story.id, index)),
      );
      expect(TIMES.map((field) => diagram[field])).toEqual(
        BEATS.map((field, index) =>
          index === 0 ? 0.3 : story.words[Number(story.proposal[field])].start,
        ),
      );
      expect(diagram.resolveAt).toBeLessThanOrEqual(story.window.endTime - 0.8);
      expect(diagram).not.toHaveProperty('treatment');
      expect(diagram).not.toHaveProperty('winner');
    });
    for (const negative of story.negatives) {
      it(`${story.id}: rejects ${negative.name} with diagnostics in both modes`, () => {
        if (negative.sourceText)
          expect(negative.words).toEqual(conceptFixtureWords(negative.sourceText, 10));
        for (const visualMode of ['diagram', 'hybrid']) {
          const proposal = structuredClone(negative.proposal);
          if (proposal.visualMode === 'diagram' || proposal.visualMode === 'hybrid')
            proposal.visualMode = visualMode;
          const result = parse(
            {
              ...story,
              words: negative.words ?? story.words,
              window: negative.window ?? story.window,
            },
            proposal,
          );
          expect(result.scene, `${story.id}/${negative.name}/${visualMode}`).toBeNull();
          expect(
            result.ctx.issues.length,
            `${story.id}/${negative.name}/${visualMode} diagnostic`,
          ).toBeGreaterThan(0);
        }
      });
    }
  }
  it('09 derives only exact complete-data subgroup ratios, retaining operands and cohort basis', () => {
    const scene = positive(baseRate);
    if (scene.storyId !== '09') throw new Error('Expected a base-rate scene');
    expect(
      scene.derivations.map(({ role, value }) => ({
        role,
        operands: value.operands,
        result: value.result,
        population: value.basis.population,
        denominator: value.basis.denominator,
      })),
    ).toEqual([
      {
        role: 'prevalence',
        operands: [
          { numerator: 20, denominator: 1 },
          { numerator: 100, denominator: 1 },
        ],
        result: { numerator: 1, denominator: 5 },
        population: 'District sample',
        denominator: { numerator: 100, denominator: 1 },
      },
      {
        role: 'selected-prevalence',
        operands: [
          { numerator: 18, denominator: 1 },
          { numerator: 30, denominator: 1 },
        ],
        result: { numerator: 3, denominator: 5 },
        population: 'Flagged cohort',
        denominator: { numerator: 30, denominator: 1 },
      },
    ]);
    expect(scene.display).toEqual({
      markCount: 100,
      aggregation: 'schematic-not-individual-counts',
    });
    for (const [index, record] of scene.records.entries()) {
      expect(record.quantity).toMatchObject(records(baseRate.proposal)[index].quantity);
      if (record.quantity.state !== 'known' || record.quantity.amount.kind !== 'rational')
        throw new Error('Expected retained source count');
      expect(record.quantity.amount.notation).toBe(String(record.quantity.amount.value.numerator));
    }
  });
  it('10 derives Bayes from the retained prior and both exhaustive likelihoods, never certainty', () => {
    const scene = positive(update);
    if (scene.storyId !== '10' || scene.update.state !== 'derived')
      throw new Error('Expected a derived Bayes update');
    expect(scene.update.derivation.supplied).toMatchObject({
      prior: { numerator: 1, denominator: 10 },
      likelihoodHypothesis: { numerator: 4, denominator: 5 },
      likelihoodComplement: { numerator: 1, denominator: 10 },
    });
    expect(scene.update.derivation.complementPrior).toEqual({ numerator: 9, denominator: 10 });
    expect(scene.update.derivation.value).toMatchObject({
      state: 'derived',
      operation: 'ratio',
      operands: [
        { numerator: 2, denominator: 25 },
        { numerator: 17, denominator: 100 },
      ],
      result: { numerator: 8, denominator: 17 },
      basis: { unit: 'ratio', period: 'April', population: 'Late scan' },
    });
    expect(scene.meaning).toBe('source-qualified-not-certainty');
    expect(scene.records.map(({ role }) => role)).not.toContain('posterior');
  });
  it('accepts relation/count paraphrases without moving claims, denominators or identities', () => {
    for (const story of packet.stories) {
      const text = clauses(story).text.map((clause) =>
        clause
          .replace(' is 100 count ', ' totals 100 count ')
          .replace(' is the subset numerator ', ' forms the subset numerator ')
          .replace(' is the selected denominator ', ' forms the selected denominator ')
          .replace(' is the prior within ', ' describes the prior within ')
          .replaceAll(' is the likelihood given ', ' describes the likelihood given ')
          .replace(' remain source-qualified.', ' stay source-qualified.')
          .replace(' remains source-qualified.', ' stays source-qualified.'),
      );
      const rewritten = rewrite(story, text);
      const canonical = positive(story);
      const paraphrased = positive(rewritten);
      expect(paraphrased.entities.map(({ id, label }) => ({ id, label }))).toEqual(
        canonical.entities.map(({ id, label }) => ({ id, label })),
      );
      expect(
        paraphrased.records.map(({ role, quantity }) => ({
          role,
          actor: quantity.actor,
          amount: 'amount' in quantity ? quantity.amount : null,
          basis: quantity.basis,
        })),
      ).toEqual(
        canonical.records.map(({ role, quantity }) => ({
          role,
          actor: quantity.actor,
          amount: 'amount' in quantity ? quantity.amount : null,
          basis: quantity.basis,
        })),
      );
    }
  });
  for (const state of [
    'unknown',
    'missing',
    'disputed',
    'conditional',
    'illustrative',
    'simulated',
  ] as const) {
    it(`${state} quantities are retained without known-only derivation or zero substitution`, () => {
      for (const story of packet.stories) {
        const first = records(story.proposal)[0].quantity;
        const evidence = first.evidence;
        if (!isRec(evidence)) throw new Error('Expected source clause span');
        const original = clauses(story);
        const index = original.spans.findIndex(
          ({ fromWord, toWord }) => fromWord === evidence.fromWord && toWord === evidence.toWord,
        );
        if (index < 0 || !isRec(first.basis) || !isRec(first.amount) || !isRec(first.amount.value))
          throw new Error('Expected canonical quantity');
        const amount = first.amount.value.numerator;
        const unit = first.basis.unit;
        const head = `${first.actor} ${first.claim}`;
        const tail = `${unit} during ${first.basis.period} among ${first.basis.population}.`;
        const text = [...original.text];
        const qualifier = state === 'illustrative' ? 'illustrative example' : 'simulated case';
        text[index] =
          state === 'unknown' || state === 'missing'
            ? `${head} is ${state} ${tail}`
            : state === 'disputed'
              ? `${head} is disputed between ${amount} and ${Number(amount) + 1} ${tail}`
              : state === 'conditional'
                ? `If approval is granted, ${head} is ${amount} ${tail}`
                : `In this ${qualifier}, ${head} is ${amount} ${tail}`;
        const revised = rewrite(story, text);
        const revisedRecords = records(revised.proposal);
        const q = revisedRecords[0].quantity;
        q.state = state;
        if (state === 'unknown' || state === 'missing' || state === 'disputed') delete q.amount;
        if (state === 'unknown' || state === 'missing' || state === 'disputed') q.qualifier = state;
        if (state === 'disputed')
          q.alternatives = [
            first.amount,
            { kind: 'rational', value: { numerator: Number(amount) + 1, denominator: 1 } },
          ];
        if (state === 'conditional') {
          q.condition = 'If approval is granted';
          revised.proposal.condition = q.condition;
        }
        if (state === 'illustrative' || state === 'simulated') {
          q.qualifier = qualifier;
          revised.proposal.evidence = 'illustrative';
        }
        if (story.id === '10') revised.proposal.updateMode = 'unresolved';
        const scene = positive(revised);
        expect(scene.records[0].quantity.state).toBe(state);
        if (state === 'unknown' || state === 'missing')
          expect(scene.records[0].quantity).not.toHaveProperty('amount');
        if (scene.storyId === '09') {
          expect(scene.derivations).toEqual([]);
          expect(scene.status).toBe('source-qualified');
        } else expect(scene.update).toEqual({ state: 'unresolved' });
      }
    });
  }
});
