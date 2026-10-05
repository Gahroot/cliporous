import {
  BUSINESS_INPUT_LIMITS,
  type BusinessEvidence,
  type BusinessIdentity,
  type BusinessWordSpan,
  type QuantityBasis,
  type TaskOwnership,
  type VersionedIdentity,
} from '../../remotion/compositions/explainer/business/types';
import {
  assertedBusinessClaim,
  businessClaims,
  escaped,
  quantityPattern,
} from './concept-business-operations-contract';
import { financeActor, financeClaim, shareCount } from './finance-contract';
import { hybridPhrase, includesPhrase, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyEvidence } from './technology-contract';

/**
 * A bounded JSON tree before any recipe reads nested fields. Field allowlists still belong
 * to each concrete parser; this is not a programmable graph or a generic scene parser.
 */
export function boundedBusinessInput(value: unknown, ctx: ParseContext): boolean {
  const pending = [{ value, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop();
    if (!entry) break;
    const candidate = entry.value;
    if (++nodes > BUSINESS_INPUT_LIMITS.nodes || entry.depth > BUSINESS_INPUT_LIMITS.depth) {
      mechanismIssue(ctx, 'business input exceeds its node/depth budget');
      return false;
    }
    if (candidate === null || typeof candidate === 'boolean') continue;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) continue;
    if (typeof candidate === 'string' && candidate.length <= BUSINESS_INPUT_LIMITS.string) continue;
    if (typeof candidate !== 'object' || seen.has(candidate)) {
      mechanismIssue(ctx, 'business input must be a finite bounded JSON tree');
      return false;
    }
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      if (candidate.length > BUSINESS_INPUT_LIMITS.array) {
        mechanismIssue(ctx, 'business input arrays exceed the authored bound');
        return false;
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const keys = Reflect.ownKeys(descriptors);
      if (
        keys.some((key) => typeof key !== 'string' || (key !== 'length' && !/^\d+$/.test(key))) ||
        Object.values(descriptors).some((descriptor) => !('value' in descriptor)) ||
        candidate.length !== keys.length - 1
      ) {
        mechanismIssue(ctx, 'business input rejects accessors, sparse arrays and extra properties');
        return false;
      }
      for (let i = candidate.length - 1; i >= 0; i--)
        pending.push({ value: descriptors[String(i)]?.value, depth: entry.depth + 1 });
    } else {
      const prototype: unknown = Object.getPrototypeOf(candidate);
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      if (
        (prototype !== Object.prototype && prototype !== null) ||
        Reflect.ownKeys(candidate).some((key) => typeof key !== 'string') ||
        Object.values(descriptors).some(
          (descriptor) => !('value' in descriptor) || !descriptor.enumerable,
        )
      ) {
        mechanismIssue(ctx, 'business input rejects prototypes, symbols and non-JSON properties');
        return false;
      }
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (key.length > 64 || ['__proto__', 'prototype', 'constructor'].includes(key)) {
          mechanismIssue(ctx, 'business input rejects unsupported object keys');
          return false;
        }
        pending.push({ value: descriptor.value, depth: entry.depth + 1 });
      }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > BUSINESS_INPUT_LIMITS.bytes) {
    mechanismIssue(ctx, 'business input exceeds its serialized byte budget');
    return false;
  }
  return true;
}

export function businessSpan(raw: unknown, ctx: ParseContext): BusinessWordSpan | null {
  if (!isRec(raw) || !onlyFields(raw, ['fromWord', 'toWord'], ctx)) return null;
  const fromWord = ctx.inWin(raw.fromWord);
  const toWord = ctx.inWin(raw.toWord);
  if (
    fromWord === null ||
    toWord === null ||
    fromWord > toWord ||
    toWord - fromWord + 1 > BUSINESS_INPUT_LIMITS.spanWords
  )
    return mechanismIssue(ctx, 'business evidence needs a bounded local source-word span');
  return { fromWord, toWord };
}

export function businessEvidenceText(span: BusinessWordSpan, ctx: ParseContext): string {
  return technologyEvidence(ctx, span.fromWord, span.toWord);
}

export function businessIdentity(raw: unknown, ctx: ParseContext): BusinessIdentity | null {
  if (!isRec(raw) || !onlyFields(raw, ['id', 'label', 'source'], ctx)) return null;
  const actor = financeActor({ id: raw.id, label: raw.label }, ctx);
  const source = businessSpan(raw.source, ctx);
  if (!actor || !source || !includesPhrase(businessEvidenceText(source, ctx), actor.label))
    return mechanismIssue(ctx, 'identity labels must belong to their own local evidence span');
  return { ...actor, source };
}

