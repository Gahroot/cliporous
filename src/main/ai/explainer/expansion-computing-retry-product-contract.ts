/** STEP16: no derivations, execution, inferred deduplication, or branded/live UI. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionRetryProductScene,
  RetryProductRecord,
  RetryProductRelation,
  RetryProductRole,
  RetryProductState,
} from '../../remotion/compositions/explainer/expansion/computing/retry-product-types';
import type { ExpansionQuantity } from '../../remotion/compositions/explainer/expansion/value-types';
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
const BEATS = PHASES.map((p) => `${p}Word`);
const STATES: readonly RetryProductState[] = [
  'stated',
  'unknown',
  'missing',
  'disputed',
  'conditional',
  'simulated',
  'illustrative',
];
const VERBS: Record<RetryProductRole, string> = {
  request: '(?:identifies|names)',
  attempt: '(?:attempts|tries)',
  effect: '(?:reports|describes)',
  condition: '(?:requires|specifies)',
  result: '(?:reports|describes)',
  form: '(?:presents|shows)',
  field: '(?:supplies|provides)',
  action: '(?:performs|carries out)',
};
function safe(text: string): boolean {
  return (
    !/[<>`{}[\]\\()]|=>|\w+:|www\.|\b(?:function|eval|password|secret|token|account)\b|\S+\.(?:html|svg|png|js|tsx)|(?:^|\s)\//i.test(
      text,
    ) && ![...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}
function same(a: ExpansionSourceEvidence, b: ExpansionSourceEvidence): boolean {
  return a.span.fromWord === b.span.fromWord && a.span.toWord === b.span.toWord;
}
function parse(raw: Rec, ctx: ParseContext, id: '67' | '68'): ExpansionRetryProductScene | null {
  const fail = (message: string) => mechanismIssue(ctx, message);
  if (!isRec(raw)) return fail('complete retry/product object required');
  const entry = expansionEntry(raw.kind, raw.preset);
  const template = id === '67' ? 'request-attempts' : 'neutral-form';
  if (
    entry?.id !== id ||
    raw.template !== template ||
    !onlyFields(
      raw,
      [
        'kind',
        'preset',
        'template',
        'visualMode',
        'evidence',
        'label',
        'subject',
        'outcome',
        'startWord',
        'endWord',
        'layout',
        'entities',
        'actor',
        'identity',
        'scope',
        'period',
        'records',
        'relations',
        'quantities',
        ...BEATS,
      ],
      ctx,
    )
  )
    return fail('exact kind/preset/authored template and closed source-only fields required');
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
    raw.evidence !== 'source-stated' ||
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid') ||
    (raw.startWord !== undefined && raw.startWord !== win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((l) => l === raw.layout))
  )
    return fail('finite complete 5–12s source-stated window, mode and offered layout required');
  for (let i = win.startWord; i <= win.endWord; i++) {
    const w = words[i];
    if (
      !w?.text.trim() ||
      !safe(w.text) ||
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.end <= w.start ||
      w.start < win.startTime ||
      w.end > win.endTime ||
      (i > win.startWord && w.start < words[i - 1].end - 1e-7)
    )
      return fail('finite positive words, nonoverlap within 1e-7 and safe plain source required');
  }
  if (
    words[win.startWord].start - win.startTime < 0.25 ||
    win.endTime - words[win.endWord].end < 0.35 - 1e-7
  )
    return fail('retain .25s lead-in and .35s tail padding');
  const clauses: ExpansionSourceEvidence[] = [];
  for (let fromWord = win.startWord; fromWord <= win.endWord; ) {
    let toWord = fromWord;
    while (toWord < win.endWord && !/[.!?;]$/.test(words[toWord].text)) toWord++;
    if (!/[.!?;]$/.test(words[toWord].text)) return fail('retain complete source clauses');
    const source = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!source) return null;
    clauses.push(source);
    fromWord = toWord + 1;
    if (clauses.length > 17) return fail('source clause capacity exceeded');
  }
  const beats: ExpansionSourceEvidence[] = [];
  for (const field of BEATS) {
    const source = clauses.find((c) => c.span.fromWord === ctx.inWin(raw[field]));
    if (!source) return fail('five beats must begin distinct complete clauses');
    beats.push(source);
  }
  const times = strictMechanismBeats(raw, ctx, BEATS, [1, 1, 1, 1], 0.8);
  if (
    !times ||
    times.some((t, i) => i > 0 && t - times[i - 1] < 1) ||
    win.endTime - times[4] < 0.8 ||
    beats[0].span.fromWord !== win.startWord ||
    beats[4].span.toWord !== win.endWord
  )
    return fail('full-window five distinct beats, strict 1s gaps and .8s hold required');
  const quote = (value: unknown, source: ExpansionSourceEvidence, max = 64) => {
    const text = expansionSourceLabel(value, source, ctx, max);
    return text && safe(text) ? text : fail('bounded local plain source labels required');
  };
  const label = quote(raw.label, beats[0], 48),
    subject = quote(raw.subject, beats[0], 34),
    outcome = quote(raw.outcome, beats[4], 54);
  const scope = quote(raw.scope, beats[0], 48),
    period = quote(raw.period, beats[0], 40);
  const entities = expansionEntities(raw.entities, ctx, id);
  if (
    !label ||
    !subject ||
    !outcome ||
    !scope ||
    !period ||
    !entities ||
    entities.some((e) => !safe(e.label))
  )
    return fail('complete locally bound labels and up to eight identities required');
  const actor = entities.find((e) => e.label === raw.actor),
    identity = entities.find((e) => e.label === raw.identity);
  if (
    !actor ||
    !identity ||
    actor.id === identity.id ||
    entities.length !== 2 ||
    subject !== identity.label
  )
    return fail(
      'distinct exact actor and request/form identity labels required; no IDs or unused actors',
    );
  if (
    !Array.isArray(raw.records) ||
    raw.records.length !== 5 ||
    !Array.isArray(raw.relations) ||
    raw.relations.length > 5 ||
    !Array.isArray(raw.quantities) ||
    raw.quantities.length > 7
  )
    return fail('authored lower caps: five records, five provenance relations, seven quantities');
  const roles: RetryProductRole[] =
    id === '67'
      ? ['request', 'attempt', 'effect', 'condition', 'result']
      : ['form', 'field', 'action', 'condition', 'result'];
  const records: RetryProductRecord[] = [];
  for (const [i, value] of raw.records.entries()) {
    if (
      !isRec(value) ||
      !onlyFields(
        value,
        [
          'actor',
          'identity',
          'role',
          'claim',
          'value',
          'state',
          'scope',
          'period',
          'condition',
          'qualifier',
          'shape',
          'evidence',
        ],
        ctx,
      )
    )
      return fail('closed complete source record required');
    const source = expansionSourceSpan(value.evidence, ctx);
    if (
      !source ||
      !same(source, beats[i]) ||
      value.actor !== actor.label ||
      value.identity !== identity.label ||
      value.scope !== scope ||
      value.period !== period ||
      value.role !== roles[i] ||
      !STATES.includes(value.state as RetryProductState)
    )
      return fail(
        'retain actor/request identity, role, scope, period, state and exact phase evidence',
      );
    const claim = quote(value.claim, source, 48),
      exact = quote(value.value, source, 64);
    const state = value.state as RetryProductState;
    const condition =
      value.condition === undefined ? undefined : quote(value.condition, source, 64);
    const qualifier =
      value.qualifier === undefined ? undefined : quote(value.qualifier, source, 48);
    if (
      !claim ||
      !exact ||
      condition === null ||
      qualifier === null ||
      (state === 'conditional') !== (condition !== undefined) ||
      (condition && !/^(?:if|unless|when|provided that|assuming)\s+\S/i.test(condition)) ||
      (state === 'simulated' || state === 'illustrative') !== (qualifier !== undefined)
    )
      return fail(
        'conditional/simulated/illustrative qualifiers must remain explicit and distinct',
      );
    if (
      id === '67'
        ? value.shape !== undefined
        : typeof value.shape !== 'string' ||
          !['form', 'table', 'task', 'result'].includes(value.shape)
    )
      return fail(
        'retry has no UI shape; product uses only original form/table/task/result shapes',
      );
    const shape = id === '68' ? ` on a ${literal(String(value.shape))}` : '';
    const prefix = qualifier ? `In ${literal(qualifier)}, ` : '';
    const suffix = condition ? ` ${literal(condition)}` : '';
    const pattern = `^${prefix}${literal(actor.label)} ${VERBS[roles[i]]} ${literal(claim)} on ${literal(identity.label)}${shape} as ${literal(exact)} with ${state} state for ${literal(scope)} during ${literal(period)}${suffix}[.;]$`;
    if (
      !new RegExp(pattern, 'iu').test(source.text) ||
      (source.text.match(/\b(?:if|unless|when|provided that|assuming)\b/gi)?.length ?? 0) !==
        (condition ? 1 : 0)
    )
      return fail(
        'complete source assertion must bind actor, claim, identity, value, state, condition, scope and period; no inferred effects or UI actions',
      );
    records.push({
      id: `expansion-${id}-record-${i}`,
      actorId: actor.id,
      identityId: identity.id,
      role: roles[i],
      claim,
      value: exact,
      state,
      scope,
      period,
      evidence: source.span,
      ...(condition ? { condition } : {}),
      ...(qualifier ? { qualifier } : {}),
      ...(id === '68' ? { shape: value.shape as RetryProductRecord['shape'] } : {}),
    });
  }
  if (outcome !== records[4].value || label !== records[0].claim)
    return fail('setup label and final result must retain exact source fact values');
  const relations: RetryProductRelation[] = [];
  for (const [i, value] of raw.relations.entries()) {
    if (
      !isRec(value) ||
      !onlyFields(value, ['from', 'to', 'role', 'evidence'], ctx) ||
      value.from !== actor.label ||
      value.to !== identity.label ||
      value.role !== 'provenance'
    )
      return fail(
        'only source actor-to-identity provenance, never invented deduplication or success edges',
      );
    const evidence = expansionSourceSpan(value.evidence, ctx);
    if (
      !evidence ||
      !beats.some((b) => same(b, evidence)) ||
      relations.some((r) => r.evidence.fromWord === evidence.span.fromWord)
    )
      return fail('unique complete provenance evidence required');
    relations.push({
      id: `expansion-${id}-relation-${i}`,
      fromId: actor.id,
      toId: identity.id,
      role: 'provenance',
      evidence: evidence.span,
    });
  }
  const quantities: ExpansionQuantity[] = [];
  for (const value of raw.quantities) {
    const quantity = parseExpansionQuantity(value, ctx);
    if (
      !quantity ||
      quantity.actor !== actor.label ||
      quantity.basis.population !== scope ||
      quantity.basis.period !== period ||
      quantities.some((q) => q.evidence.fromWord === quantity.evidence.fromWord) ||
      beats.some((b) => b.span.fromWord === quantity.evidence.fromWord)
    )
      return fail(
        'quantities need independent source clauses and identical actor/unit/basis/scope/period; derivations NONE',
      );
    quantities.push(quantity);
  }
  if (clauses.length !== 5 + quantities.length)
    return fail('every source clause must retain its complete supplied fact');
  const base = {
    storyId: id,
    visualMode: raw.visualMode as 'diagram' | 'hybrid',
    evidence: 'source-stated' as const,
    label,
    subject,
    outcome,
    setupAt: times[0],
    actionAt: times[1],
    responseAt: times[2],
    checkAt: times[3],
    resolveAt: times[4],
    entities,
    records,
    relations,
    quantities,
    sourceSpans: {
      setup: beats[0].span,
      action: beats[1].span,
      response: beats[2].span,
      check: beats[3].span,
      resolve: beats[4].span,
    },
  };
  return id === '67'
    ? {
        ...base,
        storyId: '67',
        kind: 'agent-workflow',
        preset: 'idempotent-retry',
        template: 'request-attempts',
      }
    : {
        ...base,
        storyId: '68',
        kind: 'product-walkthrough',
        preset: 'form-result',
        template: 'neutral-form',
      };
}
export function parseExpansionIdempotentRetry(
  raw: Rec,
  ctx: ParseContext,
): ExpansionRetryProductScene | null {
  return parse(raw, ctx, '67');
}
export function parseExpansionProductWalkthrough(
  raw: Rec,
  ctx: ParseContext,
): ExpansionRetryProductScene | null {
  return parse(raw, ctx, '68');
}
