import {
  INFORMATION_LIMITS,
  type InformationEvidence,
} from '../../remotion/compositions/explainer/concepts/information/types';
import type { TechnologyStory } from '../../remotion/compositions/explainer/technology/types';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import {
  technologyClause,
  technologyEvidence,
  technologyPhrase,
  technologyStory,
} from './technology-contract';

export function informationText(text: string): string {
  // Keep the same signed number/unit semantics as sourceLabel, also inside local evidence.
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/−/g, '-')
      .match(/[+-]?(?:[$€£]\s*)?\d+(?:[.,]\d+)*(?:%|[a-z]+)?|[\p{L}\p{N}]+/gu) ?? []
  )
    .map((word) => word.replace(/\s/g, ''))
    .join(' ');
}

export function informationContains(text: string, phrase: string): boolean {
  return ` ${informationText(text)} `.includes(` ${informationText(phrase)} `);
}

export function informationLabel(
  raw: unknown,
  ctx: ParseContext,
  max: number = INFORMATION_LIMITS.actorLabel,
): string | null {
  const label = technologyPhrase(raw, ctx, max);
  return label || mechanismIssue(ctx, 'information actors need bounded exact source phrases');
}

export function informationEntries(
  raw: unknown,
  ctx: ParseContext,
  min: number,
  max: number,
): Rec[] | null {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max || !raw.every(isRec)) {
    return mechanismIssue(ctx, `information entries need ${min}–${max} objects`);
  }
  return raw;
}

export function informationDistinct(labels: string[], ctx: ParseContext): boolean {
  if (new Set(labels.map(informationText)).size === labels.length) return true;
  mechanismIssue(ctx, 'information actors must have distinct identities');
  return false;
}

/** Whole local sentence, not a noun from another clause or a crop hiding negation. */
export function informationEvidence(raw: unknown, ctx: ParseContext): InformationEvidence | null {
  if (!isRec(raw))
    return mechanismIssue(ctx, 'information relationship needs a source evidence span');
  const fromWord = ctx.inWin(raw.fromWord);
  const toWord = ctx.inWin(raw.toWord);
  if (
    fromWord === null ||
    toWord === null ||
    toWord < fromWord ||
    toWord - fromWord >= INFORMATION_LIMITS.evidenceWords
  ) {
    return mechanismIssue(
      ctx,
      'information evidence indices must bound one local sentence of at most 32 words',
    );
  }
  const phrase = technologyEvidence(ctx, fromWord, toWord);
  if (
    !phrase ||
    phrase !== technologyClause(ctx, fromWord) ||
    phrase !== technologyClause(ctx, toWord)
  ) {
    return mechanismIssue(
      ctx,
      'information evidence must preserve the complete local sentence, including qualifiers',
    );
  }
  return { fromWord, toWord, phrase };
}

export const INFORMATION_UNACHIEVED =
  /\b(?:not|never|no|cannot|can\s+not|can'?t|isn'?t|aren'?t|doesn'?t|didn'?t|won'?t|without|neither|may|might|could|would|should|will|propos\w*|plan(?:s|ned)?|pretend\w*|hope\w*|wish\w*|alleg\w*|den\w*|disput\w*|uncertain|whether|simulat\w*)\b/i;

export function informationRelation(
  evidence: InformationEvidence,
  actors: string[],
  verb: RegExp,
  ctx: ParseContext,
): boolean {
  const phrase = evidence.phrase;
  if (
    actors.every((actor) => informationContains(phrase, actor)) &&
    verb.test(phrase) &&
    !INFORMATION_UNACHIEVED.test(phrase)
  )
    return true;
  mechanismIssue(
    ctx,
    'information relationship needs affirmative local evidence binding the named actors, not unrelated/proposed/negated claims',
  );
  return false;
}

export function informationStory(raw: Rec, ctx: ParseContext): TechnologyStory | null {
  const story = technologyStory(raw, ctx);
  if (!story) return null;
  const final = technologyClause(ctx, raw.resolveWord);
  const setup = technologyClause(ctx, raw.setupWord);
  if (
    !informationContains(setup, story.subject) ||
    !informationContains(final, story.subject) ||
    informationText(final) !== informationText(story.outcome)
  ) {
    return mechanismIssue(
      ctx,
      'information setup must name the subject; outcome must preserve its complete local resolve sentence',
    );
  }
  if (/\b(?:may|might|could|would|should|will|propos\w*|hope\w*|pretend\w*)\b/i.test(final)) {
    return mechanismIssue(
      ctx,
      'information outcome cannot convert a proposal into an observed result',
    );
  }
  return story;
}
