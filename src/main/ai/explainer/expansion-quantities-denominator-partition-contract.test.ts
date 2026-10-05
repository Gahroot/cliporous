import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type {
  ExpansionDenominatorScene,
  ExpansionPartitionScene,
} from '../../remotion/compositions/explainer/expansion/quantities/denominator-partition-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionDenominator,
  parseExpansionPartition,
} from './expansion-quantities-denominator-partition-contract';
import { makeParseContext, type PlannerWord, type Rec, type SceneWindow } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/quantities/denominator-partition.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
function requiredFixture(id: '19' | '20'): ExpansionSourceFixture {
  const story = packet.stories.find((entry) => entry.id === id);
  if (!story) throw new Error('Both approved quantity source stories are required');
  return story;
}
const denominator = requiredFixture('19');
const partition = requiredFixture('20');
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
function parse(id: '19' | '20', proposal: Rec, words: readonly PlannerWord[], window: SceneWindow) {
  const ctx = makeParseContext(words, window);
  const scene =
    id === '19' ? parseExpansionDenominator(proposal, ctx) : parseExpansionPartition(proposal, ctx);
  return { scene, ctx };
}
function clauses(story: ExpansionSourceFixture): string[] {
  return story.sourceText.split(/(?<=\.)\s+(?=[A-Z])/u);
}
function paraphrase(story: ExpansionSourceFixture, source: readonly string[]) {
  const speech = expansionFixtureSpeech(source, 10),
    old = expansionFixtureSpeech(clauses(story), 10);
  function rebase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rebase);
    if (value && typeof value === 'object') {
      const record = value as Rec;
      if (Object.keys(record).length === 2 && 'fromWord' in record && 'toWord' in record) {
        const index = old.spans.findIndex(
          (span) => span.fromWord === record.fromWord && span.toWord === record.toWord,
        );
        if (index < 0) throw new Error('Source evidence must remain a complete authored clause');
        return { ...speech.spans[index] };
      }
      return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, rebase(entry)]));
    }
    return value;
  }
  const proposal = rebase(story.proposal) as Rec;
  proposal.startWord = speech.window.startWord;
  proposal.endWord = speech.window.endWord;
  const phaseIndices = story.id === '19' ? [0, 1, 2, 3, 5] : [0, 1, 2, 3, 4];
  BEATS.forEach((field, index) => {
    proposal[field] = speech.spans[phaseIndices[index]].fromWord;
  });
  return { ...speech, proposal };
}
function positive19(
  proposal: Rec,
  words: readonly PlannerWord[],
  window: SceneWindow,
): ExpansionDenominatorScene {
  const result = parse('19', proposal, words, window);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  expect(result.scene?.kind).toBe('quantity-comparison');
  expect(parse('19', { ...proposal, visualMode: 'hybrid' }, words, window).scene).toEqual({
    ...result.scene,
    visualMode: 'hybrid',
  });
  if (!result.scene || result.scene.storyId !== '19')
    throw new Error('Expected real denominator scene');
  return result.scene;
}
function positive20(
  proposal: Rec,
  words: readonly PlannerWord[],
  window: SceneWindow,
): ExpansionPartitionScene {
  const result = parse('20', proposal, words, window);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  expect(result.scene?.kind).toBe('composition-view');
  expect(parse('20', { ...proposal, visualMode: 'hybrid' }, words, window).scene).toEqual({
    ...result.scene,
    visualMode: 'hybrid',
  });
  if (!result.scene || result.scene.storyId !== '20')
    throw new Error('Expected real partition scene');
  return result.scene;
}
function rows(proposal: Rec) {
  return proposal.comparisons as { entity: string; actor: string; amount: Rec; reference: Rec }[];
}
function parts(proposal: Rec) {
  return proposal.parts as { entity: string; role: string; quantity: Rec; membership: Rec }[];
}
function rationalAmount(numerator: number) {
  return { kind: 'rational', value: { numerator, denominator: 1 } };
}
function money(minorUnits: number) {
  return { kind: 'money', value: { minorUnits, currency: 'USD' } };
}
function qualify(quantity: Rec, state: string) {
  quantity.state = state;
  quantity.qualifier = state;
  delete quantity.amount;
}
function orderedPercentChange(unit = 'count') {
  const source = clauses(denominator);
  source[0] = `Ada's sales comparison orders Alpha during March before Beta during April.`;
  for (const index of [1, 2, 3, 4])
    source[index] = source[index].replace('count during', `${unit} during`);
  source[3] = source[3].replace('March', 'April');
  source[4] = source[4].replace('March', 'April');
  const next = paraphrase(denominator, source);
  for (const row of rows(next.proposal))
    for (const quantity of [row.amount, row.reference]) (quantity.basis as Rec).unit = unit;
  for (const quantity of [rows(next.proposal)[1].amount, rows(next.proposal)[1].reference])
    (quantity.basis as Rec).period = 'April';
  next.proposal.ordering = { from: 'Alpha', to: 'Beta', evidence: next.spans[0] };
  next.proposal.derive = [{ operation: 'percent-change', from: 'Alpha', to: 'Beta' }];
  return next;
}

