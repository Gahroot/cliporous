/** STEP15 source contracts. Region drawings assert nothing; only64 performs authored arithmetic. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import {
  EXPANSION_DIMENSIONAL_OPERATIONS,
  type ExpansionDimensionalResult,
  type ExpansionDimensionalScalingScene,
  type ExpansionRegionAssertion,
  type ExpansionRegionOverlapScene,
} from '../../remotion/compositions/explainer/expansion/geometry/regions-dimensions-types';
import type {
  ExpansionEntity,
  ExpansionStoryBase,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  isDerivationAllowed,
  multiply,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
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
  'template',
  'visualMode',
  'evidence',
  'label',
  'subject',
  'outcome',
  'condition',
  'actor',
  'scope',
  'period',
  'entities',
  'result',
  'startWord',
  'endWord',
  'layout',
  'continues',
  'transition',
  ...WORDS,
];
function lit(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}
function equal(a: string, b: string): boolean {
  return a.normalize('NFKC').toLowerCase().trim() === b.normalize('NFKC').toLowerCase().trim();
}
function reference(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = ctx.str(raw, EXPANSION_LIMITS.actorLabel);
  return (
    (label ? entities.find((e) => equal(e.label, label)) : undefined) ??
    mechanismIssue(ctx, 'exact declared source label required, not caller IDs')
  );
}
function envelope(raw: Rec, ctx: ParseContext, id: '63' | '64', extra: readonly string[]) {
  const entry = expansionEntry(raw.kind, raw.preset),
    w = ctx.win;
  if (!entry || entry.id !== id || !onlyFields(raw, [...COMMON, ...extra], ctx)) return null;
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
    return null;
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
      return mechanismIssue(ctx, 'finite positive nonoverlapping source intervals required (1e-7)');
    previous = word.end;
  }
  if (
    ctx.words[w.startWord].start < w.startTime + 0.25 - 1e-7 ||
    ctx.words[w.endWord].end > w.endTime - 0.35 + 1e-7
  )
    return mechanismIssue(ctx, 'retain .25 lead-in and .35 tail');
  const clauses: ExpansionSourceEvidence[] = [];
  let first = w.startWord;
  for (let i = first; i <= w.endWord; i++)
    if (/[.!?;][”"’')\]]*$/.test(ctx.words[i].text) || i === w.endWord) {
      const e = expansionSourceSpan({ fromWord: first, toWord: i }, ctx);
      if (!e) return null;
      clauses.push(e);
      first = i + 1;
    }
  if (
    clauses.length !== 5 ||
    WORDS.some((field, i) => ctx.inWin(raw[field]) !== clauses[i].span.fromWord)
  )
    return mechanismIssue(
      ctx,
      'five distinct complete source clauses in authored order are required',
    );
  const times = strictMechanismBeats(raw, ctx, WORDS, [1, 1, 1, 1], 0.8);
  if (!times || times.some((t, i) => i > 0 && t - times[i - 1] < 1) || w.endTime - times[4] < 0.8)
    return mechanismIssue(ctx, 'strict >=1s beat gaps and >=.8s final hold required');
  const [setup, action, response, check, resolve] = clauses;
  const label = expansionSourceLabel(raw.label, setup, ctx, 48),
    subject = expansionSourceLabel(raw.subject, setup, ctx, 34),
    outcome = expansionSourceLabel(raw.outcome, resolve, ctx, 54),
    scope = expansionSourceLabel(raw.scope, setup, ctx, 40),
    period = expansionSourceLabel(raw.period, setup, ctx, 32);
  const condition =
    raw.condition === undefined ? undefined : expansionSourceLabel(raw.condition, setup, ctx, 96);
  const entities = expansionEntities(raw.entities, ctx, id),
    actor = entities ? reference(raw.actor, entities, ctx) : null;
  if (
    !label ||
    !subject ||
    !outcome ||
    !scope ||
    !period ||
    !entities ||
    !actor ||
    !equal(subject, actor.label) ||
    condition === null ||
    (condition !== undefined &&
      !/^(?:if|unless|when|provided that|assuming)\s+/i.test(condition)) ||
    entities.some(
      (e) => e.evidence.fromWord !== setup.span.fromWord || e.evidence.toWord !== setup.span.toWord,
    )
  )
    return null;
  const [setupAt, actionAt, responseAt, checkAt, resolveAt] = times;
  const story: ExpansionStoryBase = {
    storyId: id,
    label,
    subject,
    outcome,
    evidence: raw.evidence,
    visualMode: raw.visualMode,
    ...(condition ? { condition } : {}),
    setupAt,
    actionAt,
    responseAt,
    checkAt,
    resolveAt,
  };
  return {
    story,
    entities,
    actor,
    scope,
    period,
    condition,
    setup,
    action,
    response,
    check,
    resolve,
  };
}
type Base = NonNullable<ReturnType<typeof envelope>>;
function assertion(
  e: ExpansionSourceEvidence,
  body: string,
  b: Base,
  labels: readonly string[] = [],
): boolean {
  return expansionAssertedRelation(
    e,
    new RegExp(
      `(?:${body}\\s+for\\s+${lit(b.scope)}\\s+during\\s+${lit(b.period)}|during\\s+${lit(b.period)}\\s+for\\s+${lit(b.scope)},\\s*${body})`,
      'iu',
    ),
    b.condition,
    [...labels, b.scope, b.period],
  );
}
function local(raw: unknown, e: ExpansionSourceEvidence, ctx: ParseContext): boolean {
  const span = expansionSourceSpan(raw, ctx);
  return !!span && span.span.fromWord === e.span.fromWord && span.span.toWord === e.span.toWord;
}
function status(
  raw: Rec,
  e: ExpansionSourceEvidence,
  b: Base,
  ctx: ParseContext,
  overlap = false,
): ExpansionRegionAssertion<string> | null {
  if (raw.state === 'unknown' || raw.state === 'missing' || raw.state === 'disputed')
    return raw.value === undefined && raw.condition === undefined && raw.qualifier === raw.state
      ? { state: raw.state, qualifier: raw.state }
      : null;
  // The semantic enum 'overlap' is grounded by the exact authored verb 'overlaps'.
  const quoted = expansionSourceLabel(
    overlap && raw.value === 'overlap' ? 'overlaps' : raw.value,
    e,
    ctx,
    40,
  );
  const value = quoted && overlap && raw.value === 'overlap' ? 'overlap' : quoted;
  if (!value || /[+-]?\d/.test(value)) return null;
  if (
    raw.state === 'known' &&
    raw.condition === undefined &&
    raw.qualifier === undefined &&
    b.condition === undefined
  )
    return { state: 'known', value };
  if (
    raw.state === 'conditional' &&
    raw.qualifier === undefined &&
    b.condition &&
    raw.condition === b.condition
  )
    return { state: 'conditional', value, condition: b.condition };
  const qualifier = expansionSourceLabel(raw.qualifier, e, ctx, 96);
  if (
    raw.condition === undefined &&
    b.condition === undefined &&
    b.story.evidence === 'illustrative' &&
    qualifier &&
    ((raw.state === 'simulated' && /^(?:simulated|simulation)$/i.test(qualifier)) ||
      (raw.state === 'illustrative' && /^(?:illustrative|teaching example)$/i.test(qualifier)))
  )
    return { state: raw.state, value, qualifier };
  return null;
}
function qualified(body: string, s: ExpansionRegionAssertion<string>): string {
  return s.state === 'simulated' || s.state === 'illustrative'
    ? `in\\s+this\\s+${lit(s.qualifier)},\\s*${body}`
    : body;
}
function region(raw: Rec, ctx: ParseContext): ExpansionRegionOverlapScene | null {
  const b = envelope(raw, ctx, '63', ['member', 'regions', 'membership', 'restriction', 'overlap']);
  if (
    !b ||
    raw.template !== 'two-authored-regions' ||
    !Array.isArray(raw.regions) ||
    raw.regions.length !== 2 ||
    b.entities.length !== 4
  )
    return null;
  const member = reference(raw.member, b.entities, ctx),
    left = reference(raw.regions[0], b.entities, ctx),
    right = reference(raw.regions[1], b.entities, ctx);
  if (!member || !left || !right || new Set([b.actor.id, member.id, left.id, right.id]).size !== 4)
    return null;
  if (
    !assertion(
      b.setup,
      `${lit(b.actor.label)}\\s+${lit(b.story.label)}\\s+(?:tracks|records)\\s+${lit(member.label)}\\s+and\\s+regions\\s+${lit(left.label)}\\s+and\\s+${lit(right.label)}`,
      b,
      [b.actor.label, b.story.label, member.label, left.label, right.label],
    )
  )
    return null;
  const m = raw.membership,
    r = raw.restriction,
    o = raw.overlap;
  if (
    !isRec(m) ||
    !isRec(r) ||
    !isRec(o) ||
    !onlyFields(
      m,
      ['actor', 'member', 'region', 'state', 'value', 'qualifier', 'condition', 'evidence'],
      ctx,
    ) ||
    !onlyFields(
      r,
      ['actor', 'region', 'state', 'value', 'qualifier', 'condition', 'evidence'],
      ctx,
    ) ||
    !onlyFields(
      o,
      ['actor', 'left', 'right', 'state', 'value', 'qualifier', 'condition', 'evidence'],
      ctx,
    ) ||
    m.actor !== b.actor.label ||
    r.actor !== b.actor.label ||
    o.actor !== b.actor.label ||
    m.member !== member.label ||
    o.left !== left.label ||
    o.right !== right.label ||
    !local(m.evidence, b.action, ctx) ||
    !local(r.evidence, b.response, ctx) ||
    !local(o.evidence, b.check, ctx)
  )
    return null;
  const mr = reference(m.region, [left, right], ctx),
    rr = reference(r.region, [left, right], ctx),
    ms = status(m, b.action, b, ctx),
    rs = status(r, b.response, b, ctx),
    os = status(o, b.check, b, ctx, true);
  if (
    !mr ||
    !rr ||
    !ms ||
    !rs ||
    !os ||
    ('value' in ms && ms.value !== 'inside' && ms.value !== 'outside') ||
    ('value' in os && os.value !== 'overlap' && os.value !== 'disjoint')
  )
    return null;
  const membershipBody =
    'value' in ms
      ? `${lit(b.actor.label)}\\s+(?:places|locates)\\s+${lit(member.label)}\\s+${ms.value}\\s+${lit(mr.label)}`
      : `${lit(b.actor.label)}\\s+membership\\s+for\\s+${lit(member.label)}\\s+in\\s+${lit(mr.label)}\\s+remains\\s+${ms.qualifier}`;
  const restrictionBody =
    'value' in rs
      ? `${lit(b.actor.label)}\\s+(?:restricts|limits)\\s+${lit(rr.label)}\\s+to\\s+${lit(rs.value)}`
      : `${lit(b.actor.label)}\\s+restriction\\s+for\\s+${lit(rr.label)}\\s+remains\\s+${rs.qualifier}`;
  const overlapBody =
    'value' in os
      ? `${lit(b.actor.label)}\\s+(?:states|reports)\\s+${lit(left.label)}\\s+${os.value === 'overlap' ? 'overlaps' : 'is\\s+disjoint\\s+from'}\\s+${lit(right.label)}`
      : `${lit(b.actor.label)}\\s+overlap\\s+for\\s+${lit(left.label)}\\s+and\\s+${lit(right.label)}\\s+remains\\s+${os.qualifier}`;
  if (
    !assertion(b.action, qualified(membershipBody, ms), b, [
      b.actor.label,
      member.label,
      mr.label,
    ]) ||
    !assertion(b.response, qualified(restrictionBody, rs), b, [
      b.actor.label,
      rr.label,
      ...('value' in rs ? [rs.value] : []),
    ]) ||
    !assertion(b.check, qualified(overlapBody, os), b, [b.actor.label, left.label, right.label])
  )
    return null;
  const result = raw.result;
  if (
    !isRec(result) ||
    !onlyFields(result, ['actor', 'claim', 'evidence'], ctx) ||
    result.actor !== b.actor.label ||
    result.claim !== 'region summary' ||
    !local(result.evidence, b.resolve, ctx) ||
    b.story.outcome !== 'retains supplied facts' ||
    !assertion(
      b.resolve,
      `${lit(b.actor.label)}\\s+region\\s+summary\\s+retains\\s+supplied\\s+facts`,
      b,
      [b.actor.label],
    )
  )
    return null;
  return {
    ...b.story,
    storyId: '63',
    kind: 'region-relation',
    preset: 'overlap',
    template: 'two-authored-regions',
    entities: b.entities,
    actorId: b.actor.id,
    memberId: member.id,
    regionIds: [left.id, right.id],
    scope: b.scope,
    period: b.period,
    membership: {
      id: 'expansion-63-membership',
      actorId: b.actor.id,
      memberId: member.id,
      regionId: mr.id,
      evidence: b.action.span,
      ...ms,
    } as ExpansionRegionOverlapScene['membership'],
    restriction: {
      id: 'expansion-63-restriction',
      actorId: b.actor.id,
      regionId: rr.id,
      evidence: b.response.span,
      ...rs,
    },
    overlap: {
      id: 'expansion-63-overlap',
      actorId: b.actor.id,
      leftId: left.id,
      rightId: right.id,
      evidence: b.check.span,
      ...os,
    } as ExpansionRegionOverlapScene['overlap'],
    result: {
      state: 'supplied',
      actorId: b.actor.id,
      claim: 'region summary',
      evidence: b.resolve.span,
    },
  };
}
function rational(q: ExpansionQuantity): ExpansionRational | null {
  return 'amount' in q && q.amount.kind === 'rational' ? q.amount.value : null;
}
function quantity(
  raw: unknown,
  e: ExpansionSourceEvidence,
  b: Base,
  ctx: ParseContext,
): ExpansionQuantity | null {
  const q = parseExpansionQuantity(raw, ctx);
  if (
    !q ||
    q.actor !== b.actor.label ||
    q.basis.population !== b.scope ||
    q.basis.period !== b.period ||
    !local(q.evidence, e, ctx) ||
    (q.state === 'conditional' && q.condition !== b.condition) ||
    (b.condition && q.state !== 'conditional') ||
    ((q.state === 'simulated' || q.state === 'illustrative') && b.story.evidence !== 'illustrative')
  )
    return null;
  const amounts = q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : [];
  if (amounts.some((a) => a.kind !== 'rational' || a.value.numerator < 0))
    return mechanismIssue(ctx, 'dimensional operands must be nonnegative bounded exact rationals');
  return q;
}
function dimensions(raw: Rec, ctx: ParseContext): ExpansionDimensionalScalingScene | null {
  const b = envelope(raw, ctx, '64', ['operation', 'scale', 'original', 'request']);
  const exponent =
    raw.template === 'line-length'
      ? 1
      : raw.template === 'square-area'
        ? 2
        : raw.template === 'cube-volume'
          ? 3
          : null;
  const noun = exponent === 1 ? 'length' : exponent === 2 ? 'area' : 'volume',
    shape = exponent === 1 ? 'line' : exponent === 2 ? 'square' : 'cube';
  if (
    !b ||
    !exponent ||
    raw.operation !== EXPANSION_DIMENSIONAL_OPERATIONS[0] ||
    !isDerivationAllowed('64', 'dimensional-scaling') ||
    b.entities.length !== 1 ||
    !assertion(
      b.setup,
      `${lit(b.actor.label)}\\s+${lit(b.story.label)}\\s+(?:scales|resizes)\\s+a\\s+${shape}\\s+${noun}`,
      b,
      [b.actor.label, b.story.label],
    )
  )
    return null;
  const scale = quantity(raw.scale, b.action, b, ctx),
    original = quantity(raw.original, b.response, b, ctx);
  if (
    !scale ||
    !original ||
    scale.claim !== 'scale factor' ||
    original.claim !== `original ${noun}` ||
    scale.basis.unit !== 'ratio' ||
    scale.basis.denominator?.numerator !== 1 ||
    scale.basis.denominator.denominator !== 1 ||
    original.basis.denominator !== undefined ||
    !(
      exponent === 1
        ? ['metre', 'centimetre', 'millimetre']
        : exponent === 2
          ? ['square-metre']
          : ['cubic-metre']
    ).includes(original.basis.unit)
  )
    return mechanismIssue(
      ctx,
      'scale ratio and original length/area/volume must have exact compatible source units and reference basis',
    );
  const request = raw.request,
    r = raw.result;
  if (
    !isRec(request) ||
    !onlyFields(request, ['actor', 'operation', 'evidence'], ctx) ||
    request.actor !== b.actor.label ||
    request.operation !== 'dimensional-scaling' ||
    !local(request.evidence, b.check, ctx) ||
    !assertion(
      b.check,
      `${lit(b.actor.label)}\\s+(?:requests|asks\\s+for)\\s+a\\s+worked\\s+${shape}\\s+scaling\\s+using\\s+scale\\s+factor\\s+and\\s+original\\s+${noun}`,
      b,
      [b.actor.label],
    )
  )
    return mechanismIssue(
      ctx,
      'complete explicit worked-calculation request required; drawings authorize no result',
    );
  if (
    !isRec(r) ||
    !onlyFields(r, ['actor', 'state', 'qualifier', 'condition', 'evidence'], ctx) ||
    r.actor !== b.actor.label ||
    !local(r.evidence, b.resolve, ctx)
  )
    return null;
  const ids: readonly [string, string] = ['expansion-64-scale', 'expansion-64-original'],
    evidence = [scale.evidence, original.evidence, b.check.span, b.resolve.span];
  let result: ExpansionDimensionalResult;
  const missing = [scale, original].filter(
    (q) => q.state === 'unknown' || q.state === 'missing' || q.state === 'disputed',
  );
  if (missing.length) {
    if (
      (r.state !== 'unknown' && r.state !== 'missing' && r.state !== 'disputed') ||
      !missing.some((q) => q.state === r.state) ||
      r.qualifier !== r.state ||
      r.condition !== undefined ||
      b.story.outcome !== `remains ${r.state}` ||
      !assertion(b.resolve, `${lit(b.actor.label)}\\s+scaling\\s+remains\\s+${r.state}`, b, [
        b.actor.label,
      ])
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
    const teaching = [scale, original].filter(
      (q) => q.state === 'simulated' || q.state === 'illustrative',
    );
    if (
      (teaching.length &&
        !teaching.every(
          (q) => q.state === r.state && 'qualifier' in q && q.qualifier === r.qualifier,
        )) ||
      (!teaching.length &&
        (r.state !== (b.condition ? 'conditional' : 'known') || r.qualifier !== undefined)) ||
      (r.state === 'conditional' ? r.condition !== b.condition : r.condition !== undefined)
    )
      return mechanismIssue(
        ctx,
        'derived scaling must retain local conditions and teaching qualifiers, never promote simulation',
      );
    const qualifier = teaching.length
      ? expansionSourceLabel(r.qualifier, b.resolve, ctx, 96)
      : undefined;
    if (
      qualifier === null ||
      (teaching.length && !qualifier) ||
      b.story.outcome !== 'worked scaling' ||
      !assertion(
        b.resolve,
        `${qualifier ? `in\\s+this\\s+${lit(qualifier)},\\s*` : ''}${lit(b.actor.label)}\\s+reports\\s+worked\\s+scaling`,
        b,
        [b.actor.label],
      )
    )
      return null;
    const s = rational(scale),
      v = rational(original);
    if (!s || !v) return null;
    let value = v;
    for (let i = 0; i < exponent; i++) {
      const product = multiply(value, s);
      if (!product.ok)
        return mechanismIssue(
          ctx,
          'exact dimensional scaling overflows bounded rational arithmetic',
        );
      value = product.value;
    }
    result = {
      state: 'derived',
      operation: 'dimensional-scaling',
      sourceState: r.state,
      ...(qualifier ? { qualifier } : {}),
      ...(b.condition ? { condition: b.condition } : {}),
      exponent,
      operandIds: ids,
      operands: [s, v],
      result: value,
      basis: original.basis,
      evidence,
    };
  }
  return {
    ...b.story,
    storyId: '64',
    kind: 'geometry-projection',
    preset: 'dimensional-scaling',
    template: raw.template as ExpansionDimensionalScalingScene['template'],
    entities: b.entities,
    actorId: b.actor.id,
    scope: b.scope,
    period: b.period,
    scale: { id: ids[0], quantity: scale },
    original: { id: ids[1], quantity: original },
    request: { actorId: b.actor.id, operation: 'dimensional-scaling', evidence: b.check.span },
    result,
  };
}
export function parseExpansionRegionOverlap(
  raw: Rec,
  ctx: ParseContext,
): ExpansionRegionOverlapScene | null {
  return (
    region(raw, ctx) ??
    mechanismIssue(
      ctx,
      'region overlap rejected: retain exact authored regions and local membership/restriction/overlap facts, never inferred rights or geography',
    )
  );
}
export function parseExpansionDimensionalScaling(
  raw: Rec,
  ctx: ParseContext,
): ExpansionDimensionalScalingScene | null {
  return (
    dimensions(raw, ctx) ??
    mechanismIssue(
      ctx,
      'dimensional scaling rejected: preserve source units/basis/operands and explicit authored worked relationship',
    )
  );
}
