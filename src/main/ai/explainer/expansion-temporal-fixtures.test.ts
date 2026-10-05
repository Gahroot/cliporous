import { describe, expect, it } from 'vitest';
import { expansionFixtureSpeech } from './expansion-fixture-words';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { isRec } from './kind-spec';

function seed(): TemporalFixtureSeed {
  const speech = expansionFixtureSpeech([
    'Aster lists the task.',
    'Aster starts the task.',
    'Aster records the response.',
    'Aster checks the task.',
    'Aster retains an unknown result.',
  ]);
  return {
    id: '41',
    ...speech,
    proposal: {
      kind: 'temporal-structure',
      preset: 'parallel-lanes',
      visualMode: 'diagram',
      startWord: 0,
      endWord: speech.words.length - 1,
      setupWord: speech.spans[0].fromWord,
      actionWord: speech.spans[1].fromWord,
      responseWord: speech.spans[2].fromWord,
      checkWord: speech.spans[3].fromWord,
      resolveWord: speech.spans[4].fromWord,
      result: { actor: 'Aster', evidence: speech.spans[4] },
      records: [{ label: 'Task' }],
    },
    negatives: [],
  };
}

describe('authored temporal fixture materialization, not a production fact generator', () => {
  it('materializes both explicit patch formats without modifying the raw seed', () => {
    const source = seed();
    const packet = {
      ...source,
      negatives: [
        { name: 'dot path', path: 'result.actor', value: 'Beacon' },
        { name: 'path segments', edits: [{ path: ['records', 0, 'label'], value: 'Other' }] },
        { name: 'omit field', edits: [{ path: ['result'], remove: true }] },
      ],
    };
    const before = structuredClone(packet);
    const [fixture] = temporalSourceFixtures([packet]);
    const originalResult = source.proposal.result;
    if (!isRec(originalResult)) throw new Error('Fixture requires a source-bound result');
    expect(fixture.negatives[0].proposal.result).toEqual({ ...originalResult, actor: 'Beacon' });
    expect(fixture.negatives[1].proposal.records).toEqual([{ label: 'Other' }]);
    expect(fixture.negatives[2].proposal).not.toHaveProperty('result');
    expect(fixture.proposal).toEqual(source.proposal);
    expect(packet).toEqual(before);
  });
  it('source replacements retain exact original clause intervals and remap every evidence/beat/window index', () => {
    const source = seed();
    const [fixture] = temporalSourceFixtures([
      {
        ...source,
        negatives: [
          {
            name: 'rewritten setup',
            edits: [],
            clauses: { '0': 'Aster explicitly lists this same task now.' },
          },
        ],
      },
    ]);
    const negative = fixture.negatives[0];
    const added = 3;
    expect(negative.words?.map((word) => word.text).join(' ')).toBe(negative.sourceText);
    expect(negative.sourceText).toContain('Aster explicitly lists this same task now.');
    expect(negative.proposal.actionWord).toBe(Number(source.proposal.actionWord) + added);
    expect(negative.proposal.resolveWord).toBe(Number(source.proposal.resolveWord) + added);
    expect(negative.proposal.endWord).toBe(source.window.endWord + added);
    expect(negative.words?.[0].start).toBe(source.words[0].start);
    expect(negative.words?.[Number(negative.proposal.actionWord)].start).toBe(
      source.words[Number(source.proposal.actionWord)].start,
    );
    expect(negative.words?.at(-1)?.end).toBe(source.words.at(-1)?.end);
    expect(negative.window).toEqual({ ...source.window, endWord: source.window.endWord + added });
    expect(negative.proposal.result).toEqual({
      actor: 'Aster',
      evidence: {
        fromWord: Number(source.proposal.resolveWord) + added,
        toWord: source.window.endWord + added,
      },
    });
  });
  it('applies source-word and whole-window patches rather than accidentally ignoring them', () => {
    const source = seed();
    const replacement = { ...source.window, endTime: 13 };
    const [fixture] = temporalSourceFixtures([
      {
        ...source,
        negatives: [
          {
            name: 'zero interval',
            edits: [{ path: ['words', 0, 'end'], value: source.words[0].start }],
          },
          { name: 'whole window', edits: [{ path: ['window'], value: replacement }] },
        ],
      },
    ]);
    expect(fixture.negatives[0].words?.[0].end).toBe(source.words[0].start);
    expect(fixture.negatives[1].window).toEqual(replacement);
    expect(source.window.endTime).toBe(10);
    expect(source.words[0].end).toBeGreaterThan(source.words[0].start);
  });
  for (const path of [
    [],
    ['__proto__', 'polluted'],
    ['constructor', 'prototype'],
    ['records', -1, 'label'],
    ['records', 10, 'label'],
    ['missing', 'parent'],
    ['records', 0, 'label', 'nested'],
  ])
    it(`rejects an invalid or inherited patch path ${JSON.stringify(path)}`, () => {
      const source = seed();
      expect(() =>
        temporalSourceFixtures([
          { ...source, negatives: [{ name: 'invalid', edits: [{ path, value: 'not a fact' }] }] },
        ]),
      ).toThrow();
      expect(source.proposal.records).toEqual([{ label: 'Task' }]);
    });
});
