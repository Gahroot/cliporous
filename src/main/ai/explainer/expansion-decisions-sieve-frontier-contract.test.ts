import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type { ExpansionSieveFrontierScene } from '../../remotion/compositions/explainer/expansion/decisions/sieve-frontier-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { isDerivationAllowed } from '../../remotion/compositions/explainer/expansion/value-logic';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import {
  parseExpansionPareto,
  parseExpansionSieve,
} from './expansion-decisions-sieve-frontier-contract';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/decisions/sieve-frontier.source.json',
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  stories: ExpansionSourceFixture[];
};
function fixture(id: '25' | '26'): ExpansionSourceFixture {
  const story = packet.stories.find((s) => s.id === id);
  if (!story) throw new Error(`Missing approved decision story ${id}`);
  return story;
}
const sieve = fixture('25'),
  pareto = fixture('26');
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
    story.id === '25' ? parseExpansionSieve(proposal, ctx) : parseExpansionPareto(proposal, ctx);
  return { scene, ctx };
}
function positive(story: ExpansionSourceFixture): ExpansionSieveFrontierScene {
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
    speech = expansionFixtureSpeech(clauses, 10);
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
  return { ...story, ...speech, proposal };
}
const amount = (numerator: number, denominator = 1) => ({
  kind: 'rational',
  value: { numerator, denominator },
});
function parity(story: ExpansionSourceFixture): ExpansionSieveFrontierScene {
  const scene = positive(story),
    before = structuredClone(story.proposal);
  for (const visualMode of ['diagram', 'hybrid'] as const) {
    expect(parse(story, { ...story.proposal, visualMode }).ctx.issues).toEqual([]);
    expect(parse(story, { ...story.proposal, visualMode }).scene).toEqual({ ...scene, visualMode });
  }
  expect(parse(story, { ...story.proposal, layout: 'stack-flipped' }).scene).toEqual(scene);
  expect(parse(story, structuredClone(story.proposal)).scene).toEqual(scene);
  expect(story.proposal).toEqual(before);
  return scene;
}

