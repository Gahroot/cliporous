import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type { ExpansionDistributionScene } from '../../remotion/compositions/explainer/expansion/quantities/distribution-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { isDerivationAllowed } from '../../remotion/compositions/explainer/expansion/value-logic';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionHistogram,
  parseExpansionSubgroupReversal,
} from './expansion-quantities-distribution-contract';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/quantities/distribution.source.json',
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  stories: ExpansionSourceFixture[];
};
const histogram = packet.stories.find((story) => story.id === '17');
const reversal = packet.stories.find((story) => story.id === '18');
if (!histogram || !reversal) throw new Error('Both approved distribution stories are required');
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function parse(story: ExpansionSourceFixture, proposal = story.proposal) {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '17'
      ? parseExpansionHistogram(proposal, ctx)
      : parseExpansionSubgroupReversal(proposal, ctx);
  return { scene, ctx };
}
function positive(story: ExpansionSourceFixture): ExpansionDistributionScene {
  const result = parse(story);
  expect(result.ctx.issues).toEqual([]);
  if (!result.scene) throw new Error(`Expected complete source-grounded story ${story.id}`);
  return result.scene;
}
function clause(words: ExpansionSourceFixture['words'], span: ExpansionEvidenceSpan): string {
  return words
    .slice(span.fromWord, span.toWord + 1)
    .map((word) => word.text)
    .join(' ');
}
function clauses(story: ExpansionSourceFixture) {
  const spans: ExpansionEvidenceSpan[] = [];
  let fromWord = 0;
  for (const [index, word] of story.words.entries()) {
    if (/[.!?;][”"’')\]]*$/.test(word.text)) {
      spans.push({ fromWord, toWord: index });
      fromWord = index + 1;
    }
  }
  if (fromWord !== story.words.length)
    throw new Error('Fixtures must preserve complete source sentences');
  return { spans, text: spans.map((span) => clause(story.words, span)) };
}
function rewrite(story: ExpansionSourceFixture, text: readonly string[]): ExpansionSourceFixture {
  const previous = clauses(story),
    speech = expansionFixtureSpeech(text, 10);
  function remap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(remap);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const index = previous.spans.findIndex(
        (span) => span.fromWord === value.fromWord && span.toWord === value.toWord,
      );
      if (!speech.spans[index]) throw new Error('Evidence must retain one full clause');
      return { ...speech.spans[index] };
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remap(entry)]));
  }
  const proposal = remap(story.proposal);
  if (!isRec(proposal)) throw new Error('Expected raw proposal');
  for (const beat of BEATS) {
    const index = previous.spans.findIndex((span) => span.fromWord === story.proposal[beat]);
    if (!speech.spans[index]) throw new Error('Beat must identify a complete source clause');
    proposal[beat] = speech.spans[index].fromWord;
  }
  proposal.startWord = 0;
  proposal.endWord = speech.window.endWord;
  return { ...story, ...speech, proposal };
}
function records(proposal: Rec): Rec[] {
  if (!Array.isArray(proposal.records) || !proposal.records.every(isRec))
    throw new Error('Expected raw records');
  return proposal.records;
}
function object(raw: unknown): Rec {
  if (!isRec(raw)) throw new Error('Expected raw object');
  return raw;
}
const amount = (numerator: number, denominator = 1) => ({
  kind: 'rational',
  value: { numerator, denominator },
});

