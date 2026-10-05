/** Step13 local stories 47–48: retain supplied history/controls; never execute a twin or switch. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionEntity,
  ExpansionStoryBase,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import type {
  ExpansionAlignedComparisonResult,
  ExpansionAlignedSnapshot,
  ExpansionAlignedStateComparisonScene,
  ExpansionHistoryTwinStatus,
  ExpansionHysteresisResult,
  ExpansionHysteresisRule,
  ExpansionHysteresisScene,
  ExpansionRetainedHistory,
} from '../../remotion/compositions/explainer/expansion/temporal/history-twin-types';
import {
  EXPANSION_LIMITS,
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

const BEATS = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const WORD_FIELDS = BEATS.map((beat) => `${beat}Word`);
const ENVELOPE_FIELDS = [
  'kind',
  'preset',
  'visualMode',
  'label',
  'subject',
  'outcome',
  'evidence',
  'startWord',
  'endWord',
  'layout',
  'continues',
  'transition',
  'entities',
  'actor',
  'scope',
  'period',
  'template',
  ...WORD_FIELDS,
];
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
function unsafe(text: string): boolean {
  return (
    /[<>`]|https?:\/\/|www\./i.test(text) ||
    [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
/** Qualitative slots cannot smuggle numerical operands past the exact quantity contract. */
function numeric(text: string): boolean {
  return /(?:^|[^\p{L}\p{N}])[+-]?(?:[$€£]\s*)?\d+(?:[.,]\d+)*(?:%|\s*\/\s*\d+)?(?=$|[^\p{L}\p{N}])/u.test(
    text,
  );
}
function clause(e: ExpansionSourceEvidence, body: string, condition?: string): boolean {
  if (unsafe(e.text)) return false;
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
    mechanismIssue(ctx, 'references must quote declared source labels, never caller IDs or aliases')
  );
}
function local(
  raw: unknown,
  beat: ExpansionSourceEvidence,
  ctx: ParseContext,
): ExpansionSourceEvidence | null {
  const e = expansionSourceSpan(raw, ctx);
  return e && spanSame(e.span, beat.span)
    ? e
    : mechanismIssue(ctx, 'this fact must retain its own complete source beat clause');
}
function condition(raw: unknown, e: ExpansionSourceEvidence, ctx: ParseContext): string | null {
  const value = expansionSourceLabel(raw, e, ctx, EXPANSION_LIMITS.qualifier);
  return value && /^(?:if|unless|when|provided that|assuming)\s+/i.test(value) && !numeric(value)
    ? value
    : mechanismIssue(
        ctx,
        'retain a complete local condition; numerical limits need named exact quantity operands',
      );
}
function status(
  raw: Rec,
  e: ExpansionSourceEvidence,
  ctx: ParseContext,
  requireCondition = false,
): ExpansionHistoryTwinStatus | null {
  const c = raw.condition === undefined ? undefined : condition(raw.condition, e, ctx);
  if (c === null || (requireCondition && !c))
    return mechanismIssue(ctx, 'this source fact requires its own explicit condition');
  if (raw.state === 'known' && raw.qualification === undefined && c === undefined)
    return { state: 'known' };
  if (raw.state === 'conditional' && raw.qualification === undefined && c)
    return { state: 'conditional', condition: c };
  const q = expansionSourceLabel(raw.qualification, e, ctx, EXPANSION_LIMITS.qualifier);
  if (!q) return null;
  if (
    (raw.state === 'unknown' || raw.state === 'missing' || raw.state === 'disputed') &&
    same(q, raw.state)
  )
    return { state: raw.state, qualification: q, ...(c ? { condition: c } : {}) };
  if (
    (raw.state === 'simulated' && /^(?:simulated|simulation)$/i.test(q)) ||
    (raw.state === 'illustrative' && /^(?:illustrative|teaching example)$/i.test(q))
  )
    return { state: raw.state, qualification: q, ...(c ? { condition: c } : {}) };
  return mechanismIssue(
    ctx,
    'known, conditional, simulated, illustrative and unknown/missing/disputed source states stay distinct',
  );
}
function absent(
  s: ExpansionHistoryTwinStatus,
): s is Extract<ExpansionHistoryTwinStatus, { state: 'unknown' | 'missing' | 'disputed' }> {
  return s.state === 'unknown' || s.state === 'missing' || s.state === 'disputed';
}
function teaching(s: { state: string }): boolean {
  return s.state === 'simulated' || s.state === 'illustrative';
}
function qualified(body: string, s: ExpansionHistoryTwinStatus): string {
  return s.state === 'simulated' || s.state === 'illustrative'
    ? `(?:in\\s+this|in\\s+the)\\s+${literal(s.qualification)},\\s*${body}`
    : body;
}
function conditionOf(s: ExpansionHistoryTwinStatus): string | undefined {
  return 'condition' in s ? s.condition : undefined;
}
function qualifications(
  raw: Rec,
  facts: readonly { state: string }[],
  result: { state: string },
  ctx: ParseContext,
): boolean {
  if (facts.some(teaching) && raw.evidence !== 'illustrative') {
    mechanismIssue(
      ctx,
      'simulated/illustrative facts must remain visibly illustrative, not measured',
    );
    return false;
  }
  if (
    facts.some(teaching) &&
    !teaching(result) &&
    !['unknown', 'missing', 'disputed'].includes(result.state)
  ) {
    mechanismIssue(
      ctx,
      'a qualified history/twin cannot be promoted to a measured or resolved source result',
    );
    return false;
  }
  return true;
}

