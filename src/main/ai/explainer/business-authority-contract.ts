import { authorityReadability } from '../../remotion/compositions/explainer/business/authority/readability';
import type {
  ActionLimits,
  AuthorityAuditEvent,
  AuthorityBusinessScene,
  AuthorityCapability,
  AuthorityCondition,
  AuthorityCost,
  AuthorityDate,
  AuthorityDatedCondition,
  AuthorityHandoff,
  AuthorityLimit,
  AuthorityMeasurement,
  AuthorityPermission,
  AuthorityPermissionEntry,
  AuthorityScope,
  ConstraintCheck,
  DelegationScope,
} from '../../remotion/compositions/explainer/business/authority/types';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import type {
  BusinessIdentity,
  BusinessStory,
  BusinessWordSpan,
} from '../../remotion/compositions/explainer/business/types';
import {
  boundedBusinessInput,
  businessEvidence,
  businessEvidenceText,
  businessIdentity,
  businessSpan,
  compatibleQuantityBases,
  quantityBasis,
  taskOwnership,
  versionedIdentity,
} from './business-contract';
import { businessClaims, escaped, quantityPattern } from './concept-business-operations-contract';
import {
  distinctActors,
  financeClaim,
  moneyPattern,
  parseMoney,
  shareCount,
} from './finance-contract';
import { hybridPhrase, hybridStory, includesPhrase, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

function readable<T extends AuthorityBusinessScene>(scene: T, ctx: ParseContext): T | null {
  const issue = authorityReadability(scene).issue;
  return issue ? mechanismIssue(ctx, issue) : scene;
}

interface AuthorityBudget {
  identities: BusinessIdentity[];
  edges: number;
  holds: number;
}

const HEAD_FIELDS = [
  'kind',
  'preset',
  'visualMode',
  'label',
  'subject',
  'outcome',
  'condition',
  'evidence',
  'factEvidence',
  'startWord',
  'endWord',
  'layout',
  'setupWord',
  'actionWord',
  'responseWord',
  'checkWord',
  'resolveWord',
];
const PERMISSION_FIELDS = ['actor', 'scope', 'expiry', 'permissions'];
const LIMIT_FIELDS = [
  'actor',
  'action',
  'capability',
  'permission',
  'decisionSource',
  'scope',
  'actionCondition',
  'expiry',
  'limits',
];

/** Count authored semantic relationships, not repeated source evidence spans. */
function reserveEdges(budget: AuthorityBudget, ctx: ParseContext, count = 1): boolean {
  if (budget.edges + count > 12) {
    mechanismIssue(ctx, 'authority stories allow at most twelve semantic edges');
    return false;
  }
  budget.edges += count;
  return true;
}
function reserveHold(budget: AuthorityBudget, ctx: ParseContext): boolean {
  if (budget.holds >= 4) {
    mechanismIssue(ctx, 'authority stories allow at most four source conditions or date holds');
    return false;
  }
  budget.holds++;
  return true;
}
function sourceSpan(raw: unknown, ctx: ParseContext): BusinessWordSpan | null {
  return businessSpan(raw, ctx);
}
function identity(
  raw: unknown,
  ctx: ParseContext,
  budget: AuthorityBudget,
): BusinessIdentity | null {
  const value = businessIdentity(raw, ctx);
  if (!value) return null;
  if (budget.identities.length >= 8 || !distinctActors([...budget.identities, value]))
    return mechanismIssue(ctx, 'authority identities must be distinct and total at most eight');
  budget.identities.push(value);
  return value;
}

/** Exact clauses also support intentionally negative permission/capability statements.
 * Negation is accepted only in the explicitly selected grammar, never stripped into approval.
 */
function localClaim(
  source: BusinessWordSpan,
  pattern: string,
  ctx: ParseContext,
  condition: string | undefined,
): boolean {
  const text = businessEvidenceText(source, ctx);
  const evidence = condition ? text.replace(new RegExp(escaped(condition), 'iu'), '') : text;
  const clause = new RegExp(`^${pattern}[.\\s]*$`, 'iu');
  return businessClaims(evidence).some((claim) => clause.test(claim));
}
function capabilityState(raw: unknown, ctx: ParseContext): AuthorityCapability | null {
  return raw === 'capable' || raw === 'incapable' || raw === 'unknown'
    ? raw
    : mechanismIssue(
        ctx,
        'capability must be capable, incapable or unknown, independently of permission',
      );
}
function permissionState(raw: unknown, ctx: ParseContext): AuthorityPermission | null {
  return raw === 'permitted' || raw === 'denied' || raw === 'pending' || raw === 'unknown'
    ? raw
    : mechanismIssue(ctx, 'permission must retain its permitted, denied, pending or unknown state');
}
function decisionEvidence(
  actor: BusinessIdentity,
  action: BusinessIdentity,
  capability: AuthorityCapability,
  permission: AuthorityPermission,
  source: BusinessWordSpan,
  ctx: ParseContext,
  condition: string | undefined,
  budget: AuthorityBudget,
): boolean {
  const who = escaped(actor.label);
  const task = escaped(action.label);
  const capabilityPattern = {
    capable: `${who} (?:can perform|is able to perform|is capable of performing) ${task}`,
    incapable: `${who} (?:cannot perform|is unable to perform|is incapable of performing) ${task}`,
    unknown: `${who} (?:ability|capability) (?:to perform|for) ${task} is (?:unknown|unstated|unspecified)`,
  }[capability];
  const permissionPattern = {
    permitted: `${who} (?:is (?:permitted|allowed|authorized) to perform|has permission to perform) ${task}`,
    denied: `${who} (?:is denied permission to perform|is (?:not permitted|not allowed|not authorized) to perform|has no permission to perform) ${task}`,
    pending: `${who} (?:permission|authorization) to perform ${task} (?:is|remains) pending`,
    unknown: `${who} (?:permission|authorization) to perform ${task} is (?:unknown|unstated|unspecified)`,
  }[permission];
  if (
    !localClaim(source, capabilityPattern, ctx, condition) ||
    !localClaim(source, permissionPattern, ctx, condition)
  ) {
    mechanismIssue(
      ctx,
      'capability and permission each need an explicit local actor/verb/action clause',
    );
    return false;
  }
  return reserveEdges(budget, ctx);
}
function scope(
  raw: unknown,
  actor: BusinessIdentity,
  actions: readonly BusinessIdentity[],
  ctx: ParseContext,
  budget: AuthorityBudget,
  condition: string | undefined,
): AuthorityScope | null {
  if (!isRec(raw) || !onlyFields(raw, ['label', 'source'], ctx)) return null;
  const label = hybridPhrase(raw.label, ctx, 40);
  const source = sourceSpan(raw.source, ctx);
  if (!label || !source) return null;
  if (
    !actions.every((action) =>
      localClaim(
        source,
        `${escaped(actor.label)} scope for ${escaped(action.label)} is ${escaped(label)}`,
        ctx,
        condition,
      ),
    )
  )
    return mechanismIssue(ctx, 'scope must explicitly bind this actor to every depicted action');
  return reserveEdges(budget, ctx, actions.length) ? { label, source } : null;
}
function expiry(
  raw: unknown,
  actor: BusinessIdentity,
  actions: readonly BusinessIdentity[],
  ctx: ParseContext,
  budget: AuthorityBudget,
  condition: string | undefined,
): AuthorityDate | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'value', 'source'], ctx)) return null;
  const source = sourceSpan(raw.source, ctx);
  if (!source || !reserveHold(budget, ctx) || !reserveEdges(budget, ctx, actions.length))
    return null;
  if (raw.state === 'unknown' && raw.value === null) {
    if (
      actions.every((action) =>
        localClaim(
          source,
          `${escaped(actor.label)} authority expiry for ${escaped(action.label)} is (?:unknown|unstated|unspecified)`,
          ctx,
          condition,
        ),
      )
    )
      return { state: 'unknown', value: null, source };
  } else if (raw.state === 'stated') {
    // Literal source calendar/expiry text: no Date parsing, seconds conversion or elapsed-time inference.
    const value = hybridPhrase(raw.value, ctx, 32);
    if (
      value &&
      !/\b(?:unknown|unstated|unspecified|pending)\b/iu.test(value) &&
      actions.every((action) =>
        localClaim(
          source,
          `${escaped(actor.label)} authority for ${escaped(action.label)} expires ${escaped(value)}`,
          ctx,
          condition,
        ),
      )
    )
      return { state: 'stated', value, source };
  }
  return mechanismIssue(
    ctx,
    'expiry must quote this actor/action date or an explicit unknown; not beat seconds',
  );
}
function actionCondition(
  raw: unknown,
  actor: BusinessIdentity,
  action: BusinessIdentity,
  ctx: ParseContext,
  budget: AuthorityBudget,
  condition: string | undefined,
): AuthorityCondition | null {
  if (!isRec(raw) || !onlyFields(raw, ['id', 'label', 'state', 'source'], ctx)) return null;
  const value = identity({ id: raw.id, label: raw.label, source: raw.source }, ctx, budget);
  const state = raw.state;
  if (
    !value ||
    (state !== 'satisfied' && state !== 'blocked' && state !== 'pending' && state !== 'unknown') ||
    !reserveHold(budget, ctx) ||
    !reserveEdges(budget, ctx)
  )
    return null;
  const statePattern = {
    satisfied: '(?:satisfied|met)',
    blocked: '(?:blocked|unmet|not satisfied)',
    pending: 'pending',
    unknown: '(?:unknown|unstated|unspecified)',
  }[state];
  if (
    !localClaim(
      value.source,
      `${escaped(actor.label)} condition ${escaped(value.label)} for ${escaped(action.label)} is ${statePattern}`,
      ctx,
      condition,
    )
  )
    return mechanismIssue(
      ctx,
      'condition state must be locally bound to this actor and actual action',
    );
  return { ...value, state };
}
function measurement(
  raw: unknown,
  action: BusinessIdentity,
  ctx: ParseContext,
  budget: AuthorityBudget,
): AuthorityMeasurement | null {
  if (!isRec(raw)) return null;
  if (raw.kind === 'unknown') {
    return onlyFields(raw, ['kind', 'value'], ctx) && raw.value === null
      ? { kind: 'unknown', value: null }
      : mechanismIssue(ctx, 'unknown thresholds must be null, never zero or an invented basis');
  }
  if (raw.kind !== 'count' && raw.kind !== 'money')
    return mechanismIssue(
      ctx,
      'limits accept only exact stated counts, money or an explicit unknown',
    );
  if (
    !onlyFields(
      raw,
      raw.kind === 'count' ? ['kind', 'value', 'basis'] : ['kind', 'amount', 'basis'],
      ctx,
    )
  )
    return null;
  const basis = quantityBasis(raw.basis, budget.identities, ctx);
  if (!basis) return null;
  if (basis.subjectId !== action.id || basis.denominator === null)
    return mechanismIssue(
      ctx,
      'numeric action limits need a complete action-bound source quantity basis',
    );
  if (raw.kind === 'count') {
    const value = shareCount(raw.value, true);
    if (value === null || /^(?:USD|EUR|GBP)$/iu.test(basis.unit))
      return mechanismIssue(
        ctx,
        'count limits require a bounded nonnegative integer and a non-money unit',
      );
    return { kind: 'count', value, basis };
  }
  const amount = parseMoney(raw.amount, ctx);
  if (!amount || basis.unit.toUpperCase() !== amount.currency)
    return mechanismIssue(
      ctx,
      'money limits require exact existing minor-unit money with the same stated unit',
    );
  return { kind: 'money', amount, basis };
}
function limit(
  raw: unknown,
  actor: BusinessIdentity,
  action: BusinessIdentity,
  ctx: ParseContext,
  budget: AuthorityBudget,
  condition: string | undefined,
): AuthorityLimit | null {
  if (!isRec(raw) || !onlyFields(raw, ['id', 'label', 'operator', 'measurement', 'source'], ctx))
    return null;
  const value = identity({ id: raw.id, label: raw.label, source: raw.source }, ctx, budget);
  const operator = raw.operator;
  const measured = measurement(raw.measurement, action, ctx, budget);
  if (
    !value ||
    !measured ||
    (operator !== 'at-most' && operator !== 'at-least' && operator !== 'unknown')
  )
    return null;
  const prefix = `${escaped(actor.label)} ${escaped(action.label)} ${escaped(value.label)}`;
  if (measured.kind === 'unknown') {
    const qualifier =
      operator === 'at-most' ? 'maximum' : operator === 'at-least' ? 'minimum' : 'limit';
    if (
      !localClaim(
        value.source,
        `${prefix} ${qualifier} is (?:unknown|unstated|unspecified)`,
        ctx,
        condition,
      )
    )
      return mechanismIssue(
        ctx,
        'unknown limits still require their actual actor/action and stated limit direction',
      );
    return reserveEdges(budget, ctx) ? { ...value, operator, measurement: measured } : null;
  }
  if (operator === 'unknown')
    return mechanismIssue(ctx, 'known quantities cannot acquire an unstated threshold direction');
  const basis = measured.basis;
  const quantity =
    measured.kind === 'count'
      ? quantityPattern(measured.value, basis.unit)
      : moneyPattern(measured.amount);
  const direction = operator === 'at-most' ? 'at most' : 'at least';
  const denominator = basis.denominator;
  if (denominator === null) return null;
  const pattern = `${escaped(actor.label)} sets ${escaped(action.label)} ${escaped(value.label)} to ${direction} ${quantity} for ${escaped(basis.population)} during ${escaped(basis.period)} per ${quantityPattern(denominator, basis.population)}`;
  if (
    !financeClaim(businessEvidenceText(value.source, ctx), pattern, condition) ||
    !financeClaim(businessEvidenceText(basis.source, ctx), pattern, condition)
  )
    return mechanismIssue(
      ctx,
      'threshold, direction, actor, action and exact basis must belong to the same source claim',
    );
  return reserveEdges(budget, ctx) ? { ...value, operator, measurement: measured } : null;
}
function factBelongsTo(
  story: BusinessStory,
  actor: BusinessIdentity,
  actions: readonly BusinessIdentity[],
  ctx: ParseContext,
): boolean {
  const text = businessEvidenceText(story.factEvidence.source, ctx);
  if (
    !includesPhrase(text, actor.label) ||
    !actions.every((action) => includesPhrase(text, action.label))
  ) {
    mechanismIssue(
      ctx,
      'factEvidence must belong to the depicted actor and actions, not unrelated source facts',
    );
    return false;
  }
  return true;
}