describe('quantity denominator/partition production source packets', () => {
  it('uses the actual two-story JSON and production-padded concrete words', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('quantities');
    expect(packet.stories.map((story) => story.id)).toEqual(['19', '20']);
    expect(packet.stories.map((story) => story.negatives.length)).toEqual([55, 57]);
    for (const story of packet.stories) {
      expect(story.words.map((word) => word.text).join(' ')).toBe(story.sourceText);
      expect(story.words).toEqual(conceptFixtureWords(story.sourceText, 10));
      expect(expansionFixtureSpeech(clauses(story), 10).words).toEqual(story.words);
      expect(story.window).toEqual({
        startWord: 0,
        endWord: story.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(story.words[0].start).toBe(0.25);
      expect(story.words.at(-1)?.end).toBe(9.65);
      expect(new Set(story.negatives.map((negative) => negative.name)).size).toBe(
        story.negatives.length,
      );
    }
  });
  for (const story of packet.stories) {
    const id = story.id as '19' | '20';
    describe(`story ${id}`, () => {
      it('keeps identical facts, qualifications, stable IDs and source times in both modes and repeated parses', () => {
        const diagram = parse(
            id,
            { ...story.proposal, visualMode: 'diagram' },
            story.words,
            story.window,
          ),
          hybrid = parse(
            id,
            { ...story.proposal, visualMode: 'hybrid' },
            story.words,
            story.window,
          );
        expect(diagram.ctx.issues).toEqual([]);
        expect(hybrid.ctx.issues).toEqual([]);
        expect(diagram.scene).not.toBeNull();
        expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
        const scene = diagram.scene;
        if (!scene) throw new Error('Expected complete source-owned scene');
        expect(scene.entities.map((entity) => entity.id)).toEqual(
          scene.entities.map((_, index) => expansionEntityId(id, index)),
        );
        expect(scene.entities.map((entity) => entity.label)).toEqual(
          (story.proposal.entities as { label: string }[]).map((entity) => entity.label),
        );
        expect(TIMES.map((field) => scene[field])).toEqual(
          BEATS.map((field, index) =>
            index === 0 ? 0.3 : story.words[Number(story.proposal[field])].start,
          ),
        );
        expect(scene.resolveAt).toBeLessThanOrEqual(story.window.endTime - 0.8);
        expect(parse(id, structuredClone(story.proposal), story.words, story.window).scene).toEqual(
          scene,
        );
        expect(
          parse(id, { ...story.proposal, layout: 'stack-flipped' }, story.words, story.window)
            .scene,
        ).toEqual(scene);
        expect(scene).not.toHaveProperty('treatment');
      });
      for (const negative of story.negatives)
        it(`rejects raw ${negative.name} with diagnostics in both modes`, () => {
          if (negative.sourceText) {
            expect(negative.words?.map((word) => word.text).join(' ')).toBe(negative.sourceText);
            expect(negative.words).toEqual(conceptFixtureWords(negative.sourceText, 10));
          }
          for (const mode of ['diagram', 'hybrid']) {
            const proposal = structuredClone(negative.proposal);
            if (proposal.visualMode === 'diagram' || proposal.visualMode === 'hybrid')
              proposal.visualMode = mode;
            const result = parse(
              id,
              proposal,
              negative.words ?? story.words,
              negative.window ?? story.window,
            );
            expect(result.scene, `${id}/${negative.name}/${mode}`).toBeNull();
            expect(
              result.ctx.issues.length,
              `${id}/${negative.name}/${mode} diagnostic`,
            ).toBeGreaterThan(0);
          }
        });
    });
  }
  it('retains explicit amounts and reference totals while separating absolute and relative differences', () => {
    const scene = positive19(denominator.proposal, denominator.words, denominator.window);
    expect(scene.derived.map((value) => [value.operation, value.result, value.basis.unit])).toEqual(
      [
        ['ratio', { numerator: 1, denominator: 5 }, 'ratio'],
        ['ratio', { numerator: 1, denominator: 10 }, 'ratio'],
        ['difference', { numerator: 20, denominator: 1 }, 'count'],
      ],
    );
    expect(scene.derived.map((value) => value.operands)).toEqual([
      [
        { numerator: 20, denominator: 1 },
        { numerator: 100, denominator: 1 },
      ],
      [
        { numerator: 40, denominator: 1 },
        { numerator: 400, denominator: 1 },
      ],
      [
        { numerator: 40, denominator: 1 },
        { numerator: 20, denominator: 1 },
      ],
    ]);
    expect(scene.derived[0].sourceQuantities).toEqual([
      scene.comparisons[0].amount,
      scene.comparisons[0].reference,
    ]);
    expect(scene.derived[0].operandBases).toEqual([
      scene.comparisons[0].amount.basis,
      scene.comparisons[0].reference.basis,
    ]);
    expect(scene.derived[0].basis).toEqual({
      unit: 'ratio',
      period: 'March',
      population: 'district',
      denominator: { numerator: 100, denominator: 1 },
    });
    expect(scene.comparisons.map((row) => row.reference)).toHaveLength(2);
    expect(scene.derived.every((value) => value.state === 'derived')).toBe(true);
    expect(scene).not.toHaveProperty('winner');
  });
  it('computes exact percent change only with source-bound chronological records and keeps both periods', () => {
    const next = orderedPercentChange(),
      scene = positive19(next.proposal, next.words, next.window);
    expect(scene.derived[0].operation).toBe('percent-change');
    expect(scene.derived[0].result).toEqual({ numerator: 100, denominator: 1 });
    expect(scene.derived[0].basis.unit).toBe('percent-change');
    expect(scene.derived[0].operands).toEqual([
      { numerator: 20, denominator: 1 },
      { numerator: 40, denominator: 1 },
    ]);
    expect(scene.derived[0].operandBases.map((basis) => basis.period)).toEqual(['March', 'April']);
    expect(scene.derived[0].sourceQuantities).toEqual(scene.comparisons.map((row) => row.amount));
    expect(scene.comparisons[1].reference.basis.period).toBe('April');
  });
  it('distinguishes percentage-point differences from relative percent change of percentage values', () => {
    const source = clauses(denominator).map((clause, index) =>
      index >= 1 && index <= 4 ? clause.replace('count during', 'percent during') : clause,
    );
    const next = paraphrase(denominator, source);
    for (const row of rows(next.proposal))
      for (const quantity of [row.amount, row.reference]) (quantity.basis as Rec).unit = 'percent';
    const difference = positive19(next.proposal, next.words, next.window).derived[2];
    expect(difference.result).toEqual({ numerator: 20, denominator: 1 });
    expect(difference.basis.unit).toBe('percentage-point');
    expect(difference.operandBases.map((basis) => basis.unit)).toEqual(['percent', 'percent']);
    const ordered = orderedPercentChange('percent'),
      relative = positive19(ordered.proposal, ordered.words, ordered.window).derived[0];
    expect(relative.result).toEqual({ numerator: 100, denominator: 1 });
    expect(relative.basis.unit).toBe('percent-change');
  });
  it('keeps signed money precision and exact major-unit operands, never mixing currencies', () => {
    const source = clauses(denominator);
    const values = ['-2.50', '100.00', '12.50', '400.00'];
    for (let index = 1; index <= 4; index++)
      source[index] = source[index].replace(/(?:20|100|40|400) count/, `${values[index - 1]} USD`);
    const next = paraphrase(denominator, source);
    const records = rows(next.proposal),
      minor = [-250, 10000, 1250, 40000];
    let index = 0;
    for (const row of records)
      for (const quantity of [row.amount, row.reference]) {
        (quantity.basis as Rec).unit = 'USD';
        quantity.amount = money(minor[index++]);
      }
    const scene = positive19(next.proposal, next.words, next.window);
    expect(scene.derived.map((value) => value.result)).toEqual([
      { numerator: -1, denominator: 40 },
      { numerator: 1, denominator: 32 },
      { numerator: 15, denominator: 1 },
    ]);
    expect(scene.derived[2].basis.unit).toBe('USD');
    expect(scene.derived[2].operands).toEqual([
      { numerator: 25, denominator: 2 },
      { numerator: -5, denominator: 2 },
    ]);
    expect(scene.comparisons[0].amount).toMatchObject({
      amount: { kind: 'money', value: { minorUnits: -250, currency: 'USD' } },
    });
    if (scene.comparisons[0].amount.state !== 'known')
      throw new Error('Expected explicit known signed money');
    expect(scene.comparisons[0].amount.amount.notation).toContain('-2.50');
    const incompatible = structuredClone(next.proposal);
    (rows(incompatible)[1].amount.basis as Rec).unit = 'EUR';
    const invalid = parse('19', incompatible, next.words, next.window);
    expect(invalid.scene).toBeNull();
    expect(invalid.ctx.issues.length).toBeGreaterThan(0);
  });
  it('accepts independently authored actor/quantity and comparison paraphrases', () => {
    const source = clauses(denominator);
    source[0] = `Ada's sales comparison contrasts Alpha and Beta.`;
    source[1] = `During March, Ada Alpha sales amount totals 20 count among district.`;
    source[2] = `Ada recorded Alpha sales reference total of 100 count during March for district.`;
    source[5] = `Ada's sales comparison preserves amounts and reference totals distinct.`;
    const next = paraphrase(denominator, source),
      scene = positive19(next.proposal, next.words, next.window);
    expect(scene.derived.map((value) => value.result)).toEqual([
      { numerator: 1, denominator: 5 },
      { numerator: 1, denominator: 10 },
      { numerator: 20, denominator: 1 },
    ]);
  });
  it.each([
    'unknown',
    'missing',
    'disputed',
  ] as const)('retains %s reference totals without a fabricated ratio', (state) => {
    const source = clauses(denominator);
    source[2] = source[2].replace(
      '100 count',
      state === 'disputed' ? 'disputed between 100 and 200 count' : `${state} count`,
    );
    const next = paraphrase(denominator, source);
    delete next.proposal.derive;
    const reference = rows(next.proposal)[0].reference;
    qualify(reference, state);
    if (state === 'disputed') reference.alternatives = [rationalAmount(100), rationalAmount(200)];
    const scene = positive19(next.proposal, next.words, next.window);
    expect(scene.comparisons[0].reference.state).toBe(state);
    expect(scene.comparisons[0].reference).not.toHaveProperty('amount');
    expect(scene.derived).toEqual([]);
    const invalid = parse(
      '19',
      { ...next.proposal, derive: [{ operation: 'ratio', row: 'Alpha' }] },
      next.words,
      next.window,
    );
    expect(invalid.scene).toBeNull();
    expect(invalid.ctx.issues.length).toBeGreaterThan(0);
  });
  it.each([
    ['illustrative', 'teaching example'],
    ['simulated', 'simulation'],
    ['conditional', 'If permits are granted'],
  ])('preserves %s amount qualification without publishing a measured comparison', (state, qualification) => {
    const source = clauses(denominator);
    source[1] =
      state === 'conditional'
        ? `${qualification}, ${source[1]}`
        : `In this ${qualification}, ${source[1]}`;
    const next = paraphrase(denominator, source);
    delete next.proposal.derive;
    const amount = rows(next.proposal)[0].amount;
    amount.state = state;
    if (state === 'conditional') {
      next.proposal.condition = qualification;
      amount.condition = qualification;
    } else {
      next.proposal.evidence = 'illustrative';
      amount.qualifier = qualification;
    }
    const scene = positive19(next.proposal, next.words, next.window);
    expect(scene.comparisons[0].amount.state).toBe(state);
    expect(scene.derived).toEqual([]);
    expect(scene.comparisons[0].amount).toHaveProperty(
      state === 'conditional' ? 'condition' : 'qualifier',
      qualification,
    );
  });
  it('keeps the explicit unknown remainder rather than calculating the arithmetical 300 USD gap', () => {
    const scene = positive20(partition.proposal, partition.words, partition.window);
    expect(scene.total).toMatchObject({
      state: 'known',
      amount: { kind: 'money', value: { minorUnits: 100000, currency: 'USD' } },
    });
    expect(scene.parts.map((part) => part.role)).toEqual(['part', 'part', 'remainder']);
    expect(scene.parts[2].quantity.state).toBe('unknown');
    expect(scene.parts[2].quantity).not.toHaveProperty('amount');
    expect(scene.relations).toHaveLength(3);
    expect(
      scene.relations.every(
        (relation) => relation.role === 'membership' && relation.toId === scene.wholeId,
      ),
    ).toBe(true);
    expect(scene.relations.map((relation) => relation.fromId)).toEqual(
      scene.parts.map((part) => part.entityId),
    );
    for (const key of ['derived', 'computedRemainder', 'remainderValue', 'sum'])
      expect(scene).not.toHaveProperty(key);
  });
  it('accepts complete source membership/quantity paraphrases without inventing parts', () => {
    const source = clauses(partition);
    source[0] = `Ada's budget contains Housing, Food and Unallocated as parts of budget.`;
    source[1] = `During March, Ada's budget total equals 1000.00 USD among household.`;
    source[3] = `Ada's budget recorded Food part of 300.00 USD during March for household.`;
    const next = paraphrase(partition, source),
      scene = positive20(next.proposal, next.words, next.window);
    expect(scene.parts[2].quantity.state).toBe('unknown');
    expect(scene.parts[2].quantity).not.toHaveProperty('amount');
    expect(scene).not.toHaveProperty('derived');
  });
  it.each([
    'missing',
    'disputed',
  ] as const)('preserves %s remainder state instead of asserting an unstated value', (state) => {
    const source = clauses(partition);
    source[4] = source[4].replace(
      'unknown USD',
      state === 'disputed' ? 'disputed between 0.00 and 300.00 USD' : 'missing USD',
    );
    const next = paraphrase(partition, source);
    next.proposal.outcome = state;
    const remainder = parts(next.proposal)[2].quantity;
    qualify(remainder, state);
    if (state === 'disputed') remainder.alternatives = [money(0), money(30000)];
    const scene = positive20(next.proposal, next.words, next.window);
    expect(scene.parts[2].quantity.state).toBe(state);
    expect(scene.parts[2].quantity).not.toHaveProperty('amount');
    expect(scene).not.toHaveProperty('derived');
  });
  it('accepts a remainder value only when the source explicitly supplies it', () => {
    const source = clauses(partition);
    source[4] = source[4].replace('unknown USD', '300.00 USD');
    const next = paraphrase(partition, source);
    next.proposal.outcome = '300.00';
    const remainder = parts(next.proposal)[2].quantity;
    remainder.state = 'known';
    delete remainder.qualifier;
    remainder.amount = money(30000);
    const scene = positive20(next.proposal, next.words, next.window);
    expect(scene.parts[2].quantity).toMatchObject({
      state: 'known',
      amount: { kind: 'money', value: { minorUnits: 30000, currency: 'USD' } },
    });
    expect(scene).not.toHaveProperty('derived');
  });
  it('rejects inconsistent fully known parts rather than fabricating a new missing part', () => {
    const source = clauses(partition);
    source[4] = source[4].replace('unknown USD', '0.00 USD');
    const next = paraphrase(partition, source);
    next.proposal.outcome = '0.00';
    const remainder = parts(next.proposal)[2].quantity;
    remainder.state = 'known';
    delete remainder.qualifier;
    remainder.amount = money(0);
    const result = parse('20', next.proposal, next.words, next.window);
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.length).toBeGreaterThan(0);
  });
  it('retains an explicitly unknown total without replacing it with known parts or zero', () => {
    const source = clauses(partition);
    source[1] = source[1].replace('1000.00 USD', 'unknown USD');
    const next = paraphrase(partition, source);
    qualify(next.proposal.total as Rec, 'unknown');
    const scene = positive20(next.proposal, next.words, next.window);
    expect(scene.total.state).toBe('unknown');
    expect(scene.total).not.toHaveProperty('amount');
    expect(scene.parts[0].quantity.state).toBe('known');
    expect(scene).not.toHaveProperty('derived');
  });
});
