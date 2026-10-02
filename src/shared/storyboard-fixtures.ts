/** Authored local transcript, not a claim about observed model output. Verification only. */
import type { StoryboardSourceSpec } from './storyboards';
import type { WordTimestamp } from './types';

export function storyboardDefinitionFixture(): {
  words: WordTimestamp[];
  duration: number;
  spec: StoryboardSourceSpec;
} {
  const text =
    'A storyboard keeps related ideas on one canvas while the camera moves between panels';
  const words = text
    .split(' ')
    .map((word, index) => ({ text: word, start: 0.5 + index * 0.5, end: 0.9 + index * 0.5 }));
  const endWord = words.length - 1;
  return {
    words,
    duration: 9,
    spec: {
      kind: 'storyboard',
      specVersion: 1,
      startWord: 0,
      endWord,
      subject: { text: 'storyboard', startWord: 1, endWord: 1 },
      panels: [
        {
          id: 'definition',
          kind: 'statement',
          startWord: 0,
          endWord,
          title: { text: 'A storyboard', startWord: 0, endWord: 1 },
          body: { text: 'keeps related ideas on one canvas', startWord: 2, endWord: 7 },
          revealWord: 0,
          moveWord: 0,
        },
      ],
    },
  };
}
