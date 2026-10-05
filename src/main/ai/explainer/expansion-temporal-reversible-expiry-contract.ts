/** Closed, source-only contracts for reversible states and expiry. Never execute a policy. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionEntity,
  ExpansionStoryBase,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import type {
  ExpansionExpiryScene,
  ExpansionReversibleScene,
  ExpiryAuthorization,
  ExpiryResult,
  ExpiryTimingRecord,
  ReversibleExpiryBeatEvidence,
  ReversibleExpiryFact,
  ReversibleExpiryPermission,
  ReversibleResult,
  ReversibleStateRecord,
  ReversibleTransition,
} from '../../remotion/compositions/explainer/expansion/temporal/reversible-expiry-types';
import {
  compare,
  compatibleBasis,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  type ExpansionEvidenceSpan,
  type ExpansionQuantity,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  type ExpansionSourceEvidence,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const BEATS = PHASES.map((phase) => `${phase}Word`);
const CONTEXT_FIELDS = ['actor', 'resource', 'scope', 'period'] as const;
const PERMISSION_FIELDS = ['state', 'status', 'condition', 'evidence'] as const;
function normalized(text: string): string {
  return text.normalize('NFKC').replace(/’/g, "'").replace(/−/g, '-').replace(/\s+/g, ' ').trim();
}
function literal(text: string): string {
  return normalized(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function safe(text: string): boolean {
  return (
    !/[<>`{}[\]\\()]|=>|\w+:\/\/|www\.|javascript:|data:|\b(?:function|eval)\b|\b\S+\.(?:html|svg|png|js|tsx)\b|(?:^|\s)\//i.test(
      text,
    ) && ![...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function phrase(raw: unknown, source: ExpansionSourceEvidence, ctx: ParseContext, max: number) {
  const text = expansionSourceLabel(raw, source, ctx, max);
  return text && safe(text)
    ? text
    : mechanismIssue(
        ctx,
        'bounded plain local source labels required; no executable or asset text',
      );
}
function sameSpan(a: ExpansionEvidenceSpan, b: ExpansionEvidenceSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function clause(source: ExpansionSourceEvidence, body: string, condition?: string): boolean {
  const text = normalized(source.text).replace(/[.;]$/, '');
  const markers = [...text.matchAll(/\b(?:if|unless|when|provided that|assuming)\b/gi)];
  if (!safe(text) || markers.length !== (condition === undefined ? 0 : 1)) return false;
  const pattern = condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
  return new RegExp(`^(?:${pattern})$`, 'iu').test(text);
}
function scoped(body: string, scope: string, period: string): string {
  const suffix = `(?:for|within)\\s+${literal(scope)}\\s+(?:during|in)\\s+${literal(period)}`;
  return `(?:${body}\\s+${suffix}|${suffix},\\s*${body})`;
}
function names(entities: readonly ExpansionEntity[]): string {
  const labels = entities.map((e) => literal(e.label));
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return labels.join('\\s+and\\s+');
  return `${labels.slice(0, -1).join(',\\s*')},?\\s+and\\s+${labels.at(-1)}`;
}
function ref(raw: unknown, entities: readonly ExpansionEntity[], ctx: ParseContext) {
  return (
    (typeof raw === 'string' ? entities.find((e) => e.label === raw) : undefined) ??
    mechanismIssue(ctx, 'references must use exact declared labels, never arbitrary IDs or aliases')
  );
}
function rows(raw: unknown, max: number, ctx: ParseContext): Rec[] | null {
  return Array.isArray(raw) && raw.length >= 1 && raw.length <= max && raw.every(isRec)
    ? raw
    : mechanismIssue(ctx, `one to ${max} complete local records/relations required`);
}
interface Envelope {
  story: ExpansionStoryBase;
  entities: ExpansionEntity[];
  actor: ExpansionEntity;
  resource: ExpansionEntity;
  members: ExpansionEntity[];
  scope: string;
  period: string;
  beats: ExpansionSourceEvidence[];
  clauses: ExpansionSourceEvidence[];
  sourceSpans: ReversibleExpiryBeatEvidence;
}
function envelope(raw: Rec, ctx: ParseContext, id: '43' | '44'): Envelope | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'temporal proposal must be an object');
  const entry = expansionEntry(raw.kind, raw.preset);
  if (
    entry?.id !== id ||
    raw.template !== (id === '43' ? 'state-rail' : 'expiry-window') ||
    (raw.route !== undefined && raw.route !== 'source-only') ||
    !onlyFields(
      raw,
      [
        'kind',
        'preset',
        'visualMode',
        'template',
        'route',
        'label',
        'subject',
        'outcome',
        'evidence',
        'startWord',
        'endWord',
        'layout',
        'entities',
        ...CONTEXT_FIELDS,
        ...BEATS,
        'records',
        'relations',
        'result',
        ...(id === '43' ? ['states'] : ['events', 'timingBasis']),
      ],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'exact authored kind/preset/template and source-only fields required',
    );
  const { win, words } = ctx;
  const duration = win.endTime - win.startTime;
  if (
    !Number.isSafeInteger(win.startWord) ||
    !Number.isSafeInteger(win.endWord) ||
    win.startWord < 0 ||
    win.endWord < win.startWord ||
    win.endWord >= words.length ||
    !Number.isFinite(win.startTime) ||
    !Number.isFinite(win.endTime) ||
    duration < 5 ||
    duration > 12 ||
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid') ||
    raw.evidence !== 'source-stated' ||
    (raw.startWord !== undefined && raw.startWord !== win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((layout) => layout === raw.layout))
  )
    return mechanismIssue(
      ctx,
      'finite complete 5–12s source-stated window and exact offered mode/layout required',
    );
  for (let i = win.startWord; i <= win.endWord; i++) {
    const w = words[i],
      previous = i > win.startWord ? words[i - 1] : undefined;
    if (
      !w ||
      typeof w.text !== 'string' ||
      !w.text.trim() ||
      !safe(w.text) ||
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.end <= w.start ||
      w.start < win.startTime ||
      w.end > win.endTime ||
      (previous && w.start < previous.end - 1e-7)
    )
      return mechanismIssue(
        ctx,
        'word intervals must be finite, positive, nonoverlapping within 1e-7 and in-window',
      );
  }
  const clauses: ExpansionSourceEvidence[] = [];
  for (let fromWord = win.startWord; fromWord <= win.endWord; ) {
    let toWord = fromWord;
    while (toWord < win.endWord && !/[.!?;][”"’')\]]*$/.test(words[toWord].text)) toWord++;
    if (!/[.!?;][”"’')\]]*$/.test(words[toWord].text))
      return mechanismIssue(
        ctx,
        'source must end in a complete clause, not a window-truncated assertion',
      );
    const source = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!source) return null;
    clauses.push(source);
    if (clauses.length > 32)
      return mechanismIssue(ctx, 'source clauses exceed the bounded local facts');
    fromWord = toWord + 1;
  }
  const beats: ExpansionSourceEvidence[] = [];
  for (const field of BEATS) {
    const index = ctx.inWin(raw[field]);
    const source = clauses.find((c) => c.span.fromWord === index);
    if (!source)
      return mechanismIssue(ctx, 'five distinct beats must begin five complete source clauses');
    beats.push(source);
  }
  if (beats[0].span.fromWord !== win.startWord || beats[4].span.toWord !== win.endWord)
    return mechanismIssue(ctx, 'setup and resolve must retain the complete source window');
  const times = strictMechanismBeats(raw, ctx, BEATS, [1, 1, 1, 1], 0.8);
  if (!times) return null;
  // The shared helper tolerates rounding; this pack's approved minimums are strict.
  if (times.some((time, i) => i > 0 && time - times[i - 1] < 1) || duration - times[4] < 0.8)
    return mechanismIssue(ctx, 'five source beats require full 1s gaps and a full 0.8s final hold');
  const label = phrase(raw.label, beats[0], ctx, 48),
    subject = phrase(raw.subject, beats[0], ctx, 34),
    outcome = phrase(raw.outcome, beats[4], ctx, 54),
    scope = phrase(raw.scope, beats[0], ctx, EXPANSION_LIMITS.population),
    period = phrase(raw.period, beats[0], ctx, EXPANSION_LIMITS.period),
    entities = expansionEntities(raw.entities, ctx, id);
  if (
    !label ||
    !subject ||
    !outcome ||
    !scope ||
    !period ||
    !entities ||
    entities.some((e) => !safe(e.label) || !sameSpan(e.evidence, beats[0].span))
  )
    return mechanismIssue(
      ctx,
      'introduce every bounded identity, scope and period in the full setup clause',
    );
  const actor = ref(raw.actor, entities, ctx),
    resource = ref(raw.resource, entities, ctx);
  const memberLabels = raw[id === '43' ? 'states' : 'events'];
  if (
    !actor ||
    !resource ||
    !Array.isArray(memberLabels) ||
    memberLabels.length < (id === '43' ? 2 : 1) ||
    memberLabels.length > 6
  )
    return mechanismIssue(
      ctx,
      'separate actor/resource and explicitly supplied state/event identities required',
    );
  const members: ExpansionEntity[] = [];
  for (const value of memberLabels) {
    const member = ref(value, entities, ctx);
    if (!member) return null;
    members.push(member);
  }
  if (
    subject !== resource.label ||
    new Set([actor.id, resource.id, ...members.map((m) => m.id)]).size !== entities.length ||
    entities.length !== members.length + 2
  )
    return mechanismIssue(
      ctx,
      'actor, resource and every state/event must be distinct and completely declared',
    );
  return {
    story: {
      storyId: id,
      visualMode: raw.visualMode,
      evidence: 'source-stated',
      label,
      subject,
      outcome,
      setupAt: times[0],
      actionAt: times[1],
      responseAt: times[2],
      checkAt: times[3],
      resolveAt: times[4],
    },
    entities,
    actor,
    resource,
    members,
    scope,
    period,
    beats,
    clauses,
    sourceSpans: {
      setup: beats[0].span,
      action: beats[1].span,
      response: beats[2].span,
      check: beats[3].span,
      resolve: beats[4].span,
    },
  };
}
function context(raw: Rec, b: Envelope, ctx: ParseContext): boolean {
  if (
    raw.actor !== b.actor.label ||
    raw.resource !== b.resource.label ||
    raw.scope !== b.scope ||
    raw.period !== b.period
  ) {
    mechanismIssue(ctx, 'retain the exact local actor, resource, scope and period on each fact');
    return false;
  }
  return true;
}
function fact(id: string, b: Envelope, evidence: ExpansionEvidenceSpan): ReversibleExpiryFact {
  return {
    id,
    actorId: b.actor.id,
    resourceId: b.resource.id,
    scope: b.scope,
    period: b.period,
    evidence,
  };
}
function condition(
  raw: unknown,
  source: ExpansionSourceEvidence,
  ctx: ParseContext,
): string | null {
  const value = phrase(raw, source, ctx, EXPANSION_LIMITS.qualifier);
  return value && /^(?:if|unless|when|provided that|assuming)\s+\S/i.test(value)
    ? value
    : mechanismIssue(
        ctx,
        'retain the actual complete local condition, not an unconditional authorization',
      );
}
function permission(
  raw: Rec,
  source: ExpansionSourceEvidence,
  ctx: ParseContext,
): ReversibleExpiryPermission | null {
  if (raw.state === 'allowed' || raw.state === 'denied' || raw.state === 'unknown') {
    if ('status' in raw || 'condition' in raw)
      return mechanismIssue(ctx, 'unconditional/unknown status has no fabricated qualifier');
    return { state: raw.state };
  }
  if (raw.state === 'conditional' && (raw.status === 'allowed' || raw.status === 'denied')) {
    const value = condition(raw.condition, source, ctx);
    return value ? { state: 'conditional', status: raw.status, condition: value } : null;
  }
  return mechanismIssue(
    ctx,
    'preserve explicit allowed/denied/unknown/conditional status and conditional result',
  );
}
function statusOf(value: ReversibleExpiryPermission): string {
  return value.state === 'conditional' ? value.status : value.state;
}
function conditionOf(value: ReversibleExpiryPermission): string | undefined {
  return value.state === 'conditional' ? value.condition : undefined;
}
function finalResult(
  raw: unknown,
  b: Envelope,
  ctx: ParseContext,
  event?: ExpansionEntity,
): ReversibleResult | ExpiryResult | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, [...CONTEXT_FIELDS, ...PERMISSION_FIELDS, ...(event ? ['event'] : [])], ctx) ||
    !context(raw, b, ctx)
  )
    return mechanismIssue(ctx, 'complete actor/resource-bound source result required');
  const source = expansionSourceSpan(raw.evidence, ctx);
  if (!source || !sameSpan(source.span, b.beats[4].span) || (event && raw.event !== event.label))
    return mechanismIssue(
      ctx,
      'result must retain its own complete final event/actor/resource assertion',
    );
  const value = permission(raw, source, ctx);
  if (
    !value ||
    b.story.outcome !== statusOf(value) ||
    !clause(
      source,
      scoped(
        `${literal(b.actor.label)}'s\\s+result\\s+(?:for\\s+${event ? literal(event.label) : '(?!)'}\\s+)?(?:on|for)\\s+${literal(b.resource.label)}\\s+(?:is|remains|stays)\\s+${statusOf(value)}`,
        b.scope,
        b.period,
      ),
      conditionOf(value),
    )
  )
    return mechanismIssue(
      ctx,
      'final result is source-stated, never derived from reversibility or a timestamp',
    );
  // Expiry requires the event explicitly even if its label also occurs elsewhere in the clause.
  if (
    event &&
    !clause(
      source,
      scoped(
        `${literal(b.actor.label)}'s\\s+result\\s+for\\s+${literal(event.label)}\\s+on\\s+${literal(b.resource.label)}\\s+(?:is|remains|stays)\\s+${statusOf(value)}`,
        b.scope,
        b.period,
      ),
      conditionOf(value),
    )
  )
    return mechanismIssue(ctx, 'result must name this exact attempted event');
  return {
    ...fact(`expansion-${b.story.storyId}-result`, b, source.span),
    ...value,
    ...(event ? { eventId: event.id } : {}),
  };
}
function covered(b: Envelope, spans: readonly ExpansionEvidenceSpan[], ctx: ParseContext): boolean {
  if (b.clauses.some((c) => !spans.some((s) => sameSpan(s, c.span)))) {
    mechanismIssue(
      ctx,
      'every complete source clause must be represented with its actual facts and conditions',
    );
    return false;
  }
  return true;
}
function common(b: Envelope) {
  return {
    ...b.story,
    route: 'source-only' as const,
    entities: b.entities,
    actorId: b.actor.id,
    resourceId: b.resource.id,
    scope: b.scope,
    period: b.period,
    sourceSpans: b.sourceSpans,
  };
}

/** Raw43: common envelope + actor/resource/scope/period, states:<declared labels>[],
 * records:{type:state,...context,state:known|unknown|conditional,value?,condition?,evidence}[],
 * relations:{from,to,...context,...permission,evidence}[], result:{...context,...permission,evidence}.
 * Each direction is independent. No reverse edge or executed state is inferred. */
