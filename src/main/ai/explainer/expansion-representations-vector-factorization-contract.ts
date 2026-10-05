/** Local step14 contracts. No expression parser, evaluator, geometry, or implicit vector arithmetic. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import {
  EXPANSION_FACTORIZATION_OPERATIONS,
  type ExpansionAuthoredFactors,
  type ExpansionComponentDirection,
  type ExpansionFactorizationOperand,
  type ExpansionFactorizationResult,
  type ExpansionFactorizationScene,
  type ExpansionSuppliedVector,
  type ExpansionVectorAxis,
  type ExpansionVectorBasisScene,
} from '../../remotion/compositions/explainer/expansion/representations/vector-factorization-types';
import type {
  ExpansionEntity,
  ExpansionStoryBase,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  compare,
  compatibleBasis,
  isDerivationAllowed,
  multiply,
  subtract,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  type ExpansionEvidenceSpan,
  type ExpansionQuantity,
  type ExpansionRational,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  type ExpansionSourceEvidence,
  expansionAssertedRelation,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const WORDS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const COMMON = [
  'kind',
  'preset',
  'visualMode',
  'label',
  'subject',
  'outcome',
  'evidence',
  'condition',
  'entities',
  'actor',
  'scope',
  'period',
  'template',
  'result',
  'startWord',
  'endWord',
  'layout',
  'continues',
  'transition',
  ...WORDS,
];
function same(a: string, b: string): boolean {
  return a.normalize('NFKC').toLowerCase().trim() === b.normalize('NFKC').toLowerCase().trim();
}
function lit(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}
function list(text: readonly string[]): string {
  if (text.length === 1) return lit(text[0]);
  if (text.length === 2) return `${lit(text[0])}\\s+and\\s+${lit(text[1])}`;
  return `${text.slice(0, -1).map(lit).join(',\\s*')},?\\s+and\\s+${lit(text.at(-1) ?? '')}`;
}
function exact(a: ExpansionEvidenceSpan, b: ExpansionEvidenceSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function asserted(
  e: ExpansionSourceEvidence,
  body: string,
  scope: string,
  period: string,
  condition?: string,
  labels: readonly string[] = [],
): boolean {
  const local = `(?:${body}\\s+for\\s+${lit(scope)}\\s+during\\s+${lit(period)}|during\\s+${lit(period)}\\s+for\\s+${lit(scope)},\\s*${body})`;
  return expansionAssertedRelation(e, new RegExp(local, 'iu'), condition, [
    ...labels,
    scope,
    period,
  ]);
}
function entity(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = ctx.str(raw, EXPANSION_LIMITS.actorLabel);
  return (
    (label ? entities.find((e) => same(e.label, label)) : undefined) ??
    mechanismIssue(ctx, 'use an exact declared source label, never a caller ID')
  );
}
function envelope(raw: Rec, ctx: ParseContext, storyId: '55' | '56', extra: readonly string[]) {
  const entry = expansionEntry(raw.kind, raw.preset),
    w = ctx.win;
  if (!entry || entry.id !== storyId || !onlyFields(raw, [...COMMON, ...extra], ctx)) return null;
  if (
    !Number.isFinite(w.startTime) ||
    !Number.isFinite(w.endTime) ||
    w.endTime - w.startTime < 5 ||
    w.endTime - w.startTime > 12 ||
    !Number.isSafeInteger(w.startWord) ||
    !Number.isSafeInteger(w.endWord) ||
    w.startWord < 0 ||
    w.endWord < w.startWord ||
    w.endWord >= ctx.words.length ||
    (raw.startWord !== undefined && raw.startWord !== w.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== w.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((v) => v === raw.layout)) ||
    (raw.continues !== undefined && typeof raw.continues !== 'boolean') ||
    (raw.transition !== undefined &&
      raw.transition !== 'grow' &&
      raw.transition !== 'slide' &&
      raw.transition !== 'fade')
  )
    return mechanismIssue(ctx, 'retain the complete finite 5–12s authored scene window');
  if (
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid') ||
    (raw.evidence !== 'source-stated' && raw.evidence !== 'illustrative')
  )
    return null;
  let previous = -Infinity;
  for (let i = w.startWord; i <= w.endWord; i++) {
    const word = ctx.words[i];
    if (
      !word ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.end <= word.start ||
      word.start < previous - 1e-7 ||
      word.start < w.startTime ||
      word.end > w.endTime
    )
      return mechanismIssue(
        ctx,
        'words must be finite positive nonoverlapping intervals (1e-7) inside the window',
      );
    previous = word.end;
  }
  if (
    ctx.words[w.startWord].start < w.startTime + 0.25 - 1e-7 ||
    ctx.words[w.endWord].end > w.endTime - 0.35 + 1e-7
  )
    return mechanismIssue(ctx, 'retain .25s lead-in and .35s tail');
  const clauses: ExpansionSourceEvidence[] = [];
  let start = w.startWord;
  for (let i = start; i <= w.endWord; i++) {
    if (/[.!?;][”"’')\]]*$/.test(ctx.words[i].text) || i === w.endWord) {
      const e = expansionSourceSpan({ fromWord: start, toWord: i }, ctx);
      if (!e) return null;
      clauses.push(e);
      start = i + 1;
    }
  }
  const beats = WORDS.map((field) =>
    clauses.find((e) => e.span.fromWord === ctx.inWin(raw[field])),
  );
  if (
    beats.some((e) => !e) ||
    new Set(beats).size !== 5 ||
    beats[0] !== clauses[0] ||
    beats[4] !== clauses.at(-1)
  )
    return mechanismIssue(ctx, 'five distinct complete clause starts must own the story');
  const [setup, action, response, check, resolve] = beats;
  if (!setup || !action || !response || !check || !resolve) return null;
  const times = strictMechanismBeats(raw, ctx, WORDS, [1, 1, 1, 1], 0.8);
  if (!times || times.some((t, i) => i > 0 && t - times[i - 1] < 1) || w.endTime - times[4] < 0.8)
    return mechanismIssue(ctx, 'require strict >=1s gaps and >=.8s final hold');
  const label = expansionSourceLabel(raw.label, setup, ctx, 48),
    subject = expansionSourceLabel(raw.subject, setup, ctx, 34),
    outcome = expansionSourceLabel(raw.outcome, resolve, ctx, 54);
  const scope = expansionSourceLabel(raw.scope, setup, ctx, EXPANSION_LIMITS.population),
    period = expansionSourceLabel(raw.period, setup, ctx, EXPANSION_LIMITS.period);
  const conditionEvidence =
    clauses.find(
      (e) =>
        typeof raw.condition === 'string' &&
        e.text.toLowerCase().includes(raw.condition.toLowerCase()),
    ) ?? setup;
  const condition =
    raw.condition === undefined
      ? undefined
      : expansionSourceLabel(raw.condition, conditionEvidence, ctx, EXPANSION_LIMITS.qualifier);
  const entities = expansionEntities(raw.entities, ctx, storyId),
    actor = entities ? entity(raw.actor, entities, ctx) : null;
  if (
    !label ||
    !subject ||
    !outcome ||
    !scope ||
    !period ||
    !entities ||
    !actor ||
    !same(subject, actor.label) ||
    condition === null ||
    (condition !== undefined &&
      !/^(?:if|unless|when|provided that|assuming)\s+/i.test(condition)) ||
    entities.some((e) => !exact(e.evidence, setup.span))
  )
    return null;
  const [setupAt, actionAt, responseAt, checkAt, resolveAt] = times;
  const story: ExpansionStoryBase = {
    storyId,
    label,
    subject,
    outcome,
    visualMode: raw.visualMode,
    evidence: raw.evidence,
    ...(condition ? { condition } : {}),
    setupAt,
    actionAt,
    responseAt,
    checkAt,
    resolveAt,
  };
  return {
    story,
    actor,
    entities,
    scope,
    period,
    condition,
    clauses,
    setup,
    action,
    response,
    check,
    resolve,
  };
}
function boundQuantity(
  raw: unknown,
  base: NonNullable<ReturnType<typeof envelope>>,
  ctx: ParseContext,
): ExpansionQuantity | null {
  const q = parseExpansionQuantity(raw, ctx);
  if (
    !q ||
    !same(q.actor, base.actor.label) ||
    !same(q.basis.population, base.scope) ||
    !same(q.basis.period, base.period) ||
    (q.state === 'conditional' && q.condition !== base.condition) ||
    (base.condition !== undefined && q.state !== 'conditional') ||
    (['count', 'ratio', 'percent', 'percentage-point', 'percent-change'].includes(q.basis.unit) &&
      !q.basis.denominator) ||
    q.evidence.fromWord <= base.setup.span.toWord ||
    q.evidence.toWord >= base.check.span.fromWord
  )
    return mechanismIssue(
      ctx,
      'quantity must bind the same actor/claim/unit/scope/period/denominator and local condition',
    );
  if (
    (q.state === 'simulated' || q.state === 'illustrative') &&
    base.story.evidence !== 'illustrative'
  )
    return mechanismIssue(ctx, 'teaching operands cannot become measured facts');
  return q;
}
function coverage(
  base: NonNullable<ReturnType<typeof envelope>>,
  quantities: readonly ExpansionQuantity[],
  ctx: ParseContext,
): boolean {
  if (
    new Set(quantities.map((q) => q.evidence.fromWord)).size !== quantities.length ||
    base.clauses.some(
      (e) =>
        ![
          base.setup.span,
          base.check.span,
          base.resolve.span,
          ...quantities.map((q) => q.evidence),
        ].some((s) => exact(e.span, s)),
    )
  ) {
    mechanismIssue(ctx, 'retain every complete supplied operand clause exactly once');
    return false;
  }
  return true;
}
function amount(q: ExpansionQuantity): ExpansionRational | null {
  return 'amount' in q && q.amount.kind === 'rational' ? q.amount.value : null;
}
function sign(q: ExpansionQuantity): ExpansionComponentDirection | null {
  if (q.state === 'unknown' || q.state === 'missing' || q.state === 'disputed') return q.state;
  const value = amount(q);
  return value
    ? value.numerator < 0
      ? 'negative'
      : value.numerator > 0
        ? 'positive'
        : 'zero'
    : null;
}

/** 55 accepts only complete supplied components; no coefficients, norms or rotations are computed. */
export function parseExpansionVectorBasis(
  raw: Rec,
  ctx: ParseContext,
): ExpansionVectorBasisScene | null {
  return (
    vectorBasis(raw, ctx) ??
    mechanismIssue(
      ctx,
      'vector-basis rejected: retain the complete authored template, source frame, directions, components and correspondence',
    )
  );
}
function vectorBasis(raw: Rec, ctx: ParseContext): ExpansionVectorBasisScene | null {
  const base = envelope(raw, ctx, '55', ['frame', 'axes', 'vector', 'basis', 'correspondence']);
  if (!base) return null;
  const axes: ExpansionVectorAxis[] =
    raw.template === 'planar-components'
      ? ['x', 'y']
      : raw.template === 'spatial-components'
        ? ['x', 'y', 'z']
        : [];
  if (
    !axes.length ||
    !Array.isArray(raw.axes) ||
    raw.axes.length !== axes.length ||
    raw.axes.some((v, i) => v !== axes[i]) ||
    !Array.isArray(raw.basis) ||
    raw.basis.length !== axes.length ||
    !isRec(raw.vector)
  )
    return null;
  const frame = expansionSourceLabel(raw.frame, base.setup, ctx, 32);
  const quantities: ExpansionQuantity[] = [];
  function vector(r: Rec, index: number): ExpansionSuppliedVector | null {
    if (!onlyFields(r, ['label', 'components'], ctx)) return null;
    const owner = entity(r.label, base?.entities ?? [], ctx);
    if (
      !owner ||
      owner.id === base?.actor.id ||
      !Array.isArray(r.components) ||
      r.components.length !== axes.length
    )
      return null;
    const components: ExpansionSuppliedVector['components'][number][] = [];
    for (const [i, c] of r.components.entries()) {
      if (!isRec(c) || !onlyFields(c, ['axis', 'direction', 'quantity'], ctx) || c.axis !== axes[i])
        return null;
      const q = boundQuantity(c.quantity, base as NonNullable<typeof base>, ctx);
      if (
        !q ||
        c.direction !== sign(q) ||
        !same(q.claim, `${owner.label} ${axes[i]} ${c.direction} component`) ||
        (index === 0 &&
          (q.evidence.fromWord < (base?.action.span.fromWord ?? 0) ||
            q.evidence.toWord >= (base?.response.span.fromWord ?? 0))) ||
        (index > 0 && q.evidence.fromWord < (base?.response.span.fromWord ?? 0))
      )
        return null;
      components.push({
        id: `expansion-55-component-${index}-${i}`,
        axis: axes[i],
        direction: c.direction as ExpansionComponentDirection,
        quantity: q,
      });
      quantities.push(q);
    }
    return { id: `expansion-55-vector-${index}`, entityId: owner.id, components };
  }
  const supplied = vector(raw.vector, 0),
    basis: ExpansionSuppliedVector[] = [];
  for (const [i, r] of raw.basis.entries()) {
    if (!isRec(r)) return null;
    const b = vector(r, i + 1);
    if (!b) return null;
    basis.push(b);
  }
  if (
    !frame ||
    !supplied ||
    base.entities.length !== axes.length + 2 ||
    new Set([supplied.entityId, ...basis.map((v) => v.entityId)]).size !== axes.length + 1 ||
    quantities.length > EXPANSION_LIMITS.records ||
    quantities.length > EXPANSION_LIMITS.relations ||
    quantities.some((q) => !compatibleBasis(q.basis, quantities[0].basis)) ||
    !exact(supplied.components[0].quantity.evidence, base.action.span) ||
    !exact(basis[0].components[0].quantity.evidence, base.response.span)
  )
    return null;
  const name = (id: string) => base.entities.find((e) => e.id === id)?.label ?? '';
  const vectorLabel = name(supplied.entityId),
    basisLabels = basis.map((v) => name(v.entityId));
  if (
    !asserted(
      base.setup,
      `${lit(base.actor.label)}\\s+${lit(base.story.label)}\\s+(?:presents|introduces)\\s+${lit(vectorLabel)}\\s+with\\s+basis\\s+${list(basisLabels)}\\s+in\\s+${lit(frame)}`,
      base.scope,
      base.period,
      base.condition,
      [`${base.actor.label} ${base.story.label}`, vectorLabel, ...basisLabels, frame],
    )
  )
    return null;
  if (
    !isRec(raw.correspondence) ||
    !onlyFields(raw.correspondence, ['actor', 'frame', 'vector', 'basis', 'evidence'], ctx) ||
    !isRec(raw.result) ||
    !onlyFields(raw.result, ['actor', 'claim', 'evidence'], ctx)
  )
    return null;
  const c = raw.correspondence,
    ce = expansionSourceSpan(c.evidence, ctx),
    r = raw.result,
    re = expansionSourceSpan(r.evidence, ctx);
  if (
    !ce ||
    !re ||
    !exact(ce.span, base.check.span) ||
    !exact(re.span, base.resolve.span) ||
    c.actor !== base.actor.label ||
    c.frame !== frame ||
    c.vector !== vectorLabel ||
    !Array.isArray(c.basis) ||
    c.basis.length !== basisLabels.length ||
    c.basis.some((v, i) => v !== basisLabels[i]) ||
    r.actor !== base.actor.label ||
    r.claim !== 'component display' ||
    base.story.outcome !== 'preserves supplied components' ||
    !asserted(
      ce,
      `${lit(base.actor.label)}\\s+(?:maps|corresponds)\\s+${list([vectorLabel, ...basisLabels])}\\s+to\\s+${lit(frame)}`,
      base.scope,
      base.period,
      base.condition,
      [base.actor.label, vectorLabel, ...basisLabels, frame],
    ) ||
    !asserted(
      re,
      `${lit(base.actor.label)}\\s+component\\s+display\\s+preserves\\s+supplied\\s+components`,
      base.scope,
      base.period,
      base.condition,
      [base.actor.label],
    ) ||
    !coverage(base, quantities, ctx)
  )
    return null;
  return {
    ...base.story,
    storyId: '55',
    kind: 'linear-algebra',
    preset: 'vector-basis',
    template: raw.template as ExpansionVectorBasisScene['template'],
    entities: base.entities,
    actorId: base.actor.id,
    scope: base.scope,
    period: base.period,
    frame,
    axes,
    vector: supplied,
    basis,
    correspondence: {
      actorId: base.actor.id,
      frame,
      vectorId: supplied.id,
      basisIds: basis.map((b) => b.id),
      evidence: ce.span,
    },
    result: {
      state: 'supplied',
      actorId: base.actor.id,
      claim: 'component display',
      evidence: re.span,
    },
  };
}

