import type { WordTimestamp } from './types';

const START_BUFFER_SECONDS = 0.12;
const END_BUFFER_SECONDS = 0.25;
const NATURAL_PAUSE_SECONDS = 0.65;
const MAX_SENTENCE_EXTENSION_SECONDS = 6;
/** How far back a mid-sentence start may move to reach its sentence start. */
const MAX_START_PULLBACK_SECONDS = 6;

export interface StabilizedClipBoundary {
  startTime: number;
  endTime: number;
}

export interface ClipBoundaryOptions {
  /**
   * The range ends the clip: if it ends on a question, keep going to the
   * next sentence (the speaker's answer) instead of stopping on the setup.
   */
  finalRange?: boolean;
}

function endsSentence(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim());
}

function endsQuestion(text: string): boolean {
  return /\?["']?\s*$/.test(text.trim());
}

/** True when `words[index]` begins a sentence (or follows a clear pause). */
function startsSentence(words: readonly WordTimestamp[], index: number): boolean {
  const previous = words[index - 1];
  if (!previous) return true;
  return endsSentence(previous.text) || words[index].start - previous.end >= NATURAL_PAUSE_SECONDS;
}

/**
 * Walk a mid-sentence start back to the first word of its sentence, at most
 * MAX_START_PULLBACK_SECONDS. Keeps the original word when no sentence start
 * is that close (a very long run-on sentence).
 */
function sentenceStartIndex(words: readonly WordTimestamp[], firstWordIndex: number): number {
  const limit = words[firstWordIndex].start - MAX_START_PULLBACK_SECONDS;
  for (let index = firstWordIndex; index >= 0; index--) {
    if (words[index].start < limit) break;
    if (startsSentence(words, index)) return index;
  }
  return firstWordIndex;
}

/**
 * Last word of the answer after a closing question: the end of the next
 * sentence(s), within the extension budget. Returns `questionIndex` when no
 * complete sentence ends in time.
 */
function answerEndIndex(
  words: readonly WordTimestamp[],
  questionIndex: number,
  budgetEnd: number,
): number {
  let best = questionIndex;
  for (let index = questionIndex + 1; index < words.length; index++) {
    const word = words[index];
    if (word.end > budgetEnd) break;
    const nextWord = words[index + 1];
    const pauseAfter = nextWord ? nextWord.start - word.end : Number.POSITIVE_INFINITY;
    if (endsSentence(word.text) || pauseAfter >= NATURAL_PAUSE_SECONDS) {
      best = index;
      if (!endsQuestion(word.text)) break;
    }
  }
  return best;
}

/**
 * Align coarse AI timestamps to the ASR word track and leave room for speech
 * onsets/decays. A start that lands mid-sentence moves back to the start of
 * that sentence; an end that lands mid-sentence extends by at most six
 * seconds to the next punctuation or natural pause, so exports neither open
 * nor close on half a thought. With `finalRange`, a closing question also
 * keeps its answer.
 */
export function stabilizeShortFormClipBoundary(
  requestedStart: number,
  requestedEnd: number,
  words: readonly WordTimestamp[],
  videoDuration?: number,
  options: ClipBoundaryOptions = {},
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

  const startWordIndex = sentenceStartIndex(words, firstWordIndex);
  const firstWord = words[startWordIndex];
  const previousWord = words[startWordIndex - 1];
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

  if (options.finalRange && endsQuestion(words[boundaryWordIndex].text)) {
    boundaryWordIndex = answerEndIndex(
      words,
      boundaryWordIndex,
      Math.min(finiteVideoEnd, safeEnd + MAX_SENTENCE_EXTENSION_SECONDS),
    );
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
