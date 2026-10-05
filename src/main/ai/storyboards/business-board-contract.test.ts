import { describe, expect, it } from 'vitest';
import {
  compactBusinessSourceChoices,
  expandBusinessSourceChoices,
} from '../../../shared/business-source-choices';
import { storyboardSourceInputBudget } from '../../../shared/storyboards';
import { businessSourceFixtures } from '../../remotion/compositions/explainer/business/source-fixtures';
import { compileStoryboardSpec } from './compiler';

function envelope(source: ReturnType<typeof businessSourceFixtures>[number]) {
  const compact = compactBusinessSourceChoices(source.raw);
  if (!compact.ok) throw new Error(compact.message);
  const restored = expandBusinessSourceChoices(compact.choices);
  if (!restored.ok) throw new Error(restored.message);
  expect(restored.choices).toEqual(source.raw);
  const last = source.words.length - 1;
  const title = { text: source.words[0].text, startWord: 0, endWord: 0 };
  return {
    kind: 'storyboard',
    specVersion: 2,
    startWord: 0,
    endWord: last,
    subject: title,
    panels: [
      {
        kind: 'explanation',
        id: 'business',
        startWord: 0,
        endWord: last,
        revealWord: 0,
        moveWord: 0,
        title,
        explanation: {
          sourceVersion: 2,
          recipe: source.id,
          sourceChoices: compact.choices,
          identityLinks: [],
        },
      },
    ],
  };
}

describe('actual business sources in whole-board persistence', () => {
  it('executes the unchanged whole-board boundary for every native source mode', () => {
    const fixtures = businessSourceFixtures();
    expect(fixtures).toHaveLength(152);
    const rejected = fixtures.filter((source) => !storyboardSourceInputBudget(envelope(source)));
    const maxDepth = (value: unknown): number =>
      value && typeof value === 'object'
        ? Math.max(0, ...Object.values(value).map((child) => 1 + maxDepth(child)))
        : 0;
    for (const source of fixtures) expect(maxDepth(envelope(source))).toBeLessThanOrEqual(8);
    expect(rejected.map((source) => source.fixtureId)).toEqual([]);
  });
  it('reconstructs a concrete source into complete authored board elements', () => {
    const source = businessSourceFixtures().find(
      (fixture) => fixture.id === 'OP-01' && fixture.visualMode === 'diagram',
    );
    if (!source) throw new Error('Missing real source fixture');
    const lastWord = source.words.at(-1);
    if (!lastWord) throw new Error('Missing source words');
    const words = [
      ...source.words,
      { text: 'Context', start: lastWord.end + 12, end: lastWord.end + 12.3 },
    ];
    const spec = envelope({ ...source, words });
    const before = JSON.stringify(spec);
    const result = compileStoryboardSpec(spec, words, { clipStart: 0, clipEnd: 90 });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.board.businessPanels).toHaveLength(1);
    expect(result.value.board.businessPanels?.[0].scene.kind).toBe('task-map');
    expect(
      result.value.board.elements.some(
        (element) => element.kind === 'text' && element.text.includes('Outcome:'),
      ),
    ).toBe(true);
    expect(JSON.stringify(spec)).toBe(before);
  });
});
