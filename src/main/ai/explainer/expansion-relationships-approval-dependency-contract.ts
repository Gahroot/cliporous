/** Source-only relationships: ownership is not permission; dependency is not a schedule. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionApprovalHandoffScene,
  ExpansionApprovalRecord,
  ExpansionAuthorizationStatus,
  ExpansionDependencyRelation,
  ExpansionDependencyScene,
  ExpansionRelationshipFact,
  ExpansionRelationshipResult,
  ExpansionRelationshipStatus,
  ExpansionRelationshipValue,
} from '../../remotion/compositions/explainer/expansion/relationships/approval-dependency-types';
import type {
  ExpansionEntity,
  ExpansionStoryBase,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import { EXPANSION_LIMITS } from '../../remotion/compositions/explainer/expansion/value-types';
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

const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const FACT_FIELDS = ['actor', 'claim', 'scope', 'period', 'evidence'] as const;
const STATUS_FIELDS = ['state', 'condition'] as const;
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
    !/[<>`{}[\]\\()]|=>|\w+:\/\/|www\.|\b(?:function|javascript|eval)\b/i.test(text) &&
    ![...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function phrase(
  raw: unknown,
  source: ExpansionSourceEvidence,
  ctx: ParseContext,
  max = 96,
): string | null {
  const text = expansionSourceLabel(raw, source, ctx, max);
  return text && safe(text)
    ? text
    : mechanismIssue(ctx, 'relationship labels must be bounded plain local source text');
}
function same(a: string, b: string): boolean {
  return normalized(a).toLowerCase() === normalized(b).toLowerCase();
}
function sameSpan(a: ExpansionSourceEvidence['span'], b: ExpansionSourceEvidence['span']): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function clause(source: ExpansionSourceEvidence, body: string, condition?: string): boolean {
  if (!safe(source.text)) return false;
  const text = normalized(source.text).replace(/[.;]$/, '');
  const markers = [...text.matchAll(/\b(?:if|unless|when|provided that|assuming)\b/gi)];
  if (
    (condition === undefined && markers.length !== 0) ||
    (condition !== undefined && markers.length !== 1)
  )
    return false;
  const pattern = condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
  return new RegExp(`^(?:${pattern})$`, 'iu').test(text);
}
function scoped(body: string, scope: string, period: string): string {
  const suffix = `(?:for|within)\\s+${literal(scope)}\\s+(?:during|in)\\s+${literal(period)}`;
  return `(?:${body}\\s+${suffix}|${suffix},\\s*${body})`;
}
function names(labels: readonly string[]): string {
  if (labels.length === 1) return literal(labels[0]);
  if (labels.length === 2) return `${literal(labels[0])}\\s+and\\s+${literal(labels[1])}`;
  return `${labels.slice(0, -1).map(literal).join(',\\s*')},?\\s+and\\s+${literal(labels.at(-1) ?? '')}`;
}
function ref(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  return (
    (typeof raw === 'string' ? entities.find((e) => e.label === raw) : undefined) ??
    mechanismIssue(ctx, 'references must use exact declared source labels, never IDs or aliases')
  );
}
interface Envelope {
  story: ExpansionStoryBase;
  entities: ExpansionEntity[];
  scope: string;
  period: string;
  beats: ExpansionSourceEvidence[];
  clauses: ExpansionSourceEvidence[];
}
/** Local envelope uses the shared exact-clause helpers, not hybridStory's single blanket condition.
 * Conditions belong to individual records here and are validated against those entire clauses. */
