import {
  commercialContentFits,
  commercialPresentationFits,
} from '../../remotion/compositions/explainer/business/commercial/presentation';
import {
  type BackOfficeBlueprintScene,
  type BusinessBlueprintScene,
  type BusinessReplicationScene,
  COMMERCIAL_LIMITS,
  type CommercialScene,
  type CommercialServiceStage,
  type CommercialSourceFact,
  type FounderDependency,
  type LocalBusinessDifference,
  type ModuleCompatibility,
  type OwnerDependencyBlueprintScene,
  type ReplicationUnit,
  type ServiceLifecycleBlueprintScene,
  type ServiceModulesBlueprintScene,
  type ServiceSlotQuantity,
  type ServiceSlotsBlueprintScene,
} from '../../remotion/compositions/explainer/business/commercial/types';
import type {
  BusinessIdentity,
  BusinessStory,
  BusinessWordSpan,
  QuantityBasis,
} from '../../remotion/compositions/explainer/business/types';
import {
  boundedBusinessInput,
  businessEvidence,
  businessEvidenceText,
  businessIdentity,
  businessSpan,
  compatibleQuantityBases,
  quantityBasis,
} from './business-contract';
import {
  assertedBusinessClaim,
  escaped,
  quantityPattern,
} from './concept-business-operations-contract';
import { hybridPhrase, hybridStory, normalizedPhrase, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const COMMERCIAL_FIELDS = [
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
  'setupWord',
  'actionWord',
  'responseWord',
  'checkWord',
  'resolveWord',
  'factEvidence',
  'business',
];

function finishCommercial<T extends CommercialScene>(scene: T, ctx: ParseContext): T | null {
  if (!commercialContentFits(scene))
    return mechanismIssue(
      ctx,
      'commercial facts exceed eight identities, twelve source links or four unresolved holds',
    );
  if (!commercialPresentationFits(scene))
    return mechanismIssue(
      ctx,
      'commercial fixed-font rails exceed 478px; split the source, never shrink text or omit facts',
    );
  return scene;
}

function commercialBase(
  raw: Rec,
  fields: readonly string[],
  ctx: ParseContext,
): { story: BusinessStory; business: BusinessIdentity } | null {
  if (!onlyFields(raw, [...COMMERCIAL_FIELDS, ...fields], ctx)) return null;
  if (
    !hybridPhrase(raw.label, ctx, COMMERCIAL_LIMITS.label) ||
    !hybridPhrase(raw.subject, ctx, COMMERCIAL_LIMITS.label) ||
    !hybridPhrase(raw.outcome, ctx, COMMERCIAL_LIMITS.phase) ||
    (raw.condition !== undefined && !hybridPhrase(raw.condition, ctx, COMMERCIAL_LIMITS.phase))
  )
    return mechanismIssue(ctx, 'commercial labels and conditions exceed their authored bounds');
  const parsed = hybridStory(raw, ctx, ['factEvidence', 'business', ...fields]);
  const factEvidence = businessEvidence(raw.factEvidence, ctx);
  const business = businessIdentity(raw.business, ctx);
  if (!parsed || !factEvidence || !business) return null;
  if (normalizedPhrase(parsed.story.subject) !== normalizedPhrase(business.label))
    return mechanismIssue(ctx, 'the setup subject must be this source-named business');
  if (
    /\b(?:profit|profits|profitable|guaranteed?|success|successful|growth)\b/iu.test(
      parsed.story.outcome,
    )
  )
    return mechanismIssue(ctx, 'back-office support does not establish profit, growth or success');
  // Planner envelope fields are scalars, not a route for nested rendering directives.
  if (
    (raw.layout !== undefined &&
      (typeof raw.layout !== 'string' ||
        !['stack', 'stack-flipped', 'takeover', 'pip', 'over'].includes(raw.layout))) ||
    (raw.startWord !== undefined && ctx.inWin(raw.startWord) !== ctx.win.startWord) ||
    (raw.endWord !== undefined && ctx.inWin(raw.endWord) !== ctx.win.endWord)
  )
    return mechanismIssue(
      ctx,
      'commercial envelope must preserve the source window and authored layout',
    );
  return { story: { ...parsed.story, factEvidence }, business };
}

function distinctCommercialIdentities(
  entries: readonly BusinessIdentity[],
  ctx: ParseContext,
): boolean {
  if (
    entries.length > COMMERCIAL_LIMITS.entities ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length ||
    new Set(entries.map((entry) => normalizedPhrase(entry.label))).size !== entries.length
  ) {
    mechanismIssue(
      ctx,
      'business, service and tasks need distinct identities within the eight-entity bound',
    );
    return false;
  }
  return true;
}

function backOfficeFact(
  raw: Rec,
  business: BusinessIdentity,
  service: BusinessIdentity,
  task: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): CommercialSourceFact | null {
  const state = raw.state;
  if (
    state !== 'source-stated' &&
    state !== 'negative' &&
    state !== 'unknown' &&
    state !== 'conditional'
  )
    return mechanismIssue(ctx, 'each back-office relationship needs its explicit source state');
  const source = businessSpan(raw.source, ctx);
  if (!source) return null;
  const b = escaped(business.label),
    t = escaped(task.label),
    s = escaped(service.label);
  const target = `${t} (?:for|to support|in support of) ${s}`;
  const action = '(?:performs?|handles?|manages?|provides?|does|carries out)';
  const infinitive = '(?:perform|handle|manage|provide|do|carry out)';
  const positive = `${b} ${action} ${target}`;
  const pattern =
    state === 'negative'
      ? `${b} (?:(?:(?:does|did) not|cannot|can't|doesn't|didn't) ${infinitive}|never ${action}) ${target}`
      : state === 'unknown'
        ? `(?:whether ${positive} is (?:unknown|unstated|unspecified|unresolved)|${b}'s (?:performance|handling|management|provision) of ${target} is (?:unknown|unstated|unspecified|unresolved))`
        : state === 'conditional'
          ? `${b} (?:${action}|(?:may|might|could|will|would|can) ${infinitive}) ${target}`
          : positive;
  // Do not crop off an introductory condition/negation or a trailing qualification.
  const boundary = /[!?;]|\.(?=\s|$)/u;
  if (
    (source.fromWord > ctx.win.startWord &&
      !boundary.test(ctx.words[source.fromWord - 1]?.text ?? '')) ||
    (source.toWord < ctx.win.endWord && !boundary.test(ctx.words[source.toWord]?.text ?? ''))
  )
    return mechanismIssue(ctx, 'support evidence must include its complete local clause');
  const text = businessEvidenceText(source, ctx).replace(/’/gu, "'");
  if (state === 'conditional' && !condition)
    return mechanismIssue(ctx, 'conditional support requires its complete source condition');
  const conditionalPattern = condition
    ? `(?:${escaped(condition)}[,\\s]+${pattern}|${pattern}\\s+${escaped(condition)})`
    : pattern;
  const relation = new RegExp(
    `^${state === 'conditional' ? conditionalPattern : pattern}[.\\s]*$`,
    'iu',
  );
  // Keep commas and conjunctions: splitting them could promote a qualified action to fact.
  if (
    !text
      .split(boundary)
      .some(
        (claim) =>
          relation.test(claim.trim()) &&
          (state !== 'source-stated' || assertedBusinessClaim(claim)),
      )
  )
    return mechanismIssue(
      ctx,
      'support evidence must locally bind this business, action, task and service without changing its state',
    );
  return { state, source };
}

/** Back-office support is a sourced relationship, not an observed completion or profit claim. */
export function parseBackOfficeBlueprint(
  raw: unknown,
  ctx: ParseContext,
): BackOfficeBlueprintScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  if (raw.kind !== 'business-blueprint' || raw.preset !== 'back-office')
    return mechanismIssue(
      ctx,
      'back-office requires its concrete business-blueprint kind and preset',
    );
  const base = commercialBase(raw, ['service', 'tasks'], ctx);
  if (!base) return null;
  const service = businessIdentity(raw.service, ctx);
  if (
    !service ||
    !Array.isArray(raw.tasks) ||
    raw.tasks.length < 1 ||
    raw.tasks.length + 2 > COMMERCIAL_LIMITS.entities ||
    raw.tasks.length > COMMERCIAL_LIMITS.sourceLinks
  )
    return mechanismIssue(
      ctx,
      'back-office requires a named service and bounded source-supported tasks',
    );
  const tasks: BackOfficeBlueprintScene['tasks'][number][] = [];
  for (const entry of raw.tasks) {
    if (!isRec(entry) || !onlyFields(entry, ['task', 'state', 'source'], ctx)) return null;
    const task = businessIdentity(entry.task, ctx);
    if (!task) return null;
    const fact = backOfficeFact(entry, base.business, service, task, base.story.condition, ctx);
    if (!fact) return null;
    tasks.push({ task, ...fact });
  }
  if (
    !distinctCommercialIdentities(
      [base.business, service, ...tasks.map((entry) => entry.task)],
      ctx,
    )
  )
    return null;
  return finishCommercial(
    {
      ...base.story,
      kind: 'business-blueprint',
      preset: 'back-office',
      business: base.business,
      service,
      tasks,
    },
    ctx,
  );
}

