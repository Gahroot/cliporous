import { isRec, type PlannerWord } from './kind-spec';
import type { PlanningObserver } from './planning-diagnostics';

export const QUOTE_SELECTION_V1 = Object.freeze({
  minWords: 3,
  maxWords: 12,
  minSec: 1.2,
  maxSec: 4.5,
  minSeparationSec: 20,
  maxCount: 3,
  maxProposals: 32,
});
export type QuoteReason = 'central-claim' | 'reversal' | 'takeaway';
export interface QuoteWindow {
  startWord: number;
  endWord: number;
  text: string;
  reason: QuoteReason;
  startTime: number;
  endTime: number;
}
/** This is full-screen emphasis, not caption word emphasis or an animation takeover. */
export const QUOTE_PROMPT_V1 = `Optional full-screen emphasis: add "quotes":[] to the top-level object. Zero quotes is valid and normally preferred. At most ONE quote per clip up to 60 seconds; longer clips at most one per 60 seconds, capped at three, separated by 20 seconds. Each is {"startWord":i,"endWord":j,"text":"exact source words joined with spaces","reason":"central-claim|reversal|takeaway"}. Use 3–12 consecutive source words lasting 1.2–4.5 seconds, after the protected opening, with NO overlap with an animation. Select only an earned central claim, reversal or takeaway; uppercase text and caption emphasis scores are NOT evidence. Never invent text or emit start/end seconds. A quote does not count as an explanatory animation.`;

export function selectQuoteWindows(
  raw: unknown,
  words: readonly PlannerWord[],
  bounds: { minStart: number; maxEnd: number },
  animations: readonly { startTime: number; endTime: number }[] = [],
  observe?: PlanningObserver,
): QuoteWindow[] {
  if (
    !Number.isFinite(bounds.minStart) ||
    !Number.isFinite(bounds.maxEnd) ||
    bounds.maxEnd <= bounds.minStart
  )
    return [];
  if (!isRec(raw) || raw.quotes === undefined) return [];
  if (!Array.isArray(raw.quotes)) {
    observe?.({ stage: 'quote', action: 'rejected', reason: 'quote-list-malformed' });
    return [];
  }
  const list = raw.quotes;
  if (!list.length) {
    observe?.({ stage: 'quote', action: 'empty', reason: 'no-earned-emphasis', count: 0 });
    return [];
  }
  const out: QuoteWindow[] = [];
  const limit = Math.min(
    QUOTE_SELECTION_V1.maxCount,
    Math.max(1, Math.ceil((bounds.maxEnd - bounds.minStart) / 60)),
  );
  const candidates: { index: number; quote: QuoteWindow }[] = [];
  const reject = (index: number, reason: string): void =>
    observe?.({ stage: 'quote', action: 'rejected', reason, index });
  list.slice(0, QUOTE_SELECTION_V1.maxProposals).forEach((candidate, index) => {
    if (
      !isRec(candidate) ||
      Object.keys(candidate).some(
        (key) => !['startWord', 'endWord', 'text', 'reason'].includes(key),
      )
    ) {
      reject(index, 'quote-fields');
      return;
    }
    const { startWord, endWord, text, reason } = candidate;
    if (
      typeof startWord !== 'number' ||
      typeof endWord !== 'number' ||
      !Number.isInteger(startWord) ||
      !Number.isInteger(endWord) ||
      startWord < 0 ||
      endWord >= words.length ||
      endWord < startWord
    ) {
      reject(index, 'quote-indices');
      return;
    }
    const count = endWord - startWord + 1;
    if (count < QUOTE_SELECTION_V1.minWords || count > QUOTE_SELECTION_V1.maxWords) {
      reject(index, 'quote-word-count');
      return;
    }
    if (reason !== 'central-claim' && reason !== 'reversal' && reason !== 'takeaway') {
      reject(index, 'quote-reason');
      return;
    }
    const selected = words.slice(startWord, endWord + 1);
    if (typeof text !== 'string' || text !== selected.map((word) => word.text).join(' ')) {
      reject(index, 'quote-off-source');
      return;
    }
    const startTime = selected[0].start;
    const endTime = selected[selected.length - 1].end;
    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      selected.some(
        (word, i) =>
          !Number.isFinite(word.start) ||
          !Number.isFinite(word.end) ||
          word.end <= word.start ||
          (i > 0 && word.start < selected[i - 1].end - 0.01),
      ) ||
      endTime - startTime < QUOTE_SELECTION_V1.minSec ||
      endTime - startTime > QUOTE_SELECTION_V1.maxSec
    ) {
      reject(index, 'quote-duration');
      return;
    }
    if (startTime < bounds.minStart || endTime > bounds.maxEnd) {
      reject(index, 'quote-outside-window');
      return;
    }
    if (animations.some((scene) => startTime < scene.endTime && endTime > scene.startTime)) {
      reject(index, 'quote-animation-overlap');
      return;
    }
    candidates.push({ index, quote: { startWord, endWord, text, reason, startTime, endTime } });
  });
  for (const { index, quote } of candidates.sort(
    (a, b) => a.quote.startTime - b.quote.startTime || a.index - b.index,
  )) {
    if (out.length >= limit) {
      reject(index, 'quote-count-ceiling');
      continue;
    }
    const previous = out[out.length - 1];
    if (previous && quote.startTime - previous.endTime < QUOTE_SELECTION_V1.minSeparationSec) {
      reject(index, 'quote-separation');
      continue;
    }
    out.push(quote);
    observe?.({ stage: 'quote', action: 'accepted', reason: 'source-bound-emphasis', index });
  }
  if (list.length > QUOTE_SELECTION_V1.maxProposals)
    observe?.({
      stage: 'quote',
      action: 'rejected',
      reason: 'quote-proposal-limit',
      count: list.length - QUOTE_SELECTION_V1.maxProposals,
    });
  return out;
}