function envelope(
  raw: Rec,
  ctx: ParseContext,
  id: '35' | '36',
  fields: readonly string[],
): Envelope | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'relationship proposal must be an object');
  const entry = expansionEntry(raw.kind, raw.preset);
  const template = id === '35' ? 'approval-stations' : 'typed-links';
  if (
    !entry ||
    entry.id !== id ||
    raw.template !== template ||
    (raw.route !== undefined && raw.route !== 'source-only')
  )
    return mechanismIssue(
      ctx,
      'exact kind/preset and authored template/source-only route required',
    );
  if (
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
        'scope',
        'period',
        'values',
        'result',
        ...BEATS,
        ...fields,
      ],
      ctx,
    )
  )
    return null;
  const duration = ctx.win.endTime - ctx.win.startTime;
  if (
    !Number.isSafeInteger(ctx.win.startWord) ||
    !Number.isSafeInteger(ctx.win.endWord) ||
    ctx.win.startWord < 0 ||
    ctx.win.endWord >= ctx.words.length ||
    ctx.win.endWord < ctx.win.startWord
  )
    return mechanismIssue(ctx, 'source window must contain actual bounded word indices');
  if (
    !Number.isFinite(duration) ||
    duration < 5 ||
    duration > 12 ||
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid') ||
    raw.evidence !== 'source-stated' ||
    (raw.startWord !== undefined && raw.startWord !== ctx.win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== ctx.win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((layout) => layout === raw.layout))
  )
    return mechanismIssue(
      ctx,
      'complete finite 5–12s source-stated window and offered mode/layout required',
    );
  const words = ctx.words.slice(ctx.win.startWord, ctx.win.endWord + 1);
  if (
    !words.length ||
    words.some(
      (w, i) =>
        !safe(w.text) ||
        !Number.isFinite(w.start) ||
        !Number.isFinite(w.end) ||
        w.end <= w.start ||
        w.start < ctx.win.startTime ||
        w.end > ctx.win.endTime ||
        (i > 0 && (w.start <= words[i - 1].start || w.end < words[i - 1].end)),
    )
  )
    return mechanismIssue(
      ctx,
      'all source words must be safe, finite, bounded and monotonically timed',
    );
  const clauses: ExpansionSourceEvidence[] = [];
  for (let fromWord = ctx.win.startWord; fromWord <= ctx.win.endWord; ) {
    let toWord = fromWord;
    while (toWord < ctx.win.endWord && !/[.!?;][”"’')\]]*$/.test(ctx.words[toWord].text)) toWord++;
    const source = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!source) return null;
    clauses.push(source);
    fromWord = toWord + 1;
  }
  const beats: ExpansionSourceEvidence[] = [];
  for (const field of BEATS) {
    const index = ctx.inWin(raw[field]);
    const source = clauses.find((c) => c.span.fromWord === index);
    if (!source)
      return mechanismIssue(ctx, 'five beats must start five distinct complete source clauses');
    beats.push(source);
  }
  if (beats[0].span.fromWord !== ctx.win.startWord || beats[4].span.toWord !== ctx.win.endWord)
    return mechanismIssue(ctx, 'setup and resolve must retain the complete source window');
  const times = strictMechanismBeats(raw, ctx, BEATS, [1, 1, 1, 1], 0.8);
  if (!times || times.some((at) => at < ctx.win.startTime || at > ctx.win.endTime)) return null;
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
      'all identities and scope/period must be introduced in the exact setup clause',
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
    scope,
    period,
    entities,
    beats,
    clauses,
  };
}
interface FactInput {
  fact: ExpansionRelationshipFact;
  actor: ExpansionEntity;
  source: ExpansionSourceEvidence;
}
function fact(raw: Rec, base: Envelope, ctx: ParseContext, id: string): FactInput | null {
  const source = expansionSourceSpan(raw.evidence, ctx),
    actor = ref(raw.actor, base.entities, ctx);
  if (!source || !actor) return null;
  const claim = phrase(raw.claim, source, ctx),
    scope = phrase(raw.scope, source, ctx, EXPANSION_LIMITS.population),
    period = phrase(raw.period, source, ctx, EXPANSION_LIMITS.period);
  if (!claim || !scope || !period || scope !== base.scope || period !== base.period)
    return mechanismIssue(ctx, 'each actor/claim must retain this exact local scope and period');
  return {
    fact: { id, actorId: actor.id, claim, scope, period, evidence: source.span },
    actor,
    source,
  };
}
function status(
  raw: Rec,
  source: ExpansionSourceEvidence,
  ctx: ParseContext,
  authorization: boolean,
): ExpansionRelationshipStatus | ExpansionAuthorizationStatus | null {
  const states = authorization
    ? ['allowed', 'denied', 'pending', 'unknown', 'missing', 'disputed']
    : ['known', 'pending', 'unknown', 'missing', 'disputed'];
  if (typeof raw.state === 'string' && states.includes(raw.state) && raw.condition === undefined)
    return { state: raw.state } as ExpansionRelationshipStatus | ExpansionAuthorizationStatus;
  if (raw.state === 'conditional') {
    const condition = phrase(raw.condition, source, ctx);
    if (condition && /^(?:if|unless|when|provided that|assuming)\s+\S/i.test(condition))
      return { state: 'conditional', condition };
  }
  return mechanismIssue(
    ctx,
    'retain the explicit local status and full condition; unknown/missing/pending are not denied or allowed',
  );
}
function conditionOf(value: { state: string; condition?: string }): string | undefined {
  return value.state === 'conditional' ? value.condition : undefined;
}
function result(
  raw: unknown,
  base: Envelope,
  actor: ExpansionEntity,
  subject: string,
  ctx: ParseContext,
): ExpansionRelationshipResult | null {
  if (!isRec(raw) || !onlyFields(raw, [...FACT_FIELDS, ...STATUS_FIELDS, 'subject'], ctx))
    return mechanismIssue(ctx, 'result needs only its source actor/subject/claim/context/status');
  const input = fact(raw, base, ctx, `expansion-${base.story.storyId}-result`);
  if (
    !input ||
    input.actor.id !== actor.id ||
    raw.subject !== subject ||
    input.fact.claim !== 'result' ||
    !sameSpan(input.source.span, base.beats[4].span) ||
    typeof raw.state !== 'string' ||
    !same(base.story.outcome, raw.state)
  )
    return mechanismIssue(
      ctx,
      'result must retain the final actor-owned source result, never a grant or inferred completion',
    );
  if (
    ![
      'complete',
      'unresolved',
      'pending',
      'unknown',
      'missing',
      'disputed',
      'conditional',
    ].includes(raw.state)
  )
    return mechanismIssue(ctx, 'unsupported result state; no inferred authorization/schedule');
  const value =
    raw.state === 'complete' || raw.state === 'unresolved'
      ? raw.condition === undefined
        ? { state: raw.state }
        : null
      : status(raw, input.source, ctx, false);
  if (
    !value ||
    !clause(
      input.source,
      scoped(
        `${literal(actor.label)}'s\\s+result\\s+(?:for|on)\\s+${literal(subject)}\\s+(?:is|remains|stays)\\s+${literal(raw.state)}`,
        base.scope,
        base.period,
      ),
      conditionOf(value),
    )
  )
    return mechanismIssue(
      ctx,
      'result status and its own condition must be explicit in one complete final source clause',
    );
  return { ...input.fact, subject, ...value } as ExpansionRelationshipResult;
}
function values(
  raw: unknown,
  base: Envelope,
  actors: readonly ExpansionEntity[],
  subjects: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionRelationshipValue[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > EXPANSION_LIMITS.records)
    return mechanismIssue(
      ctx,
      'supplied quantities are bounded source records, never derived values',
    );
  const output: ExpansionRelationshipValue[] = [];
  for (const [i, entry] of raw.entries()) {
    if (!isRec(entry) || !onlyFields(entry, ['actor', 'entity', 'claim', 'quantity'], ctx))
      return null;
    const actor = ref(entry.actor, actors, ctx),
      entity = ref(entry.entity, subjects, ctx),
      quantity = parseExpansionQuantity(entry.quantity, ctx);
    if (!actor || !entity || !quantity)
      return mechanismIssue(ctx, 'a value must retain a supplied actor/entity-bound quantity');
    const source = expansionSourceSpan(quantity.evidence, ctx);
    const claim = source ? phrase(entry.claim, source, ctx, 54) : null;
    if (
      !source ||
      !claim ||
      quantity.actor !== actor.label ||
      quantity.claim !== `${entity.label} ${claim}` ||
      quantity.basis.population !== base.scope ||
      quantity.basis.period !== base.period ||
      output.some(
        (v) =>
          v.actorId === actor.id &&
          v.entityId === entity.id &&
          v.claim === claim &&
          sameSpan(v.quantity.evidence, quantity.evidence),
      )
    )
      return mechanismIssue(
        ctx,
        'quantity must retain its exact actor, entity claim, scope, period and independent supplied value',
      );
    output.push({
      id: `expansion-${base.story.storyId}-value-${i}`,
      actorId: actor.id,
      entityId: entity.id,
      claim,
      quantity,
    });
  }
  return output;
}
function covered(
  base: Envelope,
  evidence: readonly ExpansionSourceEvidence['span'][],
  ctx: ParseContext,
): boolean {
  if (base.clauses.some((source) => !evidence.some((span) => sameSpan(span, source.span)))) {
    mechanismIssue(
      ctx,
      'every complete source clause must be represented without losing its facts or conditions',
    );
    return false;
  }
  return true;
}