type SlotName = 'reserved' | 'used' | 'available';

function slotClaim(
  source: BusinessWordSpan,
  pattern: string,
  condition: string | undefined,
  ctx: ParseContext,
): boolean {
  const boundary = /[!?;]|\.(?=\s|$)/u;
  if (
    (source.fromWord > ctx.win.startWord &&
      !boundary.test(ctx.words[source.fromWord - 1]?.text ?? '')) ||
    (source.toWord < ctx.win.endWord && !boundary.test(ctx.words[source.toWord]?.text ?? ''))
  )
    return false;
  const qualified = condition
    ? `(?:${escaped(condition)}[,\\s]+${pattern}|${pattern}\\s+${escaped(condition)})`
    : pattern;
  const relation = new RegExp(`^${qualified}[.\\s]*$`, 'iu');
  return businessEvidenceText(source, ctx)
    .replace(/’/gu, "'")
    .split(boundary)
    .some((claim) => relation.test(claim.trim()));
}

function serviceSlotQuantity(
  raw: unknown,
  slot: SlotName,
  business: BusinessIdentity,
  service: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): ServiceSlotQuantity | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'count', 'basis', 'source'], ctx)) return null;
  const source = businessSpan(raw.source, ctx);
  const state = raw.state;
  if (
    !source ||
    (state !== 'source-stated' &&
      state !== 'conditional' &&
      state !== 'negative' &&
      state !== 'unknown')
  )
    return mechanismIssue(
      ctx,
      'slot quantities require bounded local evidence and an explicit state',
    );
  const basis = raw.basis === null ? null : quantityBasis(raw.basis, [business, service], ctx);
  if (raw.basis !== null && !basis) return null;
  const b = escaped(business.label),
    s = escaped(service.label);
  if (state === 'negative' || state === 'unknown') {
    if (raw.count !== null)
      return mechanismIssue(ctx, 'negative and unknown slots retain null, never zero');
    const unit = escaped(basis?.unit ?? 'slots');
    const verb = slot === 'reserved' ? 'reserve' : slot === 'used' ? 'use' : 'have available';
    const pattern =
      state === 'negative'
        ? `${b} (?:does not|doesn't|cannot|can't) ${verb} (?:\\d+ )?${unit} for ${s}`
        : `(?:${b}'s ${slot} ${unit} for ${s}|${s}'s ${slot} ${unit} at ${b}) (?:are|is) (?:unknown|unstated|unspecified|unresolved|not measured)`;
    if (!slotClaim(source, pattern, undefined, ctx))
      return mechanismIssue(
        ctx,
        'null slots still need a local business/service relationship and its negative or unknown state',
      );
    return { state, count: null, basis, source };
  }
  if (
    typeof raw.count !== 'number' ||
    !Number.isSafeInteger(raw.count) ||
    raw.count < 0 ||
    !basis ||
    basis.denominator === null
  )
    return mechanismIssue(
      ctx,
      'numeric slots need a nonnegative safe integer and a complete sourced quantity basis',
    );
  if (state === 'conditional' && !condition)
    return mechanismIssue(ctx, 'conditional slots require the complete source condition');
  const count = raw.count;
  const quantity = quantityPattern(count, basis.unit);
  const tail = `(?:during|in|for|per) ${escaped(basis.period)} (?:per|of|over|among|from) ${quantityPattern(basis.denominator, basis.population)}`;
  const action =
    slot === 'reserved'
      ? '(?:reserves?|has reserved)'
      : slot === 'used'
        ? '(?:uses?|has used)'
        : '(?:has|reports?)';
  const numeric =
    basis.subjectId === business.id
      ? `${b} ${action} ${quantity}${slot === 'available' ? ' available' : ''} for ${s} ${tail}`
      : `${s} (?:has|reports?) ${quantity} ${slot} at ${b} ${tail}`;
  if (!slotClaim(source, numeric, state === 'conditional' ? condition : undefined, ctx))
    return mechanismIssue(
      ctx,
      'each count must locally bind this business, service, slot state and exact unit/population/period/denominator',
    );
  return { state, count, basis: { ...basis, denominator: basis.denominator }, source };
}

