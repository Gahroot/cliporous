import { longformSourceFingerprint, type SceneFirstLongformPlan } from '@shared/longform-scenes';
import type { WordTimestamp } from '@shared/types';

export const QA_SCENE_DURATION = 20;
export const QA_SCENE_WORDS: WordTimestamp[] =
  'Save the source then review the scene plan and export the approved result Review evidence before making changes and exporting'
    .split(' ')
    .map((text, index) => ({ text, start: index + 0.125, end: index + 0.875 }));

/** Explicitly synthetic, source-grounded fixtures; never returned by the real planner. */
export function createQaScenePlan(): SceneFirstLongformPlan {
  return {
    schemaVersion: 2,
    parserVersion: 1,
    mode: 'scene-first',
    sourceFingerprint: longformSourceFingerprint(QA_SCENE_WORDS, QA_SCENE_DURATION),
    sourceDuration: QA_SCENE_DURATION,
    phrases: [],
    blocks: [],
    cards: [],
    reasoning: 'Local synthetic workflow fixture. No AI or production media.',
    generatedAt: 1_790_812_800_000,
    sections: [
      {
        id: 'qa-scene-section',
        startWord: 0,
        endWord: QA_SCENE_WORDS.length - 1,
        startTime: 0,
        endTime: QA_SCENE_DURATION,
        status: 'planned',
        diagnostics: [],
      },
    ],
    scenes: [4, 9, 14].map((startWord, index) => {
      const endWord = startWord + 1;
      const text = QA_SCENE_WORDS.slice(startWord, endWord + 1)
        .map((word) => word.text)
        .join(' ');
      return {
        id: `scene-statement-${startWord}-${endWord}`,
        kind: 'statement',
        sectionId: 'qa-scene-section',
        startWord,
        endWord,
        startTime: startWord - 0.125,
        endTime: endWord + 1.225,
        label: text,
        purpose: 'Local fixture for source-grounded review and recovery.',
        presentation: 'speaker-side',
        omitted: index === 2,
        sourceSpec: { kind: 'statement', startWord, endWord, text },
      };
    }),
  };
}