export function parseExpansionReversible(
  raw: Rec,
  ctx: ParseContext,
): ExpansionReversibleScene | null {
  const b = envelope(raw, ctx, '43');
  if (!b) return null;
  const setup = `${literal(b.story.label)}\\s+(?:names|identifies)\\s+${literal(b.actor.label)}\\s+as\\s+actor,?\\s+${literal(b.resource.label)}\\s+as\\s+resource,?\\s+and\\s+${names(b.members)}\\s+as\\s+states`;
  if (!clause(b.beats[0], scoped(setup, b.scope, b.period)))
    return mechanismIssue(ctx, 'setup must supply actual actor, resource and state identities');
  const rawRecords = rows(raw.records, EXPANSION_LIMITS.records - 1, ctx),
    rawRelations = rows(raw.relations, EXPANSION_LIMITS.relations, ctx);
  if (!rawRecords || !rawRelations) return null;
  const records: ReversibleStateRecord[] = [];
  for (const [i, entry] of rawRecords.entries()) {
    if (
      !onlyFields(
        entry,
        ['type', ...CONTEXT_FIELDS, 'state', 'value', 'condition', 'evidence'],
        ctx,
      ) ||
      !context(entry, b, ctx)
    )
      return null;
    const source = expansionSourceSpan(entry.evidence, ctx);
    if (!source || entry.type !== 'state')
      return mechanismIssue(ctx, 'state records must retain complete supplied state assertions');
    const stateValue = entry.state === 'unknown' ? undefined : ref(entry.value, b.members, ctx);
    const qualifier =
      entry.state === 'conditional' ? condition(entry.condition, source, ctx) : undefined;
    if (
      (entry.state !== 'known' && entry.state !== 'unknown' && entry.state !== 'conditional') ||
      (entry.state === 'unknown' ? 'value' in entry : !stateValue) ||
      (entry.state === 'conditional' ? !qualifier : 'condition' in entry) ||
      records.some((r) => sameSpan(r.evidence, source.span)) ||
      !clause(
        source,
        scoped(
          `${literal(b.actor.label)}\\s+(?:reports|records|states)\\s+(?:that\\s+)?${literal(b.resource.label)}\\s+(?:state\\s+is|is\\s+in\\s+state)\\s+${stateValue ? literal(stateValue.label) : 'unknown'}`,
          b.scope,
          b.period,
        ),
        qualifier ?? undefined,
      )
    )
      return mechanismIssue(
        ctx,
        'state and its own full condition must be source-supplied; unknown has no fabricated state',
      );
    const value: ReversibleStateRecord | null =
      entry.state === 'unknown'
        ? { ...fact(`expansion-43-record-${i}`, b, source.span), type: 'state', state: 'unknown' }
        : entry.state === 'conditional' && qualifier && stateValue
          ? {
              ...fact(`expansion-43-record-${i}`, b, source.span),
              type: 'state',
              state: 'conditional',
              valueId: stateValue.id,
              condition: qualifier,
            }
          : stateValue
            ? {
                ...fact(`expansion-43-record-${i}`, b, source.span),
                type: 'state',
                state: 'known',
                valueId: stateValue.id,
              }
            : null;
    if (!value) return mechanismIssue(ctx, 'complete supplied state required');
    records.push(value);
  }
  const relations: ReversibleTransition[] = [];
  for (const [i, entry] of rawRelations.entries()) {
    if (
      !onlyFields(entry, [...CONTEXT_FIELDS, ...PERMISSION_FIELDS, 'from', 'to'], ctx) ||
      !context(entry, b, ctx)
    )
      return null;
    const source = expansionSourceSpan(entry.evidence, ctx),
      from = ref(entry.from, b.members, ctx),
      to = ref(entry.to, b.members, ctx);
    if (!source || !from || !to) return null;
    const value = permission(entry, source, ctx);
    const prefix = `${literal(b.actor.label)}\\s+`;
    const motion = `${literal(b.resource.label)}\\s+from\\s+${literal(from.label)}\\s+to\\s+${literal(to.label)}`;
    const status = value ? statusOf(value) : '';
    const body =
      status === 'unknown'
        ? `${prefix}transition\\s+of\\s+${motion}\\s+(?:is|remains)\\s+unknown`
        : `${prefix}(?:is\\s+${status}\\s+to\\s+(?:move|change)\\s+${motion}|${status === 'allowed' ? 'has\\s+permission' : 'has\\s+no\\s+permission'}\\s+to\\s+(?:move|change)\\s+${motion})`;
    if (
      !value ||
      from.id === to.id ||
      relations.some((r) => r.fromId === from.id && r.toId === to.id) ||
      !clause(source, scoped(body, b.scope, b.period), conditionOf(value))
    )
      return mechanismIssue(
        ctx,
        'only distinct explicitly authorized/denied/unknown directional transitions and actual conditions survive',
      );
    relations.push({
      ...fact(`expansion-43-relation-${i}`, b, source.span),
      type: 'transition',
      fromId: from.id,
      toId: to.id,
      ...value,
    });
  }
  const result = finalResult(raw.result, b, ctx);
  if (!result || 'eventId' in result) return null;
  if (
    !relations.some((r) => statusOf(r) === 'allowed') ||
    b.members.some((e) => !relations.some((r) => r.fromId === e.id || r.toId === e.id)) ||
    b.beats.slice(1, 3).some((beat) => !relations.some((r) => sameSpan(r.evidence, beat.span))) ||
    !records.some((r) => sameSpan(r.evidence, b.beats[3].span)) ||
    !covered(
      b,
      [
        b.beats[0].span,
        result.evidence,
        ...records.map((r) => r.evidence),
        ...relations.map((r) => r.evidence),
      ],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'supply states, at least one allowed transition, two independent transition beats and an actual state check',
    );
  return {
    ...common(b),
    storyId: '43',
    kind: 'state-transition',
    preset: 'reversible',
    template: 'state-rail',
    stateIds: b.members.map((e) => e.id),
    records,
    relations,
    result,
  };
}

function timing(
  raw: unknown,
  b: Envelope,
  claim: string,
  timingBasis: string,
  ctx: ParseContext,
): ExpansionQuantity | null {
  const value = parseExpansionQuantity(raw, ctx);
  if (
    !value ||
    value.actor !== b.actor.label ||
    value.claim !== `${b.resource.label} ${claim}` ||
    value.basis.period !== b.period ||
    value.basis.population !== timingBasis ||
    !['second', 'minute', 'hour', 'day'].includes(value.basis.unit) ||
    value.basis.denominator ||
    value.state === 'simulated' ||
    value.state === 'illustrative'
  )
    return mechanismIssue(
      ctx,
      'represented timing needs exact actor/resource/time-unit/period/clock basis, not a derived or simulated timestamp',
    );
  const source = expansionSourceSpan(value.evidence, ctx);
  if (!source || !safe(source.text) || !phrase(b.scope, source, ctx, EXPANSION_LIMITS.population))
    return null;
  if (value.state === 'conditional' && !condition(value.condition, source, ctx)) return null;
  const amounts =
    value.state === 'disputed' ? value.alternatives : 'amount' in value ? [value.amount] : [];
  if (amounts.some((a) => a.kind !== 'rational' || a.value.numerator < 0))
    return mechanismIssue(
      ctx,
      'represented offsets must be exact bounded nonnegative supplied quantities, never missing-as-zero',
    );
  return value;
}
function timingSpans(record: ExpiryTimingRecord): ExpansionEvidenceSpan[] {
  return record.type === 'deadline'
    ? [record.representedDeadline.evidence]
    : record.type === 'attempt'
      ? [record.representedEventTime.evidence]
      : [record.representedStart.evidence, record.representedEnd.evidence];
}
/** Raw44: common envelope + events:<declared labels>[], timingBasis;
 * records:{type:deadline,representedDeadline:<quantity>,...context} OR
 * {type:validity,representedStart:<quantity>,representedEnd:<quantity>,...context} OR
 * {type:attempt,event,representedEventTime:<quantity>,...context}.
 * Quantity claims are '<resource> deadline|validity start|validity end|<event> attempt time'.
 * relations:{event,...context,...permission,evidence}[], result:{event,...context,...permission,evidence}.
 * Units/period/clock basis must be identical. There is NO timestamp-to-permission rule. */
export function parseExpansionExpiry(raw: Rec, ctx: ParseContext): ExpansionExpiryScene | null {
  const b = envelope(raw, ctx, '44');
  if (!b) return null;
  const timingBasis = phrase(raw.timingBasis, b.beats[0], ctx, EXPANSION_LIMITS.population);
  const setup = `${literal(b.story.label)}\\s+(?:names|identifies)\\s+${literal(b.actor.label)}\\s+as\\s+actor,?\\s+${literal(b.resource.label)}\\s+as\\s+resource,?\\s+and\\s+${names(b.members)}\\s+as\\s+events?`;
  if (
    !timingBasis ||
    !clause(
      b.beats[0],
      `${scoped(setup, b.scope, b.period)}\\s+with\\s+(?:basis|clock\\s+basis)\\s+${literal(timingBasis)}`,
    )
  )
    return mechanismIssue(
      ctx,
      'setup must name the actor/resource/events and explicit represented clock basis',
    );
  const rawRecords = rows(raw.records, EXPANSION_LIMITS.records - 1, ctx),
    rawRelations = rows(raw.relations, EXPANSION_LIMITS.relations, ctx);
  if (!rawRecords || !rawRelations) return null;
  const records: ExpiryTimingRecord[] = [],
    quantities: ExpansionQuantity[] = [];
  let scheduleCount = 0,
    factCount = 1;
  for (const [i, entry] of rawRecords.entries()) {
    const fields =
      entry.type === 'deadline'
        ? ['representedDeadline']
        : entry.type === 'validity'
          ? ['representedStart', 'representedEnd']
          : entry.type === 'attempt'
            ? ['event', 'representedEventTime']
            : null;
    if (
      !fields ||
      !onlyFields(entry, ['type', ...CONTEXT_FIELDS, ...fields], ctx) ||
      !context(entry, b, ctx)
    )
      return mechanismIssue(
        ctx,
        'timing records accept only the exact represented deadline/window/attempt fields',
      );
    const core = {
      id: `expansion-44-record-${i}`,
      actorId: b.actor.id,
      resourceId: b.resource.id,
      scope: b.scope,
      period: b.period,
    };
    if (entry.type === 'deadline') {
      const value = timing(entry.representedDeadline, b, 'deadline', timingBasis, ctx);
      if (!value) return null;
      records.push({ ...core, type: 'deadline', representedDeadline: value });
      quantities.push(value);
      scheduleCount++;
      factCount++;
    } else if (entry.type === 'validity') {
      const start = timing(entry.representedStart, b, 'validity start', timingBasis, ctx),
        end = timing(entry.representedEnd, b, 'validity end', timingBasis, ctx);
      if (!start || !end || sameSpan(start.evidence, end.evidence))
        return mechanismIssue(ctx, 'validity endpoints need separate complete source assertions');
      const sameQualification =
        (start.state === 'known' && end.state === 'known') ||
        (start.state === 'conditional' &&
          end.state === 'conditional' &&
          normalized(start.condition).toLowerCase() === normalized(end.condition).toLowerCase());
      if (
        sameQualification &&
        'amount' in start &&
        'amount' in end &&
        start.amount.kind === 'rational' &&
        end.amount.kind === 'rational'
      ) {
        const order = compare(start.amount.value, end.amount.value);
        if (!order.ok || order.value >= 0)
          return mechanismIssue(
            ctx,
            'explicit validity endpoints must be increasing without overflow',
          );
      }
      records.push({ ...core, type: 'validity', representedStart: start, representedEnd: end });
      quantities.push(start, end);
      scheduleCount++;
      factCount += 2;
    } else {
      const event = ref(entry.event, b.members, ctx);
      if (!event || records.some((r) => r.type === 'attempt' && r.eventId === event.id))
        return mechanismIssue(ctx, 'one distinct supplied attempt per named event required');
      const value = timing(
        entry.representedEventTime,
        b,
        `${event.label} attempt time`,
        timingBasis,
        ctx,
      );
      if (!value) return null;
      records.push({ ...core, type: 'attempt', eventId: event.id, representedEventTime: value });
      quantities.push(value);
      factCount++;
    }
  }
  if (
    scheduleCount !== 1 ||
    factCount > EXPANSION_LIMITS.records ||
    b.members.some((e) => !records.some((r) => r.type === 'attempt' && r.eventId === e.id)) ||
    quantities.some((q) => !compatibleBasis(q.basis, quantities[0].basis)) ||
    new Set(quantities.map((q) => q.evidence.fromWord)).size !== quantities.length
  )
    return mechanismIssue(
      ctx,
      'one supplied deadline/window and all attempts require distinct facts, at most twelve records and identical units/period/basis',
    );
  const relations: ExpiryAuthorization[] = [];
  for (const [i, entry] of rawRelations.entries()) {
    if (
      !onlyFields(entry, [...CONTEXT_FIELDS, ...PERMISSION_FIELDS, 'event'], ctx) ||
      !context(entry, b, ctx)
    )
      return null;
    const source = expansionSourceSpan(entry.evidence, ctx),
      event = ref(entry.event, b.members, ctx);
    if (!source || !event) return null;
    const value = permission(entry, source, ctx);
    if (
      !value ||
      relations.some((r) => r.eventId === event.id) ||
      !clause(
        source,
        scoped(
          `${literal(b.actor.label)}'s\\s+(?:authorization|permission)\\s+for\\s+${literal(event.label)}\\s+on\\s+${literal(b.resource.label)}\\s+(?:is|remains|stays)\\s+${statusOf(value)}`,
          b.scope,
          b.period,
        ),
        conditionOf(value),
      )
    )
      return mechanismIssue(
        ctx,
        'authorization needs its own complete source status/condition; no permission from schedule order',
      );
    relations.push({
      ...fact(`expansion-44-relation-${i}`, b, source.span),
      type: 'authorization',
      eventId: event.id,
      ...value,
    });
  }
  const resultEvent = isRec(raw.result) ? ref(raw.result.event, b.members, ctx) : null;
  const result = resultEvent ? finalResult(raw.result, b, ctx, resultEvent) : null;
  if (!result || !('eventId' in result) || typeof result.eventId !== 'string')
    return mechanismIssue(ctx, 'retain the actual attempted event result');
  if (
    !records.some(
      (r) => r.type !== 'attempt' && timingSpans(r).some((s) => sameSpan(s, b.beats[1].span)),
    ) ||
    !records.some(
      (r) => r.type === 'attempt' && sameSpan(r.representedEventTime.evidence, b.beats[2].span),
    ) ||
    !relations.some((r) => sameSpan(r.evidence, b.beats[3].span)) ||
    !covered(
      b,
      [
        b.beats[0].span,
        result.evidence,
        ...records.flatMap(timingSpans),
        ...relations.map((r) => r.evidence),
      ],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'all validity/deadline, attempt, authorization and final result source beats must remain represented',
    );
  return {
    ...common(b),
    storyId: '44',
    kind: 'temporal-structure',
    preset: 'expiry',
    template: 'expiry-window',
    timingBasis,
    eventIds: b.members.map((e) => e.id),
    records,
    relations,
    result: { ...result, eventId: result.eventId },
  };
}