/** Missing measurements stay null; no total or available capacity is calculated. */
export function parseServiceSlotsBlueprint(
  raw: unknown,
  ctx: ParseContext,
): ServiceSlotsBlueprintScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  if (raw.kind !== 'business-blueprint' || raw.preset !== 'service-slots')
    return mechanismIssue(
      ctx,
      'service-slots requires its concrete business-blueprint kind and preset',
    );
  const base = commercialBase(raw, ['service', 'reserved', 'used', 'available'], ctx);
  if (!base) return null;
  const service = businessIdentity(raw.service, ctx);
  if (!service || !distinctCommercialIdentities([base.business, service], ctx)) return null;
  const quantities: Partial<Record<SlotName, ServiceSlotQuantity | null>> = {};
  let comparison: QuantityBasis | null = null;
  let comparisonState: 'source-stated' | 'conditional' | null = null;
  let links = 0;
  for (const slot of ['reserved', 'used', 'available'] satisfies SlotName[]) {
    const value = raw[slot];
    const quantity =
      value === undefined || value === null
        ? null
        : serviceSlotQuantity(value, slot, base.business, service, base.story.condition, ctx);
    if (value !== undefined && value !== null && !quantity) return null;
    quantities[slot] = quantity;
    if (quantity) links++;
    if (quantity && quantity.count !== null) {
      if (
        comparison &&
        (!compatibleQuantityBases(comparison, quantity.basis) || comparisonState !== quantity.state)
      )
        return mechanismIssue(
          ctx,
          'slot quantities cannot compare different subjects, units, populations, periods, denominators or evidence states',
        );
      comparison = quantity.basis;
      comparisonState = quantity.state;
    }
  }
  if (links > COMMERCIAL_LIMITS.sourceLinks) return null;
  if (
    !links &&
    !slotClaim(
      service.source,
      `${escaped(base.business.label)} (?:provides?|offers?) ${escaped(service.label)}(?: service slots)?`,
      undefined,
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'an unmeasured service still needs a source-stated business/service relationship',
    );
  return finishCommercial(
    {
      ...base.story,
      kind: 'business-blueprint',
      preset: 'service-slots',
      business: base.business,
      service,
      reserved: quantities.reserved ?? null,
      used: quantities.used ?? null,
      available: quantities.available ?? null,
    },
    ctx,
  );
}