function observations(): ExpansionSourceFixture {
  const speech = expansionFixtureSpeech(
    [
      'Depot wait distribution: Depot reports waiting time distribution in minute during April among parcels using supplied observations.',
      'Depot waiting time is -1.50 minute during April among parcels.',
      'Depot waiting time is 2.25 minute during April among parcels.',
      'Depot waiting time is 0 minute during April among parcels.',
      'Depot wait distribution retains only supplied observations without generated samples.',
    ],
    10,
  );
  const proposal: Rec = {
    kind: 'distribution-view',
    preset: 'histogram',
    visualMode: 'diagram',
    layout: 'stack',
    label: 'Depot wait distribution',
    subject: 'Depot wait distribution',
    outcome: 'supplied observations without generated samples',
    evidence: 'source-stated',
    startWord: 0,
    endWord: speech.window.endWord,
    ...Object.fromEntries(BEATS.map((beat, index) => [beat, speech.spans[index].fromWord])),
    entities: [{ label: 'Depot', evidence: speech.spans[0] }],
    actor: 'Depot',
    metric: 'waiting time',
    valueUnit: 'minute',
    representation: 'observations',
    records: [
      [-3, 2],
      [9, 4],
      [0, 1],
    ].map(([n, d], index) => ({
      quantity: {
        actor: 'Depot',
        claim: 'waiting time',
        state: 'known',
        amount: amount(n, d),
        basis: { unit: 'minute', period: 'April', population: 'parcels' },
        evidence: speech.spans[index + 1],
      },
    })),
  };
  return { id: '17', ...speech, proposal, negatives: [] };
}

