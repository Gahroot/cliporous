import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { isDerivationAllowed } from '../../remotion/compositions/explainer/expansion/value-logic';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionCalendarSeasonality,
  parseExpansionRankChange,
} from './expansion-quantities-ranking-calendar-contract';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/quantities/ranking-calendar.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected authored record');
  return value;
}
function rows(value: unknown): Rec[] {
  if (!Array.isArray(value)) throw new Error('Expected authored records');
  return value.map(rec);
}
function fixture(id: '21' | '22'): ExpansionSourceFixture {
  const found = packet.stories.find((story) => story.id === id);
  if (!found) throw new Error(`Missing fixture ${id}`);
  return found;
}
function clauses(story: ExpansionSourceFixture): string[] {
  const result: string[] = [];
  let start = 0;
  story.words.forEach((word, index) => {
    if (/[.!?;]["'”’\])]*$/.test(word.text)) {
      result.push(
        story.words
          .slice(start, index + 1)
          .map((entry) => entry.text)
          .join(' '),
      );
      start = index + 1;
    }
  });
  if (start !== story.words.length) throw new Error('Source clauses must be complete');
  return result;
}
function rewrite(id: '21' | '22', text: string[], mapping?: number[]): ExpansionSourceFixture {
  const original = fixture(id),
    prior = expansionFixtureSpeech(clauses(original), 10),
    speech = expansionFixtureSpeech(text, 10);
  function rebase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rebase);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const index = prior.spans.findIndex(
        (span) => span.fromWord === value.fromWord && span.toWord === value.toWord,
      );
      if (index < 0) throw new Error('Evidence must remain a complete source clause');
      return { ...speech.spans[mapping?.[index] ?? index] };
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rebase(entry)]));
  }
  const proposal = rec(rebase(original.proposal));
  proposal.endWord = speech.window.endWord;
  BEATS.forEach((field) => {
    const index = prior.spans.findIndex((span) => span.fromWord === original.proposal[field]);
    if (index < 0) throw new Error('Beat must start a clause');
    proposal[field] = speech.spans[mapping?.[index] ?? index].fromWord;
  });
  return {
    id,
    sourceText: speech.sourceText,
    words: speech.words,
    window: speech.window,
    proposal,
    negatives: [],
  };
}
function parse(story: ExpansionSourceFixture, proposal = story.proposal) {
  const ctx = makeParseContext(story.words, story.window);
  return {
    ctx,
    scene:
      story.id === '21'
        ? parseExpansionRankChange(proposal, ctx)
        : parseExpansionCalendarSeasonality(proposal, ctx),
  };
}
function rank(story: ExpansionSourceFixture) {
  const ctx = makeParseContext(story.words, story.window),
    scene = parseExpansionRankChange(story.proposal, ctx);
  expect(ctx.issues).toEqual([]);
  if (!scene) throw new Error('Expected real ranking parse');
  return scene;
}
function calendar(story: ExpansionSourceFixture) {
  const ctx = makeParseContext(story.words, story.window),
    scene = parseExpansionCalendarSeasonality(story.proposal, ctx);
  expect(ctx.issues).toEqual([]);
  if (!scene) throw new Error('Expected real calendar parse');
  return scene;
}
function modes(story: ExpansionSourceFixture): void {
  const d = parse(story, { ...story.proposal, visualMode: 'diagram' }),
    h = parse(story, { ...story.proposal, visualMode: 'hybrid' });
  expect(d.ctx.issues).toEqual([]);
  expect(h.ctx.issues).toEqual([]);
  expect(d.scene).not.toBeNull();
  expect(h.scene).toEqual({ ...d.scene, visualMode: 'hybrid' });
}
function afterAda(proposal: Rec): Rec {
  return rows(rows(proposal.states)[1].records)[0];
}