/** OP-09/OP-11 only. OP-10 remains the existing agent-workflow approval-gate contract. */
export function parseDelegationScope(raw: unknown, ctx: ParseContext): DelegationScope | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  if (
    raw.kind !== 'delegation-scope' ||
    (raw.preset !== 'permissions' && raw.preset !== 'action-limits')
  )
    return mechanismIssue(ctx, 'delegation-scope requires the permissions or action-limits preset');
  const fields = raw.preset === 'permissions' ? PERMISSION_FIELDS : LIMIT_FIELDS;
  if (!onlyFields(raw, [...HEAD_FIELDS, ...fields], ctx)) return null;
  if (
    (raw.startWord !== undefined && raw.startWord !== ctx.win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== ctx.win.endWord) ||
    (raw.layout !== undefined &&
      (typeof raw.layout !== 'string' ||
        !['stack', 'stack-flipped', 'takeover', 'pip', 'over'].includes(raw.layout)))
  )
    return mechanismIssue(
      ctx,
      'scene metadata must stay within the validated source window and layouts',
    );
  const parsed = hybridStory(raw, ctx, ['factEvidence', ...fields]);
  if (!parsed) return null;
  const recipe = BUSINESS_RECIPES.find(
    (entry) => entry.kind === raw.kind && entry.preset === raw.preset,
  );
  if (!recipe || recipe.owner !== 'authority' || !recipe.modes.includes(parsed.story.visualMode))
    return mechanismIssue(ctx, 'delegation presentation must use the frozen recipe catalog modes');
  const budget: AuthorityBudget = { identities: [], edges: 0, holds: 0 };
  const factEvidence = businessEvidence(raw.factEvidence, ctx);
  if (!factEvidence) return null;
  if (
    (factEvidence.state === 'illustrative' || factEvidence.state === 'scenario') &&
    parsed.story.evidence !== 'illustrative'
  )
    return mechanismIssue(
      ctx,
      'illustrative or scenario facts must remain an illustrative presentation',
    );
  const story: BusinessStory = { ...parsed.story, factEvidence };
  const actor = identity(raw.actor, ctx, budget);
  if (!actor) return null;
  if (actor.label !== story.subject || !includesPhrase(parsed.spans.setup, actor.label))
    return mechanismIssue(
      ctx,
      'the delegated actor must be the subject introduced in setup evidence',
    );

  if (raw.preset === 'permissions') {
    if (!Array.isArray(raw.permissions) || raw.permissions.length < 1 || raw.permissions.length > 4)
      return mechanismIssue(ctx, 'permissions need one to four explicitly sourced actions');
    const permissions: AuthorityPermissionEntry[] = [];
    for (const entry of raw.permissions) {
      if (
        !isRec(entry) ||
        !onlyFields(entry, ['action', 'capability', 'permission', 'source'], ctx)
      )
        return null;
      const action = identity(entry.action, ctx, budget);
      const capability = capabilityState(entry.capability, ctx);
      const permission = permissionState(entry.permission, ctx);
      const source = sourceSpan(entry.source, ctx);
      if (
        !action ||
        !capability ||
        !permission ||
        !source ||
        !decisionEvidence(
          actor,
          action,
          capability,
          permission,
          source,
          ctx,
          story.condition,
          budget,
        )
      )
        return null;
      permissions.push({ action, capability, permission, source });
    }
    const actions = permissions.map((entry) => entry.action);
    const scoped = scope(raw.scope, actor, actions, ctx, budget, story.condition);
    const expires = expiry(raw.expiry, actor, actions, ctx, budget, story.condition);
    if (
      !scoped ||
      !expires ||
      !factBelongsTo(story, actor, actions, ctx) ||
      !permissions.every((entry) => preservesFinal(story, entry.permission, ctx))
    )
      return null;
    return readable(
      {
        ...story,
        kind: 'delegation-scope',
        preset: 'permissions',
        actor,
        scope: scoped,
        expiry: expires,
        permissions,
      },
      ctx,
    );
  }

  const action = identity(raw.action, ctx, budget);
  const capability = capabilityState(raw.capability, ctx);
  const permission = permissionState(raw.permission, ctx);
  const decisionSource = sourceSpan(raw.decisionSource, ctx);
  if (
    !action ||
    !capability ||
    !permission ||
    !decisionSource ||
    !decisionEvidence(
      actor,
      action,
      capability,
      permission,
      decisionSource,
      ctx,
      story.condition,
      budget,
    )
  )
    return null;
  const scoped = scope(raw.scope, actor, [action], ctx, budget, story.condition);
  const conditioned = actionCondition(
    raw.actionCondition,
    actor,
    action,
    ctx,
    budget,
    story.condition,
  );
  const expires = expiry(raw.expiry, actor, [action], ctx, budget, story.condition);
  if (
    !scoped ||
    !conditioned ||
    !expires ||
    !factBelongsTo(story, actor, [action], ctx) ||
    !preservesFinal(story, permission, ctx) ||
    !preservesFinal(story, conditioned.state, ctx)
  )
    return null;
  if (!Array.isArray(raw.limits) || raw.limits.length < 1 || raw.limits.length > 4)
    return mechanismIssue(
      ctx,
      'action-limits needs one to four source-stated limits or explicit unknowns',
    );
  const limits: AuthorityLimit[] = [];
  for (const entry of raw.limits) {
    const parsedLimit = limit(entry, actor, action, ctx, budget, story.condition);
    if (!parsedLimit) return null;
    limits.push(parsedLimit);
  }
  const result: ActionLimits = {
    ...story,
    kind: 'delegation-scope',
    preset: 'action-limits',
    actor,
    action,
    capability,
    permission,
    decisionSource,
    scope: scoped,
    actionCondition: conditioned,
    expiry: expires,
    limits,
  };
  return readable(result, ctx);
}