describe('decision source packet (real local contracts)', () => {
  it('persists both approved raw stories and 114 explicit invalid proposals with production padding', () => {
    expect([packet.version, packet.pack]).toEqual([1, 'decisions']);
    expect(packet.stories.map((s) => s.id)).toEqual(['25', '26']);
    expect(packet.stories.map((s) => s.negatives.length)).toEqual([47, 67]);
    for (const story of packet.stories) {
      expect(story.sourceText).toBe(story.words.map((w) => w.text).join(' '));
      expect(story.words).toEqual(conceptFixtureWords(story.sourceText, 10));
      expect(expansionFixtureSpeech(sourceClauses(story).clauses, 10).words).toEqual(story.words);
      expect(story.words[0].start).toBe(0.25);
      expect(story.words.at(-1)?.end).toBe(9.65);
      expect(story.window).toEqual({
        startWord: 0,
        endWord: story.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
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
    it(`${story.id}: facts, full source sentences, IDs, ordered times and repeated parses are identical in both modes`, () => {
      const scene = parity(story),
        source = sourceClauses(story);
      expect(scene.storyId).toBe(story.id);
      expect(scene.period).toBe('May');
      expect(scene.entities).toEqual(
        rows(story.proposal.entities).map((e, i) => ({
          id: expansionEntityId(story.id, i),
          label: e.label,
          evidence: e.evidence,
        })),
      );
      expect(scene).not.toHaveProperty('treatment');
      for (const [i, phase] of PHASES.entries()) {
        const span = scene.sourceSpans[phase];
        expect(source.spans).toContainEqual(span);
        expect(text(story, span)).toBe(
          source.clauses[source.spans.findIndex((s) => s.fromWord === span.fromWord)],
        );
        expect(story.proposal[BEATS[i]]).toBe(span.fromWord);
        expect(scene[TIMES[i]]).toBe(i === 0 ? 0.3 : story.words[span.fromWord].start);
        if (i > 0) expect(scene[TIMES[i]]).toBeGreaterThan(scene[TIMES[i - 1]]);
      }
      expect(story.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    });
    for (const negative of story.negatives)
      for (const mode of ['diagram', 'hybrid'] as const) {
        it(`${story.id}: rejects ${negative.name} (${mode}) with real bounded diagnostics`, () => {
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
          expect(result.ctx.issues.length, `${story.id}/${negative.name}/${mode}`).toBeGreaterThan(
            0,
          );
          expect(result.ctx.issues.length).toBeLessThanOrEqual(4);
        });
      }
  }

  it('sieve retains actual named requirements and explicit pass/fail/unknown checks, not a winner', () => {
    const scene = positive(sieve);
    if (scene.storyId !== '25') throw new Error('Expected literal sieve');
    expect([scene.kind, scene.preset, scene.meaning]).toEqual([
      'constraint-choice',
      'sieve',
      'source-stated-checks-not-winner',
    ]);
    expect(scene.population).toBe('rentals');
    expect(
      scene.requirements.map((r) => ({ id: r.id, label: r.label, content: r.content })),
    ).toEqual([
      { id: 'expansion-25-entity-2', label: 'access', content: 'step free entry' },
      { id: 'expansion-25-entity-3', label: 'lease', content: 'a twelve month term' },
    ]);
    expect(scene.requirements.map((r) => text(sieve, r.evidence))).toEqual(
      sourceClauses(sieve).clauses.slice(1, 3),
    );
    expect(
      scene.records.map((r) => ({
        id: r.id,
        optionId: r.optionId,
        requirementId: r.requirementId,
        state: r.state,
        ...('status' in r ? { status: r.status } : { qualifier: r.qualifier }),
      })),
    ).toEqual([
      {
        id: 'expansion-25-entity-4',
        optionId: 'expansion-25-entity-0',
        requirementId: 'expansion-25-entity-2',
        state: 'known',
        status: 'pass',
      },
      {
        id: 'expansion-25-entity-5',
        optionId: 'expansion-25-entity-0',
        requirementId: 'expansion-25-entity-3',
        state: 'known',
        status: 'fail',
      },
      {
        id: 'expansion-25-entity-6',
        optionId: 'expansion-25-entity-1',
        requirementId: 'expansion-25-entity-2',
        state: 'unknown',
        qualifier: 'unknown',
      },
      {
        id: 'expansion-25-entity-7',
        optionId: 'expansion-25-entity-1',
        requirementId: 'expansion-25-entity-3',
        state: 'known',
        status: 'pass',
      },
    ]);
    expect(scene.records.map((r) => text(sieve, r.evidence))).toEqual(
      sourceClauses(sieve).clauses.slice(3, 7),
    );
    expect(scene).not.toHaveProperty('winner');
    expect(scene).not.toHaveProperty('eliminated');
    expect(scene).not.toHaveProperty('result');
    expect(isDerivationAllowed('25', 'pareto')).toBe(false);
  });
  it('Pareto retains exact operands and bases and derives only nondominated identities and strict dominations', () => {
    const scene = positive(pareto);
    if (scene.storyId !== '26' || scene.result.state !== 'derived')
      throw new Error('Expected exact derived frontier');
    expect([scene.kind, scene.preset, scene.meaning]).toEqual([
      'tradeoff-frontier',
      'pareto',
      'nondominated-not-universal-superiority',
    ]);
    expect(scene.criteria.map((c) => [c.id, c.label, c.direction])).toEqual([
      ['expansion-26-entity-3', 'duration', 'minimize'],
      ['expansion-26-entity-4', 'payload', 'maximize'],
    ]);
    expect(scene.criteria.map((c) => text(pareto, c.evidence))).toEqual(
      sourceClauses(pareto).clauses.slice(1, 3),
    );
    expect(scene.result.operation).toBe('pareto');
    expect(isDerivationAllowed('26', 'pareto')).toBe(true);
    expect(isDerivationAllowed('26', 'difference')).toBe(false);
    expect(scene.result.nondominatedOptionIds).toEqual([
      'expansion-26-entity-0',
      'expansion-26-entity-1',
    ]);
    expect(scene.result.dominations).toEqual([
      { fromId: 'expansion-26-entity-0', toId: 'expansion-26-entity-2' },
      { fromId: 'expansion-26-entity-1', toId: 'expansion-26-entity-2' },
    ]);
    expect(scene.result.operands).toEqual(
      [10, 4, 20, 8, 25, 3].map((n, i) => ({
        recordId: expansionEntityId('26', 5 + i),
        optionId: expansionEntityId('26', Math.floor(i / 2)),
        criterionId: expansionEntityId('26', 3 + (i % 2)),
        value: { numerator: n, denominator: 1 },
        basis: {
          unit: i % 2 === 0 ? 'minute' : 'kilogram',
          period: 'May',
          population: 'deliveries',
        },
        evidence: scene.records[i].quantity.evidence,
      })),
    );
    expect(scene.records.map((r) => text(pareto, r.quantity.evidence))).toEqual(
      sourceClauses(pareto).clauses.slice(3, 9),
    );
    expect(text(pareto, scene.comparisonEvidence)).toBe(sourceClauses(pareto).clauses[9]);
    expect(scene).not.toHaveProperty('winner');
    expect(scene).not.toHaveProperty('scores');
  });
  it('all-equal candidates remain nondominated: equality is never strict domination', () => {
    const original = sourceClauses(pareto).clauses;
    const variant = rewrite(
      pareto,
      original.map((s, i) =>
        i === 5
          ? s.replace('20 minute', '10 minute')
          : i === 6
            ? s.replace('8 kilogram', '4 kilogram')
            : i === 7
              ? s.replace('25 minute', '10 minute')
              : i === 8
                ? s.replace('3 kilogram', '4 kilogram')
                : s,
      ),
    );
    for (const [i, r] of rows(variant.proposal.records).entries())
      object(r.quantity).amount = amount(i % 2 === 0 ? 10 : 4);
    const scene = parity(variant);
    if (scene.storyId !== '26' || scene.result.state !== 'derived')
      throw new Error('Known complete equality must derive');
    expect(scene.result.dominations).toEqual([]);
    expect(scene.result.nondominatedOptionIds).toEqual(scene.entities.map((e) => e.id));
  });
  it('equal value in one criterion plus strict improvement in another is genuine domination', () => {
    const original = sourceClauses(pareto).clauses;
    const variant = rewrite(
      pareto,
      original.map((s, i) => (i === 5 ? s.replace('20 minute', '10 minute') : s)),
    );
    object(rows(variant.proposal.records)[2].quantity).amount = amount(10);
    const scene = positive(variant);
    if (scene.storyId !== '26' || scene.result.state !== 'derived')
      throw new Error('Known complete metrics must derive');
    expect(scene.result.nondominatedOptionIds).toEqual(['expansion-26-entity-1']);
    expect(scene.result.dominations).toContainEqual({
      fromId: 'expansion-26-entity-1',
      toId: 'expansion-26-entity-0',
    });
  });
  it('retains signed decimal source quantities and uses exact comparisons, not a weighted score', () => {
    const original = sourceClauses(pareto).clauses;
    const variant = rewrite(
      pareto,
      original.map((s, i) => (i === 3 ? s.replace('10 minute', '-1.50 minute') : s)),
    );
    object(rows(variant.proposal.records)[0].quantity).amount = amount(-3, 2);
    const scene = parity(variant);
    if (scene.storyId !== '26' || scene.result.state !== 'derived')
      throw new Error('Exact signed metric must derive');
    expect(scene.result.operands[0].value).toEqual({ numerator: -3, denominator: 2 });
    expect(scene.records[0].quantity.state).toBe('known');
    if (scene.records[0].quantity.state === 'known')
      expect(scene.records[0].quantity.amount.notation).toBe('-1.50');
  });
  for (const story of packet.stories)
    it(`${story.id}: accepts a realistic second wording with unchanged judgments/frontier facts`, () => {
      const original = sourceClauses(story).clauses;
      const wording = original.map((s) =>
        story.id === '25'
          ? s
              .replace('face requirements', 'are checked against requirements')
              .replace('requires', 'calls for')
              .replace('passes requirement', 'meets requirement')
              .replace('fails requirement', 'does not meet requirement')
              .replace('retains source-stated', 'keeps source-stated')
          : s
              .replace('compare duration', 'report duration')
              .replace('minimize duration', 'prefer lower duration')
              .replace('maximize payload', 'prefer higher payload')
              .replace(' is ', ' equals ')
              .replace('use the same', 'share the same')
              .replace('retains only', 'keeps only'),
      );
      const scene = parity(rewrite(story, wording));
      if (scene.storyId === '25')
        expect(scene.records.map((r) => (r.state === 'known' ? r.status : r.state))).toEqual([
          'pass',
          'fail',
          'unknown',
          'pass',
        ]);
      else {
        if (scene.result.state !== 'derived')
          throw new Error('Known paraphrase must retain exact frontier');
        expect(scene.result.nondominatedOptionIds).toEqual([
          'expansion-26-entity-0',
          'expansion-26-entity-1',
        ]);
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
    for (const story of packet.stories)
      it(`${story.id}: preserves ${state} without invented known status/frontier`, () => {
        const original = sourceClauses(story).clauses;
        const index = 3;
        const condition = 'If traffic clears';
        const qualifier = state === 'simulated' ? 'simulation' : 'illustrative example';
        let replacement: string;
        if (story.id === '25')
          replacement =
            state === 'unknown' || state === 'missing'
              ? `Loft access check is ${state} during May among rentals.`
              : state === 'disputed'
                ? 'Loft access check is disputed between pass and fail during May among rentals.'
                : state === 'conditional'
                  ? `${condition}, ${original[index]}`
                  : `In this ${qualifier}, ${original[index]}`;
        else
          replacement =
            state === 'unknown' || state === 'missing'
              ? `Bike duration is ${state} minute during May among deliveries.`
              : state === 'disputed'
                ? 'Bike duration is disputed between 10 and 12 minute during May among deliveries.'
                : state === 'conditional'
                  ? `${condition}, ${original[index]}`
                  : `In this ${qualifier}, ${original[index]}`;
        const variant = rewrite(
          story,
          original.map((s, i) => (i === index ? replacement : s)),
        );
        if (state === 'conditional') variant.proposal.condition = condition;
        if (state === 'illustrative' || state === 'simulated')
          variant.proposal.evidence = 'illustrative';
        if (story.id === '25') {
          const record = rows(variant.proposal.records)[0];
          record.state = state;
          if (state === 'unknown' || state === 'missing') {
            delete record.status;
            record.qualifier = state;
          } else if (state === 'disputed') {
            delete record.status;
            record.alternatives = ['pass', 'fail'];
            record.qualifier = 'disputed';
          } else if (state === 'conditional') record.condition = condition;
          else record.qualifier = qualifier;
        } else {
          const quantity = object(rows(variant.proposal.records)[0].quantity);
          quantity.state = state;
          if (state === 'unknown' || state === 'missing') {
            delete quantity.amount;
            quantity.qualifier = state;
          } else if (state === 'disputed') {
            delete quantity.amount;
            quantity.alternatives = [amount(10), amount(12)];
            quantity.qualifier = 'disputed';
          } else if (state === 'conditional') quantity.condition = condition;
          else quantity.qualifier = qualifier;
        }
        const scene = parity(variant);
        if (scene.storyId === '25') {
          expect(scene.records[0].state).toBe(state);
          if (state === 'unknown' || state === 'missing' || state === 'disputed')
            expect(scene.records[0]).not.toHaveProperty('status');
          if (state === 'conditional')
            expect(scene.records[0]).toHaveProperty('condition', condition);
          expect(scene).not.toHaveProperty('winner');
        } else {
          expect(scene.records[0].quantity.state).toBe(state);
          expect(scene.result).toEqual({ state: 'source-qualified' });
          expect(scene.result).not.toHaveProperty('operands');
          expect(scene.result).not.toHaveProperty('nondominatedOptionIds');
          if (state === 'unknown' || state === 'missing' || state === 'disputed')
            expect(scene.records[0].quantity).not.toHaveProperty('amount');
          if (state === 'disputed')
            expect(scene.records[0].quantity).toHaveProperty('alternatives', [
              { ...amount(10), notation: '10' },
              { ...amount(12), notation: '12' },
            ]);
          if (state === 'conditional')
            expect(scene.records[0].quantity).toHaveProperty('condition', condition);
        }
      });
  }
});
