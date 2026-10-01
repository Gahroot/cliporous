import type { LongformSectionContext, PlannerWord } from './explainer-scenes';

/** Planning policy, not a promise about visual frequency or story duration. */
export const LONGFORM_SECTION_POLICY = Object.freeze({
  targetSeconds: 90,
  targetWords: 400,
  hardSeconds: 120,
  hardWords: 600,
  contextSeconds: 15,
  contextWords: 80,
  pauseSeconds: 0.8,
  concurrency: 2,
  recentSections: 8,
});

export interface LongformSection extends LongformSectionContext {
  id: string;
  startTime: number;
  endTime: number;
}

/** Non-overlapping word ownership; context can finish a story, never own its start. */
export function partitionLongformSections(words: readonly PlannerWord[]): LongformSection[] {
  const policy = LONGFORM_SECTION_POLICY;
  const sections: LongformSection[] = [];
  let start = 0;
  while (start < words.length) {
    let end = start;
    let endTime = words[start].end;
    let boundary = -1;
    for (let index = start; index < words.length; index++) {
      const span = Math.max(endTime, words[index].end) - words[start].start;
      const count = index - start + 1;
      if (span > policy.hardSeconds || count > policy.hardWords) break;
      end = index;
      endTime = Math.max(endTime, words[index].end);
      const sentenceEnd = /[.!?]["'”’)]*$/.test(words[index].text);
      const pause = !words[index + 1] || words[index + 1].start - endTime >= policy.pauseSeconds;
      if (
        (sentenceEnd || pause) &&
        (span >= policy.targetSeconds * 0.75 || count >= policy.targetWords * 0.75)
      )
        boundary = index;
      if (span >= policy.targetSeconds || count >= policy.targetWords) {
        if (boundary >= start) {
          end = boundary;
          break;
        }
        // No near-target boundary yet: extend only up to the hard cap.
      }
    }
    endTime = Math.max(...words.slice(start, end + 1).map((word) => word.end));
    if (endTime - words[start].start > policy.hardSeconds)
      throw new Error('A transcript word exceeds the long-form section duration limit.');
    let contextStartWord = start;
    let contextEndWord = end;
    while (
      contextStartWord > 0 &&
      start - contextStartWord < policy.contextWords &&
      words[start].start - words[contextStartWord - 1].start <= policy.contextSeconds
    )
      contextStartWord--;
    while (
      contextEndWord + 1 < words.length &&
      contextEndWord - end < policy.contextWords &&
      words[contextEndWord + 1].end - endTime <= policy.contextSeconds
    )
      contextEndWord++;
    sections.push({
      id: `section-${start}-${end}`,
      startWord: start,
      endWord: end,
      startTime: words[start].start,
      endTime,
      contextStartWord,
      contextEndWord,
    });
    start = end + 1;
  }
  return sections;
}
