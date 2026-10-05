import { businessAlternativeReadingFits } from '../../remotion/compositions/explainer/business/decisions/alternative-presentation';
import type {
  BusinessAlternativeRecord,
  BusinessAlternativesLens,
  BusinessAlternativesNative,
} from '../../remotion/compositions/explainer/business/decisions/alternative-types';
import type { BusinessWordSpan } from '../../remotion/compositions/explainer/business/types';
import type { PossibleFuturesScene } from '../../remotion/compositions/explainer/concepts/perspective/types';
import {
  boundedBusinessInput,
  businessEvidence,
  businessEvidenceText,
  businessIdentity,
  businessSpan,
} from './business-contract';
import { hybridPhrase, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyClause } from './technology-contract';

function sameSpan(a: BusinessWordSpan, b: BusinessWordSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function literal(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/\s+/gu, ' ').trim();
}
function name(value: unknown, ctx: ParseContext, max: number): string | null {
  const text = hybridPhrase(value, ctx, max);
  return text && /^[\p{L}\p{N}][\p{L}\p{N} '-]*$/u.test(text) ? text : null;
}
/** Exact positive complete local clauses, never a cropped assertion following a modal/negation. */
function complete(span: BusinessWordSpan, expected: string, ctx: ParseContext): boolean {
  const text = businessEvidenceText(span, ctx);
  const before = ctx.words[span.fromWord - 1]?.text;
  return (
    (!before || /[.!?;]$/u.test(before)) &&
    /[.!?;]$/u.test(ctx.words[span.toWord]?.text ?? '') &&
    literal(text) === literal(technologyClause(ctx, span.fromWord)) &&
    literal(text).replace(/[.!?;]$/u, '') === literal(expected)
  );
}

function setupOrAction(
  span: BusinessWordSpan,
  scene: PossibleFuturesScene,
  ctx: ParseContext,
): boolean {
  const from = ctx.words[span.fromWord]?.start;
  const to = ctx.words[span.toWord]?.start;
  return (
    typeof from === 'number' &&
    typeof to === 'number' &&
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    ((from >= scene.setupAt && to < scene.actionAt) ||
      (from >= scene.actionAt && to < scene.responseAt))
  );
}

/** Augments an already fully accepted legacy story. This function never repairs legacy truth. */
export function parseBusinessAlternatives(
  raw: Rec,
  ctx: ParseContext,
  legacy: PossibleFuturesScene,
): BusinessAlternativesLens | null {
  const input = raw.businessAlternatives;
  if (
    !boundedBusinessInput(input, ctx) ||
    !isRec(input) ||
    !onlyFields(input, ['version', 'evidence', 'baseline', 'records', 'native'], ctx) ||
    input.version !== 1 ||
    legacy.preset !== 'branching-scenarios' ||
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid')
  )
    return mechanismIssue(
      ctx,
      'businessAlternatives requires v1, an accepted branching-scenarios story and diagram/hybrid mode',
    );
  const base = input.baseline;
  if (
    !isRec(base) ||
    !onlyFields(base, ['identity', 'subject', 'period', 'revision', 'source'], ctx)
  )
    return mechanismIssue(ctx, 'alternative snapshot needs its complete actual baseline');
  const identity = businessIdentity(base.identity, ctx);
  const subject = businessIdentity(base.subject, ctx);
  const period = name(base.period, ctx, 28);
  const revision = name(base.revision, ctx, 20);
  const source = businessSpan(base.source, ctx);
  const evidence = businessEvidence(input.evidence, ctx);
  if (
    !identity ||
    !subject ||
    !period ||
    !revision ||
    !source ||
    !evidence ||
    evidence.state !== 'illustrative' ||
    evidence.label !== 'illustrative operating-unit records' ||
    !name(identity.label, ctx, 28) ||
    !name(subject.label, ctx, 24) ||
    subject.label !== legacy.subject ||
    identity.id === subject.id ||
    !sameSpan(identity.source, source) ||
    !sameSpan(subject.source, source) ||
    !setupOrAction(source, legacy, ctx) ||
    !complete(
      source,
      `${subject.label} has actual baseline ${identity.label} during ${period} at revision ${revision}`,
      ctx,
    ) ||
    !complete(
      evidence.source,
      `${subject.label} compares illustrative operating-unit records from actual baseline ${identity.label} during ${period} at revision ${revision}`,
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'snapshot needs complete positive same-subject actual baseline and illustrative comparison clauses',
    );
  if (!Array.isArray(input.records) || input.records.length !== legacy.alternatives.length)
    return mechanismIssue(
      ctx,
      'every accepted alternative needs exactly one literal source record',
    );
  const records: BusinessAlternativeRecord[] = [];
  for (const alternative of legacy.alternatives) {
    const matches = input.records.filter(
      (entry) => isRec(entry) && entry.alternativeId === alternative.id,
    );
    const record = matches[0];
    if (
      matches.length !== 1 ||
      !isRec(record) ||
      !onlyFields(
        record,
        ['alternativeId', 'baselineId', 'subjectId', 'period', 'revision', 'identity', 'source'],
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'alternative IDs must match exactly, with no invented or duplicate scenarios',
      );
    const recordIdentity = businessIdentity(record.identity, ctx);
    const recordSource = businessSpan(record.source, ctx);
    if (
      !recordIdentity ||
      !recordSource ||
      !name(recordIdentity.label, ctx, 28) ||
      record.baselineId !== identity.id ||
      record.subjectId !== subject.id ||
      record.period !== period ||
      record.revision !== revision ||
      !sameSpan(recordIdentity.source, recordSource) ||
      !setupOrAction(recordSource, legacy, ctx) ||
      !complete(
        recordSource,
        `${recordIdentity.label} is an illustrative operating-unit record for ${subject.label} from actual baseline ${identity.label} during ${period} at revision ${revision} representing ${alternative.qualifier}`,
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'literal records must independently preserve the same actual baseline, subject, period, revision and original possibility qualifier',
      );
    records.push({
      alternativeId: alternative.id,
      baselineId: identity.id,
      subjectId: subject.id,
      period,
      revision,
      identity: recordIdentity,
      source: recordSource,
    });
  }
  const labels = [identity.label, subject.label, ...records.map((record) => record.identity.label)];
  if (new Set(labels.map(literal)).size !== labels.length)
    return mechanismIssue(
      ctx,
      'baseline, production subject and illustrative records keep distinct source identities',
    );
  let native: BusinessAlternativesNative | null = null;
  if (input.native !== null) {
    const model = input.native;
    if (
      !isRec(model) ||
      !onlyFields(
        model,
        ['assembly', 'baselineId', 'subjectId', 'period', 'revision', 'source'],
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'native must be explicit null or an independently supported A-03 record assembly',
      );
    const modelSource = businessSpan(model.source, ctx);
    if (
      model.assembly !== 'A-03' ||
      model.baselineId !== identity.id ||
      model.subjectId !== subject.id ||
      model.period !== period ||
      model.revision !== revision ||
      !modelSource ||
      !setupOrAction(modelSource, legacy, ctx) ||
      !complete(
        modelSource,
        `${subject.label} maintains illustrative operating-unit records of actual baseline ${identity.label} during ${period} at revision ${revision}`,
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'native assembly requires its own positive actual-baseline/subject/period/revision clause; adjacent facts do not bind it',
      );
    native = {
      assembly: 'A-03',
      baselineId: identity.id,
      subjectId: subject.id,
      period,
      revision,
      source: modelSource,
    };
  }
  if (raw.visualMode === 'hybrid' && !native)
    return mechanismIssue(ctx, 'hybrid alternatives require a supported literal record assembly');
  const lens: BusinessAlternativesLens = {
    version: 1,
    visualMode: raw.visualMode,
    evidence,
    baseline: { identity, subject, period, revision, source },
    records,
    native,
    finalHoldSeconds: ctx.win.endTime - legacy.resolveAt,
  };
  if (!businessAlternativeReadingFits(legacy, lens))
    return mechanismIssue(
      ctx,
      'snapshot exceeds complete fixed-font source reading, identity or final-hold budget',
    );
  return lens;
}