type LifecycleRole = 'lead' | 'booking' | 'delivery';

function lifecycleStage(
  raw: unknown,
  role: LifecycleRole,
  business: BusinessIdentity,
  service: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): CommercialServiceStage | null {
  if (!isRec(raw) || !onlyFields(raw, ['identity', 'state', 'source'], ctx)) return null;
  const identity = businessIdentity(raw.identity, ctx);
  const source = businessSpan(raw.source, ctx);
  const state = raw.state;
  if (
    !identity ||
    !source ||
    (state !== 'pending' &&
      state !== 'observed' &&
      state !== 'conditional' &&
      state !== 'negative' &&
      state !== 'unknown')
  )
    return mechanismIssue(
      ctx,
      'each lifecycle artifact needs its own name, local evidence and explicit stage state',
    );
  const b = escaped(business.label),
    i = escaped(identity.label),
    s = escaped(service.label);
  const leadTarget = `${i} as (?:a )?lead`;
  const target = role === 'lead' ? leadTarget : i;
  const action =
    role === 'lead'
      ? '(?:receives?|received)'
      : role === 'booking'
        ? '(?:books?|booked)'
        : '(?:delivers?|delivered)';
  const infinitive = role === 'lead' ? 'receive' : role === 'booking' ? 'book' : 'deliver';
  const past = role === 'lead' ? 'received' : role === 'booking' ? 'booked' : 'delivered';
  const observed = `${b} ${action} ${target} for ${s}`;
  const pattern =
    state === 'pending'
      ? `${b} has ${i} (?:pending as (?:a )?${role}|as (?:a )?pending ${role}) for ${s}`
      : state === 'negative'
        ? `${b} (?:(?:does not|did not|doesn't|didn't|cannot|can't) ${infinitive}|(?:has not|hasn't) ${past}|never ${action}) ${target} for ${s}`
        : state === 'unknown'
          ? `(?:${b}'s ${role} ${i} for ${s} is (?:unknown|unresolved|unstated|unspecified|not known|not confirmed)|whether ${observed} is (?:unknown|unresolved|unstated|unspecified))`
          : state === 'conditional'
            ? `${b} (?:${action}|(?:may|might|could|would|will|can) ${infinitive}) ${target} for ${s}`
            : observed;
  if (state === 'conditional' && !condition)
    return mechanismIssue(
      ctx,
      'conditional lifecycle facts require the complete global source condition',
    );
  if (!slotClaim(source, pattern, state === 'conditional' ? condition : undefined, ctx))
    return mechanismIssue(
      ctx,
      'the stage claim must bind this business, named artifact, service and exact event/state; mention or promise is not observation',
    );
  return { identity, state, source };
}

function sameLifecycleArtifact(
  left: CommercialServiceStage,
  leftRole: LifecycleRole,
  right: CommercialServiceStage,
  rightRole: LifecycleRole,
  business: BusinessIdentity,
  service: BusinessIdentity,
  ctx: ParseContext,
): boolean {
  const a = left.identity,
    b = right.identity;
  if (
    normalizedPhrase(a.label) !== normalizedPhrase(b.label) ||
    a.source.fromWord !== b.source.fromWord ||
    a.source.toWord !== b.source.toWord
  )
    return false;
  const pair = `(?:${leftRole} (?:and|to) ${rightRole}|${rightRole} (?:and|to) ${leftRole})`;
  return slotClaim(
    a.source,
    `${escaped(business.label)} (?:retains?|keeps?|uses?) ${escaped(a.label)} as (?:the )?same (?:artifact|identity) (?:for|through) ${escaped(service.label)}'s ${pair}`,
    undefined,
    ctx,
  );
}

