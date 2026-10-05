import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type { ExpansionStoryId } from '../../remotion/compositions/explainer/expansion/catalog';
import type { PlannerWord, Rec, SceneWindow } from './kind-spec';

/** Test-authoring only. Never used to fill missing source facts in the planner. */
export interface ExpansionSourceFixture {
  readonly id: ExpansionStoryId;
  readonly sourceText: string;
  readonly words: readonly PlannerWord[];
  readonly window: SceneWindow;
  readonly proposal: Rec;
  readonly negatives: readonly ExpansionNegativeFixture[];
}
export interface ExpansionNegativeFixture {
  readonly name: string;
  readonly proposal: Rec;
  readonly sourceText?: string;
  readonly words?: readonly PlannerWord[];
  readonly window?: SceneWindow;
}

/** Clauses stay separate so fixtures can point to full, actor-owned evidence, not keyword spans. */
export function expansionFixtureSpeech(
  clauses: readonly string[],
  durationSec = 10,
): {
  readonly sourceText: string;
  readonly words: PlannerWord[];
  readonly window: SceneWindow;
  readonly spans: readonly { fromWord: number; toWord: number }[];
} {
  if (
    clauses.length < 5 ||
    clauses.length > 32 ||
    clauses.some(
      (clause) =>
        !clause.trim() ||
        clause !== clause.trim() ||
        !/[.!?;]$/.test(clause) ||
        clause.split(/\s+/).length > 64,
    )
  )
    throw new Error('Fixture clauses must be complete, bounded authored source sentences');
  const sourceText = clauses.join(' ');
  const words = conceptFixtureWords(sourceText, durationSec);
  let cursor = 0;
  const spans = clauses.map((clause) => {
    const count = clause.split(/\s+/).length;
    const span = { fromWord: cursor, toWord: cursor + count - 1 };
    cursor += count;
    return span;
  });
  return {
    sourceText,
    words,
    spans,
    window: { startWord: 0, endWord: words.length - 1, startTime: 0, endTime: durationSec },
  };
}