/** Raw35: common envelope + owner/approver/workItem, records[] and result; optional values[]. */
export function parseExpansionApprovalHandoff(
  raw: Rec,
  ctx: ParseContext,
): ExpansionApprovalHandoffScene | null {
  const base = envelope(raw, ctx, '35', ['owner', 'approver', 'workItem', 'records']);
  if (!base) return null;
  const owner = ref(raw.owner, base.entities, ctx),
    approver = ref(raw.approver, base.entities, ctx),
    item = ref(raw.workItem, base.entities, ctx);
  if (!owner || !approver || !item) return null;
  const title = literal(base.story.label);
  if (
    base.entities.length !== 3 ||
    new Set([owner.id, approver.id, item.id]).size !== 3 ||
    base.story.subject !== item.label ||
    !clause(
      base.beats[0],
      scoped(
        `(?:${title}\\s+(?:lists|names)\\s+${literal(owner.label)}\\s+as\\s+owner\\s+and\\s+${literal(approver.label)}\\s+as\\s+approver\\s+(?:of|for)\\s+${literal(item.label)}|${title}:\\s*${literal(owner.label)}\\s+owns\\s+${literal(item.label)}\\s+and\\s+${literal(approver.label)}\\s+is\\s+its\\s+approver)`,
        base.scope,
        base.period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must explicitly separate the actual owner, approver role and work item; roles do not authorize',
    );
  if (
    !Array.isArray(raw.records) ||
    raw.records.length < 3 ||
    raw.records.length + 1 > EXPANSION_LIMITS.records ||
    raw.records.length + 2 > EXPANSION_LIMITS.relations
  )
    return mechanismIssue(
      ctx,
      'include bounded request, actual authorization state and handoff records',
    );
  const records: ExpansionApprovalRecord[] = [];
  let previous = base.beats[0].span.toWord;
  for (const [i, entry] of raw.records.entries()) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, [...FACT_FIELDS, ...STATUS_FIELDS, 'type', 'target', 'item'], ctx)
    )
      return null;
    const input = fact(entry, base, ctx, `expansion-35-record-${i}`),
      target = ref(entry.target, base.entities, ctx),
      workItem = ref(entry.item, base.entities, ctx);
    if (!input || !target || !workItem) return null;
    const authorization = entry.type === 'authorization';
    const value = status(entry, input.source, ctx, authorization);
    if (
      !value ||
      workItem.id !== item.id ||
      input.actor.id !== (authorization ? approver.id : owner.id) ||
      target.id !== (authorization ? owner.id : approver.id) ||
      input.source.span.fromWord <= previous ||
      input.source.span.toWord >= base.beats[4].span.fromWord
    )
      return mechanismIssue(
        ctx,
        'record actor/recipient/item and source chronology must stay bound; a request never becomes a grant',
      );
    let body: string;
    if (authorization && input.fact.claim === 'authorization') {
      body = `${literal(approver.label)}'s\\s+authorization\\s+(?:for|to)\\s+${literal(owner.label)}\\s+on\\s+${literal(item.label)}\\s+(?:is|remains|stays)\\s+${literal(value.state)}`;
    } else if (entry.type === 'request' && input.fact.claim === 'authorization') {
      body =
        value.state === 'known' || value.state === 'conditional'
          ? `${literal(owner.label)}\\s+(?:requests authorization from|asks for authorization from)\\s+${literal(approver.label)}\\s+for\\s+${literal(item.label)}`
          : `${literal(owner.label)}'s\\s+authorization\\s+request\\s+to\\s+${literal(approver.label)}\\s+for\\s+${literal(item.label)}\\s+(?:is|remains)\\s+${literal(value.state)}`;
    } else if (entry.type === 'handoff' && input.fact.claim === 'review') {
      body =
        value.state === 'known' || value.state === 'conditional'
          ? `${literal(owner.label)}\\s+(?:hands|passes|sends)\\s+${literal(item.label)}\\s+to\\s+${literal(approver.label)}\\s+for review`
          : `${literal(owner.label)}'s\\s+review\\s+handoff\\s+of\\s+${literal(item.label)}\\s+to\\s+${literal(approver.label)}\\s+(?:is|remains)\\s+${literal(value.state)}`;
    } else
      return mechanismIssue(
        ctx,
        'record type and claim must be the exact source relationship, not a role-based approval',
      );
    if (!clause(input.source, scoped(body, base.scope, base.period), conditionOf(value)))
      return mechanismIssue(
        ctx,
        'record type, actual status and its own full condition need one complete actor-bound clause',
      );
    records.push({
      ...input.fact,
      type: entry.type,
      targetId: target.id,
      itemId: item.id,
      ...value,
    } as ExpansionApprovalRecord);
    previous = input.source.span.toWord;
  }
  if (
    !records.some((r) => r.type === 'request' && sameSpan(r.evidence, base.beats[1].span)) ||
    !records.some((r) => r.type === 'authorization' && sameSpan(r.evidence, base.beats[2].span)) ||
    !records.some((r) => r.type === 'handoff' && sameSpan(r.evidence, base.beats[3].span))
  )
    return mechanismIssue(
      ctx,
      'action/response/check must preserve the supplied request, authorization status and handoff respectively',
    );
  const supplied = values(raw.values, base, [owner, approver], [item], ctx),
    final = result(raw.result, base, owner, item.label, ctx);
  if (!supplied || !final) return null;
  if (
    records.length + supplied.length + 1 > EXPANSION_LIMITS.records ||
    !covered(
      base,
      [
        base.beats[0].span,
        final.evidence,
        ...records.map((r) => r.evidence),
        ...supplied.map((v) => v.quantity.evidence),
      ],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'approval records exceed twelve or leave unrepresented source facts',
    );
  return {
    ...base.story,
    storyId: '35',
    kind: 'agent-team',
    preset: 'approval-handoff',
    template: 'approval-stations',
    route: 'source-only',
    entities: base.entities,
    ownerId: owner.id,
    approverId: approver.id,
    workItemId: item.id,
    scope: base.scope,
    period: base.period,
    roles: [
      {
        id: 'expansion-35-role-0',
        type: 'owner',
        actorId: owner.id,
        itemId: item.id,
        claim: 'owner',
        scope: base.scope,
        period: base.period,
        evidence: base.beats[0].span,
      },
      {
        id: 'expansion-35-role-1',
        type: 'approver',
        actorId: approver.id,
        itemId: item.id,
        claim: 'approver',
        scope: base.scope,
        period: base.period,
        evidence: base.beats[0].span,
      },
    ],
    records,
    values: supplied,
    result: final,
  };
}

