import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyEvidence, technologyPhrase, technologyStory } from './technology-contract';

const NON_ASSERTED =
  /\b(?:not|never|no|without|cannot|can't|won't|doesn't|didn't|isn't|wasn't|hasn't|couldn't|wouldn't|may|might|could|should|would|will|perhaps|maybe|plans?|proposes?|hopes?|allegedly|supposedly|pretends?|unverified|unrelated)\b/i;

export function businessPhrase(value: unknown, ctx: ParseContext, max = 22): string | null {
  const phrase = technologyPhrase(value, ctx, max);
  return phrase && !/[<>]|https?:\/\/|www\./i.test(phrase) ? phrase : null;
}

export function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Local claims, preserving decimal signs/units and never spanning sentence boundaries. */
export function businessClaims(text: string): string[] {
  return text
    .replace(/’/g, "'")
    .split(/[!?;,]|\.(?=\s|$)|\b(?:but|then|and)\b/i)
    .map((claim) => claim.trim())
    .filter(Boolean);
}

export function assertedBusinessClaim(claim: string): boolean {
  return !NON_ASSERTED.test(claim);
}

export function hasClaim(text: string, relationship: RegExp, unresolved = false): boolean {
  return businessClaims(text).some(
    (claim) => (unresolved || assertedBusinessClaim(claim)) && relationship.test(claim),
  );
}

/** Explicitly bind actors and quantities to one of the five local evidence windows. */
export function businessStory(raw: Rec, ctx: ParseContext) {
  const story = technologyStory(raw, ctx);
  const indices = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map(
    (key) => ctx.inWin(raw[key]),
  );
  const [setup, action, response, check, resolve] = indices;
  if (
    !story ||
    setup == null ||
    action == null ||
    response == null ||
    check == null ||
    resolve == null
  )
    return null;
  if (
    [story.label, story.subject, story.outcome, story.condition ?? ''].some((text) =>
      /[<>]|https?:\/\/|www\./i.test(text),
    )
  )
    return mechanismIssue(ctx, 'business labels must be bounded source text, not URLs or markup');
  const spans = {
    setup: technologyEvidence(ctx, setup, action - 1),
    action: technologyEvidence(ctx, action, response - 1),
    response: technologyEvidence(ctx, response, check - 1),
    check: technologyEvidence(ctx, check, resolve - 1),
    resolve: technologyEvidence(ctx, resolve, ctx.win.endWord),
  };
  if (
    !businessClaims(spans.resolve).some((claim) =>
      claim.toLowerCase().includes(story.outcome.toLowerCase()),
    )
  )
    return mechanismIssue(ctx, 'the quoted outcome must belong to the final local evidence span');
  const claims = Object.values(spans)
    .join(' ')
    .replace(story.condition ?? '\u0000', '');
  if (
    /\b(?:not|never|cannot|can't|won't|doesn't|didn't|isn't|wasn't|hasn't|couldn't|wouldn't|may|might|could|should|would|will|perhaps|maybe|plans?|proposes?|hopes?|allegedly|supposedly|pretends?|unverified|guaranteed?|profits?)\b/i.test(
      claims,
    )
  )
    return mechanismIssue(
      ctx,
      'business evidence must not negate, merely propose, or guarantee the depicted result; stated costs do not establish net profit',
    );
  return { story, spans };
}

/** Positive money/cost scalars only, at most two decimal places, no coerced strings. */
export function money(value: unknown, allowZero = false): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= (allowZero ? 0 : 0.01) &&
    value <= 1_000_000 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-7
    ? value
    : null;
}

/** Boundaries prevent matching 2 within -2, +2, 12, 2.5, or a different unit. */
export function quantityPattern(value: number, unit: string): string {
  const numeric = Number.isInteger(value) ? `${value}(?:\\.0{1,2})?` : escaped(String(value));
  return `(?<![\\d.+-])${numeric}\\s+${escaped(unit)}(?![\\p{L}\\p{N}])`;
}

export function monetaryUnit(value: unknown, ctx: ParseContext): string | null {
  const unit = businessPhrase(value, ctx, 16);
  return unit &&
    /^(?:dollars|euros|pounds|yen|rupees|cents|credits|USD|EUR|GBP|CAD|AUD)$/i.test(unit)
    ? unit
    : null;
}

export function resourceCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 12
    ? value
    : null;
}

export function relationship(pattern: string): RegExp {
  return new RegExp(pattern, 'iu');
}