/** Local envelope: the shared hybrid envelope allows one blanket condition, but these stories
 * require independent enter/leave or per-view conditions. Never strip conditions to call it. */
function envelope(raw: Rec, ctx: ParseContext, id: '47' | '48', fields: readonly string[]) {
  const entry = expansionEntry(raw.kind, raw.preset);
  if (!entry || entry.id !== id || !onlyFields(raw, [...ENVELOPE_FIELDS, ...fields], ctx))
    return mechanismIssue(
      ctx,
      'use only the exact recognized temporal preset and bounded authored fields',
    );
  const win = ctx.win;
  const duration = win.endTime - win.startTime;
  if (
    !Number.isFinite(win.startTime) ||
    !Number.isFinite(win.endTime) ||
    duration < 5 ||
    duration > 12 ||
    !Number.isSafeInteger(win.startWord) ||
    !Number.isSafeInteger(win.endWord) ||
    win.startWord < 0 ||
    win.endWord < win.startWord ||
    win.endWord >= ctx.words.length ||
    (raw.startWord !== undefined && raw.startWord !== win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((v) => v === raw.layout)) ||
    (raw.continues !== undefined && typeof raw.continues !== 'boolean') ||
    (raw.transition !== undefined && !['grow', 'slide', 'fade'].includes(String(raw.transition)))
  )
    return mechanismIssue(
      ctx,
      'retain the complete finite 5–12s source window and offered envelope',
    );
  if (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid')
    return mechanismIssue(ctx, 'visualMode must be exactly diagram or hybrid');
  if (raw.evidence !== 'source-stated' && raw.evidence !== 'illustrative')
    return mechanismIssue(ctx, 'evidence must be source-stated or illustrative');
  let previous = -Infinity;
  for (let i = win.startWord; i <= win.endWord; i++) {
    const w = ctx.words[i];
    if (
      !w ||
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.end <= w.start ||
      w.start < win.startTime ||
      w.end > win.endTime ||
      w.start < previous - 1e-7
    )
      return mechanismIssue(
        ctx,
        'all words must be finite, positive, non-overlapping (1e-7) and inside the window',
      );
    previous = w.end;
  }
  if (
    ctx.words[win.startWord].start < win.startTime + 0.25 - 1e-7 ||
    ctx.words[win.endWord].end > win.endTime - 0.35 + 1e-7
  )
    return mechanismIssue(ctx, 'source speech must retain the 0.25s lead-in and 0.35s tail');
  const clauses: ExpansionSourceEvidence[] = [];
  let from = win.startWord;
  for (let i = from; i <= win.endWord; i++) {
    if (/[.!?;][”"’')\]]*$/.test(ctx.words[i].text) || i === win.endWord) {
      const e = expansionSourceSpan({ fromWord: from, toWord: i }, ctx);
      if (!e) return null;
      clauses.push(e);
      from = i + 1;
    }
  }
  const locals = WORD_FIELDS.map((field) => {
    const index = ctx.inWin(raw[field]);
    return clauses.find((e) => e.span.fromWord === index);
  });
  const [setup, action, response, check, resolve] = locals;
  if (
    !setup ||
    !action ||
    !response ||
    !check ||
    !resolve ||
    new Set(locals).size !== 5 ||
    setup !== clauses[0] ||
    resolve !== clauses.at(-1)
  )
    return mechanismIssue(
      ctx,
      'five distinct complete source-clause starts must own the full story',
    );
  const times = strictMechanismBeats(raw, ctx, WORD_FIELDS, [1, 1, 1, 1], 0.8);
  if (!times || times.some((t) => t < win.startTime || t > win.endTime)) return null;
  if (times.some((t, i) => i > 0 && t - times[i - 1] < 1) || win.endTime - times[4] < 0.8)
    return mechanismIssue(
      ctx,
      'temporal stories require strict one-second beat gaps and a full 0.8s final hold',
    );
  const label = expansionSourceLabel(raw.label, setup, ctx, 48);
  const subject = expansionSourceLabel(raw.subject, setup, ctx, 34);
  const outcome = expansionSourceLabel(raw.outcome, resolve, ctx, 54);
  const scope = expansionSourceLabel(raw.scope, setup, ctx, EXPANSION_LIMITS.population);
  const period = expansionSourceLabel(raw.period, setup, ctx, EXPANSION_LIMITS.period);
  const entities = expansionEntities(raw.entities, ctx, id);
  const actor = entities ? ref(raw.actor, entities, ctx) : null;
  if (
    !label ||
    !subject ||
    !outcome ||
    !scope ||
    !period ||
    !entities ||
    !actor ||
    !same(subject, actor.label) ||
    entities.some((e) => !spanSame(e.evidence, setup.span))
  )
    return mechanismIssue(
      ctx,
      'introduce this same actor and all entities in their exact source scope/period',
    );
  const [setupAt, actionAt, responseAt, checkAt, resolveAt] = times;
  const story: ExpansionStoryBase = {
    storyId: id,
    visualMode: raw.visualMode,
    evidence: raw.evidence,
    label,
    subject,
    outcome,
    setupAt,
    actionAt,
    responseAt,
    checkAt,
    resolveAt,
  };
  return {
    story,
    scope,
    period,
    entities,
    actor,
    clauses,
    beats: { setup, action, response, check, resolve },
  };
}
function partition(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  actor: ExpansionEntity,
  ctx: ParseContext,
): [ExpansionEntity, ExpansionEntity] | null {
  if (!Array.isArray(raw) || raw.length !== 2 || entities.length !== 3)
    return mechanismIssue(
      ctx,
      'this authored template has one subject and two distinct named states/views, within the eight-entity ceiling',
    );
  const a = ref(raw[0], entities, ctx),
    b = ref(raw[1], entities, ctx);
  return a && b && a.id !== b.id && a.id !== actor.id && b.id !== actor.id
    ? [a, b]
    : mechanismIssue(ctx, 'states/views and the actual subject must be distinct declared entities');
}
function covered(
  clauses: readonly ExpansionSourceEvidence[],
  evidence: readonly ExpansionSourceEvidence['span'][],
  ctx: ParseContext,
): boolean {
  if (clauses.some((e) => !evidence.some((s) => spanSame(e.span, s)))) {
    mechanismIssue(
      ctx,
      'retain every supplied source clause; no omitted history, controls, unknowns or numeric operands',
    );
    return false;
  }
  return true;
}
function quantity(
  raw: unknown,
  actor: ExpansionEntity,
  scope: string,
  period: string,
  ctx: ParseContext,
): ExpansionQuantity | null {
  const q = parseExpansionQuantity(raw, ctx);
  if (
    !q ||
    !same(q.actor, actor.label) ||
    !same(q.basis.population, scope) ||
    !same(q.basis.period, period)
  )
    return mechanismIssue(
      ctx,
      'quantity must bind this same subject, claim, source unit, period and population',
    );
  if (
    ['count', 'ratio', 'percent', 'percentage-point', 'percent-change'].includes(q.basis.unit) &&
    !q.basis.denominator
  )
    return mechanismIssue(ctx, 'counts/proportions retain an explicit positive source denominator');
  return q;
}

/** Raw47: template:'two-state-history', entities, actor, states:[from,to], scope,period;
 * rules:[{role:'enter'|'leave',actor,from,to,state,condition,qualification?,threshold?,evidence}];
 * thresholds:[{role,quantity}], history:[{actor,dataTime,state,value?,condition?,qualification?,evidence}],
 * result:{actor,claim:'current state',state,value?,condition?,qualification?,evidence}.
 * Thresholds are optional named source operands, never inferred from history or execution. */
export function parseExpansionHysteresis(
  raw: Rec,
  ctx: ParseContext,
): ExpansionHysteresisScene | null {
  const base = envelope(raw, ctx, '47', ['states', 'rules', 'thresholds', 'history', 'result']);
  if (!base) return null;
  const { story, actor, entities, scope, period, beats, clauses } = base;
  const states = partition(raw.states, entities, actor, ctx);
  if (raw.template !== 'two-state-history' || !states)
    return mechanismIssue(ctx, 'hysteresis accepts only the authored two-state-history template');
  if (
    !clause(
      beats.setup,
      context(
        `${literal(story.label)}\\s+(?:tracks|records)\\s+${literal(actor.label)}\\s+(?:with\\s+)?states\\s+${list(states.map((v) => v.label))}`,
        scope,
        period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must actually introduce this subject and its two supplied states',
    );
  if (
    !Array.isArray(raw.rules) ||
    raw.rules.length !== 2 ||
    !Array.isArray(raw.thresholds) ||
    raw.thresholds.length > 2 ||
    !Array.isArray(raw.history) ||
    !raw.history.length ||
    raw.history.length + raw.thresholds.length + 3 > EXPANSION_LIMITS.records ||
    2 + 2 * raw.history.length > EXPANSION_LIMITS.relations
  )
    return mechanismIssue(
      ctx,
      'supply enter/leave rules and retained history within twelve records and sixteen relations',
    );
  const thresholds: ExpansionHysteresisScene['thresholds'][number][] = [];
  for (const r of raw.thresholds) {
    if (
      !isRec(r) ||
      !onlyFields(r, ['role', 'quantity'], ctx) ||
      (r.role !== 'enter' && r.role !== 'leave')
    )
      return null;
    const q = quantity(r.quantity, actor, scope, period, ctx);
    if (
      !q ||
      !same(q.claim, `${r.role} threshold`) ||
      thresholds.some((t) => t.role === r.role) ||
      q.evidence.fromWord <= beats.action.span.toWord ||
      q.evidence.toWord >= beats.check.span.fromWord ||
      spanSame(q.evidence, beats.response.span)
    )
      return mechanismIssue(
        ctx,
        'each threshold is its own supplied actor/role-bound quantity clause, not a new switching limit',
      );
    thresholds.push({ id: `expansion-47-threshold-${r.role}`, role: r.role, quantity: q });
  }
  if (
    thresholds.length === 2 &&
    (thresholds[0].quantity.basis.unit !== thresholds[1].quantity.basis.unit ||
      JSON.stringify(thresholds[0].quantity.basis.denominator) !==
        JSON.stringify(thresholds[1].quantity.basis.denominator))
  )
    return mechanismIssue(
      ctx,
      'enter/leave operands retain identical units and denominator basis; no invented conversion',
    );
  const rules: ExpansionHysteresisRule[] = [];
  for (const [i, r] of raw.rules.entries()) {
    if (
      !isRec(r) ||
      !onlyFields(
        r,
        [
          'role',
          'actor',
          'from',
          'to',
          'state',
          'condition',
          'qualification',
          'threshold',
          'evidence',
        ],
        ctx,
      )
    )
      return null;
    const role = i === 0 ? 'enter' : 'leave';
    const e = local(r.evidence, i === 0 ? beats.action : beats.response, ctx);
    const owner = ref(r.actor, entities, ctx),
      from = ref(r.from, states, ctx),
      to = ref(r.to, states, ctx);
    if (
      !e ||
      !owner ||
      owner.id !== actor.id ||
      !from ||
      !to ||
      from.id === to.id ||
      r.role !== role ||
      (i === 1 && (from.id !== rules[0].toId || to.id !== rules[0].fromId))
    )
      return mechanismIssue(
        ctx,
        'enter and leave must explicitly reverse the same subject’s two named states',
      );
    const s = status(r, e, ctx, true);
    if (
      !s ||
      (s.state !== 'conditional' && s.state !== 'simulated' && s.state !== 'illustrative') ||
      !conditionOf(s)
    )
      return mechanismIssue(
        ctx,
        'rules retain explicit enter/leave conditions, not an asserted switch or unknown execution',
      );
    const c = conditionOf(s) ?? '';
    const t = thresholds.find((v) => v.role === role);
    if (
      (t &&
        (typeof r.threshold !== 'string' ||
          !same(r.threshold, t.quantity.claim) ||
          !expansionSourceLabel(t.quantity.claim, c, ctx, EXPANSION_LIMITS.claim))) ||
      (!t && (r.threshold !== undefined || /\bthreshold\b/i.test(c))) ||
      (t?.quantity.state === 'conditional' && !same(t.quantity.condition, c))
    )
      return mechanismIssue(
        ctx,
        'named switching limits must retain their exact supplied threshold operand and condition',
      );
    const verb = role === 'enter' ? '(?:enters|moves\\s+into)' : '(?:leaves|moves\\s+out\\s+of)';
    const body =
      role === 'enter'
        ? `${literal(actor.label)}\\s+${verb}\\s+${literal(to.label)}\\s+from\\s+${literal(from.label)}`
        : `${literal(actor.label)}\\s+${verb}\\s+${literal(from.label)}\\s+for\\s+${literal(to.label)}`;
    if (!clause(e, qualified(context(body, scope, period), s), c))
      return mechanismIssue(
        ctx,
        'source must assert this exact conditioned enter/leave relation, not merely mention its labels',
      );
    const common = {
      id: `expansion-47-rule-${role}`,
      role,
      actorId: actor.id,
      fromId: from.id,
      toId: to.id,
      condition: c,
      ...(t ? { thresholdId: t.id } : {}),
      evidence: e.span,
    } as const;
    rules.push(
      s.state === 'conditional'
        ? { ...common, state: 'conditional' }
        : { ...common, state: s.state, qualification: s.qualification },
    );
  }
  const history: ExpansionRetainedHistory[] = [];
  let previous = -1;
  for (const [i, r] of raw.history.entries()) {
    if (
      !isRec(r) ||
      !onlyFields(
        r,
        ['actor', 'dataTime', 'state', 'value', 'condition', 'qualification', 'evidence'],
        ctx,
      )
    )
      return null;
    const owner = ref(r.actor, entities, ctx),
      e = expansionSourceSpan(r.evidence, ctx);
    if (!owner || owner.id !== actor.id || !e)
      return mechanismIssue(ctx, 'history must belong to this same subject');
    const dataTime = expansionSourceLabel(r.dataTime, e, ctx, EXPANSION_LIMITS.period);
    const s = status(r, e, ctx);
    if (
      !dataTime ||
      !s ||
      e.span.fromWord < beats.check.span.fromWord ||
      e.span.toWord >= beats.resolve.span.fromWord ||
      e.span.fromWord <= previous ||
      history.some((h) => same(h.dataTime, dataTime))
    )
      return mechanismIssue(
        ctx,
        'retain distinct ordered source history records and their represented timestamps',
      );
    const value = absent(s) ? undefined : ref(r.value, states, ctx);
    if ((absent(s) && r.value !== undefined) || (!absent(s) && !value))
      return mechanismIssue(
        ctx,
        'unknown/missing/disputed history has no invented state, zero or erased qualifier',
      );
    const predicate = absent(s)
      ? `(?:is|remains)\\s+${literal(s.qualification)}`
      : `(?:records|recorded)\\s+${literal(value?.label ?? '')}`;
    if (
      !clause(
        e,
        qualified(
          context(
            `${literal(actor.label)}\\s+history\\s+(?:at|from)\\s+${literal(dataTime)}\\s+${predicate}\\s+and\\s+is\\s+retained`,
            scope,
            period,
          ),
          s,
        ),
        conditionOf(s),
      )
    )
      return mechanismIssue(
        ctx,
        'history must be explicitly recorded/unknown and retained in its own source clause',
      );
    const common = {
      id: `expansion-47-history-${i}`,
      actorId: actor.id,
      dataTime,
      retained: true as const,
      evidence: e.span,
    };
    history.push(absent(s) ? { ...common, ...s } : { ...common, ...s, valueId: value?.id ?? '' });
    previous = e.span.toWord;
  }
  if (!spanSame(history[0].evidence, beats.check.span))
    return mechanismIssue(ctx, 'the history check beat must retain actual supplied history');
  if (
    !isRec(raw.result) ||
    !onlyFields(
      raw.result,
      ['actor', 'claim', 'state', 'value', 'condition', 'qualification', 'evidence'],
      ctx,
    )
  )
    return null;
  const r = raw.result,
    re = local(r.evidence, beats.resolve, ctx),
    owner = ref(r.actor, entities, ctx);
  const claim = re ? expansionSourceLabel(r.claim, re, ctx, 28) : null;
  const s = re ? status(r, re, ctx) : null;
  if (!re || !owner || owner.id !== actor.id || !claim || !same(claim, 'current state') || !s)
    return null;
  const value = absent(s) ? undefined : ref(r.value, states, ctx);
  if ((absent(s) && r.value !== undefined) || (!absent(s) && !value))
    return mechanismIssue(
      ctx,
      'current state is supplied separately, never inferred by running hysteresis',
    );
  const outcome = absent(s) ? `remains ${s.qualification}` : `is ${value?.label ?? ''}`;
  if (
    !same(story.outcome, outcome) ||
    !clause(
      re,
      qualified(
        context(
          `${literal(actor.label)}\\s+${literal(claim)}\\s+${literal(outcome)}\\s+and\\s+retains\\s+${list(history.map((h) => h.dataTime))}\\s+history`,
          scope,
          period,
        ),
        s,
      ),
      conditionOf(s),
    )
  )
    return mechanismIssue(
      ctx,
      'the result must retain every source history identity and its own exact state/qualification',
    );
  const common = {
    actorId: actor.id,
    claim,
    retainedHistoryIds: history.map((h) => h.id),
    evidence: re.span,
  };
  const result: ExpansionHysteresisResult = absent(s)
    ? { ...common, ...s }
    : { ...common, ...s, valueId: value?.id ?? '' };
  if (
    !qualifications(
      raw,
      [...rules, ...history, ...thresholds.map((t) => t.quantity), result],
      result,
      ctx,
    ) ||
    !covered(
      clauses,
      [
        beats.setup.span,
        ...rules.map((v) => v.evidence),
        ...history.map((v) => v.evidence),
        ...thresholds.map((v) => v.quantity.evidence),
        re.span,
      ],
      ctx,
    )
  )
    return null;
  return {
    ...story,
    storyId: '47',
    kind: 'state-transition',
    preset: 'hysteresis',
    template: 'two-state-history',
    entities,
    actorId: actor.id,
    stateIds: [states[0].id, states[1].id],
    scope,
    period,
    rules: [rules[0], rules[1]],
    thresholds,
    history,
    result,
  };
}

/** Raw48: template:'same-subject-pair', entities,actor,views:[left,right],scope,period;
 * snapshots:[{actor,view,claim,dataTime,controls:label[],state,value?,condition,qualification?,evidence}];
 * quantities:[{view,quantity}] (optional exact supplied control quantities);
 * alignment:{actor,left,right,evidence}, result:{actor,claim:'state comparison',state,result?,condition?,qualification?,evidence}.
 * Qualitative states and exact supplied controls only; no numeric comparison output is derived. */
export function parseExpansionAlignedStateComparison(
  raw: Rec,
  ctx: ParseContext,
): ExpansionAlignedStateComparisonScene | null {
  const base = envelope(raw, ctx, '48', [
    'views',
    'snapshots',
    'quantities',
    'alignment',
    'result',
  ]);
  if (!base) return null;
  const { story, actor, entities, scope, period, beats, clauses } = base;
  const views = partition(raw.views, entities, actor, ctx);
  if (raw.template !== 'same-subject-pair' || !views)
    return mechanismIssue(
      ctx,
      'aligned comparison accepts only the authored same-subject-pair template, not the legacy conveyor gate',
    );
  if (
    !clause(
      beats.setup,
      context(
        `${literal(story.label)}\\s+(?:compares|aligns|reviews)\\s+${list(views.map((v) => v.label))}\\s+states\\s+of\\s+${literal(actor.label)}`,
        scope,
        period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must introduce two representations of the same actual source subject',
    );
  if (
    !Array.isArray(raw.snapshots) ||
    raw.snapshots.length !== 2 ||
    !Array.isArray(raw.quantities) ||
    raw.quantities.length + 4 > EXPANSION_LIMITS.records ||
    raw.quantities.length + 6 > EXPANSION_LIMITS.relations
  )
    return mechanismIssue(
      ctx,
      'two supplied snapshots plus alignment/result/controls stay within twelve records and sixteen relations',
    );
  const snapshots: ExpansionAlignedSnapshot[] = [];
  for (const [i, r] of raw.snapshots.entries()) {
    if (
      !isRec(r) ||
      !onlyFields(
        r,
        [
          'actor',
          'view',
          'claim',
          'dataTime',
          'controls',
          'state',
          'value',
          'condition',
          'qualification',
          'evidence',
        ],
        ctx,
      )
    )
      return null;
    const e = local(r.evidence, i === 0 ? beats.action : beats.response, ctx);
    const owner = ref(r.actor, entities, ctx),
      view = ref(r.view, views, ctx);
    if (!e || !owner || owner.id !== actor.id || !view || view.id !== views[i].id)
      return mechanismIssue(
        ctx,
        'both representations must preserve the same subject and their declared view identities',
      );
    const claim = expansionSourceLabel(r.claim, e, ctx, 28),
      dataTime = expansionSourceLabel(r.dataTime, e, ctx, EXPANSION_LIMITS.period);
    const s = status(r, e, ctx, true),
      c = s ? conditionOf(s) : undefined;
    if (
      !claim ||
      !dataTime ||
      !s ||
      !c ||
      numeric(claim) ||
      !Array.isArray(r.controls) ||
      !r.controls.length ||
      r.controls.length > 4
    )
      return mechanismIssue(
        ctx,
        'each snapshot retains its own bounded claim, condition, source data time and one to four controls',
      );
    const controls: string[] = [];
    for (const v of r.controls) {
      const control = expansionSourceLabel(v, e, ctx, 28);
      if (!control || numeric(control) || controls.some((p) => same(p, control)))
        return mechanismIssue(
          ctx,
          'controls are distinct local source labels; numeric controls require exact named quantity operands',
        );
      controls.push(control);
    }
    const value = absent(s) ? undefined : expansionSourceLabel(r.value, e, ctx, 28);
    if ((absent(s) && r.value !== undefined) || (!absent(s) && (!value || numeric(value))))
      return mechanismIssue(
        ctx,
        'supplied qualitative states are not numbers; unknown/missing/disputed has no fabricated state',
      );
    const predicate = absent(s)
      ? `(?:is|remains)\\s+${literal(s.qualification)}`
      : `(?:is|was)\\s+${literal(value ?? '')}`;
    if (
      !clause(
        e,
        qualified(
          context(
            `${literal(actor.label)}\\s+${literal(view.label)}\\s+${literal(claim)}\\s+${predicate}\\s+(?:at|from)\\s+${literal(dataTime)}\\s+under\\s+${list(controls)}`,
            scope,
            period,
          ),
          s,
        ),
        c,
      )
    )
      return mechanismIssue(
        ctx,
        'snapshot must bind this actor/view/claim/state/time and all source controls in one complete conditioned clause',
      );
    const common = {
      id: `expansion-48-snapshot-${i}`,
      actorId: actor.id,
      viewId: view.id,
      claim,
      dataTime,
      controls,
      condition: c,
      evidence: e.span,
    };
    if (absent(s)) snapshots.push({ ...common, ...s });
    else if (s.state === 'conditional' || s.state === 'simulated' || s.state === 'illustrative')
      snapshots.push({ ...common, ...s, condition: c, value: value ?? '' });
    else
      return mechanismIssue(
        ctx,
        'a conditioned or simulated snapshot cannot become an unqualified measured state',
      );
  }
  if (!same(snapshots[0].claim, snapshots[1].claim))
    return mechanismIssue(
      ctx,
      'aligned states must compare the same supplied claim, not unrelated properties',
    );
  const quantities: ExpansionAlignedStateComparisonScene['quantities'][number][] = [];
  for (const [i, r] of raw.quantities.entries()) {
    if (!isRec(r) || !onlyFields(r, ['view', 'quantity'], ctx)) return null;
    const view = ref(r.view, views, ctx),
      q = quantity(r.quantity, actor, scope, period, ctx);
    const j = views.findIndex((v) => v.id === view?.id),
      snapshot = snapshots[j];
    const next = j === 0 ? beats.response : beats.check;
    if (
      !view ||
      !q ||
      !snapshot?.controls.some((v) => same(v, q.claim)) ||
      q.evidence.fromWord <= snapshot.evidence.toWord ||
      q.evidence.toWord >= next.span.fromWord ||
      (q.state === 'conditional' && !same(q.condition, snapshot.condition)) ||
      quantities.some((v) => v.viewId === view.id && same(v.quantity.claim, q.claim))
    )
      return mechanismIssue(
        ctx,
        'a numeric control belongs to its own view, same subject/claim/basis and local source condition; no invented state outputs',
      );
    quantities.push({ id: `expansion-48-control-${i}`, viewId: view.id, quantity: q });
  }
  if (
    !isRec(raw.alignment) ||
    !onlyFields(raw.alignment, ['actor', 'left', 'right', 'evidence'], ctx)
  )
    return null;
  const a = raw.alignment,
    ae = local(a.evidence, beats.check, ctx);
  const owner = ref(a.actor, entities, ctx),
    left = ref(a.left, views, ctx),
    right = ref(a.right, views, ctx);
  if (
    !ae ||
    !owner ||
    owner.id !== actor.id ||
    left?.id !== views[0].id ||
    right?.id !== views[1].id ||
    !clause(
      ae,
      context(
        `${literal(story.label)}\\s+(?:aligns|pairs)\\s+${list(views.map((v) => v.label))}\\s+for\\s+the\\s+same\\s+${literal(actor.label)}\\s+and\\s+(?:retains|keeps)\\s+source\\s+controls`,
        scope,
        period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'alignment must explicitly pair these same-subject views and retain their source controls',
    );
  if (
    !isRec(raw.result) ||
    !onlyFields(
      raw.result,
      ['actor', 'claim', 'state', 'result', 'condition', 'qualification', 'evidence'],
      ctx,
    )
  )
    return null;
  const r = raw.result,
    re = local(r.evidence, beats.resolve, ctx),
    resultActor = ref(r.actor, entities, ctx);
  const claim = re ? expansionSourceLabel(r.claim, re, ctx, 28) : null;
  const s = re ? status(r, re, ctx) : null;
  if (
    !re ||
    !resultActor ||
    resultActor.id !== actor.id ||
    !claim ||
    !same(claim, 'state comparison') ||
    !s
  )
    return null;
  if (
    (absent(s) && r.result !== undefined) ||
    (!absent(s) && r.result !== 'same' && r.result !== 'different')
  )
    return mechanismIssue(
      ctx,
      'comparison result must be expressly supplied same/different or unresolved; no numeric delta or inferred winner',
    );
  if (
    !absent(s) &&
    !teaching(s) &&
    snapshots.some((v) => v.state === 'conditional') &&
    (s.state !== 'conditional' || snapshots.some((v) => !same(v.condition, conditionOf(s) ?? '')))
  )
    return mechanismIssue(
      ctx,
      'resolved conditional comparisons must retain both views’ exact source condition',
    );
  const outcome = absent(s) ? `remains ${s.qualification}` : `is ${String(r.result)}`;
  if (
    !same(story.outcome, outcome) ||
    !clause(
      re,
      qualified(
        context(
          `${literal(actor.label)}\\s+${literal(claim)}\\s+${literal(outcome)}\\s+and\\s+(?:retains|keeps)\\s+qualified\\s+states`,
          scope,
          period,
        ),
        s,
      ),
      conditionOf(s),
    )
  )
    return mechanismIssue(
      ctx,
      'result and its qualifier must be independently source-stated, retaining qualified states rather than forecasting',
    );
  const snapshotIds: [string, string] = [snapshots[0].id, snapshots[1].id];
  const common = { actorId: actor.id, claim, snapshotIds, evidence: re.span };
  const result: ExpansionAlignedComparisonResult = absent(s)
    ? { ...common, ...s }
    : { ...common, ...s, result: r.result as 'same' | 'different' };
  if (
    !qualifications(
      raw,
      [...snapshots, ...quantities.map((v) => v.quantity), result],
      result,
      ctx,
    ) ||
    !covered(
      clauses,
      [
        beats.setup.span,
        ...snapshots.map((v) => v.evidence),
        ...quantities.map((v) => v.quantity.evidence),
        ae.span,
        re.span,
      ],
      ctx,
    )
  )
    return null;
  return {
    ...story,
    storyId: '48',
    kind: 'digital-twin',
    preset: 'aligned-state-comparison',
    template: 'same-subject-pair',
    entities,
    actorId: actor.id,
    viewIds: [views[0].id, views[1].id],
    scope,
    period,
    snapshots: [snapshots[0], snapshots[1]],
    quantities,
    alignment: {
      actorId: actor.id,
      viewIds: [views[0].id, views[1].id],
      retainsSourceControls: true,
      evidence: ae.span,
    },
    result,
  };
}
