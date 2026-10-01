import {
  TECHNOLOGY_WORD_FIELDS,
  type TechnologyStory,
} from '../../remotion/compositions/explainer/technology/types';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import {
  technologyClause,
  technologyEvidence,
  technologyPhrase,
  technologyStory,
} from './technology-contract';

export function perspectiveText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function hasPhrase(source: string, label: string): boolean {
  return ` ${perspectiveText(source)} `.includes(` ${perspectiveText(label)} `);
}

export function exactKeys(raw: Rec, fields: readonly string[], ctx: ParseContext): boolean {
  if (Object.keys(raw).some((key) => !fields.includes(key))) {
    mechanismIssue(
      ctx,
      'unsupported perspective fields; no odds, winners, telemetry, coordinates or arbitrary states',
    );
    return false;
  }
  return true;
}

export function perspectiveStory(
  raw: Rec,
  ctx: ParseContext,
  fields: readonly string[],
): TechnologyStory | null {
  if (
    !exactKeys(
      raw,
      [
        'kind',
        'preset',
        'label',
        'subject',
        'outcome',
        'condition',
        'layout',
        'continues',
        'transition',
        'startWord',
        'endWord',
        ...TECHNOLOGY_WORD_FIELDS,
        ...fields,
      ],
      ctx,
    )
  )
    return null;
  const story = technologyStory(raw, ctx);
  if (!story) return null;
  if (
    !hasPhrase(technologyClause(ctx, raw.setupWord), story.subject) ||
    !hasPhrase(technologyClause(ctx, raw.resolveWord), story.outcome)
  ) {
    return mechanismIssue(
      ctx,
      'setup must identify this subject and resolve must contain its source outcome',
    );
  }
  return story;
}

/** Full single sentence, not a cropped phrase that can hide a negation or swap actors. */
export function perspectiveEvidence(raw: Rec, ctx: ParseContext): string | null {
  const from = ctx.inWin(raw.evidenceStartWord);
  const to = ctx.inWin(raw.evidenceEndWord);
  if (from === null || to === null || to < from || to - from > 44)
    return mechanismIssue(ctx, 'relationship needs a bounded local source sentence');
  const text = technologyEvidence(ctx, from, to);
  if (
    perspectiveText(text) !== perspectiveText(technologyClause(ctx, from)) ||
    perspectiveText(text) !== perspectiveText(technologyClause(ctx, to))
  ) {
    return mechanismIssue(
      ctx,
      'evidence indices must cover one complete source sentence, including conditions and negation',
    );
  }
  return text;
}

export function localPhrase(
  raw: unknown,
  evidence: string,
  ctx: ParseContext,
  max = 22,
): string | null {
  const phrase = technologyPhrase(raw, ctx, max);
  return phrase && hasPhrase(evidence, phrase)
    ? phrase
    : mechanismIssue(ctx, 'actor/qualifier must occur in its own relationship evidence');
}

export const UNACHIEVED =
  /\b(?:not|never|no|cannot|can\s*not|isn['’]t|doesn['’]t|might|may|could|would|should|proposed|planned|unconfirmed|unclear|denied|without|if|unless)\b/i;

export function escaped(value: string): string {
  return perspectiveText(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The direction of membership is essential: a server is not inside its chip. */
export function containsActor(source: string, inner: string, outer: string): boolean {
  const text = perspectiveText(source);
  return (
    !UNACHIEVED.test(source) &&
    (new RegExp(
      `\\b${escaped(inner)}\\b (?:is |sits |remains |stays |fits |belongs )?(?:inside|within|part of|to) (?:the |a |an )?${escaped(outer)}\\b`,
    ).test(text) ||
      new RegExp(
        `\\b${escaped(outer)}\\b (?:contains|houses|includes) (?:the |a |an )?${escaped(inner)}\\b`,
      ).test(text))
  );
}
