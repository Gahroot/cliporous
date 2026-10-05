/** Step12: validate supplied set selections and authored topology facts; derive nothing. */
import {
  EXPANSION_TOPOLOGY_ROLES,
  EXPANSION_TOPOLOGY_TEMPLATES,
  type ExpansionRelationshipStatus,
  type ExpansionSetMembership,
  type ExpansionSetOperation,
  type ExpansionSetOperationsScene,
  type ExpansionSetSelection,
  type ExpansionTopologyEdge,
  type ExpansionTopologyRole,
  type ExpansionTopologyScene,
  type ExpansionTopologyTemplate,
} from '../../remotion/compositions/explainer/expansion/relationships/sets-topology-types';
import type { ExpansionEntity } from '../../remotion/compositions/explainer/expansion/scene-types';
import { EXPANSION_LIMITS } from '../../remotion/compositions/explainer/expansion/value-types';
import {
  type ExpansionSourceEvidence,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const BEATS = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function key(text: string): string {
  return text.normalize('NFKC').replace(/’/g, "'").replace(/−/g, '-').replace(/\s+/g, ' ').trim();
}
function same(a: string, b: string): boolean {
  return key(a).toLowerCase() === key(b).toLowerCase();
}
function literal(text: string): string {
  return key(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function list(labels: readonly string[]): string {
  if (labels.length === 1) return literal(labels[0]);
  if (labels.length === 2) return `${literal(labels[0])}\\s+and\\s+${literal(labels[1])}`;
  return `${labels.slice(0, -1).map(literal).join(',\\s*')},?\\s+and\\s+${literal(labels.at(-1) ?? '')}`;
}
function spanSame(a: ExpansionSourceEvidence['span'], b: ExpansionSourceEvidence['span']): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
/** Full authored predicates also cover explicit negatives; a label mention is not a relation. */
function clause(e: ExpansionSourceEvidence, body: string, condition?: string): boolean {
  if (
    /[<>`]|https?:\/\/|www\./i.test(e.text) ||
    [...e.text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return false;
  const text = key(e.text)
    .replace(/[.;][”"’')\]]*$/, '')
    .trim();
  const pattern = condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
  return (
    text.split(/\s+/).length <= EXPANSION_LIMITS.evidenceWords &&
    new RegExp(`^(?:${pattern})$`, 'iu').test(text)
  );
}
function context(body: string, scope: string, period: string): string {
  const place = `(?:among|for)\\s+${literal(scope)}\\s+(?:during|in)\\s+${literal(period)}`;
  const reversed = `(?:during|in)\\s+${literal(period)}\\s+(?:among|for)\\s+${literal(scope)}`;
  return `(?:${body}\\s+${place}|${body}\\s+${reversed}|${place},\\s*${body}|${reversed},\\s*${body})`;
}
function ref(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = ctx.str(raw, EXPANSION_LIMITS.actorLabel);
  return (
    (label ? entities.find((e) => same(e.label, label)) : undefined) ??
    mechanismIssue(
      ctx,
      'references must quote declared actor/set labels, never aliases or caller IDs',
    )
  );
}
function refs(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
  min = 1,
): ExpansionEntity[] | null {
  if (!Array.isArray(raw) || raw.length < min || raw.length > EXPANSION_LIMITS.actors)
    return mechanismIssue(ctx, 'supply a bounded explicit list of named entities');
  const found: ExpansionEntity[] = [];
  for (const label of raw) {
    const e = ref(label, entities, ctx);
    if (!e) return null;
    if (found.some((v) => v.id === e.id))
      return mechanismIssue(ctx, 'duplicate entity references are not independent members');
    found.push(e);
  }
  return found;
}
function atBeat(
  raw: unknown,
  beat: ExpansionSourceEvidence,
  ctx: ParseContext,
): ExpansionSourceEvidence | null {
  const e = expansionSourceSpan(raw, ctx);
  return e && spanSame(e.span, beat.span)
    ? e
    : mechanismIssue(ctx, 'retain the complete clause owned by this beat');
}
function fact<T extends string>(
  raw: Rec,
  e: ExpansionSourceEvidence,
  field: string,
  allowed: readonly T[],
  ctx: ParseContext,
): { status: ExpansionRelationshipStatus; value?: T } | null {
  const value = allowed.find((v) => v === raw[field]);
  if (
    raw.state === 'known' &&
    value &&
    raw.condition === undefined &&
    raw.qualification === undefined
  )
    return { status: { state: 'known' }, value };
  if (raw.state === 'conditional' && value && raw.qualification === undefined) {
    const condition = expansionSourceLabel(raw.condition, e, ctx, EXPANSION_LIMITS.qualifier);
    if (condition && /^(?:if|unless|when|provided that|assuming)\s+/i.test(condition))
      return { status: { state: 'conditional', condition }, value };
  }
  if (raw.condition !== undefined)
    return mechanismIssue(ctx, 'only conditional facts retain a complete local condition');
  const qualification = expansionSourceLabel(raw.qualification, e, ctx, EXPANSION_LIMITS.qualifier);
  if (!qualification) return null;
  if (
    (raw.state === 'unknown' || raw.state === 'missing' || raw.state === 'disputed') &&
    raw[field] === undefined &&
    same(qualification, raw.state)
  )
    return { status: { state: raw.state, qualification } };
  if (
    value &&
    ((raw.state === 'illustrative' && /^(?:illustrative|teaching example)$/i.test(qualification)) ||
      (raw.state === 'simulated' && /^(?:simulated|simulation)$/i.test(qualification)))
  )
    return { status: { state: raw.state, qualification }, value };
  return mechanismIssue(
    ctx,
    'known, conditional, illustrative, simulated and unknown/missing/disputed facts must retain their distinct source state',
  );
}
function qualified(body: string, s: ExpansionRelationshipStatus): string {
  return s.state === 'illustrative' || s.state === 'simulated'
    ? `(?:in\\s+this|in\\s+the)\\s+${literal(s.qualification)},\\s*${body}`
    : body;
}
function conditionOf(s: ExpansionRelationshipStatus): string | undefined {
  return s.state === 'conditional' ? s.condition : undefined;
}
function qualifications(
  raw: Rec,
  states: readonly ExpansionRelationshipStatus[],
  ctx: ParseContext,
): boolean {
  if (
    states.some((s) => s.state === 'illustrative' || s.state === 'simulated') &&
    raw.evidence !== 'illustrative'
  ) {
    mechanismIssue(ctx, 'illustrative/simulated relations must not become measured source facts');
    return false;
  }
  const conditional = states.filter((s) => s.state === 'conditional');
  if (
    (raw.condition !== undefined && !conditional.length) ||
    conditional.some((s) => typeof raw.condition !== 'string' || !same(s.condition, raw.condition))
  ) {
    mechanismIssue(
      ctx,
      'preserve the exact condition on its own fact, not an invented blanket condition',
    );
    return false;
  }
  return true;
}
function envelope(raw: Rec, ctx: ParseContext, id: '39' | '40', fields: readonly string[]) {
  const base = expansionStoryBase(raw, ctx, id, [
    'entities',
    'scope',
    'period',
    'template',
    ...fields,
  ]);
  if (!base) return null;
  const { treatment, ...story } = base.story;
  if (treatment !== undefined) return mechanismIssue(ctx, 'no treatment is supported');
  const times = BEATS.map((b) => story[`${b}At`]);
  if (
    times.slice(1).some((t, i) => t - times[i] < 1 - 1e-6) ||
    ctx.win.endTime - story.resolveAt < 0.8 - 1e-6
  )
    return mechanismIssue(
      ctx,
      'all four beat gaps need at least 1s and resolve needs a 0.8s final hold',
    );
  const locals: ExpansionSourceEvidence[] = [];
  for (const beat of BEATS) {
    const index = ctx.inWin(raw[`${beat}Word`]);
    if (index === null) return null;
    const e = expansionSourceSpan(
      { fromWord: index, toWord: index + base.spans[beat].split(/\s+/).length - 1 },
      ctx,
    );
    if (!e)
      return mechanismIssue(
        ctx,
        'beats must start five distinct complete clauses, never keyword fragments',
      );
    locals.push(e);
  }
  const [setup, action, response, check, resolve] = locals;
  if (!setup || !action || !response || !check || !resolve) return null;
  const entities = expansionEntities(raw.entities, ctx, id);
  const scope = expansionSourceLabel(raw.scope, setup, ctx, EXPANSION_LIMITS.population);
  const period = expansionSourceLabel(raw.period, setup, ctx, EXPANSION_LIMITS.period);
  if (
    !entities ||
    !scope ||
    !period ||
    !same(story.subject, scope) ||
    entities.some((e) => !spanSame(e.evidence, setup.span))
  )
    return mechanismIssue(
      ctx,
      'actors, scope and period must be introduced together in the complete setup',
    );
  return { story, entities, scope, period, beats: { setup, action, response, check, resolve } };
}
function recordClauses(
  records: readonly {
    evidence: ExpansionSourceEvidence;
    pattern: string;
    status: ExpansionRelationshipStatus;
  }[],
  beats: readonly ExpansionSourceEvidence[],
  scope: string,
  period: string,
  ctx: ParseContext,
): boolean {
  for (const beat of beats) {
    const group = records.filter((r) => spanSame(r.evidence.span, beat.span));
    if (!group.length) {
      mechanismIssue(ctx, 'both relation beats need supplied actor-owned records');
      return false;
    }
    const conditions = group.map((r) => conditionOf(r.status));
    if (
      conditions.some((c) => c !== conditions[0]) ||
      !clause(
        beat,
        context(
          group.map((r) => qualified(r.pattern, r.status)).join('\\s+and\\s+'),
          scope,
          period,
        ),
        conditions[0],
      )
    ) {
      mechanismIssue(
        ctx,
        'source must assert these exact typed relations/states for these actors in this scope and period',
      );
      return false;
    }
  }
  return true;
}

/** Raw39: entities:{label,evidence}[], members/sets:label[], scope,period, template:'named-sets'; memberships:{member,set,state,membership?,qualification?,condition?,evidence}[]; operation:{kind,left,right,evidence}; selection:{state:'complete',members:label[],evidence}|{state:'unresolved',qualification:'unresolved',evidence}. */
export function parseExpansionSetOperations(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSetOperationsScene | null {
  const base = envelope(raw, ctx, '39', [
    'members',
    'sets',
    'memberships',
    'operation',
    'selection',
  ]);
  if (!base) return null;
  const { story, entities, scope, period, beats } = base;
  const members = refs(raw.members, entities, ctx);
  const sets = refs(raw.sets, entities, ctx, 2);
  if (
    raw.template !== 'named-sets' ||
    !members ||
    !sets ||
    members.length + sets.length !== entities.length ||
    members.some((m) => sets.some((s) => s.id === m.id))
  )
    return mechanismIssue(
      ctx,
      'named-sets requires an explicit disjoint partition into members and sets, at most eight total entities',
    );
  if (
    !clause(
      beats.setup,
      context(
        `${literal(story.label)}\\s+(?:lists|records)\\s+members\\s+${list(members.map((m) => m.label))}\\s+and\\s+sets\\s+${list(sets.map((s) => s.label))}`,
        scope,
        period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must actually introduce the supplied named members and named sets',
    );
  if (
    !Array.isArray(raw.memberships) ||
    raw.memberships.length < 2 ||
    raw.memberships.length > EXPANSION_LIMITS.records ||
    raw.memberships.length > EXPANSION_LIMITS.relations
  )
    return mechanismIssue(
      ctx,
      'memberships are two to twelve explicit records, bounded by sixteen relations',
    );
  const memberships: ExpansionSetMembership[] = [];
  const patterns: {
    evidence: ExpansionSourceEvidence;
    pattern: string;
    status: ExpansionRelationshipStatus;
  }[] = [];
  for (const [index, r] of raw.memberships.entries()) {
    if (
      !isRec(r) ||
      !onlyFields(
        r,
        ['member', 'set', 'state', 'membership', 'qualification', 'condition', 'evidence'],
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'membership records accept only their named actor, set and source status',
      );
    const member = ref(r.member, members, ctx),
      set = ref(r.set, sets, ctx),
      e = expansionSourceSpan(r.evidence, ctx);
    if (!member || !set || !e) return null;
    const f = fact(r, e, 'membership', ['included', 'excluded'] as const, ctx);
    if (
      !f ||
      (!spanSame(e.span, beats.action.span) && !spanSame(e.span, beats.response.span)) ||
      memberships.some((v) => v.memberId === member.id && v.setId === set.id)
    )
      return mechanismIssue(
        ctx,
        'membership pairs must be unique, supplied in their action/response clause',
      );
    const m = literal(member.label),
      s = literal(set.label);
    const pattern =
      f.value === 'included'
        ? `(?:${m}\\s+belongs\\s+to\\s+${s}|${m}\\s+is\\s+a\\s+member\\s+of\\s+${s})`
        : f.value === 'excluded'
          ? `(?:${m}\\s+does\\s+not\\s+belong\\s+to\\s+${s}|${m}\\s+is\\s+not\\s+a\\s+member\\s+of\\s+${s})`
          : `(?:membership\\s+of\\s+${m}\\s+in\\s+${s}\\s+(?:is|remains)|${m}\\s+membership\\s+in\\s+${s}\\s+(?:is|remains))\\s+${literal('qualification' in f.status ? f.status.qualification : '')}`;
    patterns.push({ evidence: e, pattern, status: f.status });
    memberships.push({
      id: `expansion-39-membership-${index}`,
      memberId: member.id,
      setId: set.id,
      ...f.status,
      ...(f.value ? { membership: f.value } : {}),
      evidence: e.span,
    });
  }
  if (
    !recordClauses(patterns, [beats.action, beats.response], scope, period, ctx) ||
    !qualifications(raw, memberships, ctx)
  )
    return null;
  if (
    !isRec(raw.operation) ||
    !onlyFields(raw.operation, ['kind', 'left', 'right', 'evidence'], ctx)
  )
    return mechanismIssue(
      ctx,
      'supply exactly one authored intersection, union or left-minus-right exclusion',
    );
  const o = raw.operation;
  const operation = (['intersection', 'union', 'exclusion'] as const).find((k) => k === o.kind);
  const left = ref(o.left, sets, ctx),
    right = ref(o.right, sets, ctx),
    oe = atBeat(o.evidence, beats.check, ctx);
  if (!operation || !left || !right || left.id === right.id || !oe)
    return mechanismIssue(
      ctx,
      'operation requires two distinct named sets and an allowlisted operation',
    );
  const operands =
    operation === 'exclusion'
      ? `${literal(left.label)}\\s+(?:minus|excluding)\\s+${literal(right.label)}`
      : `${literal(left.label)}\\s+and\\s+${literal(right.label)}`;
  const operationPhrase = `(?:the\\s+)?${operation}\\s+of\\s+${operands}`;
  if (
    !clause(
      oe,
      context(
        `${literal(story.label)}\\s+(?:selects|requests)\\s+${operationPhrase}`,
        scope,
        period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'the selected operation and ordered operands must be explicitly stated, not inferred from membership',
    );
  if (
    !isRec(raw.selection) ||
    !onlyFields(raw.selection, ['state', 'members', 'qualification', 'evidence'], ctx)
  )
    return mechanismIssue(
      ctx,
      'selection is a supplied complete member list or an unresolved source statement',
    );
  const se = atBeat(raw.selection.evidence, beats.resolve, ctx);
  if (!se) return null;
  let selection: ExpansionSetSelection;
  if (
    raw.selection.state === 'unresolved' &&
    raw.selection.members === undefined &&
    raw.selection.qualification === 'unresolved' &&
    clause(se, context(`${operationPhrase}\\s+(?:is|remains)\\s+unresolved`, scope, period))
  ) {
    selection = { state: 'unresolved', qualification: 'unresolved', evidence: se.span };
  } else if (raw.selection.state === 'complete' && raw.selection.qualification === undefined) {
    const supplied = refs(raw.selection.members, members, ctx, 0);
    if (!supplied) return null;
    // Consistency validation only. Never emit a computed member list or treat missing as false.
    for (const member of members) {
      const a = memberships.find((v) => v.memberId === member.id && v.setId === left.id);
      const b = memberships.find((v) => v.memberId === member.id && v.setId === right.id);
      if (!a || !b || a.state !== 'known' || b.state !== 'known')
        return mechanismIssue(
          ctx,
          'complete selection requires explicit known membership for every member in both operands; unknown/missing is not excluded',
        );
      const expected = selected(
        operation,
        a.membership === 'included',
        b.membership === 'included',
      );
      if (supplied.some((v) => v.id === member.id) !== expected)
        return mechanismIssue(
          ctx,
          'supplied complete selection is inconsistent with supplied membership; no auto-population or correction',
        );
    }
    const result = supplied.length
      ? `(?:contains\\s+only|selects\\s+only)\\s+${list(supplied.map((v) => v.label))}`
      : '(?:contains\\s+no\\s+members|selects\\s+no\\s+members)';
    if (!clause(se, context(`${operationPhrase}\\s+${result}`, scope, period)))
      return mechanismIssue(
        ctx,
        'complete selected members must themselves be explicitly supplied in the resolve clause',
      );
    selection = { state: 'complete', memberIds: supplied.map((v) => v.id), evidence: se.span };
  } else
    return mechanismIssue(ctx, 'preserve unresolved selection without a fabricated member list');
  return {
    ...story,
    storyId: '39',
    kind: 'venn',
    preset: 'set-operations',
    template: 'named-sets',
    entities,
    memberIds: members.map((v) => v.id),
    setIds: sets.map((v) => v.id),
    scope,
    period,
    memberships,
    operation: { kind: operation, leftId: left.id, rightId: right.id, evidence: oe.span },
    selection,
  };
}
function selected(operation: ExpansionSetOperation, left: boolean, right: boolean): boolean {
  return operation === 'intersection'
    ? left && right
    : operation === 'union'
      ? left || right
      : left && !right;
}
function edgeNoun(role: ExpansionTopologyRole, from: string, to: string): string {
  return role === 'transfer'
    ? `transfer\\s+from\\s+${literal(from)}\\s+to\\s+${literal(to)}`
    : `${role}\\s+of\\s+${literal(from)}\\s+${role === 'dependency' ? 'on' : 'in'}\\s+${literal(to)}`;
}
function edgePattern(
  role: ExpansionTopologyRole,
  from: string,
  to: string,
  status: string,
): string {
  const noun = edgeNoun(role, from, to);
  if (status !== 'present')
    return `(?:${noun}\\s+(?:is|remains)\\s+${literal(status)}${status === 'failed' ? `|${noun}\\s+fails` : ''})`;
  const verb =
    role === 'transfer'
      ? 'transfers\\s+to'
      : role === 'dependency'
        ? 'depends\\s+on'
        : 'is\\s+a\\s+member\\s+of';
  return `(?:${literal(from)}\\s+${verb}\\s+${literal(to)}|${noun}\\s+is\\s+present)`;
}

/** Raw40: entities:{label,evidence}[], scope,period, template:'chain'|'ring'|'diamond'; edges:{from,to,role,state,status?,qualification?,condition?,evidence}[]; failure:{from,to,role,state:'conditional',condition,effect,evidence}; result:{actor,claim,state,result?,qualification?,condition?,evidence}. Top-level condition retains the same failure condition. */
export function parseExpansionTopology(raw: Rec, ctx: ParseContext): ExpansionTopologyScene | null {
  const base = envelope(raw, ctx, '40', ['edges', 'failure', 'result']);
  if (!base) return null;
  const { story, entities, scope, period, beats } = base;
  const template = (['chain', 'ring', 'diamond'] as const).find((v) => v === raw.template);
  if (!template || entities.length !== EXPANSION_TOPOLOGY_TEMPLATES[template].nodes)
    return mechanismIssue(
      ctx,
      'topology accepts only the frozen four-slot chain, ring or diamond templates',
    );
  if (
    !clause(
      beats.setup,
      context(
        `${literal(story.label)}\\s+(?:tracks|maps|records)\\s+${list(entities.map((v) => v.label))}`,
        scope,
        period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must introduce these actual topology actors and scope, not an invented network',
    );
  if (
    !Array.isArray(raw.edges) ||
    raw.edges.length < 2 ||
    raw.edges.length + 2 > EXPANSION_LIMITS.records ||
    raw.edges.length > EXPANSION_LIMITS.relations
  )
    return mechanismIssue(
      ctx,
      'topology supplies bounded edges plus failure/outcome, at most twelve records and sixteen relations',
    );
  const edges: ExpansionTopologyEdge[] = [];
  const patterns: {
    evidence: ExpansionSourceEvidence;
    pattern: string;
    status: ExpansionRelationshipStatus;
  }[] = [];
  for (const [index, r] of raw.edges.entries()) {
    if (
      !isRec(r) ||
      !onlyFields(
        r,
        ['from', 'to', 'role', 'state', 'status', 'qualification', 'condition', 'evidence'],
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'edges accept only named endpoints, a typed relation and its source status',
      );
    const from = ref(r.from, entities, ctx),
      to = ref(r.to, entities, ctx),
      e = expansionSourceSpan(r.evidence, ctx);
    const role = EXPANSION_TOPOLOGY_ROLES.find((v) => v === r.role);
    if (!from || !to || !e || !role)
      return mechanismIssue(
        ctx,
        'dependency, transfer and membership are distinct source-bound edge roles',
      );
    const f = fact(r, e, 'status', ['present', 'absent', 'failed'] as const, ctx);
    if (
      !f ||
      (!spanSame(e.span, beats.action.span) && !spanSame(e.span, beats.response.span)) ||
      !allowsLink(template, entities.indexOf(from), entities.indexOf(to)) ||
      edges.some((v) => v.fromId === from.id && v.toId === to.id)
    )
      return mechanismIssue(
        ctx,
        'edge must occupy a unique authored directed template link and quote its own action/response clause',
      );
    patterns.push({
      evidence: e,
      pattern: edgePattern(
        role,
        from.label,
        to.label,
        f.value ?? ('qualification' in f.status ? f.status.qualification : ''),
      ),
      status: f.status,
    });
    edges.push({
      id: `expansion-40-edge-${index}`,
      fromId: from.id,
      toId: to.id,
      role,
      ...f.status,
      ...(f.value ? { status: f.value } : {}),
      evidence: e.span,
    });
  }
  if (!recordClauses(patterns, [beats.action, beats.response], scope, period, ctx)) return null;
  if (
    !isRec(raw.failure) ||
    !onlyFields(
      raw.failure,
      ['from', 'to', 'role', 'state', 'condition', 'effect', 'evidence'],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'an explicit local failure condition is required, not inferred resilience',
    );
  const f = raw.failure;
  const from = ref(f.from, entities, ctx),
    to = ref(f.to, entities, ctx),
    fe = atBeat(f.evidence, beats.check, ctx);
  const condition = fe
    ? expansionSourceLabel(f.condition, fe, ctx, EXPANSION_LIMITS.qualifier)
    : null;
  const edge = edges.find((v) => v.fromId === from?.id && v.toId === to?.id && v.role === f.role);
  const effect = (['failed', 'absent', 'unknown', 'missing', 'disputed'] as const).find(
    (v) => v === f.effect,
  );
  if (
    !from ||
    !to ||
    !fe ||
    !condition ||
    !edge ||
    !effect ||
    f.state !== 'conditional' ||
    !/^(?:if|unless|when|provided that|assuming)\s+/i.test(condition) ||
    !clause(
      fe,
      context(edgePattern(edge.role, from.label, to.label, effect), scope, period),
      condition,
    )
  )
    return mechanismIssue(
      ctx,
      'source failure must retain its exact named edge, role, condition and effect; failed is not absent or unknown',
    );
  if (
    !isRec(raw.result) ||
    !onlyFields(
      raw.result,
      ['actor', 'claim', 'state', 'result', 'qualification', 'condition', 'evidence'],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'outcome requires its own supplied actor-bound source result or explicitly unresolved state',
    );
  const r = raw.result;
  const actor = ref(r.actor, entities, ctx),
    re = atBeat(r.evidence, beats.resolve, ctx);
  const claim = re ? expansionSourceLabel(r.claim, re, ctx, EXPANSION_LIMITS.actorLabel) : null;
  if (!actor || !re || !claim) return null;
  const result = fact(r, re, 'result', ['continues', 'stops', 'unchanged'] as const, ctx);
  if (!result) return null;
  const predicate =
    result.value === 'unchanged'
      ? '(?:is|remains)\\s+unchanged'
      : (result.value ??
        `(?:is|remains)\\s+${literal('qualification' in result.status ? result.status.qualification : '')}`);
  if (
    !clause(
      re,
      qualified(
        context(`${literal(actor.label)}\\s+${literal(claim)}\\s+${predicate}`, scope, period),
        result.status,
      ),
      conditionOf(result.status),
    ) ||
    !qualifications(raw, [...edges, { state: 'conditional', condition }, result.status], ctx)
  )
    return mechanismIssue(
      ctx,
      'outcome must assert this actor/claim/state directly; do not infer connectivity, resilience or a winner from template links',
    );
  return {
    ...story,
    storyId: '40',
    kind: 'collective-pattern',
    preset: 'topology',
    template,
    entities,
    scope,
    period,
    edges,
    failure: {
      id: 'expansion-40-failure-0',
      edgeId: edge.id,
      state: 'conditional',
      condition,
      effect,
      evidence: fe.span,
    },
    result: {
      actorId: actor.id,
      claim,
      ...result.status,
      ...(result.value ? { result: result.value } : {}),
      evidence: re.span,
    },
  };
}
function allowsLink(template: ExpansionTopologyTemplate, from: number, to: number): boolean {
  return EXPANSION_TOPOLOGY_TEMPLATES[template].links.some(([a, b]) => a === from && b === to);
}
