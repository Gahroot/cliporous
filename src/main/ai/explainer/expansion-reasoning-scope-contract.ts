import type {
  ExpansionFactFrame,
  ExpansionFramingFact,
  ExpansionFramingRelation,
  ExpansionSameFactsScene,
  ExpansionScopedRelation,
  ExpansionScopedStatement,
  ExpansionScopedStatementsScene,
  ScopedComparisonStatus,
  ScopedStatementDimension,
  ScopedStatementStatus,
} from '../../remotion/compositions/explainer/expansion/reasoning/scope-types';
import {
  type ExpansionEntity,
  type ExpansionStoryBase,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  compare,
  compatibleBasis,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  type ExpansionAmount,
  type ExpansionEvidenceSpan,
  type ExpansionQuantity,
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

interface LocalEvidence {
  span: ExpansionEvidenceSpan;
  text: string;
}
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const DIMENSIONS: readonly ScopedStatementDimension[] = ['actor', 'version', 'period', 'scope'];

/** Case/typographic normalization only: signs, decimals, units and punctuation remain meaning. */
function normalized(text: string): string {
  return text.normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}
function literal(text: string): string {
  return normalized(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function terminal(text: string): boolean {
  return /[.!?;]["'”’\])]*$/.test(text);
}
function comparisonStatus(value: unknown): ScopedComparisonStatus | null {
  return value === 'disputed' || value === 'unresolved' ? value : null;
}
function statementStatus(value: unknown): ScopedStatementStatus | null {
  return value === 'reported' ? value : comparisonStatus(value);
}
function listPattern(labels: readonly string[]): string {
  if (labels.length === 1) return literal(labels[0]);
  if (labels.length === 2) return `${literal(labels[0])} and ${literal(labels[1])}`;
  return `${labels.slice(0, -1).map(literal).join(', ')},? and ${literal(labels[labels.length - 1])}`;
}

/** Entire authored clause, not a bag of actor/relationship keywords. No arbitrary suffixes. */
function matchesClause(evidence: LocalEvidence, body: string, condition?: string): boolean {
  const pattern = condition
    ? `(?:${literal(condition)}, ${body}|${body},? ${literal(condition)})`
    : body;
  return new RegExp(`^(?:${pattern})[.;]?$`, 'iu').test(normalized(evidence.text));
}
function localCondition(
  raw: Rec,
  evidence: LocalEvidence,
  ctx: ParseContext,
): string | undefined | null {
  return raw.condition === undefined
    ? undefined
    : expansionSourceLabel(raw.condition, evidence, ctx, L.qualifier);
}
function entityRef(
  value: unknown,
  evidence: LocalEvidence,
  actors: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = expansionSourceLabel(value, evidence, ctx, L.actorLabel);
  return label
    ? (actors.find((actor) => normalized(actor.label) === normalized(label)) ??
        mechanismIssue(
          ctx,
          'actor/source must reference a source-named actor label, never an input ID',
        ))
    : null;
}
function recordRef<T extends { label: string }>(
  value: unknown,
  evidence: LocalEvidence,
  records: readonly T[],
  ctx: ParseContext,
): T | null {
  const label = expansionSourceLabel(value, evidence, ctx, 48);
  return label
    ? (records.find((record) => normalized(record.label) === normalized(label)) ??
        mechanismIssue(ctx, 'relationship endpoint must name an existing local record'))
    : null;
}
function boundedArray(raw: unknown, minimum: number, maximum: number): raw is unknown[] {
  return Array.isArray(raw) && raw.length >= minimum && raw.length <= maximum;
}
function sourceEnvelope(
  raw: Rec,
  ctx: ParseContext,
  storyId: '07' | '08',
  fields: readonly string[],
): { story: Omit<ExpansionStoryBase, 'treatment'>; resolveIndex: number } | null {
  if (
    (raw.continues !== undefined && typeof raw.continues !== 'boolean') ||
    (raw.transition !== undefined && !['slide', 'fade', 'grow'].includes(String(raw.transition)))
  )
    return mechanismIssue(ctx, 'continuation/transition must use the existing authored envelope');
  const parsed = expansionStoryBase(raw, ctx, storyId, fields);
  if (!parsed) return null;
  // Require five separate clause-start source beats, not five positions in one sentence.
  let previousEnd = -1;
  for (const field of BEATS) {
    const index = ctx.inWin(raw[field]);
    if (
      index === null ||
      index <= previousEnd ||
      (index > 0 && !terminal(ctx.words[index - 1]?.text ?? ''))
    )
      return mechanismIssue(ctx, 'five beats must start five distinct complete source clauses');
    let end = index;
    while (end < ctx.win.endWord && !terminal(ctx.words[end]?.text ?? '')) end++;
    if (!expansionSourceSpan({ fromWord: index, toWord: end }, ctx)) return null;
    previousEnd = end;
  }
  const resolveIndex = ctx.inWin(raw.resolveWord);
  if (resolveIndex === null) return null;
  return { story: parsed.story, resolveIndex };
}

function scopedStatement(
  raw: unknown,
  ctx: ParseContext,
  actors: readonly ExpansionEntity[],
  index: number,
): ExpansionScopedStatement | null {
  if (
    !isRec(raw) ||
    !onlyFields(
      raw,
      [
        'label',
        'actor',
        'source',
        'version',
        'period',
        'scope',
        'claim',
        'status',
        'evidence',
        'condition',
      ],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'statement requires only its local attribution, complete scope and evidence',
    );
  const evidence = expansionSourceSpan(raw.evidence, ctx);
  if (!evidence) return null;
  const label = expansionSourceLabel(raw.label, evidence, ctx, 48);
  const actor = entityRef(raw.actor, evidence, actors, ctx);
  const source = entityRef(raw.source, evidence, actors, ctx);
  const version = expansionSourceLabel(raw.version, evidence, ctx, L.period);
  const period = expansionSourceLabel(raw.period, evidence, ctx, L.period);
  const scope = expansionSourceLabel(raw.scope, evidence, ctx, L.population);
  const claim = expansionSourceLabel(raw.claim, evidence, ctx, L.claim);
  const status = statementStatus(raw.status);
  const condition = localCondition(raw, evidence, ctx);
  if (
    !label ||
    !actor ||
    !source ||
    !version ||
    !period ||
    !scope ||
    !claim ||
    !status ||
    condition === null
  )
    return mechanismIssue(
      ctx,
      'each statement needs its own actor, source, version, period, scope, full claim and reported/disputed/unresolved status',
    );
  const a = literal(actor.label),
    s = literal(source.label),
    n = literal(label);
  const v = literal(version),
    p = literal(period),
    q = literal(scope),
    c = literal(claim);
  const state = `(?:as ${status}|with ${status} status|with status ${status})`;
  // These are attributions, not assertions that the quoted claim is true. In particular the
  // full quoted claim may itself be negative, uncertain, conditional or numerically precise.
  const body = [
    `${s} (?:reports|records|quotes) ${n} (?:by|from) ${a} (?:in|under) version ${v} (?:during|in|for) ${p} (?:for|within|on) ${q} ${state}: ${c}`,
    `(?:for|within) ${q} (?:during|in) ${p}, ${s} (?:attributes|assigns) ${n} to ${a} (?:in|under) version ${v} ${state}: ${c}`,
    `${s} (?:reports|quotes) ${a}'s ${n} (?:for|within) ${q} (?:during|in) ${p} (?:in|under) version ${v},? ${state}: ${c}`,
    `${s} (?:attributes|assigns) ${n} to ${a} (?:for|within) ${q} (?:during|in) ${p} (?:in|under) version ${v} ${state}: ${c}`,
  ].join('|');
  if (!matchesClause(evidence, `(?:${body})`, condition))
    return mechanismIssue(
      ctx,
      'statement evidence must attribute the entire claim to its exact owner/source and complete version/period/scope locally',
    );
  return {
    id: expansionEntityId('07', L.actors + index),
    label,
    actorId: actor.id,
    sourceId: source.id,
    version,
    period,
    scope,
    claim,
    status,
    evidence: evidence.span,
    ...(condition ? { condition } : {}),
  };
}

function scopedRelation(
  raw: unknown,
  ctx: ParseContext,
  statements: readonly ExpansionScopedStatement[],
): ExpansionScopedRelation | null {
  if (
    !isRec(raw) ||
    !onlyFields(
      raw,
      ['fromLabel', 'toLabel', 'role', 'dimension', 'status', 'evidence', 'condition'],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'scoped relationship needs label endpoints, role, status and local evidence',
    );
  const evidence = expansionSourceSpan(raw.evidence, ctx);
  if (!evidence) return null;
  const from = recordRef(raw.fromLabel, evidence, statements, ctx);
  const to = recordRef(raw.toLabel, evidence, statements, ctx);
  const status = comparisonStatus(raw.status);
  const condition = localCondition(raw, evidence, ctx);
  if (!from || !to || from.id === to.id || !status || condition === null)
    return mechanismIssue(
      ctx,
      'relationship needs two distinct statement endpoints and an unresolved/disputed status',
    );
  const f = literal(from.label),
    t = literal(to.label);
  const common = {
    fromId: from.id,
    toId: to.id,
    status,
    evidence: evidence.span,
    ...(condition ? { condition } : {}),
  };
  if (raw.role === 'scope-distinction') {
    const dimension = DIMENSIONS.find((value) => value === raw.dimension);
    if (!dimension)
      return mechanismIssue(ctx, 'scope distinction must name actor, version, period or scope');
    const left = dimension === 'actor' ? from.actorId : from[dimension];
    const right = dimension === 'actor' ? to.actorId : to[dimension];
    if (normalized(left) === normalized(right))
      return mechanismIssue(
        ctx,
        'a scope distinction requires an actual difference in the named dimension',
      );
    const body = [
      `${f} and ${t} (?:differ|are distinct) in ${dimension} and (?:remain|stay) ${status}`,
      `the ${dimension} of ${f} differs from ${t} and the comparison (?:remains|stays) ${status}`,
      `${f} (?:differs from|is distinct from) ${t} in ${dimension} and the comparison (?:remains|stays) ${status}`,
      `${f} and ${t} have different ${dimension}s? and the comparison (?:remains|stays) ${status}`,
    ].join('|');
    if (!matchesClause(evidence, `(?:${body})`, condition))
      return mechanismIssue(
        ctx,
        'distinction evidence must bind both statements, the actual dimension and qualified status in one full clause',
      );
    return { ...common, role: 'scope-distinction', dimension };
  }
  if (raw.role !== 'conflict' || raw.dimension !== undefined)
    return mechanismIssue(
      ctx,
      'only scope-distinction (with dimension) or conflict (without dimension) is accepted',
    );
  if (
    from.actorId !== to.actorId ||
    ['version', 'period', 'scope'].some(
      (key) =>
        normalized(from[key as 'version' | 'period' | 'scope']) !==
        normalized(to[key as 'version' | 'period' | 'scope']),
    ) ||
    normalized(from.claim) === normalized(to.claim)
  )
    return mechanismIssue(
      ctx,
      'different actor/version/period/scope is not automatically a contradiction; conflict needs matching context and distinct claims',
    );
  const scope = literal(from.scope);
  const body = [
    `${f} (?:conflicts with|contradicts|disputes) ${t} (?:for|on|within) ${scope} and the comparison (?:remains|stays|is) ${status}`,
    `${f} and ${t} (?:conflict|contradict each other) (?:for|on|within) ${scope} and (?:remain|stay) ${status}`,
    `(?:for|within) ${scope}, ${f} (?:conflicts with|contradicts) ${t} and the comparison (?:remains|stays) ${status}`,
  ].join('|');
  if (!matchesClause(evidence, `(?:${body})`, condition))
    return mechanismIssue(
      ctx,
      'conflict must be explicitly source-stated between the exact statements in their shared scope, never inferred or adjudicated',
    );
  return { ...common, role: 'conflict' };
}

/** Raw 07: actors; statements with label refs; relations with fromLabel/toLabel; result. */
export function parseExpansionScopedStatements(
  raw: Rec,
  ctx: ParseContext,
): ExpansionScopedStatementsScene | null {
  if (!isRec(raw) || raw.kind !== 'evidence-conflict' || raw.preset !== 'scoped-statements')
    return mechanismIssue(ctx, 'expected story 07 evidence-conflict/scoped-statements');
  const envelope = sourceEnvelope(raw, ctx, '07', ['actors', 'statements', 'relations', 'result']);
  if (!envelope) return null;
  const actors = expansionEntities(raw.actors, ctx, '07');
  if (
    !actors ||
    !boundedArray(raw.statements, 2, L.records) ||
    !boundedArray(raw.relations, 1, L.relations)
  )
    return mechanismIssue(
      ctx,
      'scoped statements require 1–8 actors, 2–12 statements and 1–16 relationships',
    );
  const statements: ExpansionScopedStatement[] = [];
  for (const [index, value] of raw.statements.entries()) {
    const statement = scopedStatement(value, ctx, actors, index);
    if (!statement) return null;
    if (statements.some((other) => normalized(other.label) === normalized(statement.label)))
      return mechanismIssue(ctx, 'statement labels must identify distinct records');
    statements.push(statement);
  }
  const relations: ExpansionScopedRelation[] = [];
  const seen = new Set<string>();
  for (const value of raw.relations) {
    const relation = scopedRelation(value, ctx, statements);
    if (!relation) return null;
    const key = `${[relation.fromId, relation.toId].sort().join('|')}|${relation.role}|${relation.role === 'scope-distinction' ? relation.dimension : ''}`;
    if (seen.has(key))
      return mechanismIssue(ctx, 'duplicate scoped relationships are not accepted');
    seen.add(key);
    relations.push(relation);
  }
  if (!isRec(raw.result) || !onlyFields(raw.result, ['status', 'evidence', 'condition'], ctx))
    return mechanismIssue(ctx, 'resolution requires only its qualified status and local evidence');
  const evidence = expansionSourceSpan(raw.result.evidence, ctx);
  const status = comparisonStatus(raw.result.status);
  if (!evidence || !status || evidence.span.fromWord !== envelope.resolveIndex)
    return mechanismIssue(
      ctx,
      'resolution must remain unresolved/disputed in the actual resolve clause',
    );
  const condition = localCondition(raw.result, evidence, ctx);
  if (condition === null) return null;
  const names = listPattern(statements.map((statement) => statement.label));
  const check = '(?:the scope check|checking their scopes|checking the statements)';
  const body = [
    `${names} (?:remain|stay) ${status}(?: after ${check})?`,
    `the ${names} comparison (?:remains|stays|is) ${status}(?: after ${check})?`,
    `after ${check}, ${names} (?:remain|stay) ${status}`,
  ].join('|');
  if (!matchesClause(evidence, `(?:${body})`, condition))
    return mechanismIssue(
      ctx,
      'resolve evidence must retain all statement identities and a source-stated unresolved/disputed result, not a winner',
    );
  return {
    ...envelope.story,
    storyId: '07',
    kind: 'evidence-conflict',
    preset: 'scoped-statements',
    actors,
    statements,
    relations,
    result: { status, evidence: evidence.span, ...(condition ? { condition } : {}) },
  };
}

function framingFact(
  raw: unknown,
  ctx: ParseContext,
  actors: readonly ExpansionEntity[],
  index: number,
): ExpansionFramingFact | null {
  if (!isRec(raw) || !onlyFields(raw, ['actor', 'label', 'quantity'], ctx))
    return mechanismIssue(
      ctx,
      'fact requires an actor label, a locally quoted fact label and a common quantity',
    );
  const quantity = parseExpansionQuantity(raw.quantity, ctx);
  if (!quantity)
    return mechanismIssue(
      ctx,
      'fact quantity must retain its local value, basis, state, qualification and complete condition',
    );
  const evidence = expansionSourceSpan(quantity.evidence, ctx);
  if (!evidence) return null;
  const actor = entityRef(raw.actor, evidence, actors, ctx);
  const label = expansionSourceLabel(raw.label, evidence, ctx, 48);
  if (!actor || !label || normalized(actor.label) !== normalized(quantity.actor))
    return mechanismIssue(ctx, 'fact owner must equal the exact actor of its local quantity');
  return { id: expansionEntityId('08', L.actors + index), actorId: actor.id, label, quantity };
}
function positiveAmount(amount: ExpansionAmount): boolean {
  if (amount.kind === 'money') return amount.value.minorUnits > 0;
  const checked = compare(amount.value, { numerator: 0, denominator: 1 });
  return checked.ok && checked.value > 0;
}
function validDenominator(quantity: ExpansionQuantity): boolean {
  switch (quantity.state) {
    case 'unknown':
    case 'missing':
      return true; // Retain the unknown record; do not substitute a denominator or percentage.
    case 'disputed':
      return quantity.alternatives.every(positiveAmount);
    default:
      return positiveAmount(quantity.amount);
  }
}
function framingChangePattern(
  from: ExpansionFactFrame,
  to: ExpansionFactFrame,
  facts: readonly ExpansionFramingFact[],
  basis: 'reference' | 'denominator',
): string {
  const f = literal(from.label),
    t = literal(to.label);
  const names = listPattern(facts.map((fact) => fact.label));
  const a = literal(facts.find((fact) => fact.id === from.referenceFactId)?.label ?? '');
  const b = literal(facts.find((fact) => fact.id === to.referenceFactId)?.label ?? '');
  return `(?:${[
    `${f} and ${t} (?:retain|show|present) the same ${names} and (?:change|switch) the ${basis} from ${a} to ${b}`,
    `across ${f} and ${t}, ${names} (?:stay|remain) (?:identical|unchanged|the same) while the ${basis} (?:changes|switches) from ${a} to ${b}`,
    `${f} and ${t} (?:use|share) the same ${names}, (?:but|while) the ${basis} (?:changes|switches) from ${a} to ${b}`,
    `with ${names} unchanged, ${f} uses ${a} and ${t} uses ${b} as the ${basis}`,
  ].join('|')})`;
}

/** Raw 08 has a single immutable fact pool, two full index lists and one explicit basis change.
 * No ratio/derived/display quantity fields: the frozen story-08 catalog permits no derivations.
 */
export function parseExpansionSameFacts(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSameFactsScene | null {
  if (!isRec(raw) || raw.kind !== 'framing-comparison' || raw.preset !== 'same-facts')
    return mechanismIssue(ctx, 'expected story 08 framing-comparison/same-facts');
  const envelope = sourceEnvelope(raw, ctx, '08', [
    'actors',
    'facts',
    'frames',
    'relations',
    'result',
  ]);
  if (!envelope) return null;
  const actors = expansionEntities(raw.actors, ctx, '08');
  if (
    !actors ||
    !boundedArray(raw.facts, 2, L.records) ||
    !boundedArray(raw.frames, 2, 2) ||
    !boundedArray(raw.relations, 1, 1)
  )
    return mechanismIssue(
      ctx,
      'same-facts needs 1–8 actors, 2–12 shared facts, exactly two frames and one basis-change relation (within the 16-relation cap)',
    );
  const facts: ExpansionFramingFact[] = [];
  const identities = new Set<string>();
  for (const [index, value] of raw.facts.entries()) {
    const fact = framingFact(value, ctx, actors, index);
    if (!fact) return null;
    const q = fact.quantity;
    // A second amount/unit for the same underlying actor/claim/period/population is not a
    // second fact. Denominators and all qualifications remain in the one common quantity.
    const identity = JSON.stringify([
      fact.actorId,
      normalized(q.claim),
      normalized(q.basis.period),
      normalized(q.basis.population),
    ]);
    if (
      identities.has(identity) ||
      facts.some((other) => normalized(other.label) === normalized(fact.label))
    )
      return mechanismIssue(
        ctx,
        'shared facts need unique identities/labels; changed copies of the same fact are not framing',
      );
    identities.add(identity);
    facts.push(fact);
  }
  const frameList: ExpansionFactFrame[] = [];
  for (const [index, value] of raw.frames.entries()) {
    if (
      !isRec(value) ||
      !onlyFields(value, ['label', 'factIndexes', 'referenceFactIndex', 'evidence'], ctx)
    )
      return mechanismIssue(
        ctx,
        'frame accepts only a source label, shared fact indexes, reference fact index and evidence',
      );
    const evidence = expansionSourceSpan(value.evidence, ctx);
    if (!evidence) return null;
    const label = expansionSourceLabel(value.label, evidence, ctx, 48);
    const reference =
      typeof value.referenceFactIndex === 'number' && Number.isSafeInteger(value.referenceFactIndex)
        ? facts[value.referenceFactIndex]
        : undefined;
    if (
      !label ||
      !reference ||
      !Array.isArray(value.factIndexes) ||
      value.factIndexes.length !== facts.length ||
      value.factIndexes.some((factIndex, position) => factIndex !== position) ||
      frameList.some((frame) => normalized(frame.label) === normalized(label))
    )
      return mechanismIssue(
        ctx,
        'both distinct frames must retain the complete identical ordered fact pool and an existing reference, with no edited amounts/IDs',
      );
    frameList.push({
      id: expansionEntityId('08', L.actors + L.records + index),
      label,
      factIds: facts.map((fact) => fact.id),
      referenceFactId: reference.id,
      evidence: evidence.span,
    });
  }
  const frames: [ExpansionFactFrame, ExpansionFactFrame] = [frameList[0], frameList[1]];
  const change = raw.relations[0];
  if (
    !isRec(change) ||
    !onlyFields(change, ['fromLabel', 'toLabel', 'role', 'evidence', 'condition'], ctx)
  )
    return mechanismIssue(
      ctx,
      'basis change requires frame label endpoints, reference-change/denominator-change and local evidence',
    );
  const evidence = expansionSourceSpan(change.evidence, ctx);
  if (!evidence) return null;
  const from = recordRef(change.fromLabel, evidence, frames, ctx);
  const to = recordRef(change.toLabel, evidence, frames, ctx);
  const role =
    change.role === 'reference-change' || change.role === 'denominator-change' ? change.role : null;
  const condition = localCondition(change, evidence, ctx);
  if (
    !from ||
    !to ||
    from.id === to.id ||
    !role ||
    condition === null ||
    from.referenceFactId === to.referenceFactId
  )
    return mechanismIssue(
      ctx,
      'basis change needs two frame endpoints and two distinct source references, not a changed fact',
    );
  const fromFact = facts.find((fact) => fact.id === from.referenceFactId);
  const toFact = facts.find((fact) => fact.id === to.referenceFactId);
  if (
    !fromFact ||
    !toFact ||
    !compatibleBasis(fromFact.quantity.basis, toFact.quantity.basis) ||
    (role === 'denominator-change' &&
      (!validDenominator(fromFact.quantity) || !validDenominator(toFact.quantity)))
  )
    return mechanismIssue(
      ctx,
      'references need compatible exact units/period/population; denominators are positive or explicitly unknown, never fabricated zero/percentages',
    );
  const basis = role === 'reference-change' ? 'reference' : 'denominator';
  const pattern = framingChangePattern(from, to, facts, basis);
  if (!matchesClause(evidence, pattern, condition))
    return mechanismIssue(
      ctx,
      'one full source clause must bind both frames, all unchanged facts and the exact from/to reference or denominator',
    );
  // A frame can quote that complete joint clause or its own explicit all-facts/reference clause.
  // Either way its reference cannot be selected by an unrelated keyword elsewhere in the clip.
  const names = listPattern(facts.map((fact) => fact.label));
  for (const frame of frames) {
    const local = expansionSourceSpan(frame.evidence, ctx);
    const reference = facts.find((fact) => fact.id === frame.referenceFactId);
    if (!local || !reference) return null;
    const own = `${literal(frame.label)} (?:shows|retains|presents) (?:the )?(?:same )?${names} (?:with|using) ${literal(reference.label)} as (?:the )?${basis}`;
    if (!matchesClause(local, pattern, condition) && !matchesClause(local, own))
      return mechanismIssue(
        ctx,
        'each frame must locally bind its full fact identities and its own selected reference',
      );
  }
  if (
    !isRec(raw.result) ||
    !onlyFields(raw.result, ['status', 'evidence', 'condition'], ctx) ||
    raw.result.status !== 'unchanged'
  )
    return mechanismIssue(
      ctx,
      'same-facts resolution must explicitly preserve unchanged facts; no winner or derived ratio',
    );
  const resultEvidence = expansionSourceSpan(raw.result.evidence, ctx);
  if (!resultEvidence || resultEvidence.span.fromWord !== envelope.resolveIndex)
    return mechanismIssue(ctx, 'unchanged result must quote the actual resolve clause');
  const resultCondition = localCondition(raw.result, resultEvidence, ctx);
  if (resultCondition === null) return null;
  const f = literal(from.label),
    t = literal(to.label);
  const resultPattern = `(?:${[
    `${f} and ${t} (?:keep|retain) ${names} unchanged after (?:the )?${basis} (?:switch|change)`,
    `after (?:switching|changing) the ${basis}, ${f} and ${t} (?:still )?(?:retain|keep) the same ${names}`,
    `the ${names} (?:remain|stay) unchanged across ${f} and ${t} after the ${basis} (?:switch|change)`,
  ].join('|')})`;
  if (!matchesClause(resultEvidence, resultPattern, resultCondition))
    return mechanismIssue(
      ctx,
      'resolve evidence must name both frames and all preserved facts after the explicit reference/denominator change',
    );
  const relation: ExpansionFramingRelation = {
    fromId: from.id,
    toId: to.id,
    role,
    fromReferenceId: from.referenceFactId,
    toReferenceId: to.referenceFactId,
    evidence: evidence.span,
    ...(condition ? { condition } : {}),
  };
  return {
    ...envelope.story,
    storyId: '08',
    kind: 'framing-comparison',
    preset: 'same-facts',
    actors,
    facts,
    frames,
    relations: [relation],
    result: {
      status: 'unchanged',
      evidence: resultEvidence.span,
      ...(resultCondition ? { condition: resultCondition } : {}),
    },
  };
}
