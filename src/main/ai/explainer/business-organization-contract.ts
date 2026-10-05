import {
  ORGANIZATION_TABLE,
  OrganizationLayoutError,
  organizationPageDuration,
  organizationPresentation,
} from '../../remotion/compositions/explainer/business/organization/presentation';
import {
  type ChargebackQuantity,
  type DecisionRight,
  type DecisionRightsScene,
  type DeclaredToolBoundariesScene,
  type FederatedUnitsScene,
  ORGANIZATION_LIMITS as L,
  type OrganizationFact,
  type OrganizationMapScene,
  type OrganizationScene,
  type ReconciliationRecord,
  type RolloutRingsScene,
  type StatedChargebackScene,
  type SystemReconciliationScene,
} from '../../remotion/compositions/explainer/business/organization/types';
import type {
  BusinessIdentity,
  BusinessStory,
  BusinessWordSpan,
  VersionedIdentity,
} from '../../remotion/compositions/explainer/business/types';
import {
  boundedBusinessInput,
  businessEvidence,
  businessEvidenceText,
  businessIdentity,
  businessSpan,
  compatibleQuantityBases,
  quantityBasis,
  versionedIdentity,
} from './business-contract';
import { escaped } from './concept-business-operations-contract';
import {
  conservesMoney,
  moneyPattern,
  parseMoney,
  sameCurrency,
  shareCount,
} from './finance-contract';
import { hybridPhrase, hybridStory, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const COMMON = [
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
  'setupWord',
  'actionWord',
  'responseWord',
  'checkWord',
  'resolveWord',
  'factEvidence',
  'organization',
];
type Base = BusinessStory & { organization: BusinessIdentity };
const FACT_STATES = ['declared', 'negative', 'conditional', 'unknown'] as const;
function choice<T extends string>(value: unknown, values: readonly T[]): T | null {
  return values.find((entry) => entry === value) ?? null;
}
function list<T>(
  value: unknown,
  min: number,
  max: number,
  parse: (entry: unknown) => T | null,
  ctx: ParseContext,
): T[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    return mechanismIssue(ctx, `organization array must contain ${min}–${max} explicit entries`);
  const result: T[] = [];
  for (const entry of value) {
    const parsed = parse(entry);
    if (parsed === null) return null;
    result.push(parsed);
  }
  return result;
}
function clauses(text: string): string[] {
  return text
    .replace(/’/gu, "'")
    .split(/[!?;]|\.(?=\s|$)/u)
    .map((part) => part.trim())
    .filter(Boolean);
}
function matches(text: string, pattern: string): boolean {
  return new RegExp(`^(?:${pattern})$`, 'iu').test(text);
}
/** A complete local sentence: cropping away a negation, condition or contradictory tail fails. */
function localText(source: BusinessWordSpan, ctx: ParseContext): string | null {
  const before = ctx.words[source.fromWord - 1]?.text ?? '';
  const last = ctx.words[source.toWord]?.text ?? '';
  const text = businessEvidenceText(source, ctx);
  const parts = clauses(text);
  if (
    (source.fromWord !== ctx.win.startWord && !/[.!?;]$/u.test(before)) ||
    (source.toWord !== ctx.win.endWord && !/[.!?;]$/u.test(last)) ||
    parts.length !== 1
  )
    return mechanismIssue(
      ctx,
      'each fact needs its own complete local clause, including qualifiers',
    );
  return parts[0];
}
function conditional(pattern: string, base: Base): string {
  return base.condition ? `${escaped(base.condition)}, ${pattern}` : '(?!)';
}
/** Patterns bind the actor, verb, target, state and condition together, never label presence. */
function bind(
  source: BusinessWordSpan,
  state: string,
  patterns: Readonly<Record<string, string>>,
  ctx: ParseContext,
): boolean {
  const text = localText(source, ctx);
  const selected = patterns[state];
  if (!text || !selected || !matches(text, selected)) {
    mechanismIssue(
      ctx,
      'local source must bind the actual actor, action, relationship and explicit state',
    );
    return false;
  }
  const all = clauses(
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .map((word) => word.text)
      .join(' '),
  );
  if (
    all.some((clause) =>
      Object.entries(patterns).some(
        ([other, pattern]) => other !== state && matches(clause, pattern),
      ),
    )
  ) {
    mechanismIssue(
      ctx,
      'contradictory source states for the same relationship cannot be collapsed',
    );
    return false;
  }
  return true;
}
function role(
  raw: unknown,
  roleName: string,
  organization: BusinessIdentity,
  ctx: ParseContext,
): BusinessIdentity | null {
  const identity = businessIdentity(raw, ctx);
  if (!identity) return null;
  const pattern = `${escaped(identity.label)} is (?:a|an|the) ${roleName} (?:at|of) ${escaped(organization.label)}`;
  return bind(
    identity.source,
    'declared',
    {
      declared: pattern,
      negative: `${escaped(identity.label)} is not (?:a|an|the) ${roleName} (?:at|of) ${escaped(organization.label)}`,
    },
    ctx,
  )
    ? identity
    : null;
}
function unitList(raw: unknown, base: Base, ctx: ParseContext, min = 1): BusinessIdentity[] | null {
  return list(raw, min, 6, (entry) => role(entry, 'local unit', base.organization, ctx), ctx);
}
function ref(
  value: unknown,
  identities: readonly BusinessIdentity[],
  ctx: ParseContext,
): BusinessIdentity | null {
  return (
    identities.find((identity) => identity.id === value) ??
    mechanismIssue(ctx, 'reference must name an explicit distinct organization identity')
  );
}
function baseStory(
  raw: Rec,
  kind: string,
  fields: readonly string[],
  ctx: ParseContext,
): Base | null {
  if (raw.kind !== kind || !onlyFields(raw, [...COMMON, ...fields], ctx))
    return mechanismIssue(ctx, 'unsupported organization kind or fields');
  const parsed = hybridStory(raw, ctx, ['organization', 'factEvidence', ...fields]);
  const organization = businessIdentity(raw.organization, ctx);
  const factEvidence = businessEvidence(raw.factEvidence, ctx);
  if (!parsed || !organization || !factEvidence) return null;
  if (
    parsed.story.subject !== organization.label ||
    parsed.story.label !== organization.label ||
    !bind(
      organization.source,
      'declared',
      {
        declared: `${escaped(organization.label)} is an organization`,
        negative: `${escaped(organization.label)} is not an organization`,
      },
      ctx,
    ) ||
    factEvidence.source.fromWord < Number(raw.resolveWord) ||
    localText(factEvidence.source, ctx) !== parsed.story.outcome ||
    factEvidence.label !== parsed.story.outcome ||
    (parsed.story.evidence === 'illustrative'
      ? factEvidence.state !== 'illustrative'
      : factEvidence.state === 'illustrative')
  )
    return mechanismIssue(
      ctx,
      'organization and evidence must retain their own local setup/resolve roles',
    );
  if (
    /\b(?:approved|paid|adopted|merged|completed|cleared|resolved|monitored|successful|profit)\b/iu.test(
      parsed.story.outcome,
    )
  )
    return mechanismIssue(
      ctx,
      'organization resolution cannot assert approval, payment, adoption, merge or monitoring',
    );
  return { ...parsed.story, organization, factEvidence };
}
function finish<T extends OrganizationScene>(
  scene: T,
  identities: readonly BusinessIdentity[],
  relationships: number,
  holds: number,
  ctx: ParseContext,
  duplicateRecordLabels = false,
): T | null {
  if (
    identities.length > L.entities ||
    new Set(identities.map((entry) => entry.id)).size !== identities.length ||
    (!duplicateRecordLabels &&
      new Set(identities.map((entry) => entry.label.toLowerCase())).size !== identities.length) ||
    relationships > L.sourceLinks ||
    holds > L.holds
  )
    return mechanismIssue(
      ctx,
      'organization requires <=8 distinct entities, <=12 relationships and <=4 explicit holds',
    );
  try {
    const pages = organizationPresentation(scene).pages;
    if (
      !pages.length ||
      organizationPageDuration(scene, pages.length) < ORGANIZATION_TABLE.settledSeconds
    )
      return mechanismIssue(
        ctx,
        'insufficient complete window: every fixed-font page needs >=1.5s at full diagram opacity before resolve',
      );
  } catch (error) {
    if (!(error instanceof OrganizationLayoutError)) throw error;
    return mechanismIssue(ctx, error.message);
  }
  return scene;
}
function unresolved(states: readonly string[]): number {
  return states.filter(
    (state) =>
      ![
        'declared',
        'permitted',
        'configured',
        'observed',
        'matched',
        'allowed',
        'source-stated',
      ].includes(state),
  ).length;
}
function usedAll(
  identities: readonly BusinessIdentity[],
  ids: readonly string[],
  ctx: ParseContext,
): boolean {
  if (identities.some((identity) => !ids.includes(identity.id))) {
    mechanismIssue(ctx, 'every declared identity must retain its own supported relationship');
    return false;
  }
  return true;
}
function fact(
  raw: unknown,
  base: Base,
  patterns: Readonly<Record<string, string>>,
  ctx: ParseContext,
): OrganizationFact | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'source'], ctx)) return null;
  const state = choice(raw.state, FACT_STATES);
  const source = businessSpan(raw.source, ctx);
  if (
    !state ||
    !source ||
    (state === 'conditional' && !base.condition) ||
    !bind(source, state, patterns, ctx)
  )
    return null;
  return { state, source };
}
function parseFederated(raw: Rec, ctx: ParseContext): FederatedUnitsScene | null {
  const base = baseStory(raw, 'organization-map', ['units', 'tasks', 'responsibilities'], ctx);
  if (!base) return null;
  const units = unitList(raw.units, base, ctx, 2);
  const tasks = list(raw.tasks, 1, 5, (entry) => role(entry, 'task', base.organization, ctx), ctx);
  if (!units || !tasks) return null;
  const responsibilities = list(
    raw.responsibilities,
    1,
    8,
    (entry): FederatedUnitsScene['responsibilities'][number] | null => {
      if (
        !isRec(entry) ||
        !onlyFields(entry, ['unitId', 'taskId', 'scope', 'sharedWithId', 'state', 'source'], ctx)
      )
        return null;
      const unit = ref(entry.unitId, units, ctx),
        task = ref(entry.taskId, tasks, ctx);
      const scope = choice(entry.scope, ['local', 'shared']);
      const peer = entry.sharedWithId === null ? null : ref(entry.sharedWithId, units, ctx);
      if (
        !unit ||
        !task ||
        !scope ||
        (scope === 'shared' ? !peer || peer.id === unit.id : entry.sharedWithId !== null)
      )
        return null;
      const tail = `${scope} responsibility for ${escaped(task.label)}${peer ? ` with ${escaped(peer.label)}` : ''} within ${escaped(base.organization.label)}`;
      const positive = `${escaped(unit.label)} has ${tail}`;
      const parsed = fact(
        { state: entry.state, source: entry.source },
        base,
        {
          declared: positive,
          negative: `${escaped(unit.label)} does not have ${tail}`,
          unknown: `Whether ${escaped(unit.label)} has ${tail} is unknown`,
          conditional: conditional(positive, base),
        },
        ctx,
      );
      return parsed
        ? { ...parsed, unitId: unit.id, taskId: task.id, scope, sharedWithId: peer?.id ?? null }
        : null;
    },
    ctx,
  );
  if (
    !responsibilities ||
    new Set(responsibilities.map((entry) => `${entry.unitId}:${entry.taskId}`)).size !==
      responsibilities.length ||
    !usedAll(
      units,
      responsibilities.flatMap((entry) => [
        entry.unitId,
        ...(entry.sharedWithId ? [entry.sharedWithId] : []),
      ]),
      ctx,
    ) ||
    !usedAll(
      tasks,
      responsibilities.map((entry) => entry.taskId),
      ctx,
    )
  )
    return null;
  const identities = [base.organization, ...units, ...tasks];
  return finish(
    {
      ...base,
      kind: 'organization-map',
      preset: 'federated-units',
      units,
      tasks,
      responsibilities,
    },
    identities,
    identities.length - 1 + responsibilities.length,
    unresolved(responsibilities.map((entry) => entry.state)),
    ctx,
  );
}
function parseRights(raw: Rec, ctx: ParseContext): DecisionRightsScene | null {
  const base = baseStory(raw, 'organization-map', ['units', 'rights'], ctx);
  if (!base) return null;
  const units = list(
    raw.units,
    1,
    5,
    (entry): DecisionRightsScene['units'][number] | null => {
      if (!isRec(entry) || !onlyFields(entry, ['identity', 'role'], ctx)) return null;
      const unitRole = choice(entry.role, ['local', 'central']);
      const identity = unitRole
        ? role(entry.identity, `${unitRole} unit`, base.organization, ctx)
        : null;
      return identity && unitRole ? { identity, role: unitRole } : null;
    },
    ctx,
  );
  if (!units) return null;
  const identities = units.map((entry) => entry.identity);
  const rights = list(
    raw.rights,
    1,
    4,
    (entry): DecisionRight | null => {
      if (
        !isRec(entry) ||
        !onlyFields(
          entry,
          ['decision', 'unitId', 'scope', 'sharedWithId', 'permission', 'source', 'escalation'],
          ctx,
        )
      )
        return null;
      const decision = role(entry.decision, 'decision', base.organization, ctx);
      const unit = ref(entry.unitId, identities, ctx);
      const scope = choice(entry.scope, ['local', 'central', 'shared']);
      const peer = entry.sharedWithId === null ? null : ref(entry.sharedWithId, identities, ctx);
      const permission = choice(entry.permission, [
        'permitted',
        'denied',
        'pending',
        'conditional',
        'unknown',
      ]);
      const source = businessSpan(entry.source, ctx);
      if (
        !decision ||
        !unit ||
        !scope ||
        !permission ||
        !source ||
        (scope === 'shared' ? !peer || peer.id === unit.id : entry.sharedWithId !== null) ||
        (scope !== 'shared' && units.find((item) => item.identity.id === unit.id)?.role !== scope)
      )
        return null;
      const action = `decide ${escaped(decision.label)} ${scope === 'shared' ? `jointly with ${escaped(peer?.label ?? '')}` : scope === 'local' ? 'locally' : 'centrally'} within ${escaped(base.organization.label)}`;
      const positive = `${escaped(unit.label)} is permitted to ${action}`;
      if (
        !bind(
          source,
          permission,
          {
            permitted: positive,
            denied: `${escaped(unit.label)} is not permitted to ${action}`,
            pending: `${escaped(unit.label)} has permission to ${action} pending`,
            unknown: `Whether ${escaped(unit.label)} is permitted to ${action} is unknown`,
            conditional: conditional(positive, base),
          },
          ctx,
        )
      )
        return null;
      let escalation: DecisionRight['escalation'] = null;
      if (entry.escalation !== null) {
        if (
          !isRec(entry.escalation) ||
          !onlyFields(entry.escalation, ['toUnitId', 'state', 'source'], ctx)
        )
          return null;
        const target = ref(entry.escalation.toUnitId, identities, ctx);
        if (!target || target.id === unit.id) return null;
        const route = `an escalation route for ${escaped(decision.label)} to ${escaped(target.label)} within ${escaped(base.organization.label)}`;
        const positiveRoute = `${escaped(unit.label)} has ${route}`;
        const parsed = fact(
          { state: entry.escalation.state, source: entry.escalation.source },
          base,
          {
            declared: positiveRoute,
            negative: `${escaped(unit.label)} does not have ${route}`,
            unknown: `Whether ${escaped(unit.label)} has ${route} is unknown`,
            conditional: conditional(positiveRoute, base),
          },
          ctx,
        );
        if (!parsed) return null;
        escalation = { ...parsed, toUnitId: target.id };
      }
      return {
        decision,
        unitId: unit.id,
        scope,
        sharedWithId: peer?.id ?? null,
        permission,
        source,
        escalation,
      };
    },
    ctx,
  );
  if (
    !rights ||
    !usedAll(
      identities,
      rights.flatMap((entry) => [
        entry.unitId,
        ...(entry.sharedWithId ? [entry.sharedWithId] : []),
        ...(entry.escalation ? [entry.escalation.toUnitId] : []),
      ]),
      ctx,
    )
  )
    return null;
  const entities = [base.organization, ...identities, ...rights.map((right) => right.decision)];
  const states = rights.flatMap((right) => [
    right.permission,
    ...(right.escalation ? [right.escalation.state] : []),
  ]);
  return finish(
    { ...base, kind: 'organization-map', preset: 'decision-rights', units, rights },
    entities,
    entities.length - 1 + states.length,
    unresolved(states),
    ctx,
  );
}
function version(
  raw: unknown,
  roleName: string,
  base: Base,
  ctx: ParseContext,
): VersionedIdentity | null {
  const parsed = versionedIdentity(raw, ctx);
  if (!parsed || !isRec(raw) || !role(raw.identity, roleName, base.organization, ctx)) return null;
  const identity = escaped(parsed.identity.label),
    revision = escaped(parsed.version),
    org = escaped(base.organization.label);
  return bind(
    parsed.source,
    'declared',
    {
      declared: `${identity} has version ${revision} at ${org}`,
      negative: `${identity} does not have version ${revision} at ${org}`,
    },
    ctx,
  )
    ? parsed
    : null;
}
function parseRollout(raw: Rec, ctx: ParseContext): RolloutRingsScene | null {
  const base = baseStory(raw, 'organization-map', ['rollout', 'rings'], ctx);
  if (!base) return null;
  const rollout = version(raw.rollout, 'rollout', base, ctx);
  if (!rollout) return null;
  const rings = list(
    raw.rings,
    1,
    4,
    (entry): RolloutRingsScene['rings'][number] | null => {
      if (!isRec(entry) || !onlyFields(entry, ['unit', 'state', 'date', 'source'], ctx))
        return null;
      const unit = role(entry.unit, 'local unit', base.organization, ctx),
        date = hybridPhrase(entry.date, ctx, 20);
      const state = choice(entry.state, [
        'configured',
        'pending',
        'paused',
        'rolled-back',
        'observed',
        'negative',
        'conditional',
        'unknown',
      ]);
      const source = businessSpan(entry.source, ctx);
      if (!unit || !date || !state || !source) return null;
      const org = escaped(base.organization.label);
      const target = `${escaped(rollout.identity.label)} version ${escaped(rollout.version)} for ${escaped(unit.label)} on ${escaped(date)}`;
      const positive = `${org} configured rollout of ${target}`;
      if (
        !bind(
          source,
          state,
          {
            configured: positive,
            pending: `${org} has rollout of ${target} pending`,
            paused: `${org} paused rollout of ${target}`,
            'rolled-back': `${org} rolled back rollout of ${target}`,
            observed: `${org} observed rollout of ${target}`,
            negative: `${org} did not configure rollout of ${target}`,
            unknown: `Whether ${org} configured rollout of ${target} is unknown`,
            conditional: conditional(positive, base),
          },
          ctx,
        )
      )
        return null;
      return { unit, state, date, source };
    },
    ctx,
  );
  if (!rings) return null;
  const entities = [base.organization, rollout.identity, ...rings.map((ring) => ring.unit)];
  return finish(
    { ...base, kind: 'organization-map', preset: 'rollout-rings', rollout, rings },
    entities,
    entities.length + rings.length,
    unresolved(rings.map((ring) => ring.state)),
    ctx,
  );
}
function parseLegacy(raw: Rec, ctx: ParseContext): OrganizationMapScene | null {
  const base = baseStory(
    raw,
    'organization-map',
    ['legacy', 'replacement', 'interface', 'boundary'],
    ctx,
  );
  if (!base) return null;
  const legacy = role(raw.legacy, 'legacy system', base.organization, ctx);
  const replacement = role(raw.replacement, 'replacement system', base.organization, ctx);
  const interfaceIdentity = role(raw.interface, 'interface', base.organization, ctx);
  if (
    !legacy ||
    !replacement ||
    !interfaceIdentity ||
    !isRec(raw.boundary) ||
    !onlyFields(raw.boundary, ['state', 'source'], ctx)
  )
    return null;
  const state = choice(raw.boundary.state, [
    'declared',
    'unsupported',
    'unresolved',
    'negative',
    'conditional',
    'unknown',
  ]);
  const source = businessSpan(raw.boundary.source, ctx);
  if (!state || !source) return null;
  const org = escaped(base.organization.label),
    boundary = `${escaped(interfaceIdentity.label)} between ${escaped(legacy.label)} and ${escaped(replacement.label)}`;
  const positive = `${org} declares ${boundary}`;
  if (
    !bind(
      source,
      state,
      {
        declared: positive,
        unsupported: `${org} states ${boundary} is unsupported`,
        unresolved: `${org} states ${boundary} is unresolved`,
        negative: `${org} does not declare ${boundary}`,
        unknown: `Whether ${org} declares ${boundary} is unknown`,
        conditional: conditional(positive, base),
      },
      ctx,
    )
  )
    return null;
  return finish(
    {
      ...base,
      kind: 'organization-map',
      preset: 'legacy-boundaries',
      legacy,
      replacement,
      interface: interfaceIdentity,
      boundary: { state, source },
    },
    [base.organization, legacy, replacement, interfaceIdentity],
    4,
    unresolved([state]),
    ctx,
  );
}
function parseTools(raw: Rec, ctx: ParseContext): DeclaredToolBoundariesScene | null {
  if (raw.visualMode !== 'diagram')
    return mechanismIssue(ctx, 'declared-tool-boundaries is diagram only, not monitoring');
  const base = baseStory(raw, 'organization-map', ['units', 'tools', 'workers', 'uses'], ctx);
  if (!base) return null;
  const units = unitList(raw.units, base, ctx);
  if (!units) return null;
  const workers = list(
    raw.workers,
    0,
    4,
    (entry): DeclaredToolBoundariesScene['workers'][number] | null => {
      if (!isRec(entry) || !onlyFields(entry, ['identity', 'unitId'], ctx)) return null;
      const identity = businessIdentity(entry.identity, ctx),
        unit = ref(entry.unitId, units, ctx);
      if (!identity || !unit) return null;
      const target = `a worker in ${escaped(unit.label)} at ${escaped(base.organization.label)}`;
      if (
        !bind(
          identity.source,
          'declared',
          {
            declared: `${escaped(identity.label)} is ${target}`,
            negative: `${escaped(identity.label)} is not ${target}`,
          },
          ctx,
        )
      )
        return null;
      return { identity, unitId: unit.id };
    },
    ctx,
  );
  if (!workers) return null;
  const tools = list(
    raw.tools,
    1,
    5,
    (entry): DeclaredToolBoundariesScene['tools'][number] | null => {
      if (!isRec(entry) || !onlyFields(entry, ['identity', 'unitId', 'state', 'source'], ctx))
        return null;
      const identity = role(entry.identity, 'tool', base.organization, ctx),
        unit = ref(entry.unitId, units, ctx);
      const state = choice(entry.state, [
        'allowed',
        'unapproved',
        'denied',
        'conditional',
        'unknown',
      ]);
      const source = businessSpan(entry.source, ctx);
      if (!identity || !unit || !state || !source) return null;
      const prefix = `${escaped(base.organization.label)} declares ${escaped(identity.label)}`,
        suffix = `for ${escaped(unit.label)}`;
      const positive = `${prefix} allowed ${suffix}`;
      if (
        !bind(
          source,
          state,
          {
            allowed: positive,
            unapproved: `${prefix} unapproved ${suffix}`,
            denied: `${prefix} denied ${suffix}`,
            unknown: `${prefix} status unknown ${suffix}`,
            conditional: conditional(positive, base),
          },
          ctx,
        )
      )
        return null;
      return { identity, unitId: unit.id, state, source };
    },
    ctx,
  );
  if (
    !tools ||
    !usedAll(
      units,
      tools.map((tool) => tool.unitId),
      ctx,
    )
  )
    return null;
  const uses = list(
    raw.uses,
    1,
    6,
    (entry): DeclaredToolBoundariesScene['uses'][number] | null => {
      if (
        !isRec(entry) ||
        !onlyFields(entry, ['toolId', 'unitId', 'workerId', 'context', 'state', 'source'], ctx)
      )
        return null;
      const tool = tools.find((item) => item.identity.id === entry.toolId);
      const unit = ref(entry.unitId, units, ctx);
      const worker =
        entry.workerId === null
          ? null
          : workers.find((item) => item.identity.id === entry.workerId);
      const context = choice(entry.context, ['declared', 'informal']);
      const state = choice(entry.state, [
        'configured',
        'observed',
        'negative',
        'conditional',
        'unknown',
      ]);
      const source = businessSpan(entry.source, ctx);
      if (
        !tool ||
        !unit ||
        !context ||
        !state ||
        !source ||
        tool.unitId !== unit.id ||
        (entry.workerId !== null && (!worker || worker.unitId !== unit.id))
      )
        return null;
      const target = `${context} use of ${escaped(tool.identity.label)} by ${worker ? `${escaped(worker.identity.label)} in ` : ''}${escaped(unit.label)}`;
      const org = escaped(base.organization.label),
        configured = `${org} configured ${target}`;
      if (
        !bind(
          source,
          state,
          {
            configured,
            observed: `${org} observed ${target}`,
            negative: `${org} did not observe ${target}`,
            unknown: `Whether ${org} observed ${target} is unknown`,
            conditional: conditional(configured, base),
          },
          ctx,
        )
      )
        return null;
      return {
        toolId: tool.identity.id,
        unitId: unit.id,
        workerId: worker?.identity.id ?? null,
        context,
        state,
        source,
      };
    },
    ctx,
  );
  if (
    !uses ||
    new Set(uses.map((entry) => `${entry.toolId}:${entry.unitId}:${entry.workerId}`)).size !==
      uses.length ||
    !usedAll(
      tools.map((tool) => tool.identity),
      uses.map((entry) => entry.toolId),
      ctx,
    ) ||
    !usedAll(
      workers.map((worker) => worker.identity),
      uses.flatMap((entry) => (entry.workerId ? [entry.workerId] : [])),
      ctx,
    )
  )
    return null;
  const identities = [
    base.organization,
    ...units,
    ...tools.map((tool) => tool.identity),
    ...workers.map((worker) => worker.identity),
  ];
  const states = [...tools.map((tool) => tool.state), ...uses.map((use) => use.state)];
  return finish(
    {
      ...base,
      kind: 'organization-map',
      preset: 'declared-tool-boundaries',
      visualMode: 'diagram',
      units,
      workers,
      tools,
      uses,
    },
    identities,
    identities.length - 1 + tools.length + uses.length,
    unresolved(states),
    ctx,
  );
}
function sameSpan(left: BusinessWordSpan, right: BusinessWordSpan): boolean {
  return left.fromWord === right.fromWord && left.toWord === right.toWord;
}
/** Each numeric value AND its whole basis are bound to this same local quantity clause. */
function chargeQuantity(
  raw: unknown,
  base: Base,
  payer: BusinessIdentity,
  ctx: ParseContext,
  extraFields: readonly string[] = [],
): ChargebackQuantity | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'amount', 'basis', 'source', ...extraFields], ctx))
    return null;
  const state = choice(raw.state, ['source-stated', 'conditional']);
  const amount = parseMoney(raw.amount, ctx),
    basis = quantityBasis(raw.basis, [payer], ctx),
    source = businessSpan(raw.source, ctx);
  if (
    !state ||
    !amount ||
    !basis ||
    basis.denominator === null ||
    !source ||
    basis.unit !== amount.currency ||
    !sameSpan(source, basis.source) ||
    (state === 'conditional' && !base.condition)
  )
    return mechanismIssue(
      ctx,
      'chargeback needs exact minor-unit money and its own same-currency period/population/denominator clause',
    );
  return { state, amount, basis: { ...basis, denominator: basis.denominator }, source };
}
function safeSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(total + value))
      return null;
    total += value;
  }
  return total;
}
type CostPattern = (amount: string, components: string, denominator: string) => string;
const SOURCE_MONEY = '([+-]?\\d+(?:\\.\\d+)?) (USD|EUR|GBP)';
/** Exact decimal-to-minor-unit comparison, including alternate source amounts; no float rounding. */
function sourceMinorUnits(text: string): number | null {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/u.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(value) ? value : null;
}
function bindCost(
  quantity: ChargebackQuantity,
  components: number | null,
  pattern: CostPattern,
  base: Base,
  ctx: ParseContext,
): boolean {
  const positive = pattern(
    moneyPattern(quantity.amount),
    String(components),
    String(quantity.basis.denominator),
  );
  if (
    !bind(
      quantity.source,
      quantity.state,
      {
        'source-stated': positive,
        conditional: conditional(positive, base),
        negative: positive.includes(' allocates ')
          ? positive.replace(' allocates ', ' does not allocate ')
          : positive.replace(' is ', ' is not '),
      },
      ctx,
    )
  )
    return false;
  const anyValue = pattern(SOURCE_MONEY, '(\\d+)', '(\\d+)');
  const regex = new RegExp(`^(?:${anyValue}|${conditional(anyValue, base)})$`, 'iu');
  const all = clauses(
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .map((word) => word.text)
      .join(' '),
  );
  for (const clause of all) {
    const captured = regex.exec(clause);
    if (!captured) continue;
    // The conditional alternative has its own capture group block.
    const values = captured.slice(1).filter((value) => value !== undefined);
    const [amount, code, countOrDenominator, denominator] = values;
    if (
      sourceMinorUnits(amount) !== quantity.amount.minorUnits ||
      code.toUpperCase() !== quantity.amount.currency ||
      (components !== null && Number(countOrDenominator) !== components) ||
      Number(components === null ? countOrDenominator : denominator) !== quantity.basis.denominator
    ) {
      mechanismIssue(
        ctx,
        'conflicting numeric chargeback claims for the same subject, allocation and period require rejection, not selection',
      );
      return false;
    }
  }
  return true;
}
function parseChargeback(raw: Rec, ctx: ParseContext): StatedChargebackScene | null {
  const base = baseStory(
    raw,
    'organization-map',
    ['payer', 'service', 'units', 'total', 'allocations', 'remainder'],
    ctx,
  );
  if (!base) return null;
  const service = role(raw.service, 'shared service', base.organization, ctx);
  const payer = businessIdentity(raw.payer, ctx);
  const units = unitList(raw.units, base, ctx);
  if (
    !service ||
    !payer ||
    !units ||
    !bind(
      payer.source,
      'declared',
      {
        declared: `${escaped(payer.label)} is the payer for ${escaped(service.label)} at ${escaped(base.organization.label)}`,
        negative: `${escaped(payer.label)} is not the payer for ${escaped(service.label)} at ${escaped(base.organization.label)}`,
      },
      ctx,
    )
  )
    return null;
  const total = chargeQuantity(raw.total, base, payer, ctx);
  if (!total) return null;
  const org = escaped(base.organization.label),
    pay = escaped(payer.label),
    svc = escaped(service.label);
  const basisTail = `during ${escaped(total.basis.period)} per ${total.basis.denominator} ${escaped(total.basis.population)}`;
  const totalPattern: CostPattern = (amount, _, denominator) =>
    `${org} states ${pay}'s chargeback total for ${svc} is ${amount} during ${escaped(total.basis.period)} per ${denominator} ${escaped(total.basis.population)}`;
  if (!bindCost(total, null, totalPattern, base, ctx)) return null;
  const allocations = list(
    raw.allocations,
    1,
    4,
    (entry): StatedChargebackScene['allocations'][number] | null => {
      const parsed = chargeQuantity(entry, base, payer, ctx, ['unitId', 'components']);
      if (!parsed || !isRec(entry)) return null;
      const unit = ref(entry.unitId, units, ctx),
        components = shareCount(entry.components, true);
      if (
        !unit ||
        components === null ||
        !compatibleQuantityBases(total.basis, parsed.basis) ||
        parsed.state !== total.state
      )
        return null;
      const pattern: CostPattern = (amount, count, denominator) =>
        `${org} allocates ${amount} of ${pay}'s chargeback for ${svc} to ${escaped(unit.label)} for ${count} of ${denominator} ${escaped(total.basis.population)} during ${escaped(total.basis.period)}`;
      if (!bindCost(parsed, components, pattern, base, ctx)) return null;
      return { ...parsed, unitId: unit.id, components };
    },
    ctx,
  );
  if (
    !allocations ||
    new Set(allocations.map((entry) => entry.unitId)).size !== allocations.length ||
    !usedAll(
      units,
      allocations.map((entry) => entry.unitId),
      ctx,
    )
  )
    return null;
  let remainder: StatedChargebackScene['remainder'];
  if (isRec(raw.remainder) && raw.remainder.state === 'unknown') {
    if (
      !onlyFields(raw.remainder, ['state', 'amount', 'components', 'source'], ctx) ||
      raw.remainder.amount !== null ||
      raw.remainder.components !== null
    )
      return null;
    const source = businessSpan(raw.remainder.source, ctx);
    if (
      !source ||
      !bind(
        source,
        'unknown',
        {
          unknown: `${org} states ${pay}'s chargeback remainder for ${svc} is unknown ${basisTail}`,
          numeric: `${org} states ${pay}'s chargeback remainder for ${svc} is ${SOURCE_MONEY} for \\d+ of \\d+ ${escaped(total.basis.population)} during ${escaped(total.basis.period)}`,
        },
        ctx,
      )
    )
      return null;
    remainder = { state: 'unknown', amount: null, components: null, source };
  } else {
    const parsed = chargeQuantity(raw.remainder, base, payer, ctx, ['components']);
    const components = isRec(raw.remainder) ? shareCount(raw.remainder.components, true) : null;
    if (
      !parsed ||
      components === null ||
      !compatibleQuantityBases(total.basis, parsed.basis) ||
      parsed.state !== total.state
    )
      return null;
    const pattern: CostPattern = (amount, count, denominator) =>
      `${org} states ${pay}'s chargeback remainder for ${svc} is ${amount} for ${count} of ${denominator} ${escaped(total.basis.population)} during ${escaped(total.basis.period)}`;
    if (!bindCost(parsed, components, pattern, base, ctx)) return null;
    remainder = { ...parsed, components };
  }
  const amounts = [
    total.amount,
    ...allocations.map((entry) => entry.amount),
    ...(remainder.amount ? [remainder.amount] : []),
  ];
  const allocated = safeSum(allocations.map((entry) => entry.amount.minorUnits));
  const components = safeSum(allocations.map((entry) => entry.components));
  if (
    !sameCurrency(amounts) ||
    allocated === null ||
    components === null ||
    allocated > total.amount.minorUnits ||
    components > total.basis.denominator ||
    (remainder.state !== 'unknown' &&
      (safeSum([allocated, remainder.amount.minorUnits]) !== total.amount.minorUnits ||
        safeSum([components, remainder.components]) !== total.basis.denominator ||
        !conservesMoney(
          [total.amount],
          allocations.map((entry) => entry.amount),
          remainder.amount,
        )))
  )
    return mechanismIssue(
      ctx,
      'exact same-currency chargeback amounts and components must conserve the stated total; unknown is never inferred',
    );
  const identities = [base.organization, payer, service, ...units],
    states = [total.state, ...allocations.map((entry) => entry.state), remainder.state];
  return finish(
    {
      ...base,
      kind: 'organization-map',
      preset: 'stated-chargeback',
      payer,
      service,
      units,
      total,
      allocations,
      remainder,
    },
    identities,
    identities.length - 1 + states.length,
    unresolved(states),
    ctx,
  );
}

