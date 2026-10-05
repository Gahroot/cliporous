import type {
  ExpansionCalibrationComparison,
  ExpansionCalibrationRecord,
  ExpansionCalibrationScene,
  ExpansionRiskDimension,
  ExpansionRiskMatrixScene,
  ExpansionRiskRecord,
} from '../../remotion/compositions/explainer/expansion/probability/risk-calibration-types';
import {
  type ExpansionEntity,
  type ExpansionStoryBase,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  compare,
  compatibleBasis,
  divide,
  isDerivationAllowed,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  type ExpansionDerivedValue,
  type ExpansionEvidenceSpan,
  type ExpansionQuantity,
  type ExpansionRational,
  EXPANSION_LIMITS as L,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

interface Evidence {
  span: ExpansionEvidenceSpan;
  text: string;
}
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const LIKELIHOOD = [
  'rare',
  'unlikely',
  'possible',
  'likely',
  'very likely',
  'almost certain',
  'low',
  'medium',
  'high',
];
const IMPACT = ['minor', 'moderate', 'severe', 'catastrophic', 'low', 'medium', 'high'];
const ZERO: ExpansionRational = { numerator: 0, denominator: 1 };
function norm(text: string): string {
  return text.normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}
function quoted(text: string): string {
  return norm(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function names(labels: readonly string[]): string {
  if (labels.length === 1) return quoted(labels[0]);
  if (labels.length === 2) return `${quoted(labels[0])} and ${quoted(labels[1])}`;
  return `${labels.slice(0, -1).map(quoted).join(', ')},? and ${quoted(labels[labels.length - 1])}`;
}
function matches(evidence: Evidence, body: string, condition?: string): boolean {
  const full = condition
    ? `(?:${quoted(condition)}, ${body}|${body},? ${quoted(condition)})`
    : body;
  return new RegExp(`^(?:${full})[.;]?$`, 'iu').test(norm(evidence.text));
}
function condition(raw: Rec, evidence: Evidence, ctx: ParseContext): string | undefined | null {
  return raw.condition === undefined
    ? undefined
    : expansionSourceLabel(raw.condition, evidence, ctx, L.qualifier);
}
function entity(
  value: unknown,
  evidence: Evidence,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = expansionSourceLabel(value, evidence, ctx, L.actorLabel);
  return label
    ? (entities.find((item) => norm(item.label) === norm(label)) ??
        mechanismIssue(
          ctx,
          'reference must name an existing source-bound entity label, not an input ID',
        ))
    : null;
}
function records(raw: unknown): raw is unknown[] {
  return Array.isArray(raw) && raw.length >= 1 && raw.length <= L.records;
}
function envelope(
  raw: Rec,
  ctx: ParseContext,
  id: '15' | '16',
  fields: readonly string[],
): Omit<ExpansionStoryBase, 'treatment'> | null {
  if (
    (raw.continues !== undefined && typeof raw.continues !== 'boolean') ||
    (raw.transition !== undefined &&
      raw.transition !== 'slide' &&
      raw.transition !== 'fade' &&
      raw.transition !== 'grow')
  )
    return mechanismIssue(ctx, 'continuation/transition must use the existing authored envelope');
  const parsed = expansionStoryBase(raw, ctx, id, fields);
  if (!parsed) return null;
  let lastEnd = -1;
  for (const field of BEATS) {
    const index = ctx.inWin(raw[field]);
    if (
      index === null ||
      index <= lastEnd ||
      (index > 0 && !/[.!?;]["'”’\])]*$/.test(ctx.words[index - 1]?.text ?? ''))
    )
      return mechanismIssue(ctx, 'five ordered beats must start distinct complete source clauses');
    let end = index;
    while (end < ctx.win.endWord && !/[.!?;]["'”’\])]*$/.test(ctx.words[end]?.text ?? '')) end++;
    if (!expansionSourceSpan({ fromWord: index, toWord: end }, ctx)) return null;
    lastEnd = end;
  }
  return parsed.story;
}
function local(
  raw: unknown,
  ctx: ParseContext,
  fields: readonly string[],
): { raw: Rec; evidence: Evidence; condition?: string } | null {
  if (!isRec(raw) || !onlyFields(raw, fields, ctx))
    return mechanismIssue(ctx, 'only the authored local evidence fields are accepted');
  const evidence = expansionSourceSpan(raw.evidence, ctx);
  if (!evidence) return null;
  const qualifier = condition(raw, evidence, ctx);
  if (qualifier === null) return null;
  return { raw, evidence, ...(qualifier ? { condition: qualifier } : {}) };
}
function inside(value: ExpansionRational, maximum: ExpansionRational): boolean {
  const lower = compare(value, ZERO),
    upper = compare(value, maximum);
  return lower.ok && upper.ok && lower.value >= 0 && upper.value <= 0;
}
/** Exact, source-supplied probability/count; no conversion or percent-change interpretation. */
function probability(q: ExpansionQuantity): boolean {
  if (!['percent', 'ratio', 'count'].includes(q.basis.unit)) return false;
  const maximum =
    q.basis.unit === 'percent'
      ? { numerator: 100, denominator: 1 }
      : q.basis.unit === 'ratio'
        ? { numerator: 1, denominator: 1 }
        : q.basis.denominator;
  if (!maximum) return false;
  if (q.basis.unit === 'count') {
    const positive = compare(maximum, ZERO);
    if (!positive.ok || positive.value <= 0) return false;
  }
  if (q.state === 'unknown' || q.state === 'missing') return true;
  const amounts = q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : [];
  return (
    amounts.length > 0 &&
    amounts.every((amount) => amount.kind === 'rational' && inside(amount.value, maximum))
  );
}
function scope(dimension: ExpansionRiskDimension): { period: string; population: string } {
  return dimension.state === 'quantity' ? dimension.quantity.basis : dimension.basis;
}

function riskDimension(
  raw: unknown,
  ctx: ParseContext,
  actor: ExpansionEntity,
  event: ExpansionEntity,
  axis: 'likelihood' | 'impact',
): ExpansionRiskDimension | null {
  if (!isRec(raw)) return mechanismIssue(ctx, `${axis} must be a separate source-bound dimension`);
  if (raw.state === 'quantity') {
    if (!onlyFields(raw, ['state', 'quantity'], ctx)) return null;
    const quantity = parseExpansionQuantity(raw.quantity, ctx);
    if (
      !quantity ||
      norm(quantity.actor) !== norm(actor.label) ||
      norm(quantity.claim) !== norm(`${event.label} ${axis}`) ||
      (axis === 'likelihood' && !probability(quantity))
    )
      return mechanismIssue(
        ctx,
        `${axis} quantity needs its exact event/actor, supported units and local basis; probability is not impact or percentage change`,
      );
    return { state: 'quantity', quantity };
  }
  const item = local(raw, ctx, [
    'state',
    'label',
    'qualifier',
    'period',
    'population',
    'evidence',
    'condition',
  ]);
  if (!item) return null;
  const period = expansionSourceLabel(raw.period, item.evidence, ctx, L.period);
  const population = expansionSourceLabel(raw.population, item.evidence, ctx, L.population);
  const label =
    raw.state === 'qualitative'
      ? expansionSourceLabel(raw.label, item.evidence, ctx, L.actorLabel)
      : raw.state === 'unknown'
        ? expansionSourceLabel(raw.qualifier, item.evidence, ctx, L.qualifier)
        : null;
  if (
    !period ||
    !population ||
    !label ||
    (raw.state === 'qualitative' &&
      (raw.qualifier !== undefined ||
        !(axis === 'likelihood' ? LIKELIHOOD : IMPACT).includes(norm(label)))) ||
    (raw.state === 'unknown' &&
      (raw.label !== undefined || !['unknown', 'not stated', 'unavailable'].includes(norm(label))))
  )
    return mechanismIssue(
      ctx,
      `${axis} needs a quoted qualitative label or explicit unknown, complete period/population and no numerical scores`,
    );
  const a = quoted(actor.label),
    e = quoted(event.label),
    p = quoted(period),
    n = quoted(population),
    v = quoted(label);
  const body = `(?:${a} ${e} ${axis} is ${v} (?:during|in|for) ${p} (?:among|for) ${n}|(?:during|in) ${p}, ${a} (?:reports|describes) ${e} ${axis} as ${v} (?:among|for) ${n}|(?:among|for) ${n} (?:during|in) ${p}, ${a} ${e} has ${v} ${axis})`;
  if (!matches(item.evidence, body, item.condition))
    return mechanismIssue(
      ctx,
      `${axis} must be supported by its entire own actor/event/dimension clause, not scattered keywords`,
    );
  const common = {
    basis: { period, population },
    evidence: item.evidence.span,
    ...(item.condition ? { condition: item.condition } : {}),
  };
  return raw.state === 'qualitative'
    ? { ...common, state: 'qualitative', label }
    : { ...common, state: 'unknown', qualifier: label };
}

/** Raw 15: entities; records:{actor,event,likelihood,impact}[]; check; result. */
export function parseExpansionRiskMatrix(
  raw: Rec,
  ctx: ParseContext,
): ExpansionRiskMatrixScene | null {
  if (!isRec(raw) || raw.kind !== 'quadrant' || raw.preset !== 'risk-matrix')
    return mechanismIssue(ctx, 'expected story 15 quadrant/risk-matrix');
  const story = envelope(raw, ctx, '15', ['entities', 'records', 'check', 'result']);
  if (!story) return null;
  const entities = expansionEntities(raw.entities, ctx, '15');
  if (!entities || !records(raw.records))
    return mechanismIssue(ctx, 'risk matrix needs 1–8 named entities and 1–12 source records');
  const parsed: ExpansionRiskRecord[] = [],
    labels: string[] = [],
    identities = new Set<string>();
  for (const [index, value] of raw.records.entries()) {
    if (!isRec(value) || !onlyFields(value, ['actor', 'event', 'likelihood', 'impact'], ctx))
      return mechanismIssue(
        ctx,
        'risk record accepts only actor/event labels and two separate dimensions',
      );
    // Identity refs are additionally matched to the complete dimension clauses below.
    const evidenceRaw =
      isRec(value.likelihood) &&
      value.likelihood.state === 'quantity' &&
      isRec(value.likelihood.quantity)
        ? value.likelihood.quantity.evidence
        : isRec(value.likelihood)
          ? value.likelihood.evidence
          : undefined;
    const evidence = expansionSourceSpan(evidenceRaw, ctx);
    if (!evidence) return mechanismIssue(ctx, 'risk needs a complete local likelihood clause');
    const actor = entity(value.actor, evidence, entities, ctx),
      event = entity(value.event, evidence, entities, ctx);
    if (!actor || !event || actor.id === event.id)
      return mechanismIssue(ctx, 'risk must name its actual owner and a distinct event');
    const likelihood = riskDimension(value.likelihood, ctx, actor, event, 'likelihood');
    const impact = riskDimension(value.impact, ctx, actor, event, 'impact');
    if (!likelihood || !impact) return null;
    const left = scope(likelihood),
      right = scope(impact);
    const le = likelihood.state === 'quantity' ? likelihood.quantity.evidence : likelihood.evidence;
    const ie = impact.state === 'quantity' ? impact.quantity.evidence : impact.evidence;
    if (
      norm(left.period) !== norm(right.period) ||
      norm(left.population) !== norm(right.population) ||
      le.fromWord === ie.fromWord
    )
      return mechanismIssue(
        ctx,
        'likelihood and impact need separately supported dimensions on the same period/population, not conflated units or reused evidence',
      );
    const identity = JSON.stringify([actor.id, event.id, norm(left.period), norm(left.population)]);
    if (identities.has(identity))
      return mechanismIssue(ctx, 'duplicate event/basis records are not new risks');
    identities.add(identity);
    labels.push(`${actor.label} ${event.label}`);
    parsed.push({
      id: expansionEntityId('15', L.actors + index),
      actorId: actor.id,
      eventId: event.id,
      likelihood,
      impact,
    });
  }
  const check = local(raw.check, ctx, ['evidence', 'condition']);
  const result = local(raw.result, ctx, ['status', 'evidence', 'condition']);
  if (
    !check ||
    !result ||
    result.raw.status !== 'scoped' ||
    check.evidence.span.fromWord !== ctx.inWin(raw.checkWord) ||
    result.evidence.span.fromWord !== ctx.inWin(raw.resolveWord)
  )
    return mechanismIssue(
      ctx,
      'risk check and scoped result must quote their own check/resolve clauses',
    );
  const all = names(labels);
  if (
    !matches(
      check.evidence,
      `(?:${all} (?:keeps?|retains?|have|has) separate likelihood and impact dimensions|for ${all}, likelihood and impact remain separate dimensions)`,
      check.condition,
    ) ||
    !matches(
      result.evidence,
      `(?:${all} (?:remains?|stays?) scoped to the stated period and population|the assessment for ${all} stays within the stated period and population)`,
      result.condition,
    )
  )
    return mechanismIssue(
      ctx,
      'source must retain the exact event identities, separate dimensions and scoped result, not invented scores or an observed winner',
    );
  return {
    ...story,
    storyId: '15',
    kind: 'quadrant',
    preset: 'risk-matrix',
    entities,
    records: parsed,
    check: {
      evidence: check.evidence.span,
      ...(check.condition ? { condition: check.condition } : {}),
    },
    result: {
      status: 'scoped',
      evidence: result.evidence.span,
      ...(result.condition ? { condition: result.condition } : {}),
    },
  };
}

function ratio(quantity: ExpansionQuantity, ctx: ParseContext): ExpansionDerivedValue | null {
  if (
    !isDerivationAllowed('16', 'ratio') ||
    quantity.state !== 'known' ||
    quantity.basis.unit !== 'count' ||
    quantity.amount.kind !== 'rational' ||
    !quantity.basis.denominator
  )
    return mechanismIssue(
      ctx,
      'only catalog-16 known source-count/denominator ratios are authorized',
    );
  const value = divide(quantity.amount.value, quantity.basis.denominator);
  if (!value.ok)
    return mechanismIssue(
      ctx,
      'exact calibration ratio failed: zero denominator or bounded arithmetic overflow',
    );
  return {
    state: 'derived',
    operation: 'ratio',
    operands: [quantity.amount.value, quantity.basis.denominator],
    result: value.value,
    basis: { ...quantity.basis, unit: 'ratio' },
    evidence: [quantity.evidence],
  };
}
function calibrationComparison(
  raw: unknown,
  ctx: ParseContext,
  actor: ExpansionEntity,
  label: string,
  prediction: ExpansionQuantity,
  observation: ExpansionQuantity,
): ExpansionCalibrationComparison | null {
  const item = local(raw, ctx, ['state', 'relation', 'evidence', 'condition']);
  if (!item) return null;
  const a = quoted(actor.label),
    n = quoted(label);
  const common = {
    evidence: item.evidence.span,
    ...(item.condition ? { condition: item.condition } : {}),
  };
  if (prediction.state === 'known' && observation.state === 'known') {
    if (prediction.amount.kind !== 'rational' || observation.amount.kind !== 'rational')
      return mechanismIssue(
        ctx,
        'calibration comparisons require exact rational observations/predictions',
      );
    const order = compare(prediction.amount.value, observation.amount.value);
    if (!order.ok)
      return mechanismIssue(ctx, 'calibration comparison overflowed bounded exact arithmetic');
    const relation = order.value < 0 ? 'below' : order.value > 0 ? 'above' : 'equal';
    const verb = relation === 'equal' ? 'equal to' : relation;
    if (
      item.raw.state !== 'compared' ||
      item.raw.relation !== relation ||
      !matches(
        item.evidence,
        `(?:${a} ${n} prediction is ${verb} its observation on the same denominator, period and population|for ${n}, ${a} prediction is ${verb} its observation with the same period, population and denominator)`,
        item.condition,
      )
    )
      return mechanismIssue(
        ctx,
        'comparison must explicitly bind the matched prediction/observation and agree with their exact order and common basis',
      );
    return { ...common, state: 'compared', relation };
  }
  const which = observation.state !== 'known' ? 'observation' : 'prediction';
  const state = which === 'observation' ? observation.state : prediction.state;
  const other = which === 'observation' ? 'prediction' : 'observation';
  if (
    item.raw.state !== 'uncompared' ||
    item.raw.relation !== undefined ||
    !matches(
      item.evidence,
      `(?:${a} ${n} ${which} (?:remains|stays|is) ${state} and its ${other} is not compared|for ${n}, ${a} ${which} is ${state} and the ${other} remains uncompared)`,
      item.condition,
    )
  )
    return mechanismIssue(
      ctx,
      'unknown/qualified records must explicitly remain uncompared, never zero or an incorrect prediction',
    );
  return { ...common, state: 'uncompared' };
}

/** Raw 16: entities; records:{label,actor,prediction,observation,comparison,deriveRatios?}[]; result. */
export function parseExpansionCalibration(
  raw: Rec,
  ctx: ParseContext,
): ExpansionCalibrationScene | null {
  if (!isRec(raw) || raw.kind !== 'probability-workbench' || raw.preset !== 'calibration')
    return mechanismIssue(ctx, 'expected story 16 probability-workbench/calibration');
  const story = envelope(raw, ctx, '16', ['entities', 'records', 'result']);
  if (!story) return null;
  const entities = expansionEntities(raw.entities, ctx, '16');
  if (!entities || !records(raw.records))
    return mechanismIssue(
      ctx,
      'calibration needs 1–8 named entities and 1–12 matched source records',
    );
  const parsed: ExpansionCalibrationRecord[] = [],
    labels: string[] = [],
    identities = new Set<string>();
  for (const [index, value] of raw.records.entries()) {
    if (
      !isRec(value) ||
      !onlyFields(
        value,
        ['label', 'actor', 'prediction', 'observation', 'comparison', 'deriveRatios'],
        ctx,
      ) ||
      (value.deriveRatios !== undefined && typeof value.deriveRatios !== 'boolean')
    )
      return mechanismIssue(
        ctx,
        'calibration record accepts only paired source quantities, local comparison and an optional authored deriveRatios flag',
      );
    const prediction = parseExpansionQuantity(value.prediction, ctx),
      observation = parseExpansionQuantity(value.observation, ctx);
    if (!prediction || !observation)
      return mechanismIssue(
        ctx,
        'both quantities must retain their own complete local value, qualification, unit, period, population and denominator',
      );
    const evidence = expansionSourceSpan(prediction.evidence, ctx),
      observedEvidence = expansionSourceSpan(observation.evidence, ctx);
    if (!evidence || !observedEvidence) return null;
    const actor = entity(value.actor, evidence, entities, ctx);
    const label = expansionSourceLabel(value.label, evidence, ctx, 48);
    if (
      !actor ||
      !label ||
      !expansionSourceLabel(label, observedEvidence, ctx, 48) ||
      norm(prediction.actor) !== norm(actor.label) ||
      norm(observation.actor) !== norm(actor.label) ||
      norm(prediction.claim) !== norm(`${label} prediction`) ||
      norm(observation.claim) !== norm(`${label} observation`) ||
      prediction.evidence.fromWord === observation.evidence.fromWord ||
      prediction.state === 'unknown' ||
      prediction.state === 'missing' ||
      !prediction.basis.denominator ||
      !probability(prediction) ||
      !probability(observation)
    )
      return mechanismIssue(
        ctx,
        'each record needs a supplied prediction and its own corresponding observation for the exact actor/label; no borrowed observations, unsupported units or invented rates',
      );
    const p = prediction.basis,
      o = observation.basis;
    const known = prediction.state === 'known' && observation.state === 'known';
    if (
      p.unit !== o.unit ||
      norm(p.period) !== norm(o.period) ||
      norm(p.population) !== norm(o.population) ||
      ((known || o.denominator !== undefined) && !compatibleBasis(p, o))
    )
      return mechanismIssue(
        ctx,
        'prediction and observation must share exact units/period/population/denominators; absent held-out data is not a comparable zero',
      );
    const identity = JSON.stringify([actor.id, norm(label), norm(p.period), norm(p.population)]);
    if (identities.has(identity))
      return mechanismIssue(
        ctx,
        'duplicate calibration identities are not additional observations',
      );
    identities.add(identity);
    const comparison = calibrationComparison(
      value.comparison,
      ctx,
      actor,
      label,
      prediction,
      observation,
    );
    if (!comparison) return null;
    let predictionRatio: ExpansionDerivedValue | undefined,
      observationRatio: ExpansionDerivedValue | undefined;
    if (value.deriveRatios === true) {
      const derivedPrediction = ratio(prediction, ctx);
      if (!derivedPrediction) return null;
      predictionRatio = derivedPrediction;
      if (observation.state === 'known') {
        const derivedObservation = ratio(observation, ctx);
        if (!derivedObservation) return null;
        observationRatio = derivedObservation;
      }
    }
    labels.push(`${actor.label} ${label}`);
    parsed.push({
      id: expansionEntityId('16', L.actors + index),
      label,
      actorId: actor.id,
      prediction,
      observation,
      comparison,
      ...(predictionRatio ? { predictionRatio } : {}),
      ...(observationRatio ? { observationRatio } : {}),
    });
  }
  const result = local(raw.result, ctx, ['status', 'evidence', 'condition']);
  if (
    !result ||
    result.raw.status !== 'scoped' ||
    result.evidence.span.fromWord !== ctx.inWin(raw.resolveWord)
  )
    return mechanismIssue(
      ctx,
      'calibration needs a source-stated scoped result in its actual resolve clause',
    );
  const all = names(labels);
  if (
    !matches(
      result.evidence,
      `(?:${all} comparisons (?:remain|stay) limited to the supplied records|the comparison for ${all} remains limited to the supplied records)`,
      result.condition,
    )
  )
    return mechanismIssue(
      ctx,
      'resolve must retain the named supplied records, not invent model accuracy, smoothing, regression or a winner',
    );
  return {
    ...story,
    storyId: '16',
    kind: 'probability-workbench',
    preset: 'calibration',
    entities,
    records: parsed,
    result: {
      status: 'scoped',
      evidence: result.evidence.span,
      ...(result.condition ? { condition: result.condition } : {}),
    },
  };
}