/** Raw36: common envelope + actor, relations:{type,actor,from,to,claim,scope,period,state,condition?,evidence}[], result and optional values[]. */
export function parseExpansionDependency(
  raw: Rec,
  ctx: ParseContext,
): ExpansionDependencyScene | null {
  const base = envelope(raw, ctx, '36', ['actor', 'relations']);
  if (!base) return null;
  const actor = ref(raw.actor, base.entities, ctx);
  if (!actor) return null;
  const nodes = base.entities.filter((e) => e.id !== actor.id);
  if (
    nodes.length < 2 ||
    base.story.subject !== actor.label ||
    !clause(
      base.beats[0],
      scoped(
        `${literal(base.story.label)}\\s+(?:lists|names|maps)\\s+${names(nodes.map((e) => e.label))}\\s+for\\s+${literal(actor.label)}`,
        base.scope,
        base.period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must bind the source actor and actual named graph entities to scope/period',
    );
  if (
    !Array.isArray(raw.relations) ||
    raw.relations.length < 3 ||
    raw.relations.length > EXPANSION_LIMITS.relations
  )
    return mechanismIssue(
      ctx,
      'include three to sixteen explicit typed source links; no inferred schedule edges',
    );
  const relations: ExpansionDependencyRelation[] = [];
  let previous = base.beats[0].span.toWord;
  for (const [i, entry] of raw.relations.entries()) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, [...FACT_FIELDS, ...STATUS_FIELDS, 'type', 'from', 'to'], ctx)
    )
      return null;
    const input = fact(entry, base, ctx, `expansion-36-relation-${i}`),
      from = ref(entry.from, nodes, ctx),
      to = ref(entry.to, nodes, ctx);
    if (!input || !from || !to) return null;
    const value = status(entry, input.source, ctx, false);
    if (
      !value ||
      value.state === 'pending' ||
      input.actor.id !== actor.id ||
      from.id === to.id ||
      input.source.span.fromWord <= previous ||
      input.source.span.toWord >= base.beats[4].span.fromWord ||
      typeof entry.type !== 'string' ||
      !['dependency', 'transfer', 'order', 'flow'].includes(entry.type) ||
      relations.some(
        (r) =>
          r.type === entry.type &&
          r.fromId === from.id &&
          r.toId === to.id &&
          r.claim === input.fact.claim,
      )
    )
      return mechanismIssue(
        ctx,
        'links need unique bound endpoints, source actor/type/status and source chronology',
      );
    const type = entry.type as ExpansionDependencyRelation['type'];
    if (type === 'dependency' || type === 'order') {
      const predicates =
        type === 'dependency' ? ['depends on', 'requires'] : ['precedes', 'comes before'];
      if (
        value.state === 'known' || value.state === 'conditional'
          ? !predicates.includes(input.fact.claim)
          : input.fact.claim !== type
      )
        return mechanismIssue(
          ctx,
          'dependency/order claims must quote their actual local source predicates or qualified type',
        );
    }
    const intro = `${literal(actor.label)}\\s+(?:states|reports|records)\\s+(?:that\\s+)?`;
    let body: string;
    if (value.state !== 'known' && value.state !== 'conditional') {
      body = `${intro}${type}${type === 'transfer' || type === 'flow' ? `\\s+of\\s+${literal(input.fact.claim)}` : ''}\\s+from\\s+${literal(from.label)}\\s+to\\s+${literal(to.label)}\\s+(?:is|remains)\\s+${literal(value.state)}`;
    } else if (type === 'dependency') {
      body = `${intro}${literal(from.label)}\\s+${literal(input.fact.claim)}\\s+${literal(to.label)}`;
    } else if (type === 'order') {
      body = `${intro}${literal(from.label)}\\s+${literal(input.fact.claim)}\\s+${literal(to.label)}`;
    } else {
      body = `${intro}${literal(from.label)}\\s+${type === 'transfer' ? '(?:transfers|hands)' : '(?:routes|sends)'}\\s+${literal(input.fact.claim)}\\s+to\\s+${literal(to.label)}`;
    }
    if (!clause(input.source, scoped(body, base.scope, base.period), conditionOf(value)))
      return mechanismIssue(
        ctx,
        'dependency, transfer, flow and source order must keep their exact typed local assertions and conditions',
      );
    relations.push({
      ...input.fact,
      fromId: from.id,
      toId: to.id,
      type,
      ...value,
    } as ExpansionDependencyRelation);
    previous = input.source.span.toWord;
  }
  if (
    !relations.some((r) => r.type === 'dependency') ||
    base.beats
      .slice(1, 4)
      .some((beat) => !relations.some((r) => sameSpan(r.evidence, beat.span))) ||
    nodes.some((node) => !relations.some((r) => r.fromId === node.id || r.toId === node.id))
  )
    return mechanismIssue(
      ctx,
      'an explicit dependency and every source response/check/entity must be represented; transfer or order alone is insufficient',
    );
  const active = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string): boolean {
    if (active.has(id)) return false;
    if (visited.has(id)) return true;
    active.add(id);
    for (const edge of relations.filter((r) => r.type === 'dependency' && r.fromId === id))
      if (!visit(edge.toId)) return false;
    active.delete(id);
    visited.add(id);
    return true;
  }
  if (nodes.some((node) => !visit(node.id)))
    return mechanismIssue(
      ctx,
      'the bounded dependency subgraph must be acyclic; other link types never become prerequisites',
    );
  const supplied = values(raw.values, base, [actor], nodes, ctx),
    final = result(raw.result, base, actor, base.story.label, ctx);
  if (!supplied || !final) return null;
  if (
    supplied.length + 1 > EXPANSION_LIMITS.records ||
    !covered(
      base,
      [
        base.beats[0].span,
        final.evidence,
        ...relations.map((r) => r.evidence),
        ...supplied.map((v) => v.quantity.evidence),
      ],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'dependency records exceed twelve or leave unrepresented source facts',
    );
  return {
    ...base.story,
    storyId: '36',
    kind: 'relation-structure',
    preset: 'dependency',
    template: 'typed-links',
    route: 'source-only',
    entities: base.entities,
    actorId: actor.id,
    scope: base.scope,
    period: base.period,
    relations,
    values: supplied,
    result: final,
  };
}