const COMMON_ROLES = [
  'linear coefficient',
  'constant term',
  'common factor',
  'inner coefficient',
  'inner constant',
] as const;
const SQUARE_ROLES = ['square coefficient', 'constant term', 'first base', 'second base'] as const;
function equal(a: ExpansionRational, b: ExpansionRational): boolean {
  const e = compare(a, b);
  return e.ok && e.value === 0;
}
/** 56 runs only two fixed arithmetic identities after an explicit grounded worked request. */
export function parseExpansionFactorization(
  raw: Rec,
  ctx: ParseContext,
): ExpansionFactorizationScene | null {
  return (
    factorization(raw, ctx) ??
    mechanismIssue(
      ctx,
      'factorization rejected: retain the authored operand roles, exact identity, worked request and source state/qualification',
    )
  );
}
function factorization(raw: Rec, ctx: ParseContext): ExpansionFactorizationScene | null {
  const base = envelope(raw, ctx, '56', ['operation', 'symbol', 'operands', 'request']);
  if (
    !base ||
    raw.operation !== EXPANSION_FACTORIZATION_OPERATIONS[0] ||
    !isDerivationAllowed('56', 'factorization') ||
    (raw.symbol !== 'x' && raw.symbol !== 'y' && raw.symbol !== 'z')
  )
    return null;
  const roles =
    raw.template === 'common-factor'
      ? COMMON_ROLES
      : raw.template === 'integer-difference-of-squares'
        ? SQUARE_ROLES
        : null;
  if (
    !roles ||
    !Array.isArray(raw.operands) ||
    raw.operands.length !== roles.length ||
    raw.operands.length + 2 > EXPANSION_LIMITS.records ||
    raw.operands.length * 2 > EXPANSION_LIMITS.relations ||
    base.entities.length !== 1
  )
    return null;
  const operands: ExpansionFactorizationOperand[] = [];
  for (const [i, r] of raw.operands.entries()) {
    if (!isRec(r) || !onlyFields(r, ['role', 'quantity'], ctx) || r.role !== roles[i]) return null;
    const q = boundQuantity(r.quantity, base, ctx);
    if (
      !q ||
      !same(q.claim, roles[i]) ||
      q.basis.unit !== 'ratio' ||
      !q.basis.denominator ||
      q.basis.denominator.numerator !== 1 ||
      q.basis.denominator.denominator !== 1 ||
      (operands.length && !compatibleBasis(operands[0].quantity.basis, q.basis))
    )
      return null;
    operands.push({ id: `expansion-56-operand-${i}`, role: roles[i], quantity: q });
  }
  if (
    !exact(operands[0].quantity.evidence, base.action.span) ||
    !exact(operands[2].quantity.evidence, base.response.span) ||
    !coverage(
      base,
      operands.map((o) => o.quantity),
      ctx,
    )
  )
    return null;
  const descriptor =
    raw.template === 'common-factor' ? 'common factor' : 'integer difference of squares';
  if (
    !asserted(
      base.setup,
      `${lit(base.actor.label)}\\s+${lit(base.story.label)}\\s+(?:uses|teaches)\\s+${raw.symbol}\\s+for\\s+${descriptor}`,
      base.scope,
      base.period,
      base.condition,
      [base.actor.label, base.story.label],
    )
  )
    return null;
  if (
    !isRec(raw.request) ||
    !onlyFields(raw.request, ['actor', 'operation', 'evidence'], ctx) ||
    raw.request.actor !== base.actor.label ||
    raw.request.operation !== 'factorization'
  )
    return null;
  const requestEvidence = expansionSourceSpan(raw.request.evidence, ctx);
  if (
    !requestEvidence ||
    !exact(requestEvidence.span, base.check.span) ||
    !asserted(
      requestEvidence,
      `${lit(base.actor.label)}\\s+(?:requests|asks\\s+for)\\s+a\\s+worked\\s+factorization\\s+using\\s+${raw.symbol}\\s+and\\s+all\\s+supplied\\s+operands`,
      base.scope,
      base.period,
      base.condition,
      [base.actor.label],
    )
  )
    return mechanismIssue(
      ctx,
      'factor output requires an explicit complete source worked-calculation request',
    );
  if (
    !isRec(raw.result) ||
    !onlyFields(raw.result, ['actor', 'state', 'qualifier', 'condition', 'evidence'], ctx) ||
    raw.result.actor !== base.actor.label
  )
    return null;
  const r = raw.result,
    re = expansionSourceSpan(r.evidence, ctx);
  if (!re || !exact(re.span, base.resolve.span)) return null;
  const ids = operands.map((o) => o.id),
    evidence = [...operands.map((o) => o.quantity.evidence), requestEvidence.span, re.span];
  let result: ExpansionFactorizationResult;
  const absent = operands.filter((o) =>
    ['unknown', 'missing', 'disputed'].includes(o.quantity.state),
  );
  if (absent.length) {
    if (
      (r.state !== 'unknown' && r.state !== 'missing' && r.state !== 'disputed') ||
      !absent.some((o) => o.quantity.state === r.state) ||
      r.qualifier !== r.state ||
      r.condition !== undefined ||
      base.story.outcome !== `remains ${r.state}` ||
      !asserted(
        re,
        `${lit(base.actor.label)}\\s+factorization\\s+remains\\s+${r.state}`,
        base.scope,
        base.period,
        base.condition,
        [base.actor.label],
      )
    )
      return null;
    result = { state: r.state, qualifier: r.state, operandIds: ids, evidence };
  } else {
    if (
      r.state !== 'known' &&
      r.state !== 'conditional' &&
      r.state !== 'simulated' &&
      r.state !== 'illustrative'
    )
      return null;
    const teaching = operands.filter(
      (o) => o.quantity.state === 'simulated' || o.quantity.state === 'illustrative',
    );
    if (
      (teaching.length &&
        !teaching.every(
          (o) =>
            o.quantity.state === r.state &&
            'qualifier' in o.quantity &&
            o.quantity.qualifier === r.qualifier,
        )) ||
      (!teaching.length &&
        (r.state !== (base.condition ? 'conditional' : 'known') || r.qualifier !== undefined)) ||
      (r.state === 'conditional' ? r.condition !== base.condition : r.condition !== undefined)
    )
      return mechanismIssue(
        ctx,
        'derived factors retain source conditions and teaching qualifiers, never promote a simulation',
      );
    const qualifier = teaching.length ? expansionSourceLabel(r.qualifier, re, ctx, 96) : undefined;
    if (
      qualifier === null ||
      (teaching.length && !qualifier) ||
      base.story.outcome !== 'worked factorization'
    )
      return null;
    const body = `${lit(base.actor.label)}\\s+reports\\s+worked\\s+factorization`;
    if (
      !asserted(
        re,
        qualifier ? `in\\s+this\\s+${lit(qualifier)},\\s*${body}` : body,
        base.scope,
        base.period,
        base.condition,
        [base.actor.label],
      )
    )
      return null;
    const values = operands.map((o) => amount(o.quantity));
    if (values.some((v) => !v)) return null;
    const [left, constant, a, b, c] = values as ExpansionRational[];
    let factors: ExpansionAuthoredFactors;
    if (raw.template === 'common-factor') {
      if (!a.numerator || !b.numerator)
        return mechanismIssue(ctx, 'common factor and linear term are explicitly nonzero');
      const first = multiply(a, b),
        second = multiply(a, c);
      if (!first.ok || !second.ok || !equal(first.value, left) || !equal(second.value, constant))
        return mechanismIssue(ctx, 'exact bounded common-factor identity fails or overflows');
      factors = {
        template: 'common-factor',
        outerFactor: a,
        linear: { coefficient: b, constant: c },
      };
    } else {
      if (values.some((v) => v?.denominator !== 1) || a.numerator <= 0 || b.numerator <= 0)
        return mechanismIssue(
          ctx,
          'difference-of-squares requires complete positive integer bases',
        );
      const first = multiply(a, a),
        second = multiply(b, b),
        negative = subtract({ numerator: 0, denominator: 1 }, b);
      if (
        !first.ok ||
        !second.ok ||
        !negative.ok ||
        !equal(first.value, left) ||
        !equal(
          { numerator: -second.value.numerator, denominator: second.value.denominator },
          constant,
        )
      )
        return mechanismIssue(ctx, 'exact bounded integer-square identity fails or overflows');
      factors = {
        template: 'integer-difference-of-squares',
        left: { coefficient: a, constant: negative.value },
        right: { coefficient: a, constant: b },
      };
    }
    result = {
      state: 'derived',
      operation: 'factorization',
      sourceState: r.state,
      ...(qualifier ? { qualifier } : {}),
      ...(base.condition ? { condition: base.condition } : {}),
      identity: 'verified',
      operandIds: ids,
      operands: values as ExpansionRational[],
      basis: operands[0].quantity.basis,
      evidence,
      factors,
    };
  }
  return {
    ...base.story,
    storyId: '56',
    kind: 'equation',
    preset: 'factorization',
    template: raw.template as ExpansionFactorizationScene['template'],
    entities: base.entities,
    actorId: base.actor.id,
    scope: base.scope,
    period: base.period,
    symbol: raw.symbol,
    operands,
    request: { actorId: base.actor.id, operation: 'factorization', evidence: requestEvidence.span },
    result,
  };
}