/** Three independent source facts: a lead is not a booking; a booking is not delivery/payment. */
export function parseServiceLifecycleBlueprint(
  raw: unknown,
  ctx: ParseContext,
): ServiceLifecycleBlueprintScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  if (raw.kind !== 'business-blueprint' || raw.preset !== 'service-lifecycle')
    return mechanismIssue(
      ctx,
      'service-lifecycle requires its concrete business-blueprint kind and preset',
    );
  const base = commercialBase(raw, ['service', 'lead', 'booking', 'delivery'], ctx);
  if (!base) return null;
  const service = businessIdentity(raw.service, ctx);
  if (!service) return null;
  const lead = lifecycleStage(raw.lead, 'lead', base.business, service, base.story.condition, ctx);
  const booking = lifecycleStage(
    raw.booking,
    'booking',
    base.business,
    service,
    base.story.condition,
    ctx,
  );
  const delivery = lifecycleStage(
    raw.delivery,
    'delivery',
    base.business,
    service,
    base.story.condition,
    ctx,
  );
  if (!lead || !booking || !delivery) return null;
  if (
    lead.source.toWord >= booking.source.fromWord ||
    booking.source.toWord >= delivery.source.fromWord
  )
    return mechanismIssue(
      ctx,
      'lifecycle source facts must support the declared lead/booking/delivery order without overlapping evidence',
    );
  const stages: { role: LifecycleRole; value: CommercialServiceStage }[] = [
    { role: 'lead', value: lead },
    { role: 'booking', value: booking },
    { role: 'delivery', value: delivery },
  ];
  const identities = [base.business, service];
  let links = stages.length;
  for (let index = 0; index < stages.length; index++) {
    const stage = stages[index];
    const identity = stage.value.identity;
    if (identity.id === base.business.id || identity.id === service.id)
      return mechanismIssue(
        ctx,
        'the business, service and lifecycle artifacts are separate identities',
      );
    for (const earlier of stages.slice(0, index)) {
      if (earlier.value.identity.id === identity.id) {
        if (
          !sameLifecycleArtifact(
            earlier.value,
            earlier.role,
            stage.value,
            stage.role,
            base.business,
            service,
            ctx,
          )
        )
          return mechanismIssue(
            ctx,
            'reused artifact IDs require the same label/source and an explicit local stable-identity relationship',
          );
        links++;
      }
    }
    if (!identities.some((entry) => entry.id === identity.id)) identities.push(identity);
  }
  if (!distinctCommercialIdentities(identities, ctx) || links > COMMERCIAL_LIMITS.sourceLinks)
    return null;
  return finishCommercial(
    {
      ...base.story,
      kind: 'business-blueprint',
      preset: 'service-lifecycle',
      business: base.business,
      service,
      lead,
      booking,
      delivery,
    },
    ctx,
  );
}

function ownerDependency(
  raw: unknown,
  business: BusinessIdentity,
  founder: BusinessIdentity,
  task: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): FounderDependency | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'source'], ctx)) return null;
  const state = raw.state;
  if (
    state !== 'dependent' &&
    state !== 'removed' &&
    state !== 'conditional' &&
    state !== 'negative' &&
    state !== 'unknown'
  )
    return mechanismIssue(ctx, 'owner dependency requires an explicit relationship state');
  const source = businessSpan(raw.source, ctx);
  if (!source) return null;
  const b = escaped(business.label),
    f = escaped(founder.label),
    t = escaped(task.label);
  const dependent = `(?:${b}'s ${t} depends? on ${f}|${b} depends? on ${f} for ${t})`;
  const conditionalVerb = '(?:depends?|(?:may|might|could|can|will|would) depend)';
  const negativeVerb = "(?:(?:does not|did not|doesn't|didn't|cannot|can't) depend|never depends?)";
  const pattern =
    state === 'removed'
      ? `${b} (?:removed|has removed|eliminated|has eliminated) (?:${t}'s dependency on ${f}|(?:the )?dependency of ${t} on ${f})`
      : state === 'conditional'
        ? `(?:${b}'s ${t} ${conditionalVerb} on ${f}|${b} ${conditionalVerb} on ${f} for ${t})`
        : state === 'negative'
          ? `(?:${b}'s ${t} ${negativeVerb} on ${f}|${b} ${negativeVerb} on ${f} for ${t})`
          : state === 'unknown'
            ? `(?:whether ${dependent}|${b}'s ${t} dependency on ${f}|${b}'s dependency on ${f} for ${t}) is (?:unknown|unresolved|unstated|unspecified|not known)`
            : dependent;
  if (state === 'conditional' && !condition)
    return mechanismIssue(
      ctx,
      'conditional owner dependency requires the complete global source condition',
    );
  if (!slotClaim(source, pattern, state === 'conditional' ? condition : undefined, ctx))
    return mechanismIssue(
      ctx,
      'dependency evidence must bind this business/task to this founder and the exact state; a handoff or negated removal is not removal',
    );
  return { state, source };
}