function beginAuthority(
  raw: unknown,
  ctx: ParseContext,
  kind: string,
  fields: string[],
): {
  raw: Record<string, unknown>;
  story: BusinessStory;
  budget: AuthorityBudget;
} | null {
  if (
    !boundedBusinessInput(raw, ctx) ||
    !isRec(raw) ||
    raw.kind !== kind ||
    !onlyFields(raw, [...HEAD_FIELDS, ...fields], ctx)
  )
    return null;
  if (
    (raw.startWord !== undefined && raw.startWord !== ctx.win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== ctx.win.endWord) ||
    (raw.layout !== undefined &&
      !['stack', 'stack-flipped', 'takeover', 'pip', 'over'].some(
        (layout) => layout === raw.layout,
      ))
  )
    return null;
  const parsed = hybridStory(raw, ctx, ['factEvidence', ...fields]);
  const recipe = BUSINESS_RECIPES.find(
    (entry) => entry.kind === kind && entry.preset === raw.preset,
  );
  if (
    !parsed ||
    !recipe ||
    recipe.owner !== 'authority' ||
    !recipe.modes.includes(parsed.story.visualMode)
  )
    return mechanismIssue(
      ctx,
      'authority preset and presentation must belong to the frozen catalog',
    );
  const budget: AuthorityBudget = { identities: [], edges: 0, holds: 0 };
  const factEvidence = businessEvidence(raw.factEvidence, ctx);
  if (!factEvidence) return null;
  if (
    (factEvidence.state === 'illustrative' || factEvidence.state === 'scenario') &&
    parsed.story.evidence !== 'illustrative'
  )
    return null;
  return { raw, story: { ...parsed.story, factEvidence }, budget };
}
function actorList(
  raw: unknown,
  ctx: ParseContext,
  budget: AuthorityBudget,
): BusinessIdentity[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4) return null;
  const actors: BusinessIdentity[] = [];
  for (const entry of raw) {
    const actor = identity(entry, ctx, budget);
    if (!actor) return null;
    actors.push(actor);
  }
  return actors;
}
function sourceVersion(raw: unknown, ctx: ParseContext, budget: AuthorityBudget) {
  const record = versionedIdentity(raw, ctx);
  if (
    !record ||
    budget.identities.length >= 8 ||
    !distinctActors([...budget.identities, record.identity])
  )
    return null;
  budget.identities.push(record.identity);
  return record;
}
function rolesFor(
  raw: unknown,
  action: BusinessIdentity,
  ctx: ParseContext,
  budget: AuthorityBudget,
) {
  const roles = taskOwnership(raw, budget.identities, ctx);
  return roles &&
    roles.taskId === action.id &&
    reserveEdges(budget, ctx, roles.approverId === null ? 2 : 3)
    ? roles
    : null;
}
function cost(
  raw: unknown,
  actor: BusinessIdentity,
  action: BusinessIdentity,
  role: 'review' | 'retry',
  ctx: ParseContext,
  budget: AuthorityBudget,
  condition: string | undefined,
): AuthorityCost | null {
  if (
    !isRec(raw) ||
    !onlyFields(
      raw,
      raw.state === 'known'
        ? ['state', 'amount', 'basis', 'source']
        : ['state', 'amount', 'source'],
      ctx,
    )
  )
    return null;
  const source = sourceSpan(raw.source, ctx);
  if (!source) return null;
  const prefix = `${escaped(actor.label)} ${role} cost for ${escaped(action.label)}`;
  if (
    raw.state === 'unknown' &&
    raw.amount === null &&
    localClaim(source, `${prefix} is (?:unknown|unstated|unspecified)`, ctx, condition)
  )
    return { state: 'unknown', amount: null, source };
  if (raw.state !== 'known') return null;
  const amount = parseMoney(raw.amount, ctx);
  const basis = quantityBasis(raw.basis, budget.identities, ctx);
  if (
    !amount ||
    !basis ||
    basis.subjectId !== action.id ||
    basis.denominator === null ||
    basis.unit.toUpperCase() !== amount.currency
  )
    return null;
  const pattern = `${prefix} is ${moneyPattern(amount)} for ${escaped(basis.population)} during ${escaped(basis.period)} per ${quantityPattern(basis.denominator, basis.population)}`;
  if (
    !financeClaim(businessEvidenceText(source, ctx), pattern, condition) ||
    !financeClaim(businessEvidenceText(basis.source, ctx), pattern, condition)
  )
    return null;
  return { state: 'known', amount, basis, source };
}
function preservesFinal(story: BusinessStory, state: string, ctx: ParseContext): boolean {
  if (
    (state === 'pending' ||
      state === 'denied' ||
      state === 'unknown' ||
      state === 'unresolved' ||
      state === 'blocked') &&
    businessClaims(story.outcome).some((claim) => {
      // A conditional possibility or explicit negation does not assert a grant/success.
      // Check each success term locally: "not approved but completed" still fails closed.
      if (/\b(?:if|unless|may|might|could|would)\b/iu.test(claim)) return false;
      return [
        ...claim.matchAll(/\b(?:completed|approved|resolved|successful|accepted|fulfilled)\b/giu),
      ].some(
        (match) =>
          !/\b(?:not|never|no|without)\s+(?:(?:yet|been|be|being|fully|ever|already)\s+)*$/iu.test(
            claim.slice(0, match.index),
          ),
      );
    })
  ) {
    mechanismIssue(
      ctx,
      'the final reading hold must not turn an unresolved source state into success',
    );
    return false;
  }
  return true;
}

