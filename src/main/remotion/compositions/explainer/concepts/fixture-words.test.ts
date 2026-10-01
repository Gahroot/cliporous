import { describe, expect, it } from 'vitest';
import { CONCEPT_FIXTURE_PADDING, conceptFixtureWords } from './fixture-words';

describe('concept fixture source timing', () => {
  it.each([
    5, 8, 11.2, 11.4, 11.8, 12,
  ])('recovers the complete %s-second production window', (duration) => {
    const words = conceptFixtureWords(
      'One stated source claim has a readable final hold.',
      duration,
    );
    expect(words[0].start - CONCEPT_FIXTURE_PADDING.leadInSec).toBeCloseTo(0, 9);
    expect(words[words.length - 1].end + CONCEPT_FIXTURE_PADDING.tailSec).toBeCloseTo(duration, 9);
    for (const [index, word] of words.entries()) {
      expect(word.start).toBeLessThan(word.end);
      if (index > 0) expect(word.start).toBe(words[index - 1].end);
    }
    expect(
      conceptFixtureWords('One stated source claim has a readable final hold.', duration),
    ).toEqual(words);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    4.9,
    12.1,
  ])('rejects an invalid %s-second duration', (duration) => {
    expect(() => conceptFixtureWords('A bounded source.', duration)).toThrow();
  });

  it('rejects empty or excessive sources without changing source token identities', () => {
    expect(() => conceptFixtureWords('  ', 8)).toThrow();
    expect(() => conceptFixtureWords('word '.repeat(1001), 8)).toThrow();
    expect(conceptFixtureWords(' One\n two\t three. ', 8).map((word) => word.text)).toEqual([
      'One',
      'two',
      'three.',
    ]);
  });
});
