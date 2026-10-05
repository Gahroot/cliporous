import {
  infrastructureIdentities,
  infrastructurePresentationFits,
  infrastructureRows,
} from '../../remotion/compositions/explainer/business/infrastructure/presentation';
import {
  type CapacityMapScene,
  type EvaluationSnapshot,
  INFRASTRUCTURE_LIMITS,
  type InfrastructureFact,
  type InfrastructureQuantity,
  type InfrastructureScene,
  type InfrastructureState,
  type InfrastructureStory,
  type OperatingLineageScene,
  type ProvenanceEdge,
} from '../../remotion/compositions/explainer/business/infrastructure/types';
import type {
  BusinessIdentity,
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
import { distinctActors, shareCount } from './finance-contract';
import { hybridPhrase, hybridStory, normalizedPhrase, onlyFields } from './hybrid-contract';
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
  'setupWord',
  'actionWord',
  'responseWord',
  'checkWord',
  'resolveWord',
  'factEvidence',
  'period',
  'modelSource',
];
type Base = InfrastructureStory;
function completeSpan(
  raw: unknown,
  ctx: ParseContext,
): { source: BusinessWordSpan; text: string } | null {
  const source = businessSpan(raw, ctx);
  if (
    !source ||
    (source.fromWord > ctx.win.startWord &&
      !/[.!?;]$/u.test(ctx.words[source.fromWord - 1]?.text ?? '')) ||
    !/[.!?;]$/u.test(ctx.words[source.toWord]?.text ?? '')
  )
    return mechanismIssue(
      ctx,
      'retain a complete clause-local source span, including negation/condition',
    );
  return { source, text: businessEvidenceText(source, ctx) };
}
function clause(raw: unknown, pattern: string, ctx: ParseContext) {
  const parsed = completeSpan(raw, ctx);
  return parsed && new RegExp(`^${pattern}[.\\s]*$`, 'iu').test(parsed.text)
    ? parsed
    : mechanismIssue(
        ctx,
        'source must bind the exact named subject/action/value/status/period in one full clause',
      );
}
function base(raw: Rec, ctx: ParseContext, fields: string[]): Base | null {
  if (!onlyFields(raw, [...COMMON, ...fields], ctx)) return null;
  if (
    (raw.startWord !== undefined && raw.startWord !== ctx.win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== ctx.win.endWord) ||
    (raw.layout !== undefined &&
      !['stack', 'stack-flipped', 'takeover', 'pip', 'over'].includes(String(raw.layout)))
  )
    return mechanismIssue(ctx, 'retain the original complete source window and an authored layout');
  const story = hybridStory(raw, ctx, ['factEvidence', 'period', 'modelSource', ...fields]);
  const period = hybridPhrase(raw.period, ctx, 28);
  const factEvidence = businessEvidence(raw.factEvidence, ctx);
  const modelSource = raw.modelSource == null ? null : businessSpan(raw.modelSource, ctx);
  if (!story || !period || !factEvidence) return null;
  if ((raw.modelSource != null && !modelSource) || (raw.visualMode === 'hybrid' && !modelSource))
    return mechanismIssue(ctx, 'hybrid assets require an explicit complete modelSource word span');
  const resolve = completeSpan(factEvidence.source, ctx);
  const resolveWord = ctx.inWin(raw.resolveWord);
  if (
    !resolve ||
    resolveWord === null ||
    factEvidence.source.fromWord !== resolveWord ||
    normalizedPhrase(resolve.text) !== normalizedPhrase(story.story.outcome) ||
    normalizedPhrase(factEvidence.label) !== normalizedPhrase(resolve.text) ||
    /\b(?:commissioned|compliant|certified|approved|trained|retrained|profit|paid|winner|telemetry|live|improved|drift)\b/iu.test(
      resolve.text,
    )
  )
    return mechanismIssue(
      ctx,
      'resolve must retain the complete factual clause without an unsupported success/compliance/training conclusion',
    );
  return { ...story.story, factEvidence, period, modelSource };
}
function stateFact(
  raw: unknown,
  patterns: Record<InfrastructureState, string>,
  ctx: ParseContext,
  condition?: string,
): InfrastructureFact | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['state', 'source'], ctx) ||
    typeof raw.state !== 'string' ||
    !Object.hasOwn(patterns, raw.state)
  )
    return null;
  const state = raw.state as InfrastructureState;
  if (state === 'conditional' && !condition)
    return mechanismIssue(ctx, 'conditional facts require the exact complete source condition');
  const pattern =
    state === 'conditional'
      ? `${escaped(condition ?? '')},\\s+${patterns[state]}`
      : patterns[state];
  const evidence = clause(raw.source, pattern, ctx);
  return evidence ? { state, ...evidence } : null;
}
function quantity(
  raw: unknown,
  actor: BusinessIdentity,
  operation: string,
  period: string,
  ctx: ParseContext,
  condition?: string,
): InfrastructureQuantity | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'value', 'unit', 'period', 'basis', 'source'], ctx))
    return null;
  const source = completeSpan(raw.source, ctx);
  const unit = raw.unit === null ? null : hybridPhrase(raw.unit, ctx, 16);
  const ownPeriod = hybridPhrase(raw.period, ctx, 28);
  if (!source || ownPeriod !== period || (raw.unit !== null && !unit)) return null;
  const a = escaped(actor.label),
    op = escaped(operation),
    p = escaped(period),
    u = escaped(unit ?? 'unknown units');
  if (raw.state === 'source-stated' || raw.state === 'conditional') {
    const value = shareCount(raw.value, true);
    if (value === null || !unit || !isRec(raw.basis))
      return mechanismIssue(
        ctx,
        'quantitative facts require an exact bounded nonnegative integer and explicit unit/basis',
      );
    const qualification =
      raw.state === 'conditional' && condition
        ? { state: 'conditional' as const, condition, source: source.source }
        : undefined;
    if (raw.state === 'conditional' && !qualification) return null;
    const basis = quantityBasis(raw.basis, [actor], ctx, qualification);
    if (!basis || basis.denominator === null || basis.unit !== unit || basis.period !== period)
      return null;
    const skip = qualification ? qualification.condition.split(/\s+/u).length : 0;
    if (
      basis.source.fromWord !== source.source.fromWord + skip ||
      basis.source.toWord !== source.source.toWord
    )
      return mechanismIssue(
        ctx,
        'basis must be the exact full quantitative body, never adjacent evidence',
      );
    const body = `${a} ${qualification ? 'may report' : 'reports'} ${op} of ${value} ${u} during ${p} per ${basis.denominator} ${escaped(basis.population)}`;
    if (
      !clause(
        raw.source,
        qualification ? `${escaped(qualification.condition)},\\s+${body}` : body,
        ctx,
      )
    )
      return null;
    return { state: raw.state, value, unit, period, basis, ...source };
  }
  if (
    !['pending', 'negative', 'unknown'].includes(String(raw.state)) ||
    raw.value !== null ||
    raw.basis !== null
  )
    return mechanismIssue(
      ctx,
      'unknown/negative/pending quantities retain explicit null, never inferred zero',
    );
  const parsed = clause(
    raw.source,
    `${a} ${op} in ${u} is ${escaped(String(raw.state))} during ${p}`,
    ctx,
  );
  return parsed
    ? {
        state: raw.state as 'pending' | 'negative' | 'unknown',
        value: null,
        unit,
        period,
        basis: null,
        ...parsed,
      }
    : null;
}
function compatible(quantities: InfrastructureQuantity[], ctx: ParseContext): boolean {
  const bases = quantities.flatMap((q) => (q.basis ? [q.basis] : []));
  if (bases.every((basis) => !bases[0] || compatibleQuantityBases(bases[0], basis))) return true;
  mechanismIssue(
    ctx,
    'quantities require the identical subject/unit/population/period/denominator; no conversions or calibrated qualitative shares',
  );
  return false;
}
function ready(
  raw: unknown,
  identity: BusinessIdentity,
  resource: BusinessIdentity,
  b: Base,
  ctx: ParseContext,
) {
  const head = `${escaped(identity.label)} for ${escaped(resource.label)}`;
  return stateFact(
    raw,
    {
      'source-stated': `${head} is ready during ${escaped(b.period)}`,
      negative: `${head} is not ready during ${escaped(b.period)}`,
      pending: `${head} is pending during ${escaped(b.period)}`,
      unknown: `${head} is unknown during ${escaped(b.period)}`,
      conditional: `${head} may be ready during ${escaped(b.period)}`,
    },
    ctx,
    b.condition,
  );
}
/** Exact native meanings for the frozen assets, independently of the core facts' states. */
function modelMeaning(scene: InfrastructureScene): string | null {
  const p = escaped(scene.period),
    role = '(?:is|illustrates)';
  switch (scene.preset) {
    case 'installed-used-reserved':
    case 'bounded-request-capacity':
      return `${escaped(scene.resource.label)} ${role} a data-center rack during ${p}`;
    case 'physical-readiness':
      return `${escaped(scene.resource.label)} ${role} a data-center rack with ${escaped(scene.power.label)} power-readiness architecture and ${escaped(scene.cooling.label)} cooling-loop architecture during ${p}`;
    case 'resource-states':
      return `${escaped(scene.resource.label)} ${role} a data-center rack with ${escaped(scene.cooling.label)} cooling-loop architecture during ${p}`;
    case 'declared-processing-scope':
      return `${escaped(scene.resource.label)} ${role} a provider connector panel at ${escaped(scene.boundary.label)} for inspecting ${escaped(scene.item.label)} processing during ${p}`;
    case 'provider-transition':
      return `${escaped(scene.resource.label)} ${role} a provider connector panel for inspecting the switch from ${escaped(scene.fromProvider.label)} to ${escaped(scene.toProvider.label)} requiring ${escaped(scene.dependency.label)} during ${p}`;
    case 'end-to-end-periods':
      return `${escaped(scene.resource.label)} ${role} a provider connector panel at its system boundary for inspecting ${escaped(scene.task.label)} latency during ${p}`;
    case 'evidence-and-missing-information':
      return `${escaped(scene.owner.label)} ${role} a playbook binder for inspecting ${scene.items.map(({ entry }) => `${escaped(entry.identity.label)} version ${escaped(entry.version)}`).join(' and ')} during ${p}`;
    case 'versioned-provenance': {
      const first = scene.entries[0];
      return first
        ? `${escaped(scene.owner.label)} ${role} a playbook binder for inspecting ${scene.entries.map((entry) => `${escaped(entry.identity.label)} version ${escaped(entry.version)}`).join(' and ')} with a provenance connector at the ${escaped(first.identity.label)} version ${escaped(first.version)} version-record boundary during ${p}`
        : null;
    }
    case 'evaluation-periods':
      return null;
  }
}
function supportedModelSource(scene: InfrastructureScene, ctx: ParseContext): boolean {
  if (scene.preset === 'evaluation-periods') {
    if (scene.visualMode === 'diagram' && scene.modelSource === null) return true;
  } else if (scene.modelSource === null) {
    if (scene.visualMode === 'diagram') return true;
  } else {
    const parsed = completeSpan(scene.modelSource, ctx),
      meaning = modelMeaning(scene);
    if (parsed && meaning) {
      const from = ctx.words[parsed.source.fromWord].start,
        to = ctx.words[parsed.source.toWord].start;
      if (
        (parsed.source.fromWord === 0 ||
          /[.!?;]$/u.test(ctx.words[parsed.source.fromWord - 1]?.text ?? '')) &&
        ((from >= scene.setupAt && to < scene.actionAt) ||
          (from >= scene.actionAt && to < scene.responseAt)) &&
        new RegExp(`^${meaning}\\.$`, 'iu').test(parsed.text)
      )
        return true;
    }
  }
  mechanismIssue(
    ctx,
    'modelSource must be one full positive setup/action clause binding every selected native asset to its actual identities, versions and period; evaluation remains diagram-only',
  );
  return false;
}
function finish<T extends InfrastructureScene>(scene: T, ctx: ParseContext): T | null {
  if (!supportedModelSource(scene, ctx)) return null;
  const identities = infrastructureIdentities(scene);
  const rows = infrastructureRows(scene);
  if (
    identities.length > INFRASTRUCTURE_LIMITS.entities ||
    !distinctActors(identities) ||
    rows.filter((r) =>
      ['pending', 'negative', 'conditional', 'unknown', 'blocked'].includes(r.state),
    ).length > INFRASTRUCTURE_LIMITS.holds ||
    !infrastructurePresentationFits(scene, ctx.win.endTime)
  )
    return mechanismIssue(
      ctx,
      'source identities/holds or complete fixed-font reading pages exceed authored bounds',
    );
  return scene;
}
function capacity(raw: Rec, ctx: ParseContext): CapacityMapScene | null {
  const resource = businessIdentity(raw.resource, ctx);
  if (!resource) return null;
  if (raw.preset === 'installed-used-reserved') {
    const b = base(raw, ctx, ['resource', 'installed', 'used', 'reserved', 'partition']);
    if (!b) return null;
    const installed = quantity(
        raw.installed,
        resource,
        'installed capacity',
        b.period,
        ctx,
        b.condition,
      ),
      used = quantity(raw.used, resource, 'used capacity', b.period, ctx, b.condition),
      reserved = quantity(raw.reserved, resource, 'reserved capacity', b.period, ctx, b.condition);
    if (
      !installed ||
      !used ||
      !reserved ||
      !isRec(raw.partition) ||
      !onlyFields(raw.partition, ['source'], ctx) ||
      !compatible([installed, used, reserved], ctx)
    )
      return null;
    const partition = clause(
      raw.partition.source,
      `${escaped(resource.label)} declares used capacity and reserved capacity nonoverlapping within installed capacity during ${escaped(b.period)}`,
      ctx,
    );
    if (!partition) return null;
    if (
      installed.state === 'source-stated' &&
      installed.value !== null &&
      [used, reserved].reduce(
        (sum, q) => sum + (q.state === 'source-stated' ? (q.value ?? 0) : 0),
        0,
      ) > installed.value
    )
      return mechanismIssue(
        ctx,
        'used plus reserved cannot exceed explicit nonoverlapping installed capacity',
      );
    return finish(
      {
        ...b,
        kind: 'capacity-map',
        preset: 'installed-used-reserved',
        resource,
        installed,
        used,
        reserved,
        partition,
      },
      ctx,
    );
  }
  if (raw.preset === 'physical-readiness') {
    const b = base(raw, ctx, [
      'resource',
      'funding',
      'power',
      'cooling',
      'moneyReady',
      'powerReady',
      'coolingReady',
    ]);
    const funding = businessIdentity(raw.funding, ctx),
      power = businessIdentity(raw.power, ctx),
      cooling = businessIdentity(raw.cooling, ctx);
    if (!b || !funding || !power || !cooling) return null;
    const moneyReady = ready(raw.moneyReady, funding, resource, b, ctx),
      powerReady = ready(raw.powerReady, power, resource, b, ctx),
      coolingReady = ready(raw.coolingReady, cooling, resource, b, ctx);
    return moneyReady && powerReady && coolingReady
      ? finish(
          {
            ...b,
            kind: 'capacity-map',
            preset: 'physical-readiness',
            resource,
            funding,
            power,
            cooling,
            moneyReady,
            powerReady,
            coolingReady,
          },
          ctx,
        )
      : null;
  }
  if (raw.preset === 'bounded-request-capacity') {
    const b = base(raw, ctx, ['resource', 'task', 'queued', 'capacity']);
    const task = businessIdentity(raw.task, ctx);
    if (!b || !task) return null;
    const queued = quantity(
        raw.queued,
        resource,
        `queued requests for ${task.label}`,
        b.period,
        ctx,
        b.condition,
      ),
      available = quantity(
        raw.capacity,
        resource,
        `available capacity for ${task.label}`,
        b.period,
        ctx,
        b.condition,
      );
    return queued && available && compatible([queued, available], ctx)
      ? finish(
          {
            ...b,
            kind: 'capacity-map',
            preset: 'bounded-request-capacity',
            resource,
            task,
            queued,
            capacity: available,
          },
          ctx,
        )
      : null;
  }
  if (raw.preset === 'resource-states') {
    const b = base(raw, ctx, [
      'resource',
      'cooling',
      'installed',
      'idle',
      'reserved',
      'burst',
      'coolingReady',
      'partition',
    ]);
    const cooling = businessIdentity(raw.cooling, ctx);
    if (!b || !cooling) return null;
    const installed = quantity(
        raw.installed,
        resource,
        'installed capacity',
        b.period,
        ctx,
        b.condition,
      ),
      idle = quantity(raw.idle, resource, 'idle allocation', b.period, ctx, b.condition),
      reserved = quantity(
        raw.reserved,
        resource,
        'reserved allocation',
        b.period,
        ctx,
        b.condition,
      ),
      burst = quantity(raw.burst, resource, 'burst allocation', b.period, ctx, b.condition),
      coolingReady = ready(raw.coolingReady, cooling, resource, b, ctx);
    if (
      !installed ||
      !idle ||
      !reserved ||
      !burst ||
      !coolingReady ||
      !compatible([installed, idle, reserved, burst], ctx) ||
      !isRec(raw.partition) ||
      !onlyFields(raw.partition, ['source'], ctx)
    )
      return null;
    const partition = clause(
      raw.partition.source,
      `${escaped(resource.label)} declares idle allocation, reserved allocation and burst allocation nonoverlapping within installed capacity during ${escaped(b.period)}`,
      ctx,
    );
    if (!partition) return null;
    if (
      installed.state === 'source-stated' &&
      installed.value !== null &&
      [idle, reserved, burst].reduce(
        (sum, q) => sum + (q.state === 'source-stated' ? (q.value ?? 0) : 0),
        0,
      ) > installed.value
    )
      return mechanismIssue(ctx, 'idle/reserved/burst must be disjoint within installed capacity');
    return finish(
      {
        ...b,
        kind: 'capacity-map',
        preset: 'resource-states',
        resource,
        cooling,
        installed,
        idle,
        reserved,
        burst,
        coolingReady,
        partition,
      },
      ctx,
    );
  }
  if (raw.preset === 'declared-processing-scope') {
    const b = base(raw, ctx, ['resource', 'item', 'boundary', 'processing']);
    const item = businessIdentity(raw.item, ctx),
      boundary = businessIdentity(raw.boundary, ctx);
    if (!b || !item || !boundary) return null;
    const tail = `${escaped(item.label)} within ${escaped(boundary.label)} during ${escaped(b.period)}`,
      r = escaped(resource.label);
    const processing = stateFact(
      raw.processing,
      {
        'source-stated': `${r} processes ${tail}`,
        negative: `${r} does not process ${tail}`,
        pending: `${r} processing ${tail} is pending`,
        unknown: `${r} processing ${tail} is unknown`,
        conditional: `${r} may process ${tail}`,
      },
      ctx,
      b.condition,
    );
    return processing
      ? finish(
          {
            ...b,
            kind: 'capacity-map',
            preset: 'declared-processing-scope',
            resource,
            item,
            boundary,
            processing,
          },
          ctx,
        )
      : null;
  }
  if (raw.preset === 'end-to-end-periods') {
    const b = base(raw, ctx, ['resource', 'task', 'stages', 'total', 'aggregation']);
    const task = businessIdentity(raw.task, ctx);
    if (!b || !task || !Array.isArray(raw.stages) || raw.stages.length < 2 || raw.stages.length > 6)
      return null;
    const stages = [];
    for (const entry of raw.stages) {
      if (!isRec(entry) || !onlyFields(entry, ['identity', 'quantity'], ctx)) return null;
      const identity = businessIdentity(entry.identity, ctx);
      const q = identity
        ? quantity(
            entry.quantity,
            resource,
            `latency for ${task.label} stage ${identity.label}`,
            b.period,
            ctx,
            b.condition,
          )
        : null;
      if (!identity || !q) return null;
      stages.push({ identity, quantity: q });
    }
    const total = quantity(
      raw.total,
      resource,
      `end-to-end latency for ${task.label}`,
      b.period,
      ctx,
      b.condition,
    );
    if (
      !total ||
      !compatible([total, ...stages.map((s) => s.quantity)], ctx) ||
      !isRec(raw.aggregation) ||
      !onlyFields(raw.aggregation, ['state', 'source'], ctx) ||
      (raw.aggregation.state !== 'sequential' && raw.aggregation.state !== 'unknown')
    )
      return null;
    const pattern =
      raw.aggregation.state === 'sequential'
        ? `${escaped(resource.label)} declares ${stages.map((s) => escaped(s.identity.label)).join(' then ')} sequential with no overlap for ${escaped(task.label)} during ${escaped(b.period)}`
        : `${escaped(resource.label)} aggregation for ${escaped(task.label)} is unknown during ${escaped(b.period)}`;
    const aggregation = clause(raw.aggregation.source, pattern, ctx);
    if (!aggregation) return null;
    if (
      raw.aggregation.state === 'sequential' &&
      [total, ...stages.map((s) => s.quantity)].every((q) => q.state === 'source-stated') &&
      stages.reduce((sum, s) => sum + (s.quantity.value ?? 0), 0) !== total.value
    )
      return mechanismIssue(
        ctx,
        'sequential latency requires exact supplied conservation, without concurrent or duplicate stages',
      );
    return finish(
      {
        ...b,
        kind: 'capacity-map',
        preset: 'end-to-end-periods',
        resource,
        task,
        stages,
        total,
        aggregation: { state: raw.aggregation.state, ...aggregation },
      },
      ctx,
    );
  }
  return mechanismIssue(ctx, 'unknown concrete capacity-map preset');
}
function sourceDate(raw: unknown, ctx: ParseContext): string | null {
  const date = hybridPhrase(raw, ctx, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}
function lineage(raw: Rec, ctx: ParseContext): OperatingLineageScene | null {
  if (raw.preset === 'provider-transition') {
    const b = base(raw, ctx, [
      'resource',
      'fromProvider',
      'toProvider',
      'dependency',
      'transition',
    ]);
    const resource = businessIdentity(raw.resource, ctx),
      fromProvider = businessIdentity(raw.fromProvider, ctx),
      toProvider = businessIdentity(raw.toProvider, ctx),
      dependency = businessIdentity(raw.dependency, ctx);
    if (
      !b ||
      !resource ||
      !fromProvider ||
      !toProvider ||
      !dependency ||
      !isRec(raw.transition) ||
      !onlyFields(raw.transition, ['state', 'source'], ctx)
    )
      return null;
    const a = escaped(resource.label),
      tail = `transition of ${escaped(dependency.label)} from ${escaped(fromProvider.label)} to ${escaped(toProvider.label)} during ${escaped(b.period)}`;
    const patterns: Record<string, string> = {
      completed: `${a} completed ${tail}`,
      pending: `${a} ${tail} is pending`,
      blocked: `${a} ${tail} is blocked`,
      unknown: `${a} ${tail} is unknown`,
      conditional: b.condition ? `${escaped(b.condition)},\\s+${a} may complete ${tail}` : '(?!)',
    };
    if (typeof raw.transition.state !== 'string' || !Object.hasOwn(patterns, raw.transition.state))
      return null;
    const evidence = clause(raw.transition.source, patterns[raw.transition.state], ctx);
    if (!evidence) return null;
    const state = raw.transition.state as
      | 'completed'
      | 'pending'
      | 'blocked'
      | 'conditional'
      | 'unknown';
    return finish(
      {
        ...b,
        kind: 'operating-lineage',
        preset: 'provider-transition',
        resource,
        fromProvider,
        toProvider,
        dependency,
        transition: { state, ...evidence },
      },
      ctx,
    );
  }
  const owner = businessIdentity(raw.owner, ctx);
  if (!owner) return null;
  if (raw.preset === 'evidence-and-missing-information') {
    const b = base(raw, ctx, ['owner', 'items']);
    if (!b || !Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 7)
      return null;
    const items = [];
    for (const item of raw.items) {
      if (!isRec(item) || !onlyFields(item, ['entry', 'date', 'fact'], ctx)) return null;
      const entry = versionedIdentity(item.entry, ctx),
        date = sourceDate(item.date, ctx);
      if (!entry || !date) return null;
      const target = `${escaped(entry.identity.label)} version ${escaped(entry.version)} dated ${escaped(date)} during ${escaped(b.period)}`,
        a = escaped(owner.label);
      const fact = stateFact(
        item.fact,
        {
          'source-stated': `${a} holds ${target}`,
          negative: `${a} does not hold ${target}`,
          pending: `${a} receipt of ${target} is pending`,
          unknown: `${a} status of ${target} is unknown`,
          conditional: `${a} may hold ${target}`,
        },
        ctx,
        b.condition,
      );
      if (
        !fact ||
        entry.source.fromWord !== fact.source.fromWord ||
        entry.source.toWord !== fact.source.toWord
      )
        return null;
      items.push({ entry, date, fact });
    }
    return finish(
      { ...b, kind: 'operating-lineage', preset: 'evidence-and-missing-information', owner, items },
      ctx,
    );
  }
  if (raw.preset === 'versioned-provenance') {
    const b = base(raw, ctx, ['owner', 'entries', 'edges']);
    if (
      !b ||
      !Array.isArray(raw.entries) ||
      raw.entries.length < 2 ||
      raw.entries.length > 7 ||
      !Array.isArray(raw.edges) ||
      raw.edges.length < 1 ||
      raw.edges.length > INFRASTRUCTURE_LIMITS.edges
    )
      return null;
    const entries: VersionedIdentity[] = [];
    for (const value of raw.entries) {
      const entry = versionedIdentity(value, ctx);
      if (
        !entry ||
        !clause(
          entry.source,
          `${escaped(owner.label)} names ${escaped(entry.identity.label)} version ${escaped(entry.version)} during ${escaped(b.period)}`,
          ctx,
        )
      )
        return null;
      entries.push(entry);
    }
    const edges: ProvenanceEdge[] = [];
    for (const value of raw.edges) {
      if (!isRec(value) || !onlyFields(value, ['fromId', 'toId', 'state', 'source'], ctx))
        return null;
      const from = entries.find((e) => e.identity.id === value.fromId),
        to = entries.find((e) => e.identity.id === value.toId);
      if (
        !from ||
        !to ||
        from === to ||
        edges.some((e) => e.fromId === value.fromId && e.toId === value.toId)
      )
        return null;
      const tail = `${escaped(to.identity.label)} version ${escaped(to.version)} from ${escaped(from.identity.label)} version ${escaped(from.version)} during ${escaped(b.period)}`,
        a = escaped(owner.label);
      const fact = stateFact(
        { state: value.state, source: value.source },
        {
          'source-stated': `${a} derives ${tail}`,
          negative: `${a} does not derive ${tail}`,
          pending: `${a} derivation of ${tail} is pending`,
          unknown: `${a} derivation of ${tail} is unknown`,
          conditional: `${a} may derive ${tail}`,
        },
        ctx,
        b.condition,
      );
      if (!fact) return null;
      edges.push({ fromId: from.identity.id, toId: to.identity.id, ...fact });
    }
    return finish(
      { ...b, kind: 'operating-lineage', preset: 'versioned-provenance', owner, entries, edges },
      ctx,
    );
  }
  if (raw.preset === 'evaluation-periods') {
    const b = base(raw, ctx, ['owner', 'task', 'snapshots']);
    const task = businessIdentity(raw.task, ctx);
    if (
      !b ||
      !task ||
      raw.visualMode !== 'diagram' ||
      !Array.isArray(raw.snapshots) ||
      raw.snapshots.length < 2 ||
      raw.snapshots.length > 4
    )
      return null;
    const snapshots: EvaluationSnapshot[] = [];
    for (const value of raw.snapshots) {
      if (!isRec(value) || !onlyFields(value, ['version', 'date', 'quantity', 'source'], ctx))
        return null;
      const date = sourceDate(value.date, ctx),
        entry = versionedIdentity(
          { identity: raw.owner, version: value.version, source: value.source },
          ctx,
        );
      if (!date || !entry) return null;
      const q = quantity(
        value.quantity,
        owner,
        `score for ${task.label} version ${entry.version} dated ${date}`,
        b.period,
        ctx,
      );
      if (
        !q ||
        !['source-stated', 'unknown'].includes(q.state) ||
        entry.source.fromWord !== q.source.fromWord ||
        entry.source.toWord !== q.source.toWord ||
        snapshots.some((s) => s.version === entry.version || s.date === date)
      )
        return null;
      snapshots.push({ version: entry.version, date, entry, quantity: q });
    }
    if (
      !compatible(
        snapshots.map((s) => s.quantity),
        ctx,
      )
    )
      return null;
    return finish(
      { ...b, kind: 'operating-lineage', preset: 'evaluation-periods', owner, task, snapshots },
      ctx,
    );
  }
  return mechanismIssue(ctx, 'unknown concrete operating-lineage preset');
}
export function parseCapacityMapScene(raw: unknown, ctx: ParseContext): CapacityMapScene | null {
  if (!boundedBusinessInput(raw, ctx)) return null;
  if (!isRec(raw) || raw.kind !== 'capacity-map')
    return mechanismIssue(ctx, 'expected a concrete capacity-map');
  const scene = capacity(raw, ctx);
  return scene ?? mechanismIssue(ctx, 'invalid source-bound capacity facts');
}
export function parseOperatingLineageScene(
  raw: unknown,
  ctx: ParseContext,
): OperatingLineageScene | null {
  if (!boundedBusinessInput(raw, ctx)) return null;
  if (!isRec(raw) || raw.kind !== 'operating-lineage')
    return mechanismIssue(ctx, 'expected a concrete operating-lineage');
  const scene = lineage(raw, ctx);
  return scene ?? mechanismIssue(ctx, 'invalid source-bound lineage facts');
}
