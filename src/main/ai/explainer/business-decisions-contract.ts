import {
  decisionIdentities,
  decisionPresentationFits,
  decisionRows,
} from '../../remotion/compositions/explainer/business/decisions/presentation';
import {
  type AdoptionFrame,
  type DecisionAlternative,
  type DecisionCohort,
  type DecisionFact,
  type DecisionNativeSource,
  type DecisionQuantity,
  type DecisionsBase,
  type DecisionsScene,
  immutableDecision,
  DECISIONS_LIMITS as L,
  type MeasurementFrameScene,
  type StagedDecisionScene,
  type UncertaintyAlbumScene,
} from '../../remotion/compositions/explainer/business/decisions/types';
import type { BusinessIdentity } from '../../remotion/compositions/explainer/business/types';
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
import { distinctActors } from './finance-contract';
import { hybridPhrase, hybridStory, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

function complete(raw: unknown, ctx: ParseContext) {
  const source = businessSpan(raw, ctx);
  if (
    !source ||
    (source.fromWord > 0 && !/[.!?;]$/u.test(ctx.words[source.fromWord - 1]?.text ?? '')) ||
    !/[.!?;]$/u.test(ctx.words[source.toWord]?.text ?? '')
  )
    return mechanismIssue(
      ctx,
      'complete local clauses required; do not crop negation, conditions or adjacent actors',
    );
  return { source, text: businessEvidenceText(source, ctx) };
}
function clause(raw: unknown, pattern: string, ctx: ParseContext) {
  const parsed = complete(raw, ctx);
  return parsed && new RegExp(`^(?:${pattern})[.!?;]$`, 'iu').test(parsed.text)
    ? parsed
    : mechanismIssue(
        ctx,
        'source clause does not bind the actual identity, state, quantity, period or version',
      );
}
function fact(
  raw: unknown,
  patterns: Record<DecisionFact['state'], string>,
  ctx: ParseContext,
  condition?: string,
): DecisionFact | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'source'], ctx)) return null;
  const state = raw.state;
  if (
    state !== 'source-stated' &&
    state !== 'pending' &&
    state !== 'negative' &&
    state !== 'conditional' &&
    state !== 'unknown'
  )
    return mechanismIssue(ctx, 'explicit bounded fact state required');
  if (state === 'conditional' && !condition)
    return mechanismIssue(ctx, 'conditional fact requires the complete source condition');
  const parsed = clause(
    raw.source,
    `${state === 'conditional' ? `${escaped(condition ?? '')}, ` : ''}${patterns[state]}`,
    ctx,
  );
  return parsed ? { state, ...parsed } : null;
}
type Base = Omit<DecisionsBase, 'modelSource'>;
function base(raw: Rec, ctx: ParseContext, fields: string[]): Base | null {
  const story = hybridStory(raw, ctx, [
    'owner',
    'period',
    'factEvidence',
    'modelSource',
    ...fields,
  ]);
  const owner = businessIdentity(raw.owner, ctx),
    period = hybridPhrase(raw.period, ctx, 28);
  if (!story || !owner || !period || owner.label !== story.story.subject)
    return mechanismIssue(ctx, 'owner must be the source setup subject and period must be literal');
  const evidence = businessEvidence(raw.factEvidence, ctx);
  const resolve = complete(isRec(raw.factEvidence) ? raw.factEvidence.source : null, ctx);
  if (
    !evidence ||
    !resolve ||
    resolve.source.fromWord !== raw.resolveWord ||
    resolve.source.toWord !== ctx.win.endWord ||
    resolve.text.replace(/[.!?;]$/u, '') !== story.story.outcome ||
    !resolve.text.includes(evidence.label)
  )
    return mechanismIssue(ctx, 'evidence/outcome must preserve the complete final local clause');
  return { ...story.story, owner, period, factEvidence: evidence };
}
/** Native clauses are independently bound for every real assembly, never inferred from facts/preset. */
function natives(
  raw: unknown,
  expected: { asset: DecisionNativeSource['asset']; identityId: string; pattern: string }[],
  b: Base,
  ctx: ParseContext,
  rawScene: Rec,
): readonly DecisionNativeSource[] | null | false {
  if (raw === null) return b.visualMode === 'diagram' ? null : false;
  if (!Array.isArray(raw) || raw.length !== expected.length || expected.length === 0) return false;
  const result: DecisionNativeSource[] = [];
  for (let i = 0; i < expected.length; i++) {
    const entry: unknown = raw[i],
      target = expected[i];
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['asset', 'identityId', 'source'], ctx) ||
      entry.asset !== target.asset ||
      entry.identityId !== target.identityId
    )
      return false;
    const parsed = clause(entry.source, target.pattern, ctx);
    const setupWord = ctx.inWin(rawScene.setupWord),
      responseWord = ctx.inWin(rawScene.responseWord);
    if (
      !parsed ||
      setupWord === null ||
      responseWord === null ||
      parsed.source.fromWord < setupWord ||
      parsed.source.toWord >= responseWord
    )
      return false;
    result.push({ asset: target.asset, identityId: target.identityId, ...parsed });
  }
  return result;
}
function finish<T extends DecisionsScene>(scene: T, ctx: ParseContext): T | null {
  const identities = decisionIdentities(scene);
  if (
    identities.length > L.entities ||
    !distinctActors(identities) ||
    decisionRows(scene).filter((row) =>
      ['pending', 'negative', 'conditional', 'unknown'].includes(row.state),
    ).length > L.holds ||
    !decisionPresentationFits(scene, ctx.win.endTime)
  )
    return mechanismIssue(
      ctx,
      'identities, holds or complete 24px pages exceed bounded readable windows',
    );
  return immutableDecision(scene);
}
function scalar(raw: unknown, max: number = L.quantity): number | null {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 && raw <= max
    ? raw
    : null;
}
function quantity(
  raw: unknown,
  owner: BusinessIdentity,
  operation: string,
  period: string,
  allowed: readonly DecisionQuantity['state'][],
  ctx: ParseContext,
  condition?: string,
): DecisionQuantity | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'value', 'basis', 'source'], ctx)) return null;
  const state = raw.state;
  if (
    state !== 'planned' &&
    state !== 'configured' &&
    state !== 'observed' &&
    state !== 'pending' &&
    state !== 'negative' &&
    state !== 'conditional' &&
    state !== 'unknown'
  )
    return null;
  if (!allowed.includes(state))
    return mechanismIssue(ctx, 'configured/planned and observed states must stay distinct');
  const basis = quantityBasis(raw.basis, [owner], ctx);
  if (!basis || basis.period !== period) return null;
  const head = `${escaped(owner.label)}`,
    op = escaped(operation),
    unit = escaped(basis.unit),
    p = escaped(period),
    den =
      basis.denominator === null
        ? `unknown ${escaped(basis.population)} denominator`
        : `per ${basis.denominator} ${escaped(basis.population)}`;
  // The independently supplied positive basis is not an observation, forecast or fabricated denominator.
  if (!clause(basis.source, `${head} names ${op} basis in ${unit} during ${p} ${den}`, ctx))
    return null;
  const known =
    state === 'planned' ||
    state === 'configured' ||
    state === 'observed' ||
    state === 'conditional';
  const value = raw.value === null ? null : scalar(raw.value);
  if (
    (known && value === null) ||
    (!known && raw.value !== null) ||
    (state === 'conditional' && !condition)
  )
    return mechanismIssue(
      ctx,
      'unknown/negative/pending amounts are null; conditional amount keeps its source condition',
    );
  const body = known
    ? `${head} ${state === 'conditional' ? 'may report' : state} ${op} of ${value} ${unit} during ${p} ${den}`
    : `${head} ${op} in ${unit} is ${state === 'negative' ? 'not supplied' : state} during ${p} ${den}`;
  const parsed = clause(
    raw.source,
    `${state === 'conditional' ? `${escaped(condition ?? '')}, ` : ''}${body}`,
    ctx,
  );
  return parsed ? { state, value, basis, ...parsed } : null;
}
function comparable(a: DecisionQuantity, b: DecisionQuantity): boolean {
  return (
    compatibleQuantityBases(a.basis, b.basis) ||
    (a.basis.denominator === null &&
      b.basis.denominator === null &&
      ['subjectId', 'unit', 'period', 'population'].every(
        (key) => Reflect.get(a.basis, key) === Reflect.get(b.basis, key),
      ))
  );
}
const OBSERVED = ['observed', 'pending', 'negative', 'conditional', 'unknown'] as const;
function cohort(
  raw: unknown,
  owner: BusinessIdentity,
  role: string,
  period: string,
  ctx: ParseContext,
  condition?: string,
): DecisionCohort | null {
  if (!isRec(raw) || !onlyFields(raw, ['identity', 'quantity'], ctx)) return null;
  const identity = businessIdentity(raw.identity, ctx);
  const q = identity
    ? quantity(
        raw.quantity,
        owner,
        `${role} count for ${identity.label}`,
        period,
        OBSERVED,
        ctx,
        condition,
      )
    : null;
  return identity && q ? { identity, quantity: q } : null;
}
export function parseStagedDecisionScene(raw: Rec, ctx: ParseContext): StagedDecisionScene | null {
  if (
    !boundedBusinessInput(raw, ctx) ||
    raw.kind !== 'staged-decision' ||
    raw.preset !== 'contingent-commitment'
  )
    return null;
  const b = base(raw, ctx, [
    'commitment',
    'action',
    'gate',
    'approver',
    'commitmentFact',
    'gateFact',
    'actionFact',
  ]);
  const commitment = versionedIdentity(raw.commitment, ctx),
    action = businessIdentity(raw.action, ctx),
    gate = businessIdentity(raw.gate, ctx),
    approver = businessIdentity(raw.approver, ctx);
  if (!b || !commitment || !action || !gate || !approver) return null;
  const o = escaped(b.owner.label),
    c = `${escaped(commitment.identity.label)} version ${escaped(commitment.version)}`,
    a = escaped(action.label),
    g = escaped(gate.label),
    r = escaped(approver.label),
    p = escaped(b.period);
  const commitmentFact = fact(
    raw.commitmentFact,
    {
      'source-stated': `${o} records ${c} as a commitment for ${a} during ${p}`,
      pending: `${o} commitment ${c} for ${a} is pending during ${p}`,
      negative: `${o} does not record ${c} as a commitment for ${a} during ${p}`,
      unknown: `${o} commitment ${c} for ${a} is unknown during ${p}`,
      conditional: `${o} may record ${c} as a commitment for ${a} during ${p}`,
    },
    ctx,
    b.condition,
  );
  const gateFact = fact(
    raw.gateFact,
    {
      'source-stated': `${g} reviewed by ${r} remains required for ${a} during ${p}`,
      pending: `${g} reviewed by ${r} for ${a} is pending during ${p}`,
      negative: `${g} reviewed by ${r} for ${a} is not satisfied during ${p}`,
      unknown: `${g} reviewed by ${r} for ${a} is unknown during ${p}`,
      conditional: `${g} reviewed by ${r} may remain required for ${a} during ${p}`,
    },
    ctx,
    b.condition,
  );
  const actionFact = fact(
    raw.actionFact,
    {
      'source-stated': '(?!)',
      pending: `${o} approval of ${a} remains pending during ${p}`,
      negative: `${o} approval of ${a} is denied during ${p}`,
      unknown: `${o} approval of ${a} is unknown during ${p}`,
      conditional: `${o} may consider ${a} during ${p}`,
    },
    ctx,
    b.condition,
  );
  const modelSource = natives(
    raw.modelSource,
    [
      {
        asset: 'A-09',
        identityId: commitment.identity.id,
        pattern: `${o} (?:is|illustrates) a commitment folio for ${c} concerning ${a} during ${p}`,
      },
      {
        asset: 'A-06',
        identityId: gate.id,
        pattern: `${g} (?:is|illustrates) an approval rail for ${a} reviewed by ${r} during ${p}`,
      },
    ],
    b,
    ctx,
    raw,
  );
  if (!commitmentFact || !gateFact || !actionFact || modelSource === false)
    return mechanismIssue(
      ctx,
      'contingent commitment stays a record; gate/action cannot become approved actions or cash; native meaning required for hybrid',
    );
  return finish(
    {
      ...b,
      kind: 'staged-decision',
      preset: 'contingent-commitment',
      commitment,
      action,
      gate,
      approver,
      commitmentFact,
      gateFact,
      actionFact,
      modelSource,
    },
    ctx,
  );
}
export function parseMeasurementFrameScene(
  raw: Rec,
  ctx: ParseContext,
): MeasurementFrameScene | null {
  if (!boundedBusinessInput(raw, ctx) || raw.kind !== 'measurement-frame') return null;
  if (raw.preset === 'planned-observed') {
    const b = base(raw, ctx, ['task', 'planned', 'observed']),
      task = businessIdentity(raw.task, ctx);
    if (!b || !task) return null;
    const planned = quantity(
        raw.planned,
        b.owner,
        `${task.label} throughput`,
        b.period,
        ['planned', 'configured', 'pending', 'negative', 'conditional', 'unknown'],
        ctx,
        b.condition,
      ),
      observed = quantity(
        raw.observed,
        b.owner,
        `${task.label} throughput`,
        b.period,
        OBSERVED,
        ctx,
        b.condition,
      );
    const modelSource = natives(
      raw.modelSource,
      [
        {
          asset: 'A-04',
          identityId: b.owner.id,
          pattern: `${escaped(b.owner.label)} (?:is|illustrates) an operating desk for inspecting ${escaped(task.label)} planned and observed throughput during ${escaped(b.period)}`,
        },
      ],
      b,
      ctx,
      raw,
    );
    return planned && observed && comparable(planned, observed) && modelSource !== false
      ? finish(
          {
            ...b,
            kind: 'measurement-frame',
            preset: 'planned-observed',
            task,
            planned,
            observed,
            modelSource,
          },
          ctx,
        )
      : mechanismIssue(
          ctx,
          'plan and observation require identical source subject/unit/period/population/denominator, with independently supported native meaning',
        );
  }
  if (raw.preset === 'firms-functions-workers') {
    const b = base(raw, ctx, ['frames']);
    if (!b || !Array.isArray(raw.frames) || raw.frames.length !== 3)
      return mechanismIssue(ctx, 'firms/functions/workers require three separate source frames');
    const parseFrame = (entry: unknown, frame: AdoptionFrame['frame']): AdoptionFrame | null => {
      if (
        !isRec(entry) ||
        !onlyFields(entry, ['frame', 'identity', 'quantity'], ctx) ||
        entry.frame !== frame
      )
        return null;
      const identity = businessIdentity(entry.identity, ctx),
        q = identity
          ? quantity(
              entry.quantity,
              b.owner,
              `adopter count for ${identity.label} frame`,
              b.period,
              OBSERVED,
              ctx,
              b.condition,
            )
          : null;
      return identity &&
        q &&
        q.basis.unit === frame &&
        q.basis.population === frame &&
        (q.value === null || (q.basis.denominator !== null && q.value <= q.basis.denominator))
        ? { frame, identity, quantity: q }
        : null;
    };
    const firms = parseFrame(raw.frames[0], 'firms'),
      functions = parseFrame(raw.frames[1], 'functions'),
      workers = parseFrame(raw.frames[2], 'workers');
    if (!firms || !functions || !workers)
      return mechanismIssue(ctx, 'each adoption population requires its own supported basis');
    const modelSource = natives(
      raw.modelSource,
      [
        {
          asset: 'A-03',
          identityId: b.owner.id,
          pattern: `${escaped(b.owner.label)} (?:is|illustrates) a branch pod for inspecting ${[firms, functions, workers].map((entry) => `${escaped(entry.identity.label)} population in ${entry.frame} per ${entry.quantity.basis.denominator === null ? `unknown ${entry.frame} denominator` : `${entry.quantity.basis.denominator} ${entry.frame}`}`).join(' and ')} during ${escaped(b.period)}`,
        },
      ],
      b,
      ctx,
      raw,
    );
    return modelSource !== false
      ? finish(
          {
            ...b,
            kind: 'measurement-frame',
            preset: 'firms-functions-workers',
            modelSource,
            frames: [firms, functions, workers],
          },
          ctx,
        )
      : mechanismIssue(
          ctx,
          'frame denominators cannot be swapped or treated as universal adoption',
        );
  }
  if (raw.preset === 'original-and-surviving-cohorts') {
    const b = base(raw, ctx, ['original', 'surviving', 'attrition', 'accounting']);
    if (!b) return null;
    const original = cohort(raw.original, b.owner, 'original', b.period, ctx, b.condition),
      surviving = cohort(raw.surviving, b.owner, 'surviving', b.period, ctx, b.condition),
      attrition = cohort(raw.attrition, b.owner, 'attrition', b.period, ctx, b.condition);
    if (
      !original ||
      !surviving ||
      !attrition ||
      !comparable(original.quantity, surviving.quantity) ||
      !comparable(original.quantity, attrition.quantity)
    )
      return mechanismIssue(
        ctx,
        'original/surviving/attrition cohorts require identical accounting basis',
      );
    const head = `${escaped(b.owner.label)} accounting of ${escaped(original.identity.label)} as ${escaped(surviving.identity.label)} plus ${escaped(attrition.identity.label)}`,
      p = escaped(b.period);
    const accounting = fact(
      raw.accounting,
      {
        'source-stated': `${head} has no entrants during ${p}`,
        unknown: `${head} is unknown during ${p}`,
        pending: `${head} is pending during ${p}`,
        negative: `${head} is not supported during ${p}`,
        conditional: `${escaped(b.owner.label)} may account for ${escaped(original.identity.label)} as ${escaped(surviving.identity.label)} plus ${escaped(attrition.identity.label)} with no entrants during ${p}`,
      },
      ctx,
      b.condition,
    );
    const qs = [original.quantity, surviving.quantity, attrition.quantity];
    const originalObserved =
      original.quantity.state === 'observed' ? original.quantity.value : null;
    const knownLoss = [surviving.quantity, attrition.quantity].reduce(
      (sum, q) => sum + (q.state === 'observed' ? (q.value ?? 0) : 0),
      0,
    );
    if (
      !accounting ||
      (originalObserved !== null &&
        (originalObserved !== original.quantity.basis.denominator ||
          knownLoss > originalObserved)) ||
      (accounting.state === 'source-stated' &&
        qs.every((q) => q.state === 'observed') &&
        original.quantity.value !==
          (surviving.quantity.value ?? 0) + (attrition.quantity.value ?? 0))
    )
      return mechanismIssue(
        ctx,
        'exact original = surviving + attrition accounting must conserve the original denominator',
      );
    const modelSource = natives(
      raw.modelSource,
      [
        {
          asset: 'A-04',
          identityId: b.owner.id,
          pattern: `${escaped(b.owner.label)} (?:is|illustrates) an operating desk for inspecting ${escaped(original.identity.label)} and ${escaped(surviving.identity.label)} cohorts with ${escaped(attrition.identity.label)} attrition during ${p}`,
        },
      ],
      b,
      ctx,
      raw,
    );
    return modelSource !== false
      ? finish(
          {
            ...b,
            kind: 'measurement-frame',
            preset: 'original-and-surviving-cohorts',
            original,
            surviving,
            attrition,
            accounting,
            modelSource,
          },
          ctx,
        )
      : mechanismIssue(ctx, 'hybrid requires actual desk/cohort native meaning');
  }
  return mechanismIssue(ctx, 'unsupported measurement-frame preset');
}
export function parseUncertaintyAlbumScene(
  raw: Rec,
  ctx: ParseContext,
): UncertaintyAlbumScene | null {
  if (
    !boundedBusinessInput(raw, ctx) ||
    raw.kind !== 'uncertainty-album' ||
    raw.preset !== 'alternatives-or-source-distribution'
  )
    return null;
  const b = base(raw, ctx, ['setMode', 'alternatives', 'distribution']);
  if (
    !b ||
    (raw.setMode !== 'qualitative' && raw.setMode !== 'distribution') ||
    !Array.isArray(raw.alternatives) ||
    raw.alternatives.length < 2 ||
    raw.alternatives.length > L.alternatives
  )
    return null;
  const alternatives: DecisionAlternative[] = [];
  for (const item of raw.alternatives) {
    if (!isRec(item) || !onlyFields(item, ['entry', 'fact', 'probability'], ctx)) return null;
    const entry = versionedIdentity(item.entry, ctx);
    if (!entry) return null;
    const o = escaped(b.owner.label),
      v = `${escaped(entry.identity.label)} version ${escaped(entry.version)}`,
      p = escaped(b.period);
    const f = fact(
      item.fact,
      {
        'source-stated': `${o} keeps ${v} unresolved during ${p}`,
        pending: `${o} keeps ${v} pending during ${p}`,
        negative: `${o} has not chosen ${v} during ${p}`,
        unknown: `${o} status of ${v} is unknown during ${p}`,
        conditional: `${o} may consider ${v} during ${p}`,
      },
      ctx,
      b.condition,
    );
    if (!f) return null;
    let probability: DecisionAlternative['probability'] = null;
    if (raw.setMode === 'qualitative') {
      if (item.probability !== null)
        return mechanismIssue(
          ctx,
          'qualitative alternatives have equal area/time/frequency, never implied probability',
        );
    } else {
      if (
        !isRec(item.probability) ||
        !onlyFields(item.probability, ['numerator', 'denominator', 'source'], ctx)
      )
        return null;
      const numerator = scalar(item.probability.numerator, L.probability),
        denominator = scalar(item.probability.denominator, L.probability);
      if (
        numerator === null ||
        denominator === null ||
        denominator === 0 ||
        numerator > denominator
      )
        return null;
      const parsed = clause(
        item.probability.source,
        `${o} assigns ${v} probability ${numerator} of ${denominator} during ${p}`,
        ctx,
      );
      if (!parsed) return null;
      probability = { numerator, denominator, ...parsed };
    }
    alternatives.push({ entry, fact: f, probability });
  }
  const names = alternatives
      .map((a) => `${escaped(a.entry.identity.label)} version ${escaped(a.entry.version)}`)
      .join(' and '),
    head = `${escaped(b.owner.label)} supplies exhaustive mutually exclusive alternatives ${names} during ${escaped(b.period)}`;
  let distribution: DecisionFact | null = null;
  if (raw.setMode === 'distribution') {
    distribution = fact(
      raw.distribution,
      {
        'source-stated': head,
        pending: '(?!)',
        negative: '(?!)',
        unknown: '(?!)',
        conditional: '(?!)',
      },
      ctx,
    );
    const denominator = alternatives[0].probability?.denominator;
    if (
      !distribution ||
      distribution.state !== 'source-stated' ||
      !denominator ||
      alternatives.some((a) => a.probability?.denominator !== denominator) ||
      alternatives.reduce((sum, a) => sum + (a.probability?.numerator ?? 0), 0) !== denominator
    )
      return mechanismIssue(
        ctx,
        'exact supported exhaustive probabilities must share a bounded denominator and sum to one',
      );
  } else if (raw.distribution !== null) return null;
  const modelSource = natives(
    raw.modelSource,
    [
      {
        asset: 'A-03',
        identityId: b.owner.id,
        pattern: `${escaped(b.owner.label)} (?:is|illustrates) a branch pod for inspecting alternatives ${names} during ${escaped(b.period)}`,
      },
    ],
    b,
    ctx,
    raw,
  );
  return modelSource !== false
    ? finish(
        {
          ...b,
          kind: 'uncertainty-album',
          preset: 'alternatives-or-source-distribution',
          setMode: raw.setMode,
          alternatives,
          distribution,
          modelSource,
        },
        ctx,
      )
    : mechanismIssue(
        ctx,
        'hybrid requires independently supported branch and versioned alternative meaning',
      );
}
