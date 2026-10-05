import type {
  ExpansionCalendarRecord,
  ExpansionCalendarRelation,
  ExpansionCalendarSeasonalityScene,
  ExpansionRankChangeScene,
  ExpansionRankRecord,
  ExpansionRankState,
} from '../../remotion/compositions/explainer/expansion/quantities/ranking-calendar-types';
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

interface Evidence {
  span: ExpansionEvidenceSpan;
  text: string;
}
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
function norm(text: string): string {
  return text.normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}
function literal(text: string): string {
  return norm(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function names(labels: readonly string[]): string {
  if (labels.length === 1) return literal(labels[0]);
  if (labels.length === 2) return `${literal(labels[0])} and ${literal(labels[1])}`;
  return `${labels.slice(0, -1).map(literal).join(', ')},? and ${literal(labels[labels.length - 1])}`;
}
function matches(e: Evidence, body: string, condition?: string): boolean {
  const full = condition
    ? `(?:${literal(condition)}, ${body}|${body},? ${literal(condition)})`
    : body;
  return new RegExp(`^(?:${full})[.;]?$`, 'iu').test(norm(e.text));
}
function local(
  raw: unknown,
  ctx: ParseContext,
  fields: readonly string[],
): { raw: Rec; evidence: Evidence; condition?: string } | null {
  if (!isRec(raw) || !onlyFields(raw, fields, ctx))
    return mechanismIssue(ctx, 'only the authored local fields are accepted');
  const evidence = expansionSourceSpan(raw.evidence, ctx);
  if (!evidence) return null;
  const condition =
    raw.condition === undefined
      ? undefined
      : expansionSourceLabel(raw.condition, evidence, ctx, L.qualifier);
  if (condition === null) return null;
  return { raw, evidence, ...(condition ? { condition } : {}) };
}
function entity(
  raw: unknown,
  e: Evidence,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = expansionSourceLabel(raw, e, ctx, L.actorLabel);
  return label
    ? (entities.find((item) => norm(item.label) === norm(label)) ??
        mechanismIssue(ctx, 'actor must reference a source-bound entity label, not an input ID'))
    : null;
}
function envelope(
  raw: Rec,
  ctx: ParseContext,
  storyId: '21' | '22',
  fields: readonly string[],
): Omit<ExpansionStoryBase, 'treatment'> | null {
  if (
    (raw.continues !== undefined && typeof raw.continues !== 'boolean') ||
    (raw.transition !== undefined &&
      raw.transition !== 'slide' &&
      raw.transition !== 'fade' &&
      raw.transition !== 'grow')
  )
    return mechanismIssue(ctx, 'invalid continuation/transition envelope');
  const parsed = expansionStoryBase(raw, ctx, storyId, fields);
  if (!parsed) return null;
  let previousEnd = -1;
  for (const field of BEATS) {
    const index = ctx.inWin(raw[field]);
    if (
      index === null ||
      index <= previousEnd ||
      (index > 0 && !/[.!?;]["'”’\])]*$/.test(ctx.words[index - 1]?.text ?? ''))
    )
      return mechanismIssue(ctx, 'five ordered beats must start separate complete source clauses');
    let end = index;
    while (end < ctx.win.endWord && !/[.!?;]["'”’\])]*$/.test(ctx.words[end]?.text ?? '')) end++;
    if (!expansionSourceSpan({ fromWord: index, toWord: end }, ctx)) return null;
    previousEnd = end;
  }
  return parsed.story;
}
/** Validation only. Original periods are retained verbatim in each quantity/state. */
function comparableAcrossPeriods(left: ExpansionQuantity, right: ExpansionQuantity): boolean {
  return compatibleBasis({ ...left.basis, period: right.basis.period }, right.basis);
}
function bounded(raw: unknown, min: number, max: number): raw is unknown[] {
  return Array.isArray(raw) && raw.length >= min && raw.length <= max;
}

/** 21 raw: entities, criterion, two {period,records} states, explicit comparison and scoped result. */
export function parseExpansionRankChange(
  raw: Rec,
  ctx: ParseContext,
): ExpansionRankChangeScene | null {
  if (!isRec(raw) || raw.kind !== 'ranking' || raw.preset !== 'rank-change')
    return mechanismIssue(ctx, 'expected story 21 ranking/rank-change');
  const story = envelope(raw, ctx, '21', [
    'entities',
    'criterion',
    'states',
    'comparison',
    'result',
  ]);
  if (!story) return null;
  const entities = expansionEntities(raw.entities, ctx, '21');
  const setupEnd = ctx.inWin(raw.actionWord);
  const setup =
    setupEnd === null
      ? null
      : expansionSourceSpan({ fromWord: Number(raw.setupWord), toWord: setupEnd - 1 }, ctx);
  const criterion = setup ? expansionSourceLabel(raw.criterion, setup, ctx, 48) : null;
  if (!entities || !criterion || !bounded(raw.states, 2, 2) || entities.length * 2 > L.records)
    return mechanismIssue(
      ctx,
      'ranking needs source-stated criterion, two complete states, 1–8 options and at most 12 total records',
    );
  const states: ExpansionRankState[] = [];
  for (const [stateIndex, value] of raw.states.entries()) {
    if (
      !isRec(value) ||
      !onlyFields(value, ['period', 'records'], ctx) ||
      !bounded(value.records, entities.length, entities.length)
    )
      return mechanismIssue(
        ctx,
        'each rank state must retain exactly the same complete option identities',
      );
    const parsed: ExpansionRankRecord[] = [],
      seen = new Set<string>();
    let period: string | null = null;
    for (const entry of value.records) {
      if (
        !isRec(entry) ||
        !onlyFields(entry, ['actor', 'quantity', 'rank', 'unrankedEvidence'], ctx)
      )
        return mechanismIssue(
          ctx,
          'rank record accepts only its actor, source quantity and supplied placement',
        );
      const quantity = parseExpansionQuantity(entry.quantity, ctx);
      if (!quantity)
        return mechanismIssue(
          ctx,
          'rank quantity must preserve its full local state, value, criterion and basis',
        );
      const e = expansionSourceSpan(quantity.evidence, ctx);
      if (!e) return null;
      const actor = entity(entry.actor, e, entities, ctx);
      const ownPeriod = expansionSourceLabel(value.period, e, ctx, L.period);
      if (
        !actor ||
        !ownPeriod ||
        norm(quantity.actor) !== norm(actor.label) ||
        norm(quantity.claim) !== norm(`${criterion} rank`) ||
        quantity.basis.unit !== 'count' ||
        norm(quantity.basis.period) !== norm(ownPeriod) ||
        seen.has(actor.id)
      )
        return mechanismIssue(
          ctx,
          'each placement must bind its exact option, criterion rank, count unit and state period locally',
        );
      if (period !== null && norm(period) !== norm(ownPeriod))
        return mechanismIssue(ctx, 'state records cannot mix periods');
      period = ownPeriod;
      seen.add(actor.id);
      const first = parsed[0]?.quantity;
      if (first && !compatibleBasis(first.basis, quantity.basis))
        return mechanismIssue(
          ctx,
          'rank options require the same metric/population/denominator within each state',
        );
      let rank: number | undefined;
      if ('amount' in quantity) {
        if (
          typeof entry.rank !== 'number' ||
          !Number.isSafeInteger(entry.rank) ||
          entry.rank < 1 ||
          entry.rank > L.rationalComponent ||
          quantity.amount.kind !== 'rational'
        )
          return mechanismIssue(
            ctx,
            'supplied numerical ranks must be positive bounded integers, never inferred from scores',
          );
        const same = compare(quantity.amount.value, { numerator: entry.rank, denominator: 1 });
        if (!same.ok || same.value !== 0)
          return mechanismIssue(
            ctx,
            'placement must exactly equal its source-stated rank with no rounding',
          );
        rank = entry.rank;
      } else if (entry.rank !== undefined)
        return mechanismIssue(
          ctx,
          'missing/unknown/disputed ranks cannot become a chosen numeric placement or zero',
        );
      let unrankedEvidence: ExpansionEvidenceSpan | undefined;
      if (entry.unrankedEvidence !== undefined) {
        const unranked = expansionSourceSpan(entry.unrankedEvidence, ctx);
        if (
          !unranked ||
          (quantity.state !== 'missing' && quantity.state !== 'unknown') ||
          !matches(
            unranked,
            `${literal(actor.label)} is unranked for ${literal(criterion)} (?:during|in) ${literal(ownPeriod)} among ${literal(quantity.basis.population)}`,
          )
        )
          return mechanismIssue(
            ctx,
            'unranked placement requires its own explicit actor/criterion/period/population assertion',
          );
        unrankedEvidence = unranked.span;
      }
      const actorIndex = entities.findIndex((item) => item.id === actor.id);
      parsed.push({
        id: expansionEntityId('21', L.actors + stateIndex * entities.length + actorIndex),
        actorId: actor.id,
        quantity,
        ...(rank === undefined ? {} : { rank }),
        ...(unrankedEvidence ? { unrankedEvidence } : {}),
      });
    }
    if (!period || seen.size !== entities.length)
      return mechanismIssue(ctx, 'both ordered states must preserve every source-named option');
    states.push({
      id: expansionEntityId('21', L.actors + L.records + stateIndex),
      label: period,
      period,
      records: parsed,
    });
  }
  const [before, after] = states;
  if (norm(before.period) === norm(after.period))
    return mechanismIssue(ctx, 'rank change needs two explicitly different source periods');
  for (const record of before.records) {
    const paired = after.records.find((item) => item.actorId === record.actorId);
    if (!paired || !comparableAcrossPeriods(record.quantity, paired.quantity))
      return mechanismIssue(
        ctx,
        'same identities need comparable unit/population/denominator across the explicitly named periods',
      );
  }
  const comparison = local(raw.comparison, ctx, [
    'fromPeriod',
    'toPeriod',
    'evidence',
    'condition',
  ]);
  const result = local(raw.result, ctx, ['status', 'evidence', 'condition']);
  if (
    !comparison ||
    !result ||
    comparison.raw.fromPeriod !== before.period ||
    comparison.raw.toPeriod !== after.period ||
    comparison.evidence.span.fromWord !== ctx.inWin(raw.checkWord) ||
    result.evidence.span.fromWord !== ctx.inWin(raw.resolveWord) ||
    result.raw.status !== 'scoped'
  )
    return mechanismIssue(
      ctx,
      'explicit state relationship and scoped result must bind their own check/resolve evidence',
    );
  const actors = names(entities.map((item) => item.label)),
    c = literal(criterion),
    f = literal(before.period),
    t = literal(after.period);
  const basis = before.records[0].quantity.basis.denominator
    ? 'unit, population and denominator'
    : 'unit and population';
  if (
    !matches(
      comparison.evidence,
      `(?:the ${c} ranks for ${actors} are comparable from ${f} to ${t} on the same ${basis}|from ${f} to ${t}, ${actors} have comparable ${c} ranks with the same ${basis})`,
      comparison.condition,
    ) ||
    !matches(
      result.evidence,
      `(?:${c} ranks for ${actors} (?:remain|stay) scoped to the supplied ${f} and ${t} states|the supplied ${f} and ${t} states retain ${c} ranks for ${actors}|${c} ranks for ${actors} (?:remain|stay) scoped to supplied states|the supplied states retain ${c} ranks for ${actors})`,
      result.condition,
    )
  )
    return mechanismIssue(
      ctx,
      'ranking comparison must explicitly retain all identities, criterion, basis and named periods; no inferred winner',
    );
  return {
    ...story,
    storyId: '21',
    kind: 'ranking',
    preset: 'rank-change',
    entities,
    criterion,
    states: [before, after],
    comparison: {
      fromStateId: before.id,
      toStateId: after.id,
      evidence: comparison.evidence.span,
      ...(comparison.condition ? { condition: comparison.condition } : {}),
    },
    result: {
      status: 'scoped',
      evidence: result.evidence.span,
      ...(result.condition ? { condition: result.condition } : {}),
    },
  };
}

/** 22 is a bounded authored month/year calendar, not a forecast or a cycle extrapolator. */
export function parseExpansionCalendarSeasonality(
  raw: Rec,
  ctx: ParseContext,
): ExpansionCalendarSeasonalityScene | null {
  if (!isRec(raw) || raw.kind !== 'temporal-pattern' || raw.preset !== 'calendar-seasonality')
    return mechanismIssue(ctx, 'expected story 22 temporal-pattern/calendar-seasonality');
  const story = envelope(raw, ctx, '22', ['entities', 'records', 'relations', 'result']);
  if (!story) return null;
  const entities = expansionEntities(raw.entities, ctx, '22');
  if (
    !entities ||
    !bounded(raw.records, 2, L.records) ||
    !bounded(raw.relations, 1, L.relations) ||
    raw.relations.length !== raw.records.length - 1
  )
    return mechanismIssue(
      ctx,
      'calendar needs 1–8 entities, 2–12 supplied records and an explicit relation for every adjacent pair (at most 16)',
    );
  const namedEntities = entities;
  const records: ExpansionCalendarRecord[] = [],
    identities = new Set<string>();
  for (const [index, value] of raw.records.entries()) {
    if (
      !isRec(value) ||
      !onlyFields(value, ['actor', 'label', 'calendar', 'quantity'], ctx) ||
      !isRec(value.calendar) ||
      !onlyFields(value.calendar, ['year', 'month'], ctx)
    )
      return mechanismIssue(
        ctx,
        'calendar record accepts actor, label, supplied year/month and source quantity only',
      );
    const year = value.calendar.year,
      month = value.calendar.month;
    if (
      typeof year !== 'number' ||
      !Number.isSafeInteger(year) ||
      year < 1 ||
      year > 9999 ||
      typeof month !== 'number' ||
      !Number.isSafeInteger(month) ||
      month < 1 ||
      month > 12
    )
      return mechanismIssue(ctx, 'calendar year/month must be finite bounded data integers');
    const quantity = parseExpansionQuantity(value.quantity, ctx);
    if (!quantity)
      return mechanismIssue(
        ctx,
        'calendar quantity must preserve local value/precision/unit/period/population/denominator and all qualifications',
      );
    const e = expansionSourceSpan(quantity.evidence, ctx);
    if (!e) return null;
    const actor = entity(value.actor, e, entities, ctx),
      label = expansionSourceLabel(value.label, e, ctx, 48);
    const period = norm(quantity.basis.period);
    if (
      !actor ||
      !label ||
      norm(quantity.actor) !== norm(actor.label) ||
      norm(quantity.claim) !== norm(label) ||
      (period !== norm(`${MONTHS[month - 1]} ${year}`) &&
        period !== `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`)
    )
      return mechanismIssue(
        ctx,
        'calendar data must quote its own actor/event and actual source period; never assign an invented year or month',
      );
    const identity = JSON.stringify([actor.id, norm(label), period]);
    if (identities.has(identity))
      return mechanismIssue(
        ctx,
        'duplicate calendar identities are not new events or repeated seasons',
      );
    identities.add(identity);
    records.push({
      id: expansionEntityId('22', L.actors + index),
      actorId: actor.id,
      label,
      calendar: { year, month },
      quantity,
    });
  }
  function identifier(record: ExpansionCalendarRecord): string {
    const actor = namedEntities.find((item) => item.id === record.actorId);
    return `${actor?.label ?? ''} ${record.label} in ${record.quantity.basis.period}`;
  }
  const relations: ExpansionCalendarRelation[] = [];
  for (const [index, value] of raw.relations.entries()) {
    const item = local(value, ctx, ['fromRecord', 'toRecord', 'role', 'evidence', 'condition']);
    if (!item || item.raw.fromRecord !== index || item.raw.toRecord !== index + 1)
      return mechanismIssue(
        ctx,
        'calendar relations must retain original supplied adjacent identities, not model IDs or reordered data',
      );
    const from = records[index],
      to = records[index + 1];
    const left = from.calendar.year * 12 + from.calendar.month,
      right = to.calendar.year * 12 + to.calendar.month;
    const role = left < right ? 'before' : left === right ? 'same-period' : null;
    const f = literal(identifier(from)),
      t = literal(identifier(to));
    const body =
      role === 'before'
        ? `(?:${f} precedes ${t} in calendar order|in calendar order, ${f} comes before ${t})`
        : `(?:${f} shares a calendar period with ${t}|${f} and ${t} belong to the same calendar period)`;
    if (!role || item.raw.role !== role || !matches(item.evidence, body, item.condition))
      return mechanismIssue(
        ctx,
        'explicit calendar relationship must bind exact actor/event/period endpoints and preserve real calendar order',
      );
    relations.push({
      fromId: from.id,
      toId: to.id,
      role,
      evidence: item.evidence.span,
      ...(item.condition ? { condition: item.condition } : {}),
    });
  }
  const result = local(raw.result, ctx, ['status', 'evidence', 'condition']);
  const all = names(records.map(identifier));
  if (
    !result ||
    result.raw.status !== 'scoped' ||
    result.evidence.span.fromWord !== ctx.inWin(raw.resolveWord) ||
    !matches(
      result.evidence,
      `(?:${all} (?:remain|stay) limited to supplied calendar data|the supplied calendar data stays limited to ${all})`,
      result.condition,
    )
  )
    return mechanismIssue(
      ctx,
      'calendar resolve must retain all supplied event/period identities, without invented recurrence, extrapolation or results',
    );
  return {
    ...story,
    storyId: '22',
    kind: 'temporal-pattern',
    preset: 'calendar-seasonality',
    entities,
    records,
    relations,
    result: {
      status: 'scoped',
      evidence: result.evidence.span,
      ...(result.condition ? { condition: result.condition } : {}),
    },
  };
}