/** A named task's dependency is not a business-wide bottleneck, job loss or profit claim. */
export function parseOwnerDependencyBlueprint(
  raw: unknown,
  ctx: ParseContext,
): OwnerDependencyBlueprintScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  if (raw.kind !== 'business-blueprint' || raw.preset !== 'owner-dependency')
    return mechanismIssue(
      ctx,
      'owner-dependency requires its concrete business-blueprint kind and preset',
    );
  const base = commercialBase(raw, ['founder', 'task', 'dependency'], ctx);
  if (!base) return null;
  const founder = businessIdentity(raw.founder, ctx);
  const task = businessIdentity(raw.task, ctx);
  if (!founder || !task || !distinctCommercialIdentities([base.business, founder, task], ctx))
    return null;
  const dependency = ownerDependency(
    raw.dependency,
    base.business,
    founder,
    task,
    base.story.condition,
    ctx,
  );
  if (!dependency) return null;
  return finishCommercial(
    {
      ...base.story,
      kind: 'business-blueprint',
      preset: 'owner-dependency',
      business: base.business,
      founder,
      task,
      dependency,
    },
    ctx,
  );
}

function moduleCompatibility(
  raw: unknown,
  modules: readonly BusinessIdentity[],
  condition: string | undefined,
  ctx: ParseContext,
): ModuleCompatibility | null {
  if (!isRec(raw) || !onlyFields(raw, ['leftModuleId', 'rightModuleId', 'state', 'source'], ctx))
    return null;
  if (
    typeof raw.leftModuleId !== 'string' ||
    typeof raw.rightModuleId !== 'string' ||
    raw.leftModuleId === raw.rightModuleId
  )
    return mechanismIssue(ctx, 'compatibility requires two distinct declared module IDs');
  const left = modules.find((entry) => entry.id === raw.leftModuleId);
  const right = modules.find((entry) => entry.id === raw.rightModuleId);
  const source = businessSpan(raw.source, ctx);
  const state = raw.state;
  if (
    !left ||
    !right ||
    !source ||
    (state !== 'compatible' &&
      state !== 'incompatible' &&
      state !== 'conditional' &&
      state !== 'unknown')
  )
    return mechanismIssue(
      ctx,
      'compatibility requires declared modules, a local source and an explicit state',
    );
  const l = escaped(left.label),
    r = escaped(right.label);
  const compatible = `${l} is compatible with ${r}`;
  const pattern =
    state === 'incompatible'
      ? `${l} (?:is incompatible with|is not compatible with|cannot combine with|does not work with) ${r}`
      : state === 'conditional'
        ? `${l} (?:is|(?:will|would|may|might|could|can) be) compatible with ${r}`
        : state === 'unknown'
          ? `(?:compatibility between ${l} and ${r}|whether ${compatible}) is (?:unknown|unresolved|unstated|unspecified|not known)`
          : compatible;
  if (state === 'conditional' && !condition)
    return mechanismIssue(
      ctx,
      'conditional compatibility requires the complete global source condition',
    );
  if (!slotClaim(source, pattern, state === 'conditional' ? condition : undefined, ctx))
    return mechanismIssue(
      ctx,
      'compatibility must locally bind the declared left and right modules in that order and state; proximity is not agreement',
    );
  return { leftModuleId: left.id, rightModuleId: right.id, state, source };
}

function repeatedOfferingFact(
  raw: unknown,
  business: BusinessIdentity,
  service: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): CommercialSourceFact | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'source'], ctx)) return null;
  const source = businessSpan(raw.source, ctx);
  const state = raw.state;
  if (
    !source ||
    (state !== 'source-stated' &&
      state !== 'conditional' &&
      state !== 'negative' &&
      state !== 'unknown')
  )
    return mechanismIssue(ctx, 'a repeated offering needs its explicit local source state');
  const b = escaped(business.label),
    s = escaped(service.label);
  const positive = `${b} (?:repeatedly offers?|offers? repeatedly) ${s}`;
  const pattern =
    state === 'negative'
      ? `${b} (?:does not|doesn't) (?:repeatedly offer ${s}|offer ${s} repeatedly)`
      : state === 'unknown'
        ? `(?:whether ${positive}|${b}'s repeated offering of ${s}) is (?:unknown|unresolved|unstated|unspecified|not known)`
        : state === 'conditional'
          ? `(?:${positive}|${b} (?:will|would|may|might|could|can) repeatedly offer ${s})`
          : `(?:${positive}|${b} offers? ${s} repeatedly)`;
  if (state === 'conditional' && !condition)
    return mechanismIssue(
      ctx,
      'conditional repeated offerings require the complete global source condition',
    );
  if (!slotClaim(source, pattern, state === 'conditional' ? condition : undefined, ctx))
    return mechanismIssue(
      ctx,
      'repeat evidence must explicitly bind this business and service; modules do not imply productization',
    );
  return { state, source };
}