/** No inference from performer to authority/accountability, or from skill to permission. */
export function taskOwnership(
  raw: unknown,
  identities: readonly BusinessIdentity[],
  ctx: ParseContext,
): TaskOwnership | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['taskId', 'performerId', 'approverId', 'accountableOwnerId', 'source'], ctx)
  )
    return null;
  const task = identities.find((entry) => entry.id === raw.taskId);
  const performer = identities.find((entry) => entry.id === raw.performerId);
  const approver = identities.find((entry) => entry.id === raw.approverId);
  const owner = identities.find((entry) => entry.id === raw.accountableOwnerId);
  const source = businessSpan(raw.source, ctx);
  if (
    !task ||
    !performer ||
    !owner ||
    !source ||
    (raw.approverId !== null && !approver) ||
    task.id === performer.id ||
    task.id === owner.id ||
    task.id === approver?.id
  )
    return mechanismIssue(ctx, 'task ownership requires explicit task and separately named roles');
  const text = businessEvidenceText(source, ctx);
  const target = escaped(task.label);
  if (
    !financeClaim(text, `${escaped(performer.label)} (?:performs?|executes?) ${target}`) ||
    !financeClaim(text, `${escaped(owner.label)} (?:is|remains) accountable for ${target}`) ||
    (approver
      ? !financeClaim(
          text,
          `${escaped(approver.label)} (?:approves?|(?:is|remains)(?: the)? approver for) ${target}`,
        )
      : !businessClaims(text).some((claim) =>
          new RegExp(`^${target} (?:needs?|requires?) no approval[.\\s]*$`, 'iu').test(claim),
        ))
  )
    return mechanismIssue(
      ctx,
      'role evidence must locally bind each named actor to the actual task',
    );
  return {
    taskId: task.id,
    performerId: performer.id,
    approverId: approver?.id ?? null,
    accountableOwnerId: owner.id,
    source,
  };
}

export interface ConditionalQuantityBasisEvidence {
  readonly state: 'conditional';
  readonly condition: string;
  readonly source: BusinessWordSpan;
}

/**
 * Validates a complete prefix condition plus its actor-bound modal body. This is
 * qualified data only. Pack parsers still bind their exact action/value/roles and
 * must not treat a conditional basis as an observed amount or paid cash.
 */
function conditionalBasisBody(
  evidence: ConditionalQuantityBasisEvidence,
  body: BusinessWordSpan,
  subject: BusinessIdentity,
  period: string,
  ctx: ParseContext,
): boolean {
  if (
    !boundedBusinessInput(evidence, ctx) ||
    !isRec(evidence) ||
    !onlyFields(evidence, ['state', 'condition', 'source'], ctx) ||
    evidence.state !== 'conditional'
  )
    return false;
  const condition = hybridPhrase(evidence.condition, ctx, 64);
  const full = businessSpan(evidence.source, ctx);
  if (!condition || !full || !/^(?:if|unless|only if|provided(?: that)?)\b/iu.test(condition))
    return false;
  const text = businessEvidenceText(body, ctx);
  const fullText = businessEvidenceText(full, ctx);
  const boundary = /[.!?;]$/u;
  if (
    body.fromWord !== full.fromWord + condition.split(/\s+/u).length ||
    body.toWord !== full.toWord ||
    (full.fromWord > 0 && !boundary.test(ctx.words[full.fromWord - 1]?.text ?? '')) ||
    (full.toWord < ctx.words.length - 1 && !boundary.test(ctx.words[full.toWord]?.text ?? '')) ||
    !new RegExp(`^${escaped(condition)}[,\\s]+${escaped(text)}$`, 'iu').test(fullText) ||
    businessClaims(text).length !== 1
  )
    return false;
  const modal = new RegExp(
    `^${escaped(subject.label)}\\s+(?:may|might|could|would|will)\\s+(.+)$`,
    'iu',
  ).exec(text);
  if (!modal?.[1]) return false;
  // The literal reporting period can be May; it is not a second modal verb.
  const remainder = modal[1].replace(
    new RegExp(`\\bduring\\s+${escaped(period)}(?=\\s|[.!?;]|$)`, 'iu'),
    '',
  );
  return assertedBusinessClaim(remainder);
}