/** OP-12..15. Declared routes and source roles, never telemetry or the OP-10 approval parser. */
export function parseAuthorityHandoff(input: unknown, ctx: ParseContext): AuthorityHandoff | null {
  if (!boundedBusinessInput(input, ctx) || !isRec(input)) return null;
  const preset = input.preset;
  const fields =
    preset === 'exception-review'
      ? ['actors', 'action', 'roles', 'exception', 'review', 'reviewCost', 'retryCost']
      : preset === 'declared-audit-chain'
        ? ['actors', 'action', 'record', 'events']
        : preset === 'action-consequences'
          ? ['actors', 'action', 'performerId', 'reversibility', 'consequence']
          : preset === 'accountable-transfer'
            ? ['actors', 'action', 'roles', 'fromId', 'toId', 'transfer']
            : null;
  if (!fields) return mechanismIssue(ctx, 'unsupported authority-handoff preset');
  const root = beginAuthority(input, ctx, 'authority-handoff', fields);
  if (!root) return null;
  const { raw, story, budget } = root;
  const actors = actorList(raw.actors, ctx, budget);
  const action = identity(raw.action, ctx, budget);
  const principal = actors?.find((actor) => actor.label === story.subject);
  if (!actors || !action || !principal || !factBelongsTo(story, principal, [action], ctx))
    return null;
  if (preset === 'exception-review') {
    if (story.evidence !== 'illustrative')
      return mechanismIssue(ctx, 'review paths are declared illustrations, not actual monitoring');
    const roles = rolesFor(raw.roles, action, ctx, budget);
    const exception = identity(raw.exception, ctx, budget);
    const reviewer = actors.find((actor) => actor.id === roles?.approverId);
    if (
      !roles ||
      !exception ||
      !reviewer ||
      !isRec(raw.review) ||
      !onlyFields(raw.review, ['state', 'source'], ctx)
    )
      return null;
    const state = raw.review.state;
    const source = sourceSpan(raw.review.source, ctx);
    if (
      (state !== 'pending' && state !== 'denied' && state !== 'unknown') ||
      !source ||
      !localClaim(
        source,
        `${escaped(reviewer.label)} review of ${escaped(exception.label)} for ${escaped(action.label)} is ${state}`,
        ctx,
        story.condition,
      ) ||
      !preservesFinal(story, state, ctx)
    )
      return null;
    const performer = actors.find((actor) => actor.id === roles.performerId);
    if (!performer) return null;
    const reviewCost = cost(
      raw.reviewCost,
      reviewer,
      action,
      'review',
      ctx,
      budget,
      story.condition,
    );
    const retryCost = cost(raw.retryCost, performer, action, 'retry', ctx, budget, story.condition);
    if (!reviewCost || !retryCost || !reserveEdges(budget, ctx, 2)) return null;
    if (
      reviewCost.state === 'known' &&
      retryCost.state === 'known' &&
      reviewCost.source.fromWord <= retryCost.source.toWord &&
      retryCost.source.fromWord <= reviewCost.source.toWord
    )
      return mechanismIssue(
        ctx,
        'review and retry costs require separate source amounts; do not duplicate one claim',
      );
    return readable(
      {
        ...story,
        kind: 'authority-handoff',
        preset,
        representation: 'declared-illustration',
        actors,
        action,
        roles,
        exception,
        review: { state, source },
        reviewCost,
        retryCost,
      },
      ctx,
    );
  }
  if (preset === 'declared-audit-chain') {
    if (story.evidence !== 'illustrative')
      return mechanismIssue(ctx, 'an audit chain is a declared illustration, not live telemetry');
    const record = sourceVersion(raw.record, ctx, budget);
    if (!record || !Array.isArray(raw.events) || raw.events.length < 1 || raw.events.length > 4)
      return null;
    const events: AuthorityAuditEvent[] = [];
    let previous = -1;
    for (const entry of raw.events) {
      if (!isRec(entry) || !onlyFields(entry, ['id', 'label', 'actorId', 'verb', 'source'], ctx))
        return null;
      const event = identity(
        { id: entry.id, label: entry.label, source: entry.source },
        ctx,
        budget,
      );
      const actor = actors.find((candidate) => candidate.id === entry.actorId);
      const verb = entry.verb;
      if (
        !event ||
        !actor ||
        (verb !== 'records' && verb !== 'reviews' && verb !== 'declares') ||
        event.source.fromWord <= previous ||
        !localClaim(
          event.source,
          `${escaped(actor.label)} ${verb} ${escaped(event.label)} for ${escaped(action.label)} in ${escaped(record.identity.label)} revision ${escaped(record.version)}`,
          ctx,
          story.condition,
        )
      )
        return null;
      if (!reserveEdges(budget, ctx, 3)) return null;
      previous = event.source.toWord;
      events.push({ ...event, actorId: actor.id, verb });
    }
    return readable(
      {
        ...story,
        kind: 'authority-handoff',
        preset,
        representation: 'declared-illustration',
        actors,
        action,
        record,
        events,
      },
      ctx,
    );
  }
  if (preset === 'action-consequences') {
    const performer = actors.find((actor) => actor.id === raw.performerId);
    if (
      !performer ||
      !isRec(raw.reversibility) ||
      !onlyFields(raw.reversibility, ['state', 'source'], ctx) ||
      !isRec(raw.consequence) ||
      !onlyFields(raw.consequence, ['state', 'label', 'source'], ctx)
    )
      return null;
    const state = raw.reversibility.state;
    const source = sourceSpan(raw.reversibility.source, ctx);
    const consequenceState = raw.consequence.state;
    const label = hybridPhrase(raw.consequence.label, ctx, 40);
    const consequenceSource = sourceSpan(raw.consequence.source, ctx);
    if (
      !source ||
      !label ||
      !consequenceSource ||
      (state !== 'reversible' && state !== 'irreversible' && state !== 'unknown') ||
      (consequenceState !== 'source-stated' && consequenceState !== 'unknown') ||
      !localClaim(
        source,
        `${escaped(performer.label)} performing ${escaped(action.label)} is ${state}`,
        ctx,
        story.condition,
      ) ||
      !localClaim(
        consequenceSource,
        `${escaped(performer.label)} consequence of ${escaped(action.label)} is ${escaped(label)}`,
        ctx,
        story.condition,
      ) ||
      (consequenceState === 'unknown' && !/\b(?:unknown|unstated|unspecified)\b/iu.test(label)) ||
      (consequenceState === 'source-stated' &&
        /\b(?:unknown|may|might|could|if|unless)\b/iu.test(label))
    )
      return null;
    if (!reserveEdges(budget, ctx)) return null;
    return readable(
      {
        ...story,
        kind: 'authority-handoff',
        preset,
        actors,
        action,
        performerId: performer.id,
        reversibility: { state, source },
        consequence: { state: consequenceState, label, source: consequenceSource },
      },
      ctx,
    );
  }
  const roles = rolesFor(raw.roles, action, ctx, budget);
  const from = actors.find((actor) => actor.id === raw.fromId);
  const to = actors.find((actor) => actor.id === raw.toId);
  if (
    !roles ||
    !from ||
    !to ||
    from.id === to.id ||
    !isRec(raw.transfer) ||
    !onlyFields(raw.transfer, ['state', 'source'], ctx)
  )
    return null;
  const state = raw.transfer.state;
  const source = sourceSpan(raw.transfer.source, ctx);
  if (
    !source ||
    (state !== 'pending' && state !== 'accepted' && state !== 'denied' && state !== 'unknown') ||
    !localClaim(
      source,
      `${escaped(from.label)} transfer of ${escaped(action.label)} to ${escaped(to.label)} is ${state}`,
      ctx,
      story.condition,
    ) ||
    !preservesFinal(story, state, ctx)
  )
    return null;
  if (!reserveEdges(budget, ctx, 2)) return null;
  return readable(
    {
      ...story,
      kind: 'authority-handoff',
      preset: 'accountable-transfer',
      actors,
      action,
      roles,
      fromId: from.id,
      toId: to.id,
      transfer: { state, source },
    },
    ctx,
  );
}

