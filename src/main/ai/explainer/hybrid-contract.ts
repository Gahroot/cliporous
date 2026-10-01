import {
  type DiagramStory,
  DIAGRAM_LIMITS as L,
} from '../../remotion/compositions/explainer/diagrams/types';
import { TECHNOLOGY_WORD_FIELDS } from '../../remotion/compositions/explainer/technology/types';
import {
  assertedBusinessClaim,
  businessClaims,
  escaped,
} from './concept-business-operations-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue, sourceLabel, strictMechanismBeats } from './mechanism-contract';
import { technologyEvidence, technologySource } from './technology-contract';

const COMMON_FIELDS = [
  'kind',
  'preset',
  'visualMode',
  'label',
  'subject',
  'outcome',
  'condition',
  'evidence',
  'startWord',
  'endWord',
  'layout',
  'continues',
  'transition',
  // Existing planner validates transitions and omits these known extras on protected kinds.
  'laterStamp',
  'annotation',
  'dimWord',
  'reactions',
  'bursts',
  ...TECHNOLOGY_WORD_FIELDS,
];

export function onlyFields(raw: Rec, fields: readonly string[], ctx: ParseContext): boolean {
  if (Object.keys(raw).some((key) => !fields.includes(key))) {
    mechanismIssue(
      ctx,
      'unsupported field; rendering directives and invented measurements are not accepted',
    );
    return false;
  }
  return true;
}
export function hybridPhrase(value: unknown, ctx: ParseContext, max: number): string | null {
  const phrase = sourceLabel(value, ctx, max);
  return phrase && !/[<>]|https?:\/\/|www\./i.test(phrase) ? phrase : null;
}
export function normalizedPhrase(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
export function includesPhrase(text: string, phrase: string): boolean {
  return ` ${normalizedPhrase(text)} `.includes(` ${normalizedPhrase(phrase)} `);
}

export function hybridStory(
  raw: Rec,
  ctx: ParseContext,
  fields: readonly string[],
): {
  story: DiagramStory;
  spans: { setup: string; action: string; response: string; check: string; resolve: string };
} | null {
  if (!onlyFields(raw, [...COMMON_FIELDS, ...fields], ctx)) return null;
  const duration = ctx.win.endTime - ctx.win.startTime;
  if (!Number.isFinite(duration) || duration < 5 || duration > 12)
    return mechanismIssue(ctx, 'explanation needs a complete finite 5–12 second window');
  if (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid')
    return mechanismIssue(
      ctx,
      'visualMode must be diagram or hybrid; both are complete presentations',
    );
  if (raw.evidence !== 'source-stated' && raw.evidence !== 'illustrative')
    return mechanismIssue(ctx, 'evidence must be source-stated or illustrative');
  const beats = strictMechanismBeats(raw, ctx, TECHNOLOGY_WORD_FIELDS, [0.6, 1, 1, 1], L.finalHold);
  const label = hybridPhrase(raw.label, ctx, L.label);
  const subject = hybridPhrase(raw.subject, ctx, L.subject);
  const outcome = hybridPhrase(raw.outcome, ctx, L.outcome);
  if (!beats || !label || !subject || !outcome)
    return mechanismIssue(ctx, 'bounded source labels and five ordered beats required');
  const [setupAt, actionAt, responseAt, checkAt, resolveAt] = beats;
  if (
    [setupAt, actionAt, responseAt, checkAt, resolveAt].some(
      (at) => at < ctx.win.startTime || at > ctx.win.endTime,
    )
  )
    return mechanismIssue(ctx, 'every beat must remain within the complete scene window');
  const source = technologySource(ctx);
  if (/\b(?:hypothetical|illustrative|example)\b/i.test(source) && raw.evidence !== 'illustrative')
    return mechanismIssue(ctx, 'keep the source example/hypothetical visibly illustrative');
  const conditions = [
    ...source.matchAll(/\b(?:if|unless|when|provided that|assuming)\b[^,;.!?]*/gi),
  ];
  const condition =
    raw.condition === undefined ? undefined : hybridPhrase(raw.condition, ctx, L.condition);
  if (
    conditions.length > 1 ||
    (raw.condition !== undefined && !condition) ||
    (conditions[0] &&
      (!condition || normalizedPhrase(condition) !== normalizedPhrase(conditions[0][0]))) ||
    (!conditions.length && condition)
  )
    return mechanismIssue(ctx, 'preserve the complete source condition; do not invent or omit it');
  const indices = TECHNOLOGY_WORD_FIELDS.map((field) => ctx.inWin(raw[field]));
  const [setup, action, response, check, resolve] = indices;
  if (setup === null || action === null || response === null || check === null || resolve === null)
    return null;
  const spans = {
    setup: technologyEvidence(ctx, setup, action - 1),
    action: technologyEvidence(ctx, action, response - 1),
    response: technologyEvidence(ctx, response, check - 1),
    check: technologyEvidence(ctx, check, resolve - 1),
    resolve: technologyEvidence(ctx, resolve, ctx.win.endWord),
  };
  if (
    !businessClaims(spans.resolve).some(
      (claim) =>
        includesPhrase(claim, outcome) &&
        assertedBusinessClaim(claim.replace(new RegExp(escaped(outcome), 'i'), '')),
    )
  )
    return mechanismIssue(
      ctx,
      'outcome must quote the local resolve evidence, not another part of the clip',
    );
  if (!includesPhrase(spans.setup, subject))
    return mechanismIssue(ctx, 'subject must be introduced in the setup evidence');
  return {
    story: {
      visualMode: raw.visualMode,
      evidence: raw.evidence,
      label,
      subject,
      outcome,
      ...(condition ? { condition } : {}),
      setupAt,
      actionAt,
      responseAt,
      checkAt,
      resolveAt,
    },
    spans,
  };
}