/** Strict concrete OP-25/26/27/28/30/31 parser. No root-union assertion or graph API. */
export function parseOrganizationMapScene(
  raw: Rec,
  ctx: ParseContext,
): OrganizationMapScene | null {
  if (!boundedBusinessInput(raw, ctx)) return null;
  if (!isRec(raw)) return mechanismIssue(ctx, 'organization payload must be an object');
  let scene: OrganizationMapScene | null;
  switch (raw.preset) {
    case 'federated-units':
      scene = parseFederated(raw, ctx);
      break;
    case 'decision-rights':
      scene = parseRights(raw, ctx);
      break;
    case 'rollout-rings':
      scene = parseRollout(raw, ctx);
      break;
    case 'legacy-boundaries':
      scene = parseLegacy(raw, ctx);
      break;
    case 'stated-chargeback':
      scene = parseChargeback(raw, ctx);
      break;
    case 'declared-tool-boundaries':
      scene = parseTools(raw, ctx);
      break;
    default:
      return mechanismIssue(ctx, 'unsupported organization-map preset');
  }
  return (
    scene ??
    mechanismIssue(
      ctx,
      'organization fields, references and states must be complete and source-bound',
    )
  );
}
function parseReconciliation(raw: Rec, ctx: ParseContext): SystemReconciliationScene | null {
  if (raw.preset !== 'merge-identities')
    return mechanismIssue(ctx, 'unsupported system-reconciliation preset');
  const base = baseStory(
    raw,
    'system-reconciliation',
    ['owner', 'systems', 'records', 'collisions'],
    ctx,
  );
  if (!base) return null;
  const owner = businessIdentity(raw.owner, ctx);
  if (
    !owner ||
    !bind(
      owner.source,
      'declared',
      {
        declared: `${escaped(owner.label)} is responsible for reconciliation at ${escaped(base.organization.label)}`,
        negative: `${escaped(owner.label)} is not responsible for reconciliation at ${escaped(base.organization.label)}`,
      },
      ctx,
    )
  )
    return mechanismIssue(ctx, 'reconciliation desk requires its own named responsible owner');
  const systems = list(
    raw.systems,
    2,
    4,
    (entry) => version(entry, 'source system', base, ctx),
    ctx,
  );
  if (!systems) return null;
  const records = list(
    raw.records,
    2,
    5,
    (entry): ReconciliationRecord | null => {
      if (
        !isRec(entry) ||
        !onlyFields(entry, ['identity', 'sourceSystemId', 'sourceId', 'source'], ctx)
      )
        return null;
      const identity = businessIdentity(entry.identity, ctx),
        source = businessSpan(entry.source, ctx);
      const system = systems.find((item) => item.identity.id === entry.sourceSystemId);
      const sourceId =
        typeof entry.sourceId === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,23}$/u.test(entry.sourceId)
          ? entry.sourceId
          : null;
      if (!identity || !source || !system || !sourceId || !sameSpan(identity.source, source))
        return null;
      const pattern = `${escaped(base.organization.label)} records ${escaped(identity.label)} with source ID ${escaped(sourceId)} in ${escaped(system.identity.label)} version ${escaped(system.version)}`;
      if (
        !bind(
          source,
          'declared',
          { declared: pattern, negative: pattern.replace(' records ', ' does not record ') },
          ctx,
        )
      )
        return null;
      return { identity, sourceSystemId: system.identity.id, sourceId, source };
    },
    ctx,
  );
  if (
    !records ||
    new Set(records.map((record) => `${record.sourceSystemId}:${record.sourceId}`)).size !==
      records.length ||
    !usedAll(
      systems.map((system) => system.identity),
      records.map((record) => record.sourceSystemId),
      ctx,
    )
  )
    return null;
  const recordPhrase = (record: ReconciliationRecord): string => {
    const system = systems.find((entry) => entry.identity.id === record.sourceSystemId);
    if (!system) throw new Error('Missing validated reconciliation system');
    return `${escaped(record.identity.label)} source ID ${escaped(record.sourceId)} in ${escaped(system.identity.label)} version ${escaped(system.version)}`;
  };
  const collisions = list(
    raw.collisions,
    1,
    4,
    (entry): SystemReconciliationScene['collisions'][number] | null => {
      if (
        !isRec(entry) ||
        !onlyFields(entry, ['leftRecordId', 'rightRecordId', 'state', 'source'], ctx)
      )
        return null;
      const left = records.find((record) => record.identity.id === entry.leftRecordId),
        right = records.find((record) => record.identity.id === entry.rightRecordId);
      const state = choice(entry.state, [
        'matched',
        'unresolved',
        'negative',
        'conditional',
        'unknown',
      ]);
      const source = businessSpan(entry.source, ctx);
      if (
        !left ||
        !right ||
        !state ||
        !source ||
        left.identity.id === right.identity.id ||
        left.sourceSystemId === right.sourceSystemId
      )
        return null;
      const prefix = `${escaped(base.organization.label)} states ${recordPhrase(left)}`,
        target = recordPhrase(right);
      const positive = `${prefix} matches ${target}`;
      if (
        !bind(
          source,
          state,
          {
            matched: positive,
            unresolved: `${prefix} has an unresolved identity conflict with ${target}`,
            negative: `${prefix} does not match ${target}`,
            unknown: `${prefix} has unknown matching status with ${target}`,
            conditional: conditional(positive, base),
          },
          ctx,
        )
      )
        return null;
      return { leftRecordId: left.identity.id, rightRecordId: right.identity.id, state, source };
    },
    ctx,
  );
  if (
    !collisions ||
    new Set(collisions.map((entry) => [entry.leftRecordId, entry.rightRecordId].sort().join(':')))
      .size !== collisions.length ||
    !usedAll(
      records.map((record) => record.identity),
      collisions.flatMap((entry) => [entry.leftRecordId, entry.rightRecordId]),
      ctx,
    )
  )
    return null;
  const identities = [
    base.organization,
    owner,
    ...systems.map((system) => system.identity),
    ...records.map((record) => record.identity),
  ];
  const roleLabels = [base.organization, owner, ...systems.map((system) => system.identity)].map(
    (identity) => identity.label.toLowerCase(),
  );
  if (
    new Set(roleLabels).size !== roleLabels.length ||
    records.some((record) => roleLabels.includes(record.identity.label.toLowerCase()))
  )
    return mechanismIssue(ctx, 'record labels cannot replace source-system roles');
  return finish(
    {
      ...base,
      kind: 'system-reconciliation',
      preset: 'merge-identities',
      owner,
      systems,
      records,
      collisions,
    },
    identities,
    identities.length - 1 + systems.length + collisions.length,
    unresolved(collisions.map((entry) => entry.state)),
    ctx,
    true,
  );
}

/** OP-29 retains both source identities even when a local match is stated. */
export function parseSystemReconciliationScene(
  raw: Rec,
  ctx: ParseContext,
): SystemReconciliationScene | null {
  if (!boundedBusinessInput(raw, ctx)) return null;
  if (!isRec(raw)) return mechanismIssue(ctx, 'reconciliation payload must be an object');
  return (
    parseReconciliation(raw, ctx) ??
    mechanismIssue(
      ctx,
      'reconciliation fields, references and states must be complete and source-bound',
    )
  );
}