function incompatible(left: AuthorityLimit, right: AuthorityLimit): boolean {
  const a = left.measurement;
  const b = right.measurement;
  if (a.kind === 'unknown' || b.kind === 'unknown') return true; // Incompatibility must still be declared locally.
  if (a.kind !== b.kind || !compatibleQuantityBases(a.basis, b.basis)) return false;
  let av: number;
  let bv: number;
  if (a.kind === 'count' && b.kind === 'count') {
    av = a.value;
    bv = b.value;
  } else if (a.kind === 'money' && b.kind === 'money' && a.amount.currency === b.amount.currency) {
    av = a.amount.minorUnits;
    bv = b.amount.minorUnits;
  } else return false;
  return (
    (left.operator === 'at-most' && right.operator === 'at-least' && av < bv) ||
    (left.operator === 'at-least' && right.operator === 'at-most' && av > bv)
  );
}
/** OP-16/OP-74. No date arithmetic, legal interpretation or clock-based resolution. */
export function parseConstraintCheck(input: unknown, ctx: ParseContext): ConstraintCheck | null {
  if (!boundedBusinessInput(input, ctx) || !isRec(input)) return null;
  const preset = input.preset;
  const fields =
    preset === 'conflicting-limits'
      ? ['actor', 'action', 'requirements', 'collision']
      : preset === 'dated-conditions'
        ? ['actor', 'action', 'policy', 'conditions', 'relationship']
        : null;
  if (!fields) return mechanismIssue(ctx, 'unsupported constraint-check preset');
  const root = beginAuthority(input, ctx, 'constraint-check', fields);
  if (!root) return null;
  const { raw, story, budget } = root;
  const actor = identity(raw.actor, ctx, budget);
  const action = identity(raw.action, ctx, budget);
  if (
    !actor ||
    !action ||
    actor.label !== story.subject ||
    !factBelongsTo(story, actor, [action], ctx) ||
    !reserveEdges(budget, ctx)
  )
    return null;
  if (preset === 'conflicting-limits') {
    if (
      story.visualMode !== 'diagram' ||
      !Array.isArray(raw.requirements) ||
      raw.requirements.length !== 2 ||
      !isRec(raw.collision) ||
      !onlyFields(raw.collision, ['state', 'source'], ctx) ||
      raw.collision.state !== 'unresolved'
    )
      return null;
    const left = limit(raw.requirements[0], actor, action, ctx, budget, story.condition);
    const right = limit(raw.requirements[1], actor, action, ctx, budget, story.condition);
    const source = sourceSpan(raw.collision.source, ctx);
    if (
      !left ||
      !right ||
      !source ||
      !incompatible(left, right) ||
      !localClaim(
        source,
        `${escaped(actor.label)} ${escaped(action.label)} ${escaped(left.label)} conflicts with ${escaped(right.label)}`,
        ctx,
        story.condition,
      ) ||
      !localClaim(
        source,
        `${escaped(actor.label)} ${escaped(action.label)} remains unresolved`,
        ctx,
        story.condition,
      ) ||
      !preservesFinal(story, 'unresolved', ctx) ||
      !/\bunresolved\b/iu.test(story.outcome)
    )
      return null;
    if (!reserveEdges(budget, ctx)) return null;
    return readable(
      {
        ...story,
        kind: 'constraint-check',
        preset,
        visualMode: 'diagram',
        actor,
        action,
        requirements: [left, right],
        collision: { state: 'unresolved', source },
      },
      ctx,
    );
  }
  const policy = sourceVersion(raw.policy, ctx, budget);
  if (
    !policy ||
    !localClaim(
      policy.source,
      `${escaped(actor.label)} ${escaped(action.label)} uses ${escaped(policy.identity.label)} revision ${escaped(policy.version)}`,
      ctx,
      story.condition,
    ) ||
    !reserveEdges(budget, ctx) ||
    !Array.isArray(raw.conditions) ||
    raw.conditions.length < 2 ||
    raw.conditions.length > 4 ||
    !isRec(raw.relationship) ||
    !onlyFields(raw.relationship, ['state', 'source'], ctx)
  )
    return null;
  const conditions: AuthorityDatedCondition[] = [];
  for (const entry of raw.conditions) {
    if (!isRec(entry) || !onlyFields(entry, ['id', 'label', 'state', 'date', 'source'], ctx))
      return null;
    const held = actionCondition(
      { id: entry.id, label: entry.label, state: entry.state, source: entry.source },
      actor,
      action,
      ctx,
      budget,
      story.condition,
    );
    if (!held || !isRec(entry.date) || !onlyFields(entry.date, ['state', 'value', 'source'], ctx))
      return null;
    const source = sourceSpan(entry.date.source, ctx);
    if (!source) return null;
    const prefix = `${escaped(actor.label)} ${escaped(action.label)} ${escaped(held.label)} date is`;
    let date: AuthorityDate;
    if (
      entry.date.state === 'unknown' &&
      entry.date.value === null &&
      localClaim(source, `${prefix} (?:unknown|unstated|unspecified)`, ctx, story.condition)
    ) {
      date = { state: 'unknown', value: null, source };
    } else if (entry.date.state === 'stated') {
      const value = hybridPhrase(entry.date.value, ctx, 32);
      if (
        !value ||
        /\b(?:unknown|unstated|pending|unspecified)\b/iu.test(value) ||
        !localClaim(source, `${prefix} ${escaped(value)}`, ctx, story.condition)
      )
        return null;
      date = { state: 'stated', value, source };
    } else return null;
    conditions.push({ ...held, date });
  }
  const state = raw.relationship.state;
  const source = sourceSpan(raw.relationship.source, ctx);
  if (
    !source ||
    (state !== 'compatible' && state !== 'conflicting' && state !== 'unresolved') ||
    !localClaim(
      source,
      `${escaped(actor.label)} ${escaped(action.label)} ${conditions.map((entry) => escaped(entry.label)).join(' with ')} are ${state}`,
      ctx,
      story.condition,
    ) ||
    !preservesFinal(
      story,
      conditions.some((entry) => entry.state !== 'satisfied') ? 'pending' : state,
      ctx,
    )
  )
    return null;
  if (!reserveEdges(budget, ctx, conditions.length - 1)) return null;
  return readable(
    {
      ...story,
      kind: 'constraint-check',
      preset: 'dated-conditions',
      actor,
      action,
      policy,
      conditions,
      relationship: { state, source },
    },
    ctx,
  );
}
