import { longformSourceFingerprint, type SceneFirstLongformPlan } from '@shared/longform-scenes';
import type { WordTimestamp } from '@shared/types';

export const SCENE_WORDS: WordTimestamp[] = [
  { text: 'Build', start: 4, end: 4.4 },
  { text: 'trust', start: 4.5, end: 5 },
  { text: 'with', start: 5.1, end: 5.4 },
  { text: 'evidence', start: 5.5, end: 6.2 },
  { text: 'Show', start: 100, end: 100.5 },
  { text: 'the', start: 100.6, end: 100.8 },
  { text: 'evidence', start: 100.9, end: 101.5 },
];

export function makeScenePlan(
  words: WordTimestamp[] = SCENE_WORDS,
  duration = 150,
): SceneFirstLongformPlan {
  return {
    schemaVersion: 2,
    parserVersion: 1,
    mode: 'scene-first',
    sourceFingerprint: longformSourceFingerprint(words, duration),
    sourceDuration: duration,
    phrases: [],
    blocks: [],
    cards: [],
    reasoning: 'Explain the source, not generic text cards.',
    generatedAt: 100,
    scenes: [
      {
        id: 'scene-statement-0-3',
        kind: 'statement',
        sectionId: 'section-opening',
        startWord: 0,
        endWord: 3,
        startTime: 3.75,
        endTime: 6.55,
        label: 'Trust explanation',
        purpose: 'Connect trust to source evidence.',
        presentation: 'speaker-side',
        sourceSpec: {
          kind: 'statement',
          startWord: 0,
          endWord: 3,
          text: 'Build trust with evidence',
        },
      },
      {
        id: 'scene-statement-4-6',
        kind: 'statement',
        sectionId: 'section-evidence',
        startWord: 4,
        endWord: 6,
        startTime: 99.75,
        endTime: 101.85,
        label: 'Evidence explanation',
        purpose: 'Show why evidence supports the claim.',
        presentation: 'speaker-pip',
        sourceSpec: { kind: 'statement', startWord: 4, endWord: 6, text: 'Show the evidence' },
      },
    ],
    sections: [
      {
        id: 'section-opening',
        startWord: 0,
        endWord: 3,
        startTime: 0,
        endTime: 80,
        status: 'planned',
        diagnostics: [],
      },
      {
        id: 'section-evidence',
        startWord: 4,
        endWord: 6,
        startTime: 80,
        endTime: duration,
        status: 'planned',
        diagnostics: [],
      },
    ],
  };
}

export function makeStoryboardPlan(): SceneFirstLongformPlan {
  const plan = makeScenePlan();
  plan.parserVersion = 2;
  plan.storyboardStyle = 'polish';
  const first = plan.scenes[0];
  if (!first) throw new Error('Fixture scene missing');
  Object.assign(first, {
    kind: 'storyboard',
    presentation: 'full-frame',
    endTime: 8,
    sourceSpec: {
      kind: 'storyboard',
      specVersion: 1,
      startWord: 0,
      endWord: 3,
      subject: { text: 'Build trust', startWord: 0, endWord: 1 },
      panels: [
        {
          id: 'panel-trust',
          kind: 'statement',
          startWord: 0,
          endWord: 3,
          revealWord: 0,
          moveWord: 1,
          title: { text: 'Build trust', startWord: 0, endWord: 1 },
          body: { text: 'with evidence', startWord: 2, endWord: 3 },
        },
      ],
      overview: { atWord: 3 },
    },
  });
  return plan;
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
