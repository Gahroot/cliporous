import { describe, expect, it } from 'vitest';
import { expansionFixtureSpeech } from './expansion-fixture-words';

const clauses = [
  'Ledger names Claim.',
  'Ledger references Excerpt.',
  'Excerpt supports Claim.',
  'References preserve source scope.',
  'Provenance remains a reference rather than a proof of truth.',
];
describe('raw expansion fixture speech, not planner fact synthesis', () => {
  it('retains complete source spans, original words and production speech padding', () => {
    const speech = expansionFixtureSpeech(clauses);
    expect(speech.sourceText).toBe(clauses.join(' '));
    expect(speech.words.map((word) => word.text).join(' ')).toBe(speech.sourceText);
    expect(speech.words[0].start).toBe(0.25);
    expect(speech.words.at(-1)?.end).toBe(9.65);
    for (const [index, span] of speech.spans.entries())
      expect(
        speech.words
          .slice(span.fromWord, span.toWord + 1)
          .map((word) => word.text)
          .join(' '),
      ).toBe(clauses[index]);
    expect(speech.window).toEqual({
      startWord: 0,
      endWord: speech.words.length - 1,
      startTime: 0,
      endTime: 10,
    });
    expect(expansionFixtureSpeech(clauses)).toEqual(speech);
  });
  it('refuses incomplete/unbounded clauses and unsupported durations', () => {
    for (const invalid of [
      clauses.slice(0, 4),
      [...clauses, 'Incomplete'],
      [...clauses, ' Untrimmed.'],
      [...clauses, `${'word '.repeat(65)}end.`],
      Array.from({ length: 33 }, () => 'Over limit.'),
    ])
      expect(() => expansionFixtureSpeech(invalid)).toThrow();
    for (const duration of [4.9, 12.1, NaN, Infinity])
      expect(() => expansionFixtureSpeech(clauses, duration)).toThrow();
  });
});