/** Named parts stay separate unless a local source states their compatibility. */
export function parseServiceModulesBlueprint(
  raw: unknown,
  ctx: ParseContext,
): ServiceModulesBlueprintScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  if (raw.kind !== 'business-blueprint' || raw.preset !== 'service-modules')
    return mechanismIssue(
      ctx,
      'service-modules requires its concrete business-blueprint kind and preset',
    );
  const base = commercialBase(
    raw,
    ['service', 'modules', 'compatibility', 'repeatedOffering'],
    ctx,
  );
  if (!base) return null;
  const service = businessIdentity(raw.service, ctx);
  if (
    !service ||
    !Array.isArray(raw.modules) ||
    !raw.modules.length ||
    raw.modules.length + 2 > COMMERCIAL_LIMITS.entities ||
    !Array.isArray(raw.compatibility) ||
    raw.compatibility.length > COMMERCIAL_LIMITS.sourceLinks
  )
    return mechanismIssue(
      ctx,
      'service modules require a named service and bounded module/relationship arrays',
    );
  const b = escaped(base.business.label),
    s = escaped(service.label);
  if (!slotClaim(service.source, `${b} (?:offers?|provides?) ${s}(?: service)?`, undefined, ctx))
    return mechanismIssue(ctx, 'this named service must be explicitly offered by this business');
  const modules: BusinessIdentity[] = [];
  for (const entry of raw.modules) {
    const module = businessIdentity(entry, ctx);
    if (!module) return null;
    const m = escaped(module.label);
    if (
      !slotClaim(
        module.source,
        `(?:${b} includes? ${m} in ${s}|${b}'s ${s} includes? ${m}|${b} uses? ${m} as a module of ${s})`,
        undefined,
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'each named module needs its own local business/service membership claim',
      );
    modules.push(module);
  }
  if (!distinctCommercialIdentities([base.business, service, ...modules], ctx)) return null;
  const compatibility: ModuleCompatibility[] = [];
  const pairs = new Set<string>();
  for (const entry of raw.compatibility) {
    const relation = moduleCompatibility(entry, modules, base.story.condition, ctx);
    if (!relation) return null;
    const pair = [relation.leftModuleId, relation.rightModuleId].sort().join(':');
    if (pairs.has(pair))
      return mechanismIssue(
        ctx,
        'duplicate or reversed compatibility pairs cannot add semantic links',
      );
    pairs.add(pair);
    compatibility.push(relation);
  }
  const repeatedOffering =
    raw.repeatedOffering === undefined || raw.repeatedOffering === null
      ? null
      : repeatedOfferingFact(
          raw.repeatedOffering,
          base.business,
          service,
          base.story.condition,
          ctx,
        );
  if (raw.repeatedOffering !== undefined && raw.repeatedOffering !== null && !repeatedOffering)
    return null;
  if (
    1 + modules.length + compatibility.length + (repeatedOffering ? 1 : 0) >
    COMMERCIAL_LIMITS.sourceLinks
  )
    return mechanismIssue(
      ctx,
      'service/module memberships and explicit agreements exceed the twelve-link bound',
    );
  return finishCommercial(
    {
      ...base.story,
      kind: 'business-blueprint',
      preset: 'service-modules',
      business: base.business,
      service,
      modules,
      compatibility,
      repeatedOffering,
    },
    ctx,
  );
}

/** Dispatch stays concrete: no shared graph schema or rendering directives are accepted. */
export function parseBusinessBlueprint(
  raw: unknown,
  ctx: ParseContext,
): BusinessBlueprintScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  if (raw.kind !== 'business-blueprint')
    return mechanismIssue(ctx, 'business-blueprint requires its concrete kind');
  switch (raw.preset) {
    case 'back-office':
      return parseBackOfficeBlueprint(raw, ctx);
    case 'service-slots':
      return parseServiceSlotsBlueprint(raw, ctx);
    case 'service-lifecycle':
      return parseServiceLifecycleBlueprint(raw, ctx);
    case 'owner-dependency':
      return parseOwnerDependencyBlueprint(raw, ctx);
    case 'service-modules':
      return parseServiceModulesBlueprint(raw, ctx);
    default:
      return mechanismIssue(ctx, 'unsupported business-blueprint preset');
  }
}

function standardUse(
  raw: unknown,
  business: BusinessIdentity,
  unit: BusinessIdentity,
  standard: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): ReplicationUnit['standardUse'] | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'source'], ctx)) return null;
  const source = businessSpan(raw.source, ctx);
  const state = raw.state;
  if (
    !source ||
    !['observed', 'pending', 'conditional', 'negative', 'unknown'].includes(String(state))
  )
    return mechanismIssue(ctx, 'standard use needs an explicit local stage state');
  const b = escaped(business.label),
    u = escaped(unit.label),
    s = escaped(standard.label);
  const location = `(?:at|for|within) ${b}`;
  const positive = `${u} uses? ${s} ${location}`;
  const pattern =
    state === 'pending'
      ? `${u}'s use of ${s} ${location} is pending`
      : state === 'negative'
        ? `${u} (?:does not|doesn't|did not|didn't|cannot|can't) use ${s} ${location}`
        : state === 'unknown'
          ? `(?:${u}'s use of ${s} ${location}|whether ${positive}) is (?:unknown|unresolved|unstated|unspecified|not known)`
          : state === 'conditional'
            ? `${u} (?:uses?|(?:will|would|may|might|could|can) use) ${s} ${location}`
            : positive;
  if (state === 'conditional' && !condition)
    return mechanismIssue(ctx, 'conditional standard use needs its complete source condition');
  if (!slotClaim(source, pattern, state === 'conditional' ? condition : undefined, ctx))
    return mechanismIssue(
      ctx,
      'standard use must locally bind this unit, business, standard and exact state; membership is not operating replication',
    );
  // Narrowed explicitly rather than asserting untrusted input to the frozen stage union.
  if (
    state !== 'observed' &&
    state !== 'pending' &&
    state !== 'conditional' &&
    state !== 'negative' &&
    state !== 'unknown'
  )
    return null;
  return { state, source };
}

