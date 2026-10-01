import type { PlannerWord, Rec } from './kind-spec';
import { makeParseContext } from './kind-spec';

/** Authored five-clause speech, not a live transcription. Exact text and source-word mappings. */
export function hybridFixture(
  clauses: readonly [string, string, string, string, string],
  payload: Rec,
): {
  sourceText: string;
  words: PlannerWord[];
  raw: Rec;
  ctx: ReturnType<typeof makeParseContext>;
  durationSec: number;
} {
  const words: PlannerWord[] = [];
  const starts: number[] = [];
  const fields = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'];
  for (const [phase, clause] of clauses.entries()) {
    starts.push(words.length);
    const tokens = clause.trim().split(/\s+/);
    const start = 0.25 + phase * 1.9;
    const span = 1.8;
    tokens.forEach((text, i) => {
      words.push({
        text,
        start: start + (span * i) / tokens.length,
        end: start + (span * (i + 1)) / tokens.length,
      });
    });
  }
  const raw = {
    ...payload,
    ...Object.fromEntries(fields.map((field, i) => [field, starts[i]])),
    startWord: 0,
    endWord: words.length - 1,
  };
  return {
    sourceText: clauses.join(' '),
    words,
    raw,
    durationSec: 10,
    ctx: makeParseContext(words, {
      startWord: 0,
      endWord: words.length - 1,
      startTime: 0,
      endTime: 10,
    }),
  };
}
