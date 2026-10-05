/** STEP17: explicit supply stages and pay/benefit/effect assertions; derivations NONE. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionSupplyIncentivesScene,
  SupplyIncentivesRecord,
  SupplyIncentivesRelation,
  SupplyIncentivesRole,
  SupplyIncentivesState,
} from '../../remotion/compositions/explainer/expansion/physical/supply-incentives-types';
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
const STATES: readonly SupplyIncentivesState[] = [
  'stated',
  'unknown',
  'missing',
  'disputed',
  'conditional',
  'simulated',
  'illustrative',
];
const VERBS: Record<SupplyIncentivesRole, string> = {
  stage: '(?:identifies|names)',
  inventory: '(?:holds|retains)',
  transfer: '(?:transfers|sends)',
  replacement: '(?:replaces|restocks)',
  exchange: '(?:identifies|names) exchange',
  payment: '(?:pays|provides)',
  benefit: '(?:receives|obtains)',
  'external-effect': '(?:reports|describes) external effect',
  result: '(?:reports|describes)',
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
function parse(
  raw: Rec,
  ctx: ParseContext,
  id: '73' | '74',
): ExpansionSupplyIncentivesScene | null {
  const fail = (message: string) => mechanismIssue(ctx, message);
  if (!isRec(raw)) return fail('complete supply/incentives object required');
  const entry = expansionEntry(raw.kind, raw.preset);
  const template = id === '73' ? 'supply-modules' : 'incentive-board';
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
  const scope = quote(raw.scope, beats[0], 40),
    period = quote(raw.period, beats[0], 32);
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
  if (entities.length < 2 || entities.length > 4)
    return fail('two to four exact source actors required');
  if (
    !Array.isArray(raw.records) ||
    raw.records.length !== 5 ||
    !Array.isArray(raw.relations) ||
    raw.relations.length > 5 ||
    !Array.isArray(raw.quantities) ||
    raw.quantities.length > 7
  )
    return fail('authored lower caps: five records, five explicit relations, seven quantities');
  const roles: SupplyIncentivesRole[] =
    id === '73'
      ? ['stage', 'inventory', 'transfer', 'replacement', 'result']
      : ['exchange', 'payment', 'benefit', 'external-effect', 'result'];
  const records: SupplyIncentivesRecord[] = [];
  for (const [i, value] of raw.records.entries()) {
    if (
      !isRec(value) ||
      !onlyFields(
        value,
        [
          'actor',
          'target',
          'stage',
          'role',
          'claim',
          'value',
          'state',
          'scope',
          'period',
          'condition',
          'qualifier',
          'evidence',
        ],
        ctx,
      )
    )
      return fail('closed complete source record required');
    const actor = entities.find((e) => e.label === value.actor);
    const target = entities.find((e) => e.label === value.target);
    const source = expansionSourceSpan(value.evidence, ctx);
    if (
      !source ||
      !same(source, beats[i]) ||
      !actor ||
      !target ||
      actor.id === target.id ||
      value.scope !== scope ||
      value.period !== period ||
      value.role !== roles[i] ||
      !STATES.includes(value.state as SupplyIncentivesState)
    )
      return fail(
        'retain actor/target/stage identity, role, scope, period, state and exact phase evidence',
      );
    const stage = quote(value.stage, source, 32);
    const claim = quote(value.claim, source, 48),
      exact = quote(value.value, source, 64);
    const state = value.state as SupplyIncentivesState;
    const condition =
      value.condition === undefined ? undefined : quote(value.condition, source, 64);
    const qualifier =
      value.qualifier === undefined ? undefined : quote(value.qualifier, source, 48);
    if (
      !stage ||
      !claim ||
      !exact ||
      /\d|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(exact) ||
      condition === null ||
      qualifier === null ||
      (state === 'conditional') !== (condition !== undefined) ||
      (condition && !/^(?:if|unless|when|provided that|assuming)\s+\S/i.test(condition)) ||
      (state === 'simulated' || state === 'illustrative') !== (qualifier !== undefined)
    )
      return fail(
        'conditional/simulated/illustrative qualifiers must remain explicit and distinct',
      );
    const prefix = qualifier ? `In ${literal(qualifier)}, ` : '';
    const suffix = condition ? ` ${literal(condition)}` : '';
    const pattern = `^${prefix}${literal(actor.label)} ${VERBS[roles[i]]} ${literal(claim)} toward ${literal(target.label)} at stage ${literal(stage)} as ${literal(exact)} with ${state} state for ${literal(scope)} during ${literal(period)}${suffix}[.;]$`;
    if (
      !new RegExp(pattern, 'iu').test(source.text) ||
      (source.text.match(/\b(?:if|unless|when|provided that|assuming)\b/gi)?.length ?? 0) !==
        (condition ? 1 : 0)
    )
      return fail(
        'complete source assertion must bind actor, claim, target, stage, value, state, condition, scope and period; no inferred inventory balance, winners or causal effects',
      );
    records.push({
      id: `expansion-${id}-record-${i}`,
      actorId: actor.id,
      targetId: target.id,
      stage,
      role: roles[i],
      claim,
      value: exact,
      state,
      scope,
      period,
      evidence: source.span,
      ...(condition ? { condition } : {}),
      ...(qualifier ? { qualifier } : {}),
    });
  }
  if (outcome !== records[4].value || label !== records[0].claim)
    return fail('setup label and final result must retain exact source fact values');
  if (
    subject !== records[0].stage ||
    entities.some((e) => !records.some((r) => r.actorId === e.id || r.targetId === e.id))
  )
    return fail('subject must retain setup stage and every actor must be used');
  for (const e of entities) {
    if (
      !records.some(
        (r) =>
          (r.actorId === e.id || r.targetId === e.id) &&
          r.evidence.fromWord === e.evidence.fromWord &&
          r.evidence.toWord === e.evidence.toWord,
      )
    )
      return fail('each actor identity needs a complete locally bound record');
  }
  const relations: SupplyIncentivesRelation[] = [];
  for (const [i, value] of raw.relations.entries()) {
    if (
      !isRec(value) ||
      !onlyFields(value, ['from', 'to', 'role', 'evidence'], ctx) ||
      typeof value.role !== 'string'
    )
      return fail('closed source endpoint relation required');
    const evidence = expansionSourceSpan(value.evidence, ctx);
    const record = records.find(
      (r) =>
        evidence &&
        r.evidence.fromWord === evidence.span.fromWord &&
        r.evidence.toWord === evidence.span.toWord,
    );
    const from = entities.find((e) => e.label === value.from);
    const to = entities.find((e) => e.label === value.to);
    if (
      !evidence ||
      !record ||
      !from ||
      !to ||
      record.actorId !== from.id ||
      record.targetId !== to.id ||
      value.role !== record.role ||
      relations.some((r) => r.evidence.fromWord === evidence.span.fromWord)
    )
      return fail(
        'relations retain exact locally stated direction and role; no inferred causal edges',
      );
    relations.push({
      id: `expansion-${id}-relation-${i}`,
      fromId: from.id,
      toId: to.id,
      role: record.role,
      state: record.state,
      ...(record.condition ? { condition: record.condition } : {}),
      ...(record.qualifier ? { qualifier: record.qualifier } : {}),
      evidence: evidence.span,
    });
  }
  const quantities: ExpansionQuantity[] = [];
  for (const value of raw.quantities) {
    const quantity = parseExpansionQuantity(value, ctx);
    if (
      !quantity ||
      !entities.some((e) => e.label === quantity.actor) ||
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
  return id === '73'
    ? {
        ...base,
        storyId: '73',
        kind: 'inventory-demand',
        preset: 'supply-chain',
        template: 'supply-modules',
      }
    : {
        ...base,
        storyId: '74',
        kind: 'market-exchange',
        preset: 'incentive-externality',
        template: 'incentive-board',
      };
}
export function parseExpansionSupplyChain(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSupplyIncentivesScene | null {
  return parse(raw, ctx, '73');
}
export function parseExpansionIncentiveExternality(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSupplyIncentivesScene | null {
  return parse(raw, ctx, '74');
}
