import { BUSINESS_POPULATIONS_LIMITS } from '../../remotion/compositions/explainer/concepts/business-populations/types';
import type { TechnologyStory } from '../../remotion/compositions/explainer/technology/types';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyClause, technologyPhrase, technologyStory } from './technology-contract';

export function populationText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function populationPattern(value: string): string {
  return populationText(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function populationLabel(value: unknown, ctx: ParseContext): string | null {
  return technologyPhrase(value, ctx, BUSINESS_POPULATIONS_LIMITS.actorLabel);
}

/** Whole clause, not a cherry-picked span after a negation or a different actor's verb. */
export function populationClause(
  word: unknown,
  ctx: ParseContext,
  condition?: string,
): string | null {
  if (ctx.inWin(word) === null)
    return mechanismIssue(ctx, 'population evidence needs an in-window word index');
  let clause = populationText(technologyClause(ctx, word));
  if (condition && clause.startsWith(`${populationText(condition)},`)) {
    clause = clause.slice(condition.length + 1).trim();
  }
  if (
    !clause ||
    /\b(?:not|no|never|neither|without|cannot|can.t|don.t|doesn.t|didn.t|isn.t|aren.t|wasn.t|weren.t|won.t|wouldn.t|could|might|would|should|will|perhaps|possibly|proposed|proposes|planned|plans|expects|expected|hopes|if|unless|assuming|provided)\b/i.test(
      clause,
    )
  ) {
    return mechanismIssue(
      ctx,
      'population evidence must assert this relationship, not negate, propose or omit its condition',
    );
  }
  return clause.replace(/[.!?;]+$/, '').trim();
}

export function populationMatch(
  word: unknown,
  pattern: string,
  ctx: ParseContext,
  condition?: string,
): boolean {
  const clause = populationClause(word, ctx, condition);
  if (clause && new RegExp(`^(?:${pattern})$`, 'i').test(clause)) return true;
  mechanismIssue(
    ctx,
    'population evidence must bind the stated relationship, amount and unit to the correct actor in one clause',
  );
  return false;
}

export function populationInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

export function populationEntries(
  value: unknown,
  min: number,
  max: number,
  ctx: ParseContext,
): Rec[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max || !value.every(isRec)) {
    return mechanismIssue(ctx, `population actors must be ${min}..${max} complete entries`);
  }
  return value;
}

export function populationDistinct(labels: readonly string[], ctx: ParseContext): boolean {
  if (new Set(labels.map(populationText)).size === labels.length) return true;
  mechanismIssue(ctx, 'population actor labels must be distinct, including newcomers');
  return false;
}

export function populationStory(raw: Rec, ctx: ParseContext): TechnologyStory | null {
  const story = technologyStory(raw, ctx);
  if (!story) return null;
  const finalClause = populationClause(raw.resolveWord, ctx, story.condition);
  if (!finalClause || finalClause !== populationText(story.outcome).replace(/[.!?;]+$/, '')) {
    return mechanismIssue(ctx, 'population outcome must quote the non-negated final source clause');
  }
  // These payloads are never repaired into an invented ratio, period or denominator.
  if (
    ['ratio', 'percentage', 'retentionRate', 'rate', 'periods'].some(
      (field) => raw[field] !== undefined,
    )
  ) {
    return mechanismIssue(
      ctx,
      'population scenes accept named actors and supported counts, not generated ratios, rates or periods',
    );
  }
  return story;
}
