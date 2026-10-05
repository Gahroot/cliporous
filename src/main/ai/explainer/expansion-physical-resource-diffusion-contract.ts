/** STEP17: bounded stock/request and qualitative material facts; never computed outcomes. */

import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionResourceDiffusionRecord,
  ExpansionResourceDiffusionScene,
} from '../../remotion/compositions/explainer/expansion/physical/resource-diffusion-types';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
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

const WORDS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'];
function literal(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}
function matches(e: ExpansionSourceEvidence, body: string): boolean {
  return (
    !/[<>`]|(?:https?|file|data|javascript):|www\.|\b(?:fetch|eval|exec|require)\s*\(/i.test(
      e.text,
    ) && new RegExp(`^(?:${body})[.;]$`, 'iu').test(e.text)
  );
}
function spanEqual(
  a: { fromWord: number; toWord: number },
  b: { fromWord: number; toWord: number },
): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function sourceAt(raw: Rec, field: string, ctx: ParseContext): ExpansionSourceEvidence | null {
  const from = ctx.inWin(raw[field]);
  if (from === null) return mechanismIssue(ctx, 'beats must start complete source clauses');
  let to = from;
  while (to < ctx.win.endWord && !/[.!?;][”"’')\]]*$/.test(ctx.words[to].text)) to++;
  return expansionSourceSpan({ fromWord: from, toWord: to }, ctx);
}
function parse(
  raw: Rec,
  ctx: ParseContext,
  id: '75' | '76',
): ExpansionResourceDiffusionScene | null {
  const fail = (message: string) => mechanismIssue(ctx, message);
  const entry = expansionEntry(raw.kind, raw.preset);
  if (
    !entry ||
    entry.id !== id ||
    !onlyFields(
      raw,
      [
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
        'resource',
        'requester',
        'material',
        'reservoir',
        'filter',
        'model',
        'access',
        'decision',
        'movement',
        'filterRule',
        'result',
        'population',
        'period',
        'template',
        'records',
        ...WORDS,
      ],
      ctx,
    )
  )
    return fail(
      'use only the recognized preset and authored source fields; no blanket condition or treatment',
    );
  if (
    (raw.startWord !== undefined && raw.startWord !== ctx.win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== ctx.win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((layout) => layout === raw.layout)) ||
    (raw.continues !== undefined && typeof raw.continues !== 'boolean') ||
    (raw.transition !== undefined &&
      (typeof raw.transition !== 'string' || !['grow', 'slide', 'fade'].includes(raw.transition)))
  )
    return fail('retain the complete source envelope and offered layout/transition');
  if (raw.evidence !== 'source-stated' && raw.evidence !== 'illustrative')
    return fail('evidence must retain source-stated or illustrative qualification');
  if (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid')
    return fail('use diagram or hybrid only');
  const w = ctx.win;
  const duration = w.endTime - w.startTime;
  if (
    !Number.isFinite(w.startTime) ||
    !Number.isFinite(w.endTime) ||
    duration < 5 ||
    duration > 12 ||
    !Number.isSafeInteger(w.startWord) ||
    !Number.isSafeInteger(w.endWord) ||
    w.startWord < 0 ||
    w.endWord >= ctx.words.length ||
    w.startWord > w.endWord
  )
    return fail('retain a finite complete 5–12s window');
  let previous = -Infinity;
  for (let i = w.startWord; i <= w.endWord; i++) {
    const word = ctx.words[i];
    if (
      !word ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.end <= word.start ||
      word.start < w.startTime ||
      word.end > w.endTime ||
      word.start < previous - 1e-7
    )
      return fail('all source words need finite positive non-overlapping intervals (1e-7)');
    previous = word.end;
  }
  if (
    ctx.words[w.startWord].start < w.startTime + 0.25 - 1e-7 ||
    previous > w.endTime - 0.35 + 1e-7
  )
    return fail('preserve 0.25s lead-in and 0.35s tail');
  const times = strictMechanismBeats(raw, ctx, WORDS, [1, 1, 1, 1], 0.8);
  if (!times || times.some((t, i) => i > 0 && t - times[i - 1] < 1) || w.endTime - times[4] < 0.8)
    return fail('five distinct beats need one-second gaps and 0.8s final hold');
  const locals = WORDS.map((field) => sourceAt(raw, field, ctx));
  if (locals.some((e) => !e)) return null;
  const [setup, action, response, check, resolve] = locals as ExpansionSourceEvidence[];
  if (
    setup.span.fromWord !== w.startWord ||
    resolve.span.toWord !== w.endWord ||
    locals.some((e, i) => i > 0 && e?.span.fromWord !== (locals[i - 1]?.span.toWord ?? -2) + 1)
  )
    return fail('exactly five complete contiguous clauses own this authored template');
  const label = expansionSourceLabel(raw.label, setup, ctx, 48);
  const subject = expansionSourceLabel(raw.subject, setup, ctx, 34);
  const outcome = expansionSourceLabel(raw.outcome, resolve, ctx, 54);
  if (!label || !subject || !outcome)
    return fail('labels must quote their own setup or resolve clause');
  const [setupAt, actionAt, responseAt, checkAt, resolveAt] = times;
  const story: Omit<ExpansionStoryBase, 'storyId'> = {
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
  const entities = expansionEntities(raw.entities, ctx, id);
  const period = expansionSourceLabel(raw.period, setup, ctx, 32);
  const population = expansionSourceLabel(raw.population, setup, ctx, 40);
  if (
    !entities ||
    entities.length !== (id === '75' ? 2 : 3) ||
    !period ||
    !population ||
    entities.some((e) => !spanEqual(e.evidence, setup.span))
  )
    return fail(
      'authored lower cap: two resource actors or three material actors, all locally introduced',
    );
  const entity = (field: string, index: number) =>
    raw[field] === entities[index].label ? entities[index] : null;
  const quantity = (
    value: unknown,
    clause: ExpansionSourceEvidence,
    actor: string,
    claim: string,
  ) => {
    const q = parseExpansionQuantity(value, ctx);
    if (
      !q ||
      !spanEqual(q.evidence, clause.span) ||
      q.actor !== actor ||
      q.claim !== claim ||
      q.basis.period !== period ||
      q.basis.population !== population ||
      !q.basis.denominator
    )
      return fail(
        'quantities must bind exact actor/claim/unit/period/population/denominator locally',
      );
    if ((q.state === 'simulated' || q.state === 'illustrative') && raw.evidence !== 'illustrative')
      return fail('supplied teaching quantities cannot become measured truth');
    const amounts = 'amount' in q ? [q.amount] : 'alternatives' in q ? q.alternatives : [];
    if (amounts.some((a) => a.kind !== 'rational' || a.value.numerator < 0))
      return fail('this template accepts nonnegative stock/request quantities only');
    return q;
  };
  if (!Array.isArray(raw.records) || raw.records.length !== (id === '75' ? 2 : 1))
    return fail(
      'exactly two resource records or one supplied material inventory; never numerical simulation output',
    );
  const records: ExpansionResourceDiffusionRecord[] = [];
  const record = (
    index: number,
    actorId: string,
    actor: string,
    role: 'limit' | 'request' | 'inventory',
    clause: ExpansionSourceEvidence,
  ) => {
    const v = (raw.records as unknown[])[index];
    if (
      !isRec(v) ||
      !onlyFields(v, ['actor', 'role', 'quantity'], ctx) ||
      v.actor !== actor ||
      v.role !== role
    )
      return fail('record actor and claim role must be authored, with no caller IDs');
    const q = quantity(
      v.quantity,
      clause,
      actor,
      role === 'request' ? `${entities[0].label} request` : role,
    );
    if (!q) return null;
    records.push({ id: `expansion-${id}-record-${index}`, actorId, role, quantity: q });
    return q;
  };
  if (id === '75') {
    if (
      ['material', 'reservoir', 'filter', 'model', 'movement', 'filterRule', 'result'].some(
        (f) => raw[f] !== undefined,
      )
    )
      return fail('material facts do not belong to the resource template');
    const resource = entity('resource', 0);
    const requester = entity('requester', 1);
    if (!resource || !requester || subject !== resource.label || raw.template !== 'single-request')
      return fail('use the authored single-request template and resource/requester identities');
    if (
      !matches(
        setup,
        `${literal(resource.label)}\\s+(?:is shared with|is available to)\\s+${literal(requester.label)}\\s+(?:during|in)\\s+${literal(period)}\\s+(?:among|for)\\s+${literal(population)}`,
      )
    )
      return fail('setup must explicitly introduce this shared resource and requester in scope');
    const limit = record(0, resource.id, resource.label, 'limit', action);
    const request = record(1, requester.id, requester.label, 'request', response);
    if (!limit || !request) return null;
    if (JSON.stringify(limit.basis) !== JSON.stringify(request.basis))
      return fail(
        'limit and request need identical unit, period, population and denominator; no conversion',
      );
    if (!isRec(raw.access) || !onlyFields(raw.access, ['condition', 'evidence'], ctx))
      return fail('access requires an explicitly sourced condition');
    const accessEvidence = expansionSourceSpan(raw.access.evidence, ctx);
    const condition = expansionSourceLabel(raw.access.condition, check, ctx, 48);
    if (
      !accessEvidence ||
      !spanEqual(accessEvidence.span, check.span) ||
      !condition ||
      !/^if [\p{L}][\p{L} -]{1,40}$/u.test(condition) ||
      !matches(
        check,
        `${literal(requester.label)}\\s+(?:has access to|can access)\\s+${literal(resource.label)}\\s+only\\s+${literal(condition)}\\s+(?:during|in)\\s+${literal(period)}\\s+(?:among|for)\\s+${literal(population)}`,
      )
    )
      return fail('access must bind requester/resource and the complete only-if condition');
    if (
      !isRec(raw.decision) ||
      !onlyFields(raw.decision, ['state', 'result', 'condition', 'evidence'], ctx)
    )
      return fail('decision must be supplied, not inferred from capacity or access');
    const decision = raw.decision;
    const evidence = expansionSourceSpan(decision.evidence, ctx);
    const states = [
      'granted',
      'denied',
      'unknown',
      'missing',
      'disputed',
      'conditional',
      'simulated',
      'illustrative',
    ] as const;
    const state = states.find((s) => s === decision.state);
    const result = ['granted', 'denied', 'unresolved'].find((s) => s === decision.result) as
      | 'granted'
      | 'denied'
      | 'unresolved'
      | undefined;
    if (
      !state ||
      !result ||
      decision.condition !== condition ||
      !evidence ||
      !spanEqual(evidence.span, resolve.span)
    )
      return fail('decision retains its actual status/result/access condition locally');
    const unresolved = ['unknown', 'missing', 'disputed'].includes(state);
    if (
      (unresolved && result !== 'unresolved') ||
      (!unresolved && result === 'unresolved') ||
      ((state === 'granted' || state === 'denied') && state !== result)
    )
      return fail('unresolved decisions are not allocations/grants/winners');
    const teaching = state === 'simulated' || state === 'illustrative';
    if (teaching && raw.evidence !== 'illustrative')
      return fail('retain illustrative decision qualification');
    const status = unresolved
      ? `${state} and unresolved`
      : state === 'conditional'
        ? `conditional ${result}`
        : teaching
          ? result
          : state;
    const prefix = teaching ? `In this ${state}, ` : '';
    if (
      !matches(
        resolve,
        `${literal(prefix)}${literal(requester.label)}\\s+${literal(resource.label)}\\s+(?:decision is|decision remains)\\s+${literal(status)}\\s+under\\s+${literal(condition)}\\s+(?:during|in)\\s+${literal(period)}\\s+(?:among|for)\\s+${literal(population)}`,
      )
    )
      return fail(
        'resolve must state exactly this decision/status/result/condition; never infer a grant',
      );
    return {
      ...story,
      storyId: '75',
      kind: 'resource-allocation',
      preset: 'shared-resource',
      template: 'single-request',
      entities,
      period,
      population,
      records,
      resourceId: resource.id,
      requesterId: requester.id,
      access: { condition, evidence: accessEvidence.span },
      decision: { state, result, condition, evidence: evidence.span },
      relations: [
        {
          fromId: requester.id,
          toId: resource.id,
          role: 'access',
          condition,
          evidence: accessEvidence.span,
        },
      ],
    };
  }
  if (['resource', 'requester', 'access', 'decision'].some((f) => raw[f] !== undefined))
    return fail('resource facts do not belong to the material template');
  const material = entity('material', 0);
  const reservoir = entity('reservoir', 1);
  const filter = entity('filter', 2);
  const model = ['supplied', 'illustrative', 'simulated'].find((m) => m === raw.model) as
    | 'supplied'
    | 'illustrative'
    | 'simulated'
    | undefined;
  if (
    !material ||
    !reservoir ||
    !filter ||
    !model ||
    subject !== material.label ||
    raw.template !== 'qualitative-filter' ||
    raw.movement !== 'spreads toward'
  )
    return fail(
      'use the authored qualitative-filter template, movement and material/reservoir/filter identities',
    );
  if (raw.evidence !== (model === 'supplied' ? 'source-stated' : 'illustrative'))
    return fail(
      'retain supplied relation or explicit qualitative illustrative/simulated model qualification',
    );
  const qualification =
    model === 'supplied' ? 'supplied material relation' : `qualitative ${model} model`;
  if (
    !matches(
      setup,
      `(?:In this|Within this)\\s+${literal(qualification)},\\s+${literal(material.label)}\\s+(?:is in|occupies)\\s+${literal(reservoir.label)}\\s+with\\s+${literal(filter.label)}\\s+(?:during|in)\\s+${literal(period)}\\s+(?:among|for)\\s+${literal(population)}`,
    )
  )
    return fail(
      'setup needs the explicit qualitative model or supplied material relation; no medical claims',
    );
  const inventory = record(0, material.id, material.label, 'inventory', action);
  if (!inventory) return null;
  if (!['gram', 'kilogram', 'count'].includes(inventory.basis.unit))
    return fail('only supplied inventory mass/count, never concentration or filter effectiveness');
  if (
    !matches(
      response,
      `${literal(material.label)}\\s+(?:spreads toward|disperses toward)\\s+${literal(filter.label)}\\s+from\\s+${literal(reservoir.label)}\\s+in\\s+this\\s+${literal(qualification)}`,
    )
  )
    return fail('movement needs the same local material/filter/reservoir and model qualification');
  if (
    !isRec(raw.filterRule) ||
    !onlyFields(raw.filterRule, ['relation', 'condition', 'evidence'], ctx)
  )
    return fail('filter relation must be locally supplied and qualitative');
  const rule = raw.filterRule;
  const relation = ['passes', 'retains'].find((s) => s === rule.relation) as
    | 'passes'
    | 'retains'
    | undefined;
  const condition = expansionSourceLabel(rule.condition, check, ctx, 40);
  const ruleEvidence = expansionSourceSpan(rule.evidence, ctx);
  if (
    !relation ||
    !condition ||
    !/^[\p{L}][\p{L} -]{1,38}$/u.test(condition) ||
    !ruleEvidence ||
    !spanEqual(ruleEvidence.span, check.span) ||
    !matches(
      check,
      `${literal(filter.label)}\\s+(?:${relation}|${relation === 'passes' ? 'lets through' : 'holds back'})\\s+${literal(material.label)}\\s+under\\s+${literal(condition)}\\s+in\\s+this\\s+${literal(qualification)}`,
    )
  )
    return fail(
      'filter must bind the same filter/material/condition/model; no efficiency simulation',
    );
  if (!isRec(raw.result) || !onlyFields(raw.result, ['state', 'relation', 'evidence'], ctx))
    return fail('result must remain a qualitative supplied or unresolved relation');
  const resultEvidence = expansionSourceSpan(raw.result.evidence, ctx);
  const state =
    raw.result.state === 'stated'
      ? 'stated'
      : raw.result.state === 'unresolved'
        ? 'unresolved'
        : null;
  const resultRelation = state === 'stated' ? relation : 'unresolved';
  if (
    !state ||
    raw.result.relation !== resultRelation ||
    !resultEvidence ||
    !spanEqual(resultEvidence.span, resolve.span) ||
    !matches(
      resolve,
      `${literal(material.label)}\\s+${literal(filter.label)}\\s+(?:result is|result remains)\\s+${resultRelation}\\s+under\\s+${literal(condition)}\\s+in\\s+this\\s+${literal(qualification)}`,
    )
  )
    return fail(
      'retain actual qualitative result or unresolved status; no numerical/medical conclusion',
    );
  return {
    ...story,
    storyId: '76',
    kind: 'material-process',
    preset: 'diffusion-filter',
    template: 'qualitative-filter',
    entities,
    period,
    population,
    records,
    materialId: material.id,
    reservoirId: reservoir.id,
    filterId: filter.id,
    model,
    movement: 'spreads toward',
    filter: { relation, condition, evidence: ruleEvidence.span },
    result: { state, relation: resultRelation, evidence: resultEvidence.span },
    relations: [
      { fromId: material.id, toId: filter.id, role: 'flow', evidence: response.span },
      {
        fromId: filter.id,
        toId: material.id,
        role: 'condition',
        condition,
        evidence: ruleEvidence.span,
      },
    ],
  };
}
export function parseExpansionSharedResource(
  raw: Rec,
  ctx: ParseContext,
): Extract<ExpansionResourceDiffusionScene, { storyId: '75' }> | null {
  const scene = parse(raw, ctx, '75');
  return scene?.storyId === '75' ? scene : null;
}
export function parseExpansionDiffusionFilter(
  raw: Rec,
  ctx: ParseContext,
): Extract<ExpansionResourceDiffusionScene, { storyId: '76' }> | null {
  const scene = parse(raw, ctx, '76');
  return scene?.storyId === '76' ? scene : null;
}
