import type { WordTimestamp } from './types';

const START_BUFFER_SECONDS = 0.12;
const END_BUFFER_SECONDS = 0.25;
const NATURAL_PAUSE_SECONDS = 0.65;
const MAX_SENTENCE_EXTENSION_SECONDS = 6;

export interface StabilizedClipBoundary {
  startTime: number;
  endTime: number;
}

function endsSentence(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim());
}

/**
 * Align coarse AI timestamps to the ASR word track and leave room for speech
 * onsets/decays. If the requested end lands mid-sentence, extend by at most six
 * seconds to the next punctuation or natural pause so short-form exports do
 * not cut off the final word or unfinished thought.
 */
export function stabilizeShortFormClipBoundary(
  requestedStart: number,
  requestedEnd: number,
  words: readonly WordTimestamp[],
  videoDuration?: number,
): StabilizedClipBoundary {
  const finiteVideoEnd =
    Number.isFinite(videoDuration) && (videoDuration ?? 0) > 0
      ? (videoDuration as number)
      : Number.POSITIVE_INFINITY;
  const safeStart = Math.max(0, Number.isFinite(requestedStart) ? requestedStart : 0);
  const safeEnd = Math.min(
    finiteVideoEnd,
    Math.max(safeStart, Number.isFinite(requestedEnd) ? requestedEnd : safeStart),
  );

  if (words.length === 0 || safeEnd <= safeStart) {
    return { startTime: safeStart, endTime: safeEnd };
  }

  const firstWordIndex = words.findIndex((word) => word.end > safeStart && word.start < safeEnd);
  if (firstWordIndex < 0) {
    return { startTime: safeStart, endTime: safeEnd };
  }

  let lastOverlappingWordIndex = firstWordIndex;
  for (let index = firstWordIndex; index < words.length; index++) {
    if (words[index].start >= safeEnd) break;
    lastOverlappingWordIndex = index;
  }

  const firstWord = words[firstWordIndex];
  const previousWord = words[firstWordIndex - 1];
  const headRoom = previousWord
    ? Math.max(0, firstWord.start - previousWord.end)
    : Math.max(START_BUFFER_SECONDS, firstWord.start);
  const startTime = Math.max(0, firstWord.start - Math.min(START_BUFFER_SECONDS, headRoom / 2));

  let boundaryWordIndex = lastOverlappingWordIndex;
  for (let index = lastOverlappingWordIndex; index < words.length; index++) {
    const word = words[index];
    if (word.end - safeEnd > MAX_SENTENCE_EXTENSION_SECONDS) break;

    boundaryWordIndex = index;
    const nextWord = words[index + 1];
    const pauseAfter = nextWord ? nextWord.start - word.end : Number.POSITIVE_INFINITY;
    if (endsSentence(word.text) || pauseAfter >= NATURAL_PAUSE_SECONDS) break;
  }

  const boundaryWord = words[boundaryWordIndex];
  const nextWord = words[boundaryWordIndex + 1];
  const tailRoom = nextWord
    ? Math.max(0, nextWord.start - boundaryWord.end)
    : Math.max(END_BUFFER_SECONDS, finiteVideoEnd - boundaryWord.end);
  const endTime = Math.min(
    finiteVideoEnd,
    Math.max(safeEnd, boundaryWord.end + Math.min(END_BUFFER_SECONDS, tailRoom / 2)),
  );

  return { startTime, endTime };
}
