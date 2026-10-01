import type { InferenceEvidence } from '../../remotion/compositions/explainer/concepts/inference/types';
import type { TechnologyStory } from '../../remotion/compositions/explainer/technology/types';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import {
  technologyClause,
  technologyEvidence,
  technologyPhrase,
  technologyStory,
} from './technology-contract';

export function inferenceText(text: string): string {
  return text
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function inferenceHas(text: string, phrase: string): boolean {
  return ` ${inferenceText(text)} `.includes(` ${inferenceText(phrase)} `);
}

/** Escape source labels before using them in directed relationship grammars. */
export function inferenceActor(label: string): string {
  return `\\b${inferenceText(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
}

/** Qualitative illustrations do not offer probability/accuracy/privacy verdicts. */
export function inferenceLabel(value: unknown, ctx: ParseContext, max: number): string | null {
  const label = technologyPhrase(value, ctx, max);
  if (
    !label ||
    /\d|%|\b(?:probability|percent|accuracy|accurate|correct|truth|true|privacy|private|secure|guaranteed|always)\b/i.test(
      label,
    )
  )
    return mechanismIssue(
      ctx,
      'inference labels must be source phrases without quantitative or truth/privacy verdicts',
    );
  return label;
}

export function inferenceStory(raw: Rec, ctx: ParseContext): TechnologyStory | null {
  const story = technologyStory(raw, ctx);
  if (!story) return null;
  for (const field of ['label', 'subject', 'outcome'] as const) {
    if (!inferenceLabel(story[field], ctx, field === 'outcome' ? 40 : 32)) return null;
  }
  const final = technologyClause(ctx, raw.resolveWord);
  if (!inferenceHas(final, story.subject) || !inferenceHas(final, story.outcome))
    return mechanismIssue(
      ctx,
      'final inference state must belong to the same subject in the resolve clause',
    );
  return story;
}

export interface LocalInferenceEvidence {
  span: InferenceEvidence;
  text: string;
}

/** Full single clauses prevent cropping off a negation or borrowing verbs from other actors. */
export function inferenceEvidence(raw: unknown, ctx: ParseContext): LocalInferenceEvidence | null {
  if (!isRec(raw))
    return mechanismIssue(ctx, 'relationship needs an inclusive fromWord/toWord evidence span');
  const first = ctx.inWin(raw.fromWord);
  const last = ctx.inWin(raw.toWord);
  if (first === null || last === null || first > last || last - first > 56)
    return mechanismIssue(ctx, 'inference evidence must be a bounded local source clause');
  const text = technologyEvidence(ctx, first, last);
  const clause = technologyClause(ctx, first);
  if (
    inferenceText(text) !== inferenceText(clause) ||
    inferenceText(technologyClause(ctx, last)) !== inferenceText(clause)
  )
    return mechanismIssue(
      ctx,
      'inference evidence must preserve one complete clause, including negation',
    );
  return { span: { fromWord: first, toWord: last }, text: inferenceText(text) };
}

/** Conditions stay on screen. Proposed, denied and speculative actions are not achieved ones. */
export function inferenceAsserted(text: string, story: TechnologyStory): boolean {
  const withoutCondition = story.condition
    ? text.replace(inferenceText(story.condition), '').trim()
    : text;
  return !/\b(?:not|no|never|cannot|can t|doesn t|isn t|didn t|won t|may|might|could|would|should|will|plans?|planned|proposes?|proposed|hopes?|denies?|denied|fails?|failed|false|untrue|unconfirmed|speculative|alleged|unless|if)\b/.test(
    withoutCondition,
  );
}

export function inferenceMatches(text: string, pattern: string, story: TechnologyStory): boolean {
  const clause = story.condition ? text.replace(inferenceText(story.condition), '').trim() : text;
  return (
    inferenceAsserted(text, story) && new RegExp(`^(?:the |then )?${pattern}`, 'u').test(clause)
  );
}

export function inferenceRelation(
  evidence: LocalInferenceEvidence,
  pattern: string,
  story: TechnologyStory,
): boolean {
  return inferenceMatches(evidence.text, pattern, story);
}

export function inferenceAtEvidence(evidence: LocalInferenceEvidence, word: unknown): boolean {
  return typeof word === 'number' && word >= evidence.span.fromWord && word <= evidence.span.toWord;
}