/** Pack parsers additionally bind every quantity, action and qualified state. Strict by default. */
export function quantityBasis(
  raw: unknown,
  identities: readonly BusinessIdentity[],
  ctx: ParseContext,
  qualification?: ConditionalQuantityBasisEvidence,
): QuantityBasis | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['subjectId', 'population', 'unit', 'period', 'denominator', 'source'], ctx)
  )
    return null;
  const subject = identities.find((entry) => entry.id === raw.subjectId);
  const population = hybridPhrase(raw.population, ctx, 28);
  const unit = hybridPhrase(raw.unit, ctx, 16);
  const period = hybridPhrase(raw.period, ctx, 28);
  const denominator = raw.denominator === null ? null : shareCount(raw.denominator);
  const source = businessSpan(raw.source, ctx);
  if (
    !subject ||
    !population ||
    !unit ||
    !period ||
    !source ||
    (raw.denominator !== null && denominator === null)
  )
    return mechanismIssue(
      ctx,
      'quantity basis needs explicit subject, population, unit and period',
    );
  const conditional = qualification !== undefined;
  if (conditional && !conditionalBasisBody(qualification, source, subject, period, ctx))
    return mechanismIssue(
      ctx,
      'conditional basis must retain its complete condition and exact actor-bound modal body',
    );
  const denominatorPattern =
    denominator === null
      ? `(?:unknown|unstated|unspecified) ${escaped(population)}(?: denominator)?`
      : `(?:per|of|over|among|from) ${quantityPattern(denominator, population)}`;
  const matches = businessClaims(businessEvidenceText(source, ctx)).some(
    (claim) =>
      (conditional || denominator === null || assertedBusinessClaim(claim)) &&
      includesPhrase(claim, subject.label) &&
      includesPhrase(claim, unit) &&
      includesPhrase(claim, period) &&
      new RegExp(denominatorPattern, 'iu').test(claim),
  );
  if (!matches)
    return mechanismIssue(
      ctx,
      'basis and denominator must belong to one subject-bound source clause',
    );
  return { subjectId: subject.id, population, unit, period, denominator, source };
}

/** No seat/token/task, gross/net, population or reporting-period conversion is inferred. */
export function compatibleQuantityBases(left: QuantityBasis, right: QuantityBasis): boolean {
  const normalized = (text: string) => text.trim().toLowerCase();
  return (
    left.denominator !== null &&
    right.denominator !== null &&
    left.denominator === right.denominator &&
    left.subjectId === right.subjectId &&
    normalized(left.population) === normalized(right.population) &&
    normalized(left.unit) === normalized(right.unit) &&
    normalized(left.period) === normalized(right.period)
  );
}

export function businessEvidence(raw: unknown, ctx: ParseContext): BusinessEvidence | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'label', 'source'], ctx)) return null;
  const state = raw.state;
  if (
    state !== 'source-stated' &&
    state !== 'illustrative' &&
    state !== 'unknown' &&
    state !== 'scenario'
  )
    return mechanismIssue(ctx, 'business evidence state must be explicit and allowlisted');
  const label = hybridPhrase(raw.label, ctx, 40);
  const source = businessSpan(raw.source, ctx);
  if (!label || !source || !includesPhrase(businessEvidenceText(source, ctx), label)) return null;
  const marker = {
    'source-stated': /./u,
    illustrative: /\b(?:illustrative|illustration)\b/iu,
    unknown: /\b(?:unknown|unresolved|unstated|unspecified|not (?:known|measured|supplied))\b/iu,
    scenario: /\b(?:scenario|if|unless|possible|alternative)\b/iu,
  }[state];
  if (
    !marker.test(label) ||
    (state === 'source-stated' &&
      /\b(?:unknown|unresolved|unstated|unspecified|illustrative|illustration|scenario|if|unless|possible|alternative|may|might|could)\b/iu.test(
        label,
      ))
  )
    return mechanismIssue(
      ctx,
      'unknown, illustrative and scenario labels must retain their source state',
    );
  return { state, label, source };
}

export function versionedIdentity(raw: unknown, ctx: ParseContext): VersionedIdentity | null {
  if (!isRec(raw) || !onlyFields(raw, ['identity', 'version', 'source'], ctx)) return null;
  const identity = businessIdentity(raw.identity, ctx);
  const version = hybridPhrase(raw.version, ctx, 20);
  const source = businessSpan(raw.source, ctx);
  if (!identity || !version || !source) return null;
  if (
    !businessClaims(businessEvidenceText(source, ctx)).some(
      (claim) => includesPhrase(claim, identity.label) && includesPhrase(claim, version),
    )
  )
    return mechanismIssue(ctx, 'version evidence must locally bind the named source identity');
  return { identity, version, source };
}