describe('expansion quantities ranking and calendar production source contracts', () => {
  it('reads approved persisted stories with concrete padded speech and explicit raw negatives', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('quantities');
    expect(packet.stories.map((story) => story.id)).toEqual(['21', '22']);
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
      expect(story.negatives.length).toBeGreaterThanOrEqual(20);
      expect(new Set(story.negatives.map((entry) => entry.name)).size).toBe(story.negatives.length);
    }
  });
  for (const story of packet.stories) {
    describe(`story ${story.id}`, () => {
      it('preserves facts, identities, qualifications and source times across modes, repeats and portrait layouts', () => {
        const before = structuredClone(story);
        modes(story);
        const scene = parse(story).scene;
        if (!scene) throw new Error('Expected complete scene');
        expect(scene.entities.map((entry) => entry.id)).toEqual(
          scene.entities.map((_, index) => expansionEntityId(story.id, index)),
        );
        expect(parse(story).scene).toEqual(scene);
        expect(parse(story).scene).toEqual(scene);
        expect(parse(story, { ...story.proposal, layout: 'stack-flipped' }).scene).toEqual(scene);
        expect(TIMES.map((field) => scene[field])).toEqual(
          BEATS.map((field, index) =>
            index === 0 ? 0.3 : story.words[Number(story.proposal[field])].start,
          ),
        );
        expect(scene.resolveAt).toBeLessThanOrEqual(9.2);
        expect(scene).not.toHaveProperty('winner');
        expect(scene).not.toHaveProperty('derived');
        expect(story).toEqual(before);
      });
      it.each(
        story.negatives,
      )('rejects $name with source diagnostics in both modes', (negative) => {
        const variant = {
          ...story,
          words: negative.words ?? story.words,
          window: negative.window ?? story.window,
          sourceText: negative.sourceText ?? story.sourceText,
        };
        expect(variant.words.map((word) => word.text).join(' ')).toBe(variant.sourceText);
        for (const mode of ['diagram', 'hybrid']) {
          const proposal = structuredClone(negative.proposal);
          if (proposal.visualMode === 'diagram' || proposal.visualMode === 'hybrid')
            proposal.visualMode = mode;
          const result = parse(variant, proposal);
          expect(result.scene, negative.name).toBeNull();
          expect(result.ctx.issues.length, negative.name).toBeGreaterThan(0);
        }
      });
    });
  }
  it('21 retains actual period changes and supplied ranks without sorting options or inventing winners', () => {
    const scene = rank(fixture('21'));
    expect(scene.criterion).toBe('service');
    expect(scene.states.map((state) => state.period)).toEqual(['April', 'May']);
    expect(scene.states.map((state) => state.records.map((entry) => entry.rank))).toEqual([
      [2, 1],
      [1, 2],
    ]);
    expect(scene.states.map((state) => state.records.map((entry) => entry.actorId))).toEqual([
      scene.entities.map((entry) => entry.id),
      scene.entities.map((entry) => entry.id),
    ]);
    expect(
      scene.states.flatMap((state) => state.records.map((entry) => entry.quantity.basis.period)),
    ).toEqual(['April', 'April', 'May', 'May']);
    expect(scene.states.flatMap((state) => state.records.map((entry) => entry.id))).toEqual(
      [8, 9, 10, 11].map((index) => expansionEntityId('21', index)),
    );
    expect(isDerivationAllowed('21', 'difference')).toBe(false);
  });
  it('21 accepts realistic separately worded quantities, comparison and result', () => {
    const story = rewrite('21', [
      'Ada and Bea compare service ranks for the supplied April and May states.',
      'During April, Ada reported service rank as 2 count among tested tasks with denominator 2.',
      'During April, Bea recorded service rank at 1 count among tested tasks with denominator 2.',
      'During May, Ada reported service rank as 1 count among tested tasks with denominator 2.',
      'During May, Bea recorded service rank at 2 count among tested tasks with denominator 2.',
      'From April to May, Ada and Bea have comparable service ranks with the same unit, population and denominator.',
      'The supplied states retain service ranks for Ada and Bea.',
    ]);
    story.proposal.outcome = 'retain service ranks';
    const scene = rank(story);
    expect(scene.states.map((state) => state.records.map((entry) => entry.rank))).toEqual([
      [2, 1],
      [1, 2],
    ]);
    modes(story);
  });
  it('21 keeps supplied ties as duplicate ranks instead of selecting a winner', () => {
    const text = clauses(fixture('21'));
    text[4] = text[4].replace('is 2 count', 'is 1 count');
    const story = rewrite('21', text);
    const bea = rows(rows(story.proposal.states)[1].records)[1];
    rec(rec(bea.quantity).amount).value = { numerator: 1, denominator: 1 };
    bea.rank = 1;
    expect(rank(story).states[1].records.map((entry) => entry.rank)).toEqual([1, 1]);
    modes(story);
  });
  it('21 retains source-unranked identity and unknown quantity without rank zero', () => {
    const text = clauses(fixture('21'));
    text[3] = text[3].replace('is 1 count', 'is unknown count');
    text.splice(4, 0, 'Ada is unranked for service in May among tested tasks.');
    const story = rewrite('21', text, [0, 1, 2, 3, 5, 6, 7]);
    const entry = afterAda(story.proposal),
      q = rec(entry.quantity);
    q.state = 'unknown';
    q.qualifier = 'unknown';
    delete q.amount;
    delete entry.rank;
    entry.unrankedEvidence = expansionFixtureSpeech(text, 10).spans[4];
    const scene = rank(story);
    expect(scene.states[1].records[0].quantity.state).toBe('unknown');
    expect(scene.states[1].records[0].unrankedEvidence).toEqual(entry.unrankedEvidence);
    expect(scene.states[1].records[0]).not.toHaveProperty('rank');
    modes(story);
  });
  it.each([
    'missing',
    'unknown',
    'disputed',
    'conditional',
    'simulated',
    'illustrative',
  ] as const)('21 preserves %s ranks and qualification without adjudicating alternatives', (state) => {
    const text = clauses(fixture('21')),
      ordinary = text[3],
      storyState = state === 'simulated' || state === 'illustrative';
    let condition: string | undefined;
    if (state === 'missing' || state === 'unknown')
      text[3] = ordinary.replace('is 1 count', `is ${state} count`);
    else if (state === 'disputed')
      text[3] = ordinary.replace('is 1 count', 'is disputed between 1 and 2 count');
    else if (state === 'conditional') {
      condition = 'If approval is granted';
      text[3] = `${condition}, ${ordinary}`;
    } else
      text[3] = `In this ${state === 'simulated' ? 'simulation' : 'teaching example'}, ${ordinary}`;
    const story = rewrite('21', text),
      entry = afterAda(story.proposal),
      q = rec(entry.quantity);
    q.state = state;
    if (state === 'missing' || state === 'unknown') {
      delete q.amount;
      delete entry.rank;
      q.qualifier = state;
    } else if (state === 'disputed') {
      delete q.amount;
      delete entry.rank;
      q.qualifier = state;
      q.alternatives = [1, 2].map((numerator) => ({
        kind: 'rational',
        value: { numerator, denominator: 1 },
      }));
    } else if (condition) {
      q.condition = condition;
      story.proposal.condition = condition;
    } else {
      q.qualifier = state === 'simulated' ? 'simulation' : 'teaching example';
    }
    if (storyState) story.proposal.evidence = 'illustrative';
    const scene = rank(story);
    expect(scene.states[1].records[0].quantity.state).toBe(state);
    if (state === 'missing' || state === 'unknown' || state === 'disputed')
      expect(scene.states[1].records[0]).not.toHaveProperty('rank');
    expect(scene).not.toHaveProperty('winner');
    modes(story);
  });
  it('22 retains original month/year, precision, denominators and unknown observations without recurrence', () => {
    const scene = calendar(fixture('22'));
    expect(scene.records.map((entry) => entry.calendar)).toEqual([
      { year: 2025, month: 1 },
      { year: 2025, month: 2 },
    ]);
    expect(scene.records.map((entry) => entry.quantity.basis.period)).toEqual([
      'January 2025',
      'February 2025',
    ]);
    expect(scene.records[0].quantity).toMatchObject({
      state: 'known',
      amount: { kind: 'rational', value: { numerator: 100, denominator: 1 }, notation: '100.00' },
    });
    expect(scene.records[1].quantity).toMatchObject({ state: 'unknown', qualifier: 'unknown' });
    expect(scene.records[1].quantity).not.toHaveProperty('amount');
    expect(scene.records.map((entry) => entry.id)).toEqual(
      [8, 9].map((index) => expansionEntityId('22', index)),
    );
    expect(scene.relations[0]).toMatchObject({
      fromId: scene.records[0].id,
      toId: scene.records[1].id,
      role: 'before',
    });
    expect(isDerivationAllowed('22', 'ratio')).toBe(false);
    for (const entry of scene.records) {
      expect(entry).not.toHaveProperty('at');
      expect(entry.calendar).not.toHaveProperty('startAt');
    }
  });
  it('22 accepts real paraphrases without replacing calendar facts with motion times', () => {
    const story = rewrite('22', [
      'Clinic calendar records keep the actual January 2025 and February 2025 visits separately supplied.',
      'During January 2025, Clinic reported visits as 100.00 count among patient visits with denominator 200.',
      'During February 2025, Clinic observed visits of unknown count among patient visits with denominator 200.',
      'In calendar order, Clinic visits in January 2025 comes before Clinic visits in February 2025.',
      'The supplied calendar data stays limited to Clinic visits in January 2025 and Clinic visits in February 2025.',
    ]);
    story.proposal.outcome = 'stays limited';
    const scene = calendar(story);
    expect(scene.records.map((entry) => entry.calendar)).toEqual([
      { year: 2025, month: 1 },
      { year: 2025, month: 2 },
    ]);
    modes(story);
  });
  it('22 shifts only animation times when source timestamps move, never represented calendar data', () => {
    const base = fixture('22'),
      initial = calendar(base),
      shifted = {
        ...base,
        words: base.words.map((word) => ({ ...word, start: word.start + 10, end: word.end + 10 })),
        window: { ...base.window, startTime: 10, endTime: 20 },
      };
    const scene = calendar(shifted);
    expect(scene.records).toEqual(initial.records);
    TIMES.forEach((field) => {
      expect(scene[field]).toBeCloseTo(initial[field] + 10, 8);
    });
  });
  it.each([
    'known',
    'missing',
    'unknown',
    'disputed',
    'conditional',
    'simulated',
    'illustrative',
  ] as const)('22 preserves supplied %s calendar values, not interpolated values', (state) => {
    const text = clauses(fixture('22'));
    let condition: string | undefined;
    const ordinary = text[2].replace('is unknown count', 'is 75.00 count');
    if (state === 'known') text[2] = ordinary;
    else if (state === 'missing' || state === 'unknown')
      text[2] = text[2].replace('is unknown count', `is ${state} count`);
    else if (state === 'disputed')
      text[2] = text[2].replace('is unknown count', 'is disputed between 75.00 and 80.00 count');
    else if (state === 'conditional') {
      condition = 'If approval is granted';
      text[2] = `${condition}, ${ordinary}`;
    } else
      text[2] = `In this ${state === 'simulated' ? 'simulation' : 'teaching example'}, ${ordinary}`;
    const story = rewrite('22', text),
      q = rec(rows(story.proposal.records)[1].quantity);
    q.state = state;
    if (
      state === 'known' ||
      state === 'conditional' ||
      state === 'simulated' ||
      state === 'illustrative'
    ) {
      q.amount = { kind: 'rational', value: { numerator: 75, denominator: 1 } };
      delete q.qualifier;
    }
    if (state === 'disputed') {
      q.qualifier = state;
      q.alternatives = [75, 80].map((numerator) => ({
        kind: 'rational',
        value: { numerator, denominator: 1 },
      }));
    }
    if (state === 'missing' || state === 'unknown') q.qualifier = state;
    if (condition) {
      q.condition = condition;
      story.proposal.condition = condition;
    }
    if (state === 'simulated' || state === 'illustrative') {
      q.qualifier = state === 'simulated' ? 'simulation' : 'teaching example';
      story.proposal.evidence = 'illustrative';
    }
    const scene = calendar(story);
    expect(scene.records[1].quantity.state).toBe(state);
    expect(scene.records[1].calendar).toEqual({ year: 2025, month: 2 });
    expect(scene).not.toHaveProperty('forecast');
    modes(story);
  });
});
