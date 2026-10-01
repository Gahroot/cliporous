import {
  TECHNOLOGY_LIMITS,
  TECHNOLOGY_WORD_FIELDS,
  type TechnologyStory,
} from '../../remotion/compositions/explainer/technology/types';
import type { ParseContext } from './kind-spec';
import { mechanismIssue, sourceLabel, strictMechanismBeats } from './mechanism-contract';

function normalized(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function technologySource(ctx: ParseContext): string {
  return ctx.words
    .slice(ctx.win.startWord, ctx.win.endWord + 1)
    .map((word) => word.text)
    .join(' ');
}

/** Reuse the mechanism contract's contiguous phrases and signed-number/unit protection. */
export function technologyPhrase(value: unknown, ctx: ParseContext, max: number): string | null {
  return sourceLabel(value, ctx, max);
}

/** Inclusive, bounded evidence span. Families use this to associate a branch with its actor. */
export function technologyEvidence(ctx: ParseContext, from: unknown, to: unknown): string {
  const first = ctx.inWin(from);
  const last = ctx.inWin(to);
  if (first === null || last === null || first > last) return '';
  return ctx.words
    .slice(first, last + 1)
    .map((word) => word.text)
    .join(' ');
}

/** Sentence-local evidence around a source index; earlier failure is not global negation. */
export function technologyClause(ctx: ParseContext, index: unknown): string {
  const word = ctx.inWin(index);
  if (word === null) return '';
  let start = word;
  let end = word;
  while (start > ctx.win.startWord && !/[.!?;]$/.test(ctx.words[start - 1]?.text ?? '')) start--;
  while (end < ctx.win.endWord && !/[.!?;]$/.test(ctx.words[end]?.text ?? '')) end++;
  return technologyEvidence(ctx, start, end);
}

/** Shared bounds only. A family MUST additionally validate its relationship and outcome. */
export function technologyStory(
  raw: Record<string, unknown>,
  ctx: ParseContext,
): TechnologyStory | null {
  const duration = ctx.win.endTime - ctx.win.startTime;
  if (
    !Number.isFinite(ctx.win.startTime) ||
    !Number.isFinite(ctx.win.endTime) ||
    duration < TECHNOLOGY_LIMITS.minDuration ||
    duration > TECHNOLOGY_LIMITS.maxDuration
  ) {
    return mechanismIssue(ctx, 'technology stories need a finite 5–12 second window');
  }
  for (const field of TECHNOLOGY_WORD_FIELDS) {
    const index = ctx.inWin(raw[field]);
    const start = index === null ? undefined : ctx.words[index]?.start;
    if (
      typeof start !== 'number' ||
      !Number.isFinite(start) ||
      start < ctx.win.startTime ||
      start > ctx.win.endTime
    ) {
      return mechanismIssue(ctx, 'technology beats need finite source times inside the scene');
    }
  }
  const beats = strictMechanismBeats(
    raw,
    ctx,
    TECHNOLOGY_WORD_FIELDS,
    TECHNOLOGY_LIMITS.minGaps,
    TECHNOLOGY_LIMITS.finalHold,
  );
  const label = sourceLabel(raw.label, ctx, TECHNOLOGY_LIMITS.label);
  const subject = technologyPhrase(raw.subject, ctx, TECHNOLOGY_LIMITS.subject);
  const outcome = technologyPhrase(raw.outcome, ctx, TECHNOLOGY_LIMITS.outcome);
  if (!beats || !label || !subject || !outcome) {
    return mechanismIssue(
      ctx,
      'technology stories need source-backed labels, subject, outcome and spaced beats',
    );
  }
  const [setupAt, actionAt, responseAt, checkAt, resolveAt] = beats;
  if (
    setupAt === undefined ||
    actionAt === undefined ||
    responseAt === undefined ||
    checkAt === undefined ||
    resolveAt === undefined
  )
    return null;

  // Preserve the complete subordinate condition; reject compound/overlong ambiguity rather
  // than turning a hypothetical into a claim that an observed action succeeded.
  const conditions = [
    ...technologySource(ctx).matchAll(/\b(?:if|unless|when|provided that|assuming)\b[^,;.!?]*/gi),
  ];
  const suppliedCondition =
    raw.condition === undefined
      ? undefined
      : technologyPhrase(raw.condition, ctx, TECHNOLOGY_LIMITS.condition);
  if (conditions.length > 1 || (raw.condition !== undefined && !suppliedCondition)) {
    return mechanismIssue(ctx, 'technology condition is ambiguous or not a bounded source phrase');
  }
  const sourceCondition = conditions[0]?.[0]?.trim();
  if (
    sourceCondition &&
    (!suppliedCondition || normalized(sourceCondition) !== normalized(suppliedCondition))
  ) {
    return mechanismIssue(
      ctx,
      'preserve the complete source condition instead of claiming a verified event',
    );
  }
  if (!sourceCondition && suppliedCondition) {
    return mechanismIssue(ctx, 'do not invent a condition absent from the source');
  }
  return {
    label,
    subject,
    outcome,
    ...(suppliedCondition ? { condition: suppliedCondition } : {}),
    setupAt,
    actionAt,
    responseAt,
    checkAt,
    resolveAt,
  };
}
