import { describe, expect, it } from 'vitest';
import type { PlannerWord } from '../explainer-scenes';
import { assertedBusinessClaim } from './concept-business-operations-contract';
import {
  expansionAssertedRelation,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { makeParseContext, type ParseContext, type Rec } from './kind-spec';

function context(text: string): ParseContext {
  const words: PlannerWord[] = text
    .split(/\s+/)
    .map((word, index) => ({ text: word, start: index * 0.1 + 0.25, end: index * 0.1 + 0.33 }));
  const win = { startWord: 0, endWord: words.length - 1, startTime: 0, endTime: 10 };
  return makeParseContext(words, win);
}
function full(ctx: ParseContext): { fromWord: number; toWord: number } {
  return { fromWord: ctx.win.startWord, toWord: ctx.win.endWord };
}
function storyFixture(): { ctx: ParseContext; raw: Rec } {
  const sentences = [
    'Report claim starts with Source.',
    'Report action cites Source.',
    'Report response stays qualified.',
    'Report check retains context.',
    'Unresolved status remains.',
  ];
  const ctx = context(sentences.join(' '));
  let index = 0;
  const starts: number[] = [];
  for (const [slot, sentence] of sentences.entries()) {
    starts.push(index);
    for (const [wordIndex] of sentence.split(' ').entries()) {
      const word = ctx.words[index + wordIndex];
      if (word) {
        word.start = 0.25 + slot * 1.7 + wordIndex * 0.1;
        word.end = word.start + 0.08;
      }
    }
    index += sentence.split(' ').length;
  }
  return {
    ctx,
    raw: {
      kind: 'retrieval-grounding',
      preset: 'trace-chain',
      visualMode: 'diagram',
      label: 'Report claim',
      subject: 'Report',
      outcome: 'Unresolved',
      evidence: 'source-stated',
      setupWord: starts[0],
      actionWord: starts[1],
      responseWord: starts[2],
      checkWord: starts[3],
      resolveWord: starts[4],
      startWord: 0,
      endWord: ctx.win.endWord,
      layout: 'stack',
    },
  };
}

describe('source evidence word timing boundaries', () => {
  for (const patch of [
    { start: NaN },
    { start: Infinity },
    { end: -Infinity },
    { start: 0 },
    { end: 0.1 },
    { start: -1 },
    { end: 8.1 },
  ])
    it(`rejects malformed interior time ${'start' in patch ? String(patch.start) : String(patch.end)}`, () => {
      const ctx = context('Ada reports a bounded value.');
      const word = ctx.words[1];
      if (!word) throw new Error('Authored evidence word required');
      Object.assign(word, patch);
      expect(expansionSourceSpan({ fromWord: 0, toWord: 4 }, ctx)).toBeNull();
      expect(ctx.issues.join(' ')).toContain('source evidence timing');
    });
  it('accepts non-overlapping evidence after a nonzero source offset', () => {
    const ctx = context('Ada reports a bounded value.');
    const offset = 20;
    const shifted = makeParseContext(
      ctx.words.map((word) => ({
        ...word,
        start: word.start + offset,
        end: word.end + offset,
      })),
      { ...ctx.win, startTime: offset, endTime: ctx.win.endTime + offset },
    );
    expect(expansionSourceSpan({ fromWord: 0, toWord: 4 }, shifted)?.text).toBe(
      'Ada reports a bounded value.',
    );
    expect(shifted.issues).toEqual([]);
  });
});

describe('bounded local source contracts', () => {
  it('preserves a complete conditional/negated clause, rather than promoting its tail to fact', () => {
    const ctx = context('If approval is missing, Report does not support Claim.');
    expect(expansionSourceSpan(full(ctx), ctx)).toEqual({
      span: full(ctx),
      text: 'If approval is missing, Report does not support Claim.',
    });
    expect(expansionSourceSpan({ fromWord: 5, toWord: ctx.win.endWord }, ctx)).toBeNull();
    expect(expansionSourceSpan({ fromWord: 0, toWord: 3 }, ctx)).toBeNull();
  });

  it('requires ordered bounded integer spans without directives or scene-boundary trimming', () => {
    const ctx = context('Source supports Claim. Other statement stays separate.');
    expect(expansionSourceSpan({ fromWord: 0, toWord: 2 }, ctx)?.text).toBe(
      'Source supports Claim.',
    );
    for (const bad of [
      { fromWord: 0, toWord: ctx.win.endWord },
      { fromWord: 2, toWord: 0 },
      { fromWord: -1, toWord: 2 },
      { fromWord: 0.5, toWord: 2 },
      { fromWord: 0, toWord: 2, url: 'source' },
    ])
      expect(expansionSourceSpan(bad, ctx)).toBeNull();
    ctx.win.startWord = 1;
    expect(expansionSourceSpan({ fromWord: 1, toWord: 2 }, ctx)).toBeNull();
    const large = context(Array.from({ length: 65 }, (_, index) => `word${index}`).join(' '));
    expect(expansionSourceSpan(full(large), large)).toBeNull();
  });

  it('does not confuse decimal punctuation, precision, signs or number fragments', () => {
    const ctx = context('Acme price is -2.50 USD for March.');
    const evidence = expansionSourceSpan(full(ctx), ctx);
    expect(evidence?.text).toBe('Acme price is -2.50 USD for March.');
    if (!evidence) throw new Error('Expected complete decimal evidence');
    expect(expansionSourceLabel('-2.50 USD', evidence, ctx, 28)).toBe('-2.50 USD');
    for (const bad of ['2.50 USD', '-2.5 USD', '50 USD', '2', '<svg>', 'https://example.test'])
      expect(expansionSourceLabel(bad, evidence, ctx, 28)).toBeNull();
  });

  it('requires labels in their own clause and rejects invented aliases', () => {
    const ctx = context('Source supports Claim. Other statement stays separate.');
    const evidence = expansionSourceSpan({ fromWord: 0, toWord: 2 }, ctx);
    if (!evidence) throw new Error('Expected local evidence');
    expect(expansionSourceLabel('Source', evidence, ctx, 28)).toBe('Source');
    expect(expansionSourceLabel('Other', evidence, ctx, 28)).toBeNull();
    expect(expansionSourceLabel('Document', evidence, ctx, 28)).toBeNull();
    expect(expansionSourceLabel('Source', evidence, ctx, 1000)).toBeNull();
  });

  it('asserts only entire authored relations, retaining explicit conditions and uncertainty', () => {
    const pattern = /Report (?:supports|backs) Claim/i;
    expect(expansionAssertedRelation('Report supports Claim.', pattern)).toBe(true);
    expect(expansionAssertedRelation('Report backs Claim.', pattern)).toBe(true);
    for (const bad of [
      'Report does not support Claim.',
      'Report might support Claim.',
      'Did Report support Claim?',
      'Report supports Claim but Other disputes it.',
      'Other says Report supports Claim.',
    ])
      expect(expansionAssertedRelation(bad, pattern)).toBe(false);
    expect(
      expansionAssertedRelation('If approval is granted, Report supports Claim.', pattern),
    ).toBe(false);
    expect(
      expansionAssertedRelation(
        'If approval is granted, Report supports Claim.',
        pattern,
        'If approval is granted',
      ),
    ).toBe(true);
    expect(
      expansionAssertedRelation(
        'Report supports Claim when approval is granted.',
        pattern,
        'when approval is granted',
      ),
    ).toBe(true);
    expect(
      expansionAssertedRelation(
        'If approval is granted, Report supports Claim.',
        pattern,
        'If approval',
      ),
    ).toBe(false);
    expect(
      expansionAssertedRelation('Report supports Claim.', pattern, 'If approval is granted'),
    ).toBe(false);
    const stateful = /Report supports Claim/gi;
    stateful.lastIndex = 5;
    expect(expansionAssertedRelation('Report supports Claim.', stateful)).toBe(true);
    expect(stateful.lastIndex).toBe(5);
  });

  it('excludes exact source-bound label slots from grammar only after an entire authored predicate matches', () => {
    const pattern = /May supports Library during May/i;
    expect(expansionAssertedRelation('May supports Library during May.', pattern)).toBe(false);
    expect(
      expansionAssertedRelation('May supports Library during May.', pattern, undefined, ['May']),
    ).toBe(true);
    for (const text of [
      'May may support Library during May.',
      'May does not support Library during May.',
      'May supports Library during May perhaps.',
      'Other says May supports Library during May.',
    ])
      expect(expansionAssertedRelation(text, pattern, undefined, ['May'])).toBe(false);
    expect(
      expansionAssertedRelation('May supports Library during May.', pattern, undefined, ['<svg>']),
    ).toBe(false);
    expect(
      expansionAssertedRelation(
        'May supports Library during May.',
        pattern,
        undefined,
        Array.from({ length: 9 }, () => 'May'),
      ),
    ).toBe(false);
  });

  it('shared resolve checks distinguish a May date from actual modal or negated grammar', () => {
    for (const text of [
      'Project A interval remains bounded during May',
      'the result is scoped in May',
      'the observation is recorded for May among residents',
    ])
      expect(assertedBusinessClaim(text)).toBe(true);
    for (const text of [
      'Project A may change during May',
      'Project A interval perhaps remains bounded during May',
      'Project A did not resolve in May',
      'the values for may improve',
      'the values may improve',
    ])
      expect(assertedBusinessClaim(text)).toBe(false);
  });

  it('grounds identities locally, generates deterministic IDs and caps named entities', () => {
    const ctx = context('Source supports Claim. Other statement stays separate.');
    const raw = [
      { label: 'Source', evidence: { fromWord: 0, toWord: 2 } },
      { label: 'Claim', evidence: { fromWord: 0, toWord: 2 } },
    ];
    expect(expansionEntities(raw, ctx, '01')?.map((entry) => entry.id)).toEqual([
      'expansion-01-entity-0',
      'expansion-01-entity-1',
    ]);
    expect(expansionEntities(raw, ctx, '01')).toEqual(expansionEntities(raw, ctx, '01'));
    for (const bad of [
      [],
      [...raw, raw[0]],
      Array.from({ length: 9 }, () => raw[0]),
      [{ ...raw[0], id: 'user-id' }],
      [{ label: 'Other', evidence: { fromWord: 0, toWord: 2 } }],
    ])
      expect(expansionEntities(bad, ctx, '01')).toBeNull();
  });

  it('accepts the exact named-actor cap without expanding anonymous populations', () => {
    const labels = Array.from({ length: 8 }, (_, index) => `Actor${index + 1}`);
    const ctx = context(`${labels.join(' ')} are named in this source.`);
    expect(
      expansionEntities(
        labels.map((label) => ({ label, evidence: full(ctx) })),
        ctx,
        '03',
      ),
    ).toHaveLength(8);
  });

  it('accepts exact recognized story envelopes in both modes with all five source beats', () => {
    const { raw, ctx } = storyFixture();
    const diagram = expansionStoryBase(raw, ctx, '01', []);
    expect(ctx.issues).toEqual([]);
    expect(diagram?.story).toMatchObject({
      storyId: '01',
      visualMode: 'diagram',
      setupAt: 0.3,
      actionAt: 1.95,
      resolveAt: 7.05,
    });
    const hybrid = expansionStoryBase({ ...raw, visualMode: 'hybrid' }, ctx, '01', []);
    expect(diagram && { ...diagram.story, visualMode: 'hybrid' }).toEqual(hybrid?.story);
    expect(diagram?.spans.resolve).toBe('Unresolved status remains.');
    expect(
      expansionStoryBase({ ...raw, continues: true, transition: 'grow' }, ctx, '01', []),
    ).toEqual(diagram);
  });

  it('requires five distinct source clauses even when all five beat times are well spaced', () => {
    const { raw, ctx } = storyFixture();
    if (typeof raw.responseWord !== 'number') throw new Error('Authored response beat is required');
    const previous = ctx.words[raw.responseWord - 1];
    if (!previous) throw new Error('Authored action clause is required');
    previous.text = previous.text.replace(/\.$/, '');
    expect(expansionStoryBase(raw, ctx, '01', [])).toBeNull();
    expect(ctx.issues.join(' ')).toContain('five distinct complete source clauses');
  });

  it('fails closed on preset/mode/treatment/directives, unsupported compact layouts and invalid beats', () => {
    for (const change of [
      { preset: 'missing-evidence-map' },
      { preset: undefined },
      { kind: 'statement' },
      { visualMode: '3d' },
      { treatment: 'evidence-constellation' },
      { svg: '<svg/>' },
      { layout: 'takeover' },
      { layout: 'pip' },
      { endWord: 4 },
      { actionWord: 0 },
      { responseWord: Number.NaN },
      { outcome: 'Claim' },
    ]) {
      const { raw, ctx } = storyFixture();
      expect(expansionStoryBase({ ...raw, ...change }, ctx, '01', [])).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
    for (const duration of [4.9, 12.1, Number.POSITIVE_INFINITY]) {
      const { raw, ctx } = storyFixture();
      ctx.win.endTime = duration;
      expect(expansionStoryBase(raw, ctx, '01', [])).toBeNull();
    }
    const { raw, ctx } = storyFixture();
    ctx.win.endTime = 7.3;
    expect(expansionStoryBase(raw, ctx, '01', [])).toBeNull();
  });
});