function localDifference(
  raw: unknown,
  business: BusinessIdentity,
  unit: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): LocalBusinessDifference | null {
  if (!isRec(raw) || !onlyFields(raw, ['label', 'state', 'source'], ctx)) return null;
  const label = hybridPhrase(raw.label, ctx, COMMERCIAL_LIMITS.label);
  const source = businessSpan(raw.source, ctx);
  const state = raw.state;
  if (
    !label ||
    !source ||
    (state !== 'source-stated' &&
      state !== 'conditional' &&
      state !== 'negative' &&
      state !== 'unknown')
  )
    return mechanismIssue(ctx, 'local context needs a bounded label and explicit source state');
  const b = escaped(business.label),
    u = escaped(unit.label),
    l = escaped(label);
  const target = `${l} as (?:its |a )?local context (?:at|for|within) ${b}`;
  const positive = `${u} (?:has|retains) ${target}`;
  const pattern =
    state === 'negative'
      ? `${u} (?:does not|doesn't|did not|didn't) have ${target}`
      : state === 'unknown'
        ? `(?:${u}'s local context ${l} (?:at|for|within) ${b}|whether ${positive}) is (?:unknown|unresolved|unstated|unspecified|not known)`
        : state === 'conditional'
          ? `${u} (?:has|retains|(?:will|would|may|might|could|can) have) ${target}`
          : positive;
  if (state === 'conditional' && !condition)
    return mechanismIssue(ctx, 'conditional local context needs its complete source condition');
  if (!slotClaim(source, pattern, state === 'conditional' ? condition : undefined, ctx))
    return mechanismIssue(
      ctx,
      'local context must belong to this named unit and business in its own complete clause',
    );
  return { label, state, source };
}

/** A common standard and locally distinct context, never inferred franchise growth or profit. */
export function parseBusinessReplication(
  raw: unknown,
  ctx: ParseContext,
): BusinessReplicationScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  if (raw.kind !== 'business-replication' || raw.preset !== 'shared-standard-local-context')
    return mechanismIssue(ctx, 'business-replication requires shared-standard-local-context');
  const base = commercialBase(raw, ['standard', 'units'], ctx);
  if (!base) return null;
  const standard = businessIdentity(raw.standard, ctx);
  if (
    !standard ||
    !Array.isArray(raw.units) ||
    raw.units.length < 2 ||
    raw.units.length + 2 > COMMERCIAL_LIMITS.entities
  )
    return mechanismIssue(
      ctx,
      'replication needs a named standard and at least two bounded distinct local units',
    );
  const b = escaped(base.business.label),
    s = escaped(standard.label);
  if (
    !slotClaim(
      standard.source,
      `(?:${b} (?:uses?|shares?|has) ${s} as (?:a |its |the )?shared standard|${s} is (?:the )?shared standard (?:of|for) ${b})`,
      undefined,
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'this shared standard must be explicitly bound to this business, not merely mentioned',
    );
  const units: ReplicationUnit[] = [];
  for (const entry of raw.units) {
    if (!isRec(entry) || !onlyFields(entry, ['identity', 'standardUse', 'localDifference'], ctx))
      return null;
    const identity = businessIdentity(entry.identity, ctx);
    if (!identity) return null;
    const u = escaped(identity.label);
    if (
      !slotClaim(
        identity.source,
        `(?:${b} includes? ${u} as (?:a |its )?local unit|${u} is (?:a |the )?local unit (?:of|for|within) ${b})`,
        undefined,
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'each local unit needs its own business-bound membership evidence; labels cannot clone a branch',
      );
    const use = standardUse(
      entry.standardUse,
      base.business,
      identity,
      standard,
      base.story.condition,
      ctx,
    );
    const difference = localDifference(
      entry.localDifference,
      base.business,
      identity,
      base.story.condition,
      ctx,
    );
    if (!use || !difference) return null;
    units.push({ identity, standardUse: use, localDifference: difference });
  }
  const identities = [base.business, standard, ...units.map((unit) => unit.identity)];
  if (!distinctCommercialIdentities(identities, ctx)) return null;
  if (
    units.some((unit) =>
      identities.some(
        (identity) =>
          normalizedPhrase(identity.label) === normalizedPhrase(unit.localDifference.label),
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'local context labels must stay distinct from the business, shared standard and unit identities',
    );
  return finishCommercial(
    {
      ...base.story,
      kind: 'business-replication',
      preset: 'shared-standard-local-context',
      business: base.business,
      standard,
      units,
    },
    ctx,
  );
}