describe('source-owned histogram and subgroup reversal (real contracts)', () => {
  it('reads exactly approved stories and all 115 explicit raw negatives with production source padding', () => {
    expect([packet.version, packet.pack]).toEqual([1, 'quantities']);
    expect(packet.stories.map((story) => story.id)).toEqual(['17', '18']);
    expect(packet.stories.map((story) => story.negatives.length)).toEqual([55, 60]);
    for (const story of packet.stories) {
      expect(story.sourceText).toBe(story.words.map((word) => word.text).join(' '));
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
      expect(new Set(story.negatives.map((negative) => negative.name)).size).toBe(
        story.negatives.length,
      );
      for (const negative of story.negatives) {
        expect(isRec(negative.proposal)).toBe(true);
        if (negative.sourceText !== undefined) {
          expect(negative.sourceText).toBe(negative.words?.map((word) => word.text).join(' '));
          expect(negative.words).toEqual(conceptFixtureWords(negative.sourceText, 10));
        }
      }
    }
  });
  for (const story of packet.stories) {
    it(`${story.id}: modes, layouts and repeated parses preserve IDs, full source spans, times and raw input`, () => {
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
      expect(scene.entities.map((entity) => entity.id)).toEqual(
        scene.entities.map((_, index) => expansionEntityId(story.id, index)),
      );
      expect(scene.records.map((record) => record.id)).toEqual(
        scene.records.map((_, index) => expansionEntityId(story.id, scene.entities.length + index)),
      );
      expect(TIMES.map((time) => scene[time])).toEqual(
        BEATS.map((beat, index) =>
          index === 0 ? 0.3 : story.words[Number(story.proposal[beat])].start,
        ),
      );
      expect(scene.resolveAt).toBeLessThanOrEqual(story.window.endTime - 0.8);
      const source = clauses(story);
      for (const [index, phase] of PHASES.entries()) {
        const span = source.spans.find((entry) => entry.fromWord === story.proposal[BEATS[index]]);
        expect(scene.sourceSpans[phase]).toEqual(span);
        expect(clause(story.words, scene.sourceSpans[phase])).toBe(
          source.text[source.spans.indexOf(span as ExpansionEvidenceSpan)],
        );
      }
      expect(scene).not.toHaveProperty('treatment');
    });
    for (const negative of story.negatives) {
      for (const mode of ['diagram', 'hybrid']) {
        it(`${story.id}: rejects ${negative.name} (${mode}) with bounded real diagnostics`, () => {
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
          expect(
            result.ctx.issues.length,
            `${story.id}/${negative.name}/${mode} diagnostic`,
          ).toBeGreaterThan(0);
          expect(result.ctx.issues.length).toBeLessThanOrEqual(4);
        });
      }
    }
  }
  it('retains exact supplied histogram bounds, count notation, basis and ownership, without derivation', () => {
    const scene = positive(histogram);
    if (scene.storyId !== '17') throw new Error('Expected histogram');
    expect(isDerivationAllowed('17', 'ratio')).toBe(false);
    expect(isDerivationAllowed('17', 'subgroup-total')).toBe(false);
    expect([
      scene.actorId,
      scene.metric,
      scene.valueUnit,
      scene.representation,
      scene.dataMeaning,
    ]).toEqual([
      expansionEntityId('17', 0),
      'waiting time',
      'minute',
      'bins',
      'supplied-only-no-smoothing',
    ]);
    expect(scene.entities).toHaveLength(1);
    expect(
      scene.records.map((record) => {
        if (record.role !== 'bin') throw new Error('Expected supplied bin');
        expect(record.lowerInclusive).toBe(true);
        expect(record.upperInclusive).toBe(false);
        expect(record.count.actor).toBe('Depot');
        expect(record.count.claim).toBe(`${record.label} count`);
        expect(record.count.basis).toEqual({
          unit: 'count',
          period: 'April',
          population: 'parcels',
        });
        const { rangeEvidence, count: q } = records(histogram.proposal)[
          scene.records.indexOf(record)
        ];
        expect(record.rangeEvidence).toEqual(rangeEvidence);
        expect(record.count.evidence).toEqual(object(q).evidence);
        expect(record.count.state).toBe('known');
        return [
          record.label,
          record.lower,
          record.upper,
          'amount' in record.count ? record.count.amount : null,
        ];
      }),
    ).toEqual([
      [
        'short',
        { value: { numerator: 0, denominator: 1 }, notation: '0' },
        { value: { numerator: 10, denominator: 1 }, notation: '10' },
        { ...amount(4), notation: '4' },
      ],
      [
        'medium',
        { value: { numerator: 10, denominator: 1 }, notation: '10' },
        { value: { numerator: 20, denominator: 1 }, notation: '20' },
        { ...amount(7), notation: '7' },
      ],
      [
        'long',
        { value: { numerator: 20, denominator: 1 }, notation: '20' },
        { value: { numerator: 30, denominator: 1 }, notation: '30' },
        { ...amount(2), notation: '2' },
      ],
    ]);
    for (const field of ['derived', 'derivations', 'curve', 'samples', 'density', 'total'])
      expect(scene).not.toHaveProperty(field);
  });
  it('derives a real subgroup/aggregate reversal from unequal denominators, retaining all exact operands and bases', () => {
    const scene = positive(reversal);
    if (scene.storyId !== '18' || scene.result.state !== 'derived')
      throw new Error('Expected derived reversal');
    expect(isDerivationAllowed('18', 'ratio')).toBe(true);
    expect(isDerivationAllowed('18', 'subgroup-total')).toBe(true);
    expect(scene.actorIds).toEqual([expansionEntityId('18', 0), expansionEntityId('18', 1)]);
    expect(scene.groupIds).toEqual([expansionEntityId('18', 2), expansionEntityId('18', 3)]);
    expect(scene.meaning).toBe('scope-bound-not-universal-winner');
    expect(scene.subgroupHigherActorId).toBe(scene.actorIds[0]);
    expect(scene.aggregateHigherActorId).toBe(scene.actorIds[1]);
    const inputs = [
      [9, 10],
      [20, 100],
      [80, 100],
      [1, 10],
    ];
    expect(scene.result.subgroupRates.map((rate) => rate.value.result)).toEqual([
      { numerator: 9, denominator: 10 },
      { numerator: 1, denominator: 5 },
      { numerator: 4, denominator: 5 },
      { numerator: 1, denominator: 10 },
    ]);
    for (const [index, rate] of scene.result.subgroupRates.entries()) {
      const record = scene.records[index],
        [n, d] = inputs[index];
      expect(rate).toEqual({
        recordId: record.id,
        actorId: record.actorId,
        groupId: record.groupId,
        value: {
          state: 'derived',
          operation: 'ratio',
          operands: [
            { numerator: n, denominator: 1 },
            { numerator: d, denominator: 1 },
          ],
          result: rate.value.result,
          basis: {
            unit: 'ratio',
            period: 'April',
            population: index % 2 === 0 ? 'easy cases' : 'hard cases',
            denominator: { numerator: d, denominator: 1 },
          },
          evidence: [record.numerator.evidence, record.denominator.evidence],
        },
      });
    }
    expect(
      scene.result.aggregates.map((aggregate) => [
        aggregate.numerator.result,
        aggregate.denominator.result,
        aggregate.rate.result,
      ]),
    ).toEqual([
      [
        { numerator: 29, denominator: 1 },
        { numerator: 110, denominator: 1 },
        { numerator: 29, denominator: 110 },
      ],
      [
        { numerator: 81, denominator: 1 },
        { numerator: 110, denominator: 1 },
        { numerator: 81, denominator: 110 },
      ],
    ]);
    for (const [index, aggregate] of scene.result.aggregates.entries()) {
      const own = scene.records.filter((record) => record.actorId === aggregate.actorId);
      expect(aggregate.numerator).toEqual({
        state: 'derived',
        operation: 'subgroup-total',
        operands: inputs
          .slice(index * 2, index * 2 + 2)
          .map(([n]) => ({ numerator: n, denominator: 1 })),
        result: aggregate.numerator.result,
        basis: { unit: 'count', period: 'April', population: 'all cases' },
        evidence: [...own.map((record) => record.numerator.evidence), scene.aggregateEvidence],
      });
      expect(aggregate.denominator).toEqual({
        state: 'derived',
        operation: 'subgroup-total',
        operands: inputs
          .slice(index * 2, index * 2 + 2)
          .map(([, d]) => ({ numerator: d, denominator: 1 })),
        result: { numerator: 110, denominator: 1 },
        basis: { unit: 'count', period: 'April', population: 'all cases' },
        evidence: [...own.map((record) => record.denominator.evidence), scene.aggregateEvidence],
      });
      expect(aggregate.rate).toEqual({
        state: 'derived',
        operation: 'ratio',
        operands: [aggregate.numerator.result, aggregate.denominator.result],
        result: aggregate.rate.result,
        basis: {
          unit: 'ratio',
          period: 'April',
          population: 'all cases',
          denominator: aggregate.denominator.result,
        },
        evidence: [
          scene.aggregateEvidence,
          scene.reversalEvidence,
          ...own.flatMap((record) => [record.numerator.evidence, record.denominator.evidence]),
        ],
      });
    }
    expect(scene).not.toHaveProperty('winner');
  });
  it('accepts a realistic range/count paraphrase without sorting or changing source facts', () => {
    const text = clauses(histogram).text.map((line) =>
      line
        .replace('Depot reports', 'Depot describes')
        .replace(' spans ', ' covers ')
        .replace(' during April ', ' in April '),
    );
    text[2] = 'During April, Depot recorded short count of 4 count for parcels.';
    text[text.length - 1] = 'Depot wait distribution keeps supplied bins without smoothing.';
    const scene = positive(rewrite(histogram, text));
    expect(scene.storyId).toBe('17');
    if (scene.storyId !== '17' || scene.records[0].role !== 'bin')
      throw new Error('Expected histogram');
    expect(scene.records[0].count).toHaveProperty('amount', { ...amount(4), notation: '4' });
    expect(scene.records.map((record) => record.id)).toEqual(
      positive(histogram).records.map((record) => record.id),
    );
  });
  it('accepts an authored subgroup/aggregate paraphrase with the same actual reversal', () => {
    const text = clauses(reversal).text;
    text[0] = text[0].replace(' compare ', ' report ');
    text[1] = 'During April, Clinic A recorded recovery numerator of 9 count for easy cases.';
    text[9] = text[9].replace(' partition ', ' form the complete partition of ');
    text[10] = text[10].replaceAll('ratio', 'rate').replace('every', 'each');
    text[11] = text[11].replace('retains', 'keeps');
    const scene = positive(rewrite(reversal, text));
    if (scene.storyId !== '18' || scene.result.state !== 'derived')
      throw new Error('Expected actual reversal');
    expect(scene.result.aggregates.map((aggregate) => aggregate.rate.result)).toEqual([
      { numerator: 29, denominator: 110 },
      { numerator: 81, denominator: 110 },
    ]);
  });
  it('retains bounded signed decimal observations in input order with no invented bins or samples', () => {
    const story = observations(),
      scene = positive(story);
    if (scene.storyId !== '17') throw new Error('Expected observations');
    expect(parse(story, { ...story.proposal, visualMode: 'hybrid' }).scene).toEqual({
      ...scene,
      visualMode: 'hybrid',
    });
    expect(
      scene.records.map((record) =>
        record.role === 'observation' && 'amount' in record.quantity
          ? record.quantity.amount
          : null,
      ),
    ).toEqual([
      { ...amount(-3, 2), notation: '-1.50' },
      { ...amount(9, 4), notation: '2.25' },
      { ...amount(0), notation: '0' },
    ]);
    expect(scene.records.every((record) => record.role === 'observation')).toBe(true);
    expect(scene).not.toHaveProperty('derived');
    const invented = structuredClone(story.proposal);
    object(object(records(invented)[0].quantity).amount).value = { numerator: 3, denominator: 2 };
    expect(parse(story, invented).scene).toBeNull();
    const cap = structuredClone(story.proposal);
    cap.records = Array.from({ length: 13 }, () => structuredClone(records(cap)[0]));
    expect(parse(story, cap).scene).toBeNull();
  });
  for (const state of [
    'unknown',
    'missing',
    'disputed',
    'conditional',
    'illustrative',
    'simulated',
  ] as const) {
    for (const story of [histogram, reversal]) {
      it(`${story.id}: preserves ${state} source information without measured zero or known-only derivation`, () => {
        const text = clauses(story).text,
          index = story.id === '17' ? 2 : 1;
        const original = text[index],
          n = story.id === '17' ? 4 : 9,
          condition = 'If permits are approved';
        text[index] =
          state === 'unknown' || state === 'missing'
            ? original.replace(`${n} count`, `${state} count`)
            : state === 'disputed'
              ? original.replace(`${n} count`, `disputed between ${n - 1} and ${n} count`)
              : state === 'conditional'
                ? `${condition}, ${original}`
                : `In this ${state === 'illustrative' ? 'teaching example' : 'simulation'}, ${original}`;
        const next = rewrite(story, text),
          first = records(next.proposal)[0];
        const q = object(story.id === '17' ? first.count : first.numerator);
        q.state = state;
        if (state === 'unknown' || state === 'missing' || state === 'disputed') {
          delete q.amount;
          q.qualifier = state;
        }
        if (state === 'disputed') q.alternatives = [amount(n - 1), amount(n)];
        if (state === 'conditional') {
          q.condition = condition;
          next.proposal.condition = condition;
        }
        if (state === 'illustrative' || state === 'simulated') {
          q.qualifier = state === 'illustrative' ? 'teaching example' : 'simulation';
          next.proposal.evidence = 'illustrative';
        }
        const scene = positive(next);
        if (scene.storyId === '17') {
          const record = scene.records[0];
          if (record.role !== 'bin') throw new Error('Expected bin');
          expect(record.count.state).toBe(state);
          if (state === 'unknown' || state === 'missing' || state === 'disputed')
            expect(record.count).not.toHaveProperty('amount');
          expect(scene).not.toHaveProperty('derived');
        } else {
          expect(scene.records[0].numerator.state).toBe(state);
          if (state === 'unknown' || state === 'missing' || state === 'disputed')
            expect(scene.records[0].numerator).not.toHaveProperty('amount');
          expect(scene.result).toEqual({ state: 'source-qualified' });
        }
        const hybrid = parse(next, { ...next.proposal, visualMode: 'hybrid' });
        expect(hybrid.ctx.issues).toEqual([]);
        expect(hybrid.scene).toEqual({ ...scene, visualMode: 'hybrid' });
      });
    }
  }
});
