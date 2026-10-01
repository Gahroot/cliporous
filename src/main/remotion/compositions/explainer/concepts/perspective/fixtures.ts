import { conceptFixtureWords } from '../fixture-words';
import type { PerspectiveScene } from './types';

/** Synthetic narration, not actual telemetry. Each sentence supplies one authored beat. */
export const CHIP_SOURCE = [
  'Chip inside infrastructure: the Atlas chip remains identifiable.',
  'The Atlas chip sits inside the server.',
  'The server sits inside the rack.',
  'The rack sits inside the data center.',
  'The Atlas chip remains inside the data center.',
];

export const FIXTURE_DURATION = 11.2;

export function sourceFixture(sentences: readonly string[]) {
  const sourceText = sentences.join(' ');
  const words = conceptFixtureWords(sourceText, FIXTURE_DURATION);
  let nextWord = 0;
  const ranges = sentences.map((sentence) => {
    const startWord = nextWord;
    nextWord += sentence.split(/\s+/).length;
    return { evidenceStartWord: startWord, evidenceEndWord: nextWord - 1 };
  });
  const fields = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'];
  const beats = Object.fromEntries(fields.map((field, i) => [field, ranges[i]?.evidenceStartWord]));
  const times = Object.fromEntries(
    ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'].map((field, i) => [
      field,
      Math.max(0.3, words[ranges[i]?.evidenceStartWord ?? 0]?.start ?? 0),
    ]),
  );
  return { words, ranges, beats, times, sourceText };
}

const chipSource = sourceFixture(CHIP_SOURCE);
export const CHIP_RAW = {
  kind: 'scale-hierarchy',
  preset: 'chip-to-center',
  label: 'Chip inside infrastructure',
  subject: 'Atlas chip',
  outcome: 'remains inside the data center',
  startWord: 0,
  endWord: chipSource.words.length - 1,
  layout: 'stack',
  ...chipSource.beats,
  levels: [
    { label: 'server', ...chipSource.ranges[1] },
    { label: 'rack', ...chipSource.ranges[2] },
    { label: 'data center', ...chipSource.ranges[3] },
  ],
};

export const CHIP_SCENE = {
  kind: 'scale-hierarchy',
  preset: 'chip-to-center',
  label: 'Chip inside infrastructure',
  subject: 'Atlas chip',
  outcome: 'remains inside the data center',
  trackedId: 'tracked-subject',
  setupAt: chipSource.times.setupAt ?? 0,
  actionAt: chipSource.times.actionAt ?? 0,
  responseAt: chipSource.times.responseAt ?? 0,
  checkAt: chipSource.times.checkAt ?? 0,
  resolveAt: chipSource.times.resolveAt ?? 0,
  levels: [
    { id: 'level-0', label: 'server' },
    { id: 'level-1', label: 'rack' },
    { id: 'level-2', label: 'data center' },
  ],
} as const satisfies PerspectiveScene;
