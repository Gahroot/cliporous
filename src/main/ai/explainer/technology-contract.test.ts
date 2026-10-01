import { describe, expect, it } from 'vitest';
import { makeParseContext } from './kind-spec';
import {
  technologyClause,
  technologyEvidence,
  technologyPhrase,
  technologyStory,
} from './technology-contract';

function fixture(
  text = 'The task begins. The tool runs. The result returns. The check passes. The task completes.',
) {
  const words = text
    .split(' ')
    .map((word, index) => ({ text: word, start: 10 + index * 0.45, end: 10 + index * 0.45 + 0.4 }));
  const ctx = makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 10,
    endTime: 20,
  });
  const raw = {
    label: 'task',
    subject: 'task',
    outcome: 'task completes',
    setupWord: 0,
    actionWord: 3,
    responseWord: 6,
    checkWord: 9,
    resolveWord: 12,
  };
  return { words, ctx, raw };
}

describe('technology source and timing contract', () => {
  it('preserves absolute beats and bounded contiguous facts', () => {
    const { ctx, raw } = fixture();
    expect(technologyStory(raw, ctx)).toMatchObject({
      subject: 'task',
      actionAt: 11.35,
      responseAt: 12.7,
      checkAt: 14.05,
      resolveAt: 15.4,
    });
    expect(technologyPhrase('check passes', ctx, 22)).toBe('check passes');
    expect(technologyPhrase('tool completes', ctx, 22)).toBeNull();
    expect(technologyPhrase('99% faster', ctx, 22)).toBeNull();
  });

  it.each([
    { setupWord: -1 },
    { responseWord: Number.NaN },
    { responseWord: 8.5 },
    { checkWord: 999 },
    { responseWord: 4 },
    { responseWord: 5 },
    { outcome: 'task never completes' },
    { subject: 'invented agent' },
    { label: 'x'.repeat(33) },
    { condition: 'If approved' },
  ])('rejects invalid bounds/source: %j', (patch) => {
    const { ctx, raw } = fixture();
    expect(technologyStory({ ...raw, ...patch }, ctx)).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });

  it('rejects non-finite source times and missing final holds, not just invalid indices', () => {
    const { words, raw } = fixture();
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, 25]) {
      const changed = words.map((word, index) =>
        index === 6 ? { ...word, start: invalid } : word,
      );
      const ctx = makeParseContext(changed, {
        startWord: 0,
        endWord: words.length - 1,
        startTime: 10,
        endTime: 20,
      });
      expect(technologyStory(raw, ctx)).toBeNull();
    }
    const ctx = makeParseContext(words, {
      startWord: 0,
      endWord: words.length - 1,
      startTime: 10,
      endTime: 15.8,
    });
    expect(technologyStory(raw, ctx)).toBeNull();
  });

  it('does not conflate an earlier failed tool with a later successful check', () => {
    const { ctx } = fixture('The tool failed. A retry returned evidence. The check passed.');
    expect(technologyClause(ctx, 1)).toBe('The tool failed.');
    expect(technologyClause(ctx, 8)).toBe('The check passed.');
    expect(technologyEvidence(ctx, -1, 2)).toBe('');
    expect(technologyEvidence(ctx, 5, 2)).toBe('');
  });

  it('requires the complete condition rather than laundering a hypothetical result', () => {
    const { ctx, raw } = fixture(
      'If the tool passes, the task begins. The tool runs. The result returns. The check passes. The task completes.',
    );
    const adjusted = { ...raw, actionWord: 7, responseWord: 10, checkWord: 13, resolveWord: 16 };
    // Give the last source beat its full readable hold, still under the 12-second cap.
    const conditionalCtx = makeParseContext(ctx.words, { ...ctx.win, endTime: 21 });
    expect(technologyStory(adjusted, conditionalCtx)).toBeNull();
    expect(technologyStory({ ...adjusted, condition: 'If the tool' }, conditionalCtx)).toBeNull();
    expect(
      technologyStory({ ...adjusted, condition: 'If the tool passes' }, conditionalCtx),
    ).toMatchObject({ condition: 'If the tool passes' });
  });
});
