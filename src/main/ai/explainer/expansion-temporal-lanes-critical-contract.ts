/** Closed, source-grounded task lanes and complete-data critical-path arithmetic. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionEntity,
  ExpansionStoryBase,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import type {
  ExpansionCriticalDependency,
  ExpansionCriticalPathResult,
  ExpansionCriticalPathScene,
  ExpansionCriticalTask,
  ExpansionDerivedTaskSchedule,
  ExpansionKnownTaskDuration,
  ExpansionLaneRelation,
  ExpansionLaneResult,
  ExpansionLaneTask,
  ExpansionParallelLanesScene,
  ExpansionScheduleBasis,
  ExpansionTaskDuration,
  ExpansionTemporalFact,
} from '../../remotion/compositions/explainer/expansion/temporal/lanes-critical-types';
import {
  add,
  compare,
  compatibleBasis,
  isDerivationAllowed,
  subtract,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  type ExpansionRational,
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

const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const FACT = ['actor', 'claim', 'scope', 'period', 'evidence'] as const;
const ZERO: ExpansionRational = { numerator: 0, denominator: 1 };
function normal(text: string): string {
  return text.normalize('NFKC').replace(/’/g, "'").replace(/−/g, '-').replace(/\s+/g, ' ').trim();
}
function literal(text: string): string {
  return normal(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function safe(text: string): boolean {
  return (
    !/[<>`{}[\]\\()]|=>|\b(?:https?|ftp|file|data|javascript):|www\.|\b(?:function|eval)\b|(?:^|\s)(?:\.{0,2}\/|~\/)\S+|\S+\.(?:svg|html|js|tsx|png|mp4)\b/i.test(
      text,
    ) && ![...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function phrase(
  raw: unknown,
  source: ExpansionSourceEvidence,
  ctx: ParseContext,
  max = 96,
): string | null {
  const value = expansionSourceLabel(raw, source, ctx, max);
  return value && safe(value)
    ? value
    : mechanismIssue(ctx, 'task labels must be bounded plain local source text');
}
function names(labels: readonly string[]): string {
  if (labels.length === 1) return literal(labels[0]);
  if (labels.length === 2) return `${literal(labels[0])}\\s+and\\s+${literal(labels[1])}`;
  return `${labels.slice(0, -1).map(literal).join(',\\s*')},?\\s+and\\s+${literal(labels[labels.length - 1])}`;
}
function scoped(body: string, scope: string, period: string): string {
  const context = `(?:for|within)\\s+${literal(scope)}\\s+(?:during|in)\\s+${literal(period)}`;
  return `(?:${body}\\s+${context}|${context},\\s*${body})`;
}
/** Authored whole-clause grammar. Literal slots are escaped, never evaluated. */
function clause(source: ExpansionSourceEvidence, body: string, condition?: string): boolean {
  if (!safe(source.text)) return false;
  const text = normal(source.text).replace(/[.;]$/, '');
  const markers = [...text.matchAll(/\b(?:if|unless|when|provided that|assuming)\b/gi)];
  if (markers.length !== (condition === undefined ? 0 : 1)) return false;
  const full = condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
  return new RegExp(`^(?:${full})$`, 'iu').test(text);
}
interface Base {
  story: ExpansionStoryBase;
  actor: ExpansionEntity;
  entities: ExpansionEntity[];
  scope: string;
  period: string;
  setup: ExpansionSourceEvidence;
  resolve: ExpansionSourceEvidence;
  taskEntities: ExpansionEntity[];
}
function envelope(raw: Rec, ctx: ParseContext, id: '41' | '42'): Base | null {
  if (
    !isRec(raw) ||
    !onlyFields(
      raw,
      [
        'kind',
        'preset',
        'visualMode',
        'template',
        'label',
        'subject',
        'outcome',
        'evidence',
        'startWord',
        'endWord',
        'layout',
        'actor',
        'scope',
        'period',
        'entities',
        'tasks',
        'relations',
        'result',
        ...(id === '42' ? ['basis'] : []),
        ...BEATS,
      ],
      ctx,
    )
  )
    return mechanismIssue(ctx, 'closed temporal proposal required');
  if (
    raw.template !== (id === '41' ? 'task-lanes' : 'dependency-schedule') ||
    (id === '42' && raw.relations !== undefined)
  )
    return mechanismIssue(
      ctx,
      'use the authored template; critical edges come only from complete prerequisite lists',
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
    win.endWord >= ctx.words.length ||
    win.endWord < win.startWord
  )
    return mechanismIssue(ctx, 'temporal stories need a finite complete 5–12s source window');
  const words = ctx.words.slice(win.startWord, win.endWord + 1);
  if (
    words.some(
      (w, i) =>
        !safe(w.text) ||
        !Number.isFinite(w.start) ||
        !Number.isFinite(w.end) ||
        w.end <= w.start ||
        w.start < win.startTime ||
        w.end > win.endTime ||
        (i > 0 && w.start < words[i - 1].end - 1e-7),
    ) ||
    words[0].start < win.startTime + 0.25 - 1e-7 ||
    words[words.length - 1].end > win.endTime - 0.35 + 1e-7
  )
    return mechanismIssue(
      ctx,
      'all words need positive finite non-overlapping intervals and production lead/tail padding',
    );
  const clauses: ExpansionSourceEvidence[] = [];
  for (let fromWord = win.startWord; fromWord <= win.endWord; ) {
    let toWord = fromWord;
    while (toWord < win.endWord && !/[.!?;][”"’')\]]*$/.test(ctx.words[toWord].text)) toWord++;
    if (!/[.!?;][”"’')\]]*$/.test(ctx.words[toWord].text))
      return mechanismIssue(ctx, 'source clauses must be complete');
    const evidence = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!evidence) return null;
    clauses.push(evidence);
    fromWord = toWord + 1;
  }
  const beatClauses = BEATS.map((field) => clauses.find((c) => c.span.fromWord === raw[field]));
  if (
    beatClauses.some((c) => !c) ||
    new Set(beatClauses).size !== 5 ||
    beatClauses[0]?.span.fromWord !== win.startWord ||
    beatClauses[4]?.span.toWord !== win.endWord
  )
    return mechanismIssue(ctx, 'five distinct complete clauses must anchor setup through resolve');
  const times = strictMechanismBeats(raw, ctx, BEATS, [1, 1, 1, 1], 0.8);
  const setup = beatClauses[0],
    resolve = beatClauses[4];
  if (!times || !setup || !resolve) return null;
  // expansionStoryBase delegates to hybridStory's single blanket condition.
  // Here each quantity/relation owns its complete condition, not the entire story.
  const entry = expansionEntry(raw.kind, raw.preset);
  if (
    !entry ||
    entry.id !== id ||
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid') ||
    raw.evidence !== 'source-stated' ||
    (raw.startWord !== undefined && raw.startWord !== win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((layout) => layout === raw.layout))
  )
    return mechanismIssue(
      ctx,
      'exact preset, source-stated mode and complete offered envelope required',
    );
  const label = phrase(raw.label, setup, ctx, 48),
    subject = phrase(raw.subject, setup, ctx, 34),
    outcome = phrase(raw.outcome, resolve, ctx, 54);
  if (!label || !subject || !outcome) return null;
  const story: ExpansionStoryBase = {
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
  };
  const entities = expansionEntities(raw.entities, ctx, id);
  const actor = entities?.find((e) => e.label === raw.actor);
  const scope = phrase(raw.scope, setup, ctx, EXPANSION_LIMITS.population);
  const period = phrase(raw.period, setup, ctx, EXPANSION_LIMITS.period);
  if (
    !entities ||
    !actor ||
    !scope ||
    !period ||
    raw.subject !== actor.label ||
    entities.some(
      (e) =>
        !safe(e.label) ||
        e.evidence.fromWord !== setup.span.fromWord ||
        e.evidence.toWord !== setup.span.toWord,
    )
  )
    return mechanismIssue(ctx, 'actor, task identities, scope and period must all belong to setup');
  if (
    !Array.isArray(raw.tasks) ||
    raw.tasks.length < (id === '41' ? 2 : 1) ||
    raw.tasks.length > EXPANSION_LIMITS.records ||
    raw.tasks.length + 1 > EXPANSION_LIMITS.actors
  )
    return mechanismIssue(ctx, 'at most eight named entities and twelve task records are allowed');
  const taskEntities: ExpansionEntity[] = [];
  for (const task of raw.tasks) {
    const entity = isRec(task) ? entities.find((e) => e.label === task.task) : undefined;
    if (!entity || entity.id === actor.id || taskEntities.includes(entity))
      return mechanismIssue(ctx, 'tasks must reference distinct declared labels, never caller IDs');
    taskEntities.push(entity);
  }
  if (
    entities.length !== taskEntities.length + 1 ||
    !clause(
      setup,
      scoped(
        `${literal(actor.label)}\\s+(?:lists|records)\\s+${names(taskEntities.map((e) => e.label))}\\s+as\\s+${id === '42' ? 'all\\s+' : ''}tasks`,
        scope,
        period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must explicitly enumerate these tasks; critical-path setup must enumerate ALL tasks',
    );
  return {
    story,
    actor,
    entities,
    scope,
    period,
    setup,
    resolve,
    taskEntities,
  };
}
function fact(
  raw: Rec,
  base: Base,
  ctx: ParseContext,
): { fact: ExpansionTemporalFact; source: ExpansionSourceEvidence } | null {
  const source = expansionSourceSpan(raw.evidence, ctx);
  if (!source) return null;
  const actor = phrase(raw.actor, source, ctx, EXPANSION_LIMITS.actorLabel);
  const claim = phrase(raw.claim, source, ctx);
  const scope = phrase(raw.scope, source, ctx, EXPANSION_LIMITS.population);
  const period = phrase(raw.period, source, ctx, EXPANSION_LIMITS.period);
  if (actor !== base.actor.label || !claim || scope !== base.scope || period !== base.period)
    return mechanismIssue(ctx, 'every fact must retain its local actor, claim, scope and period');
  return { fact: { actorId: base.actor.id, claim, scope, period, evidence: source.span }, source };
}
function duration(
  raw: unknown,
  task: ExpansionEntity,
  base: Base,
  ctx: ParseContext,
): ExpansionTaskDuration | null {
  const quantity = parseExpansionQuantity(raw, ctx);
  if (
    !quantity ||
    quantity.actor !== base.actor.label ||
    quantity.claim !== `${task.label} duration` ||
    quantity.basis.period !== base.period ||
    quantity.basis.population !== base.scope ||
    quantity.basis.denominator !== undefined ||
    !['second', 'minute', 'hour', 'day'].includes(quantity.basis.unit)
  )
    return mechanismIssue(
      ctx,
      'duration must bind this actor/task, explicit time unit, period and population',
    );
  const amounts =
    quantity.state === 'disputed'
      ? quantity.alternatives
      : 'amount' in quantity
        ? [quantity.amount]
        : [];
  if (amounts.some((a) => a.kind !== 'rational' || a.value.numerator < 0))
    return mechanismIssue(ctx, 'task durations must be exact nonnegative time quantities');
  return quantity as ExpansionTaskDuration;
}
function condition(
  raw: Rec,
  source: ExpansionSourceEvidence,
  ctx: ParseContext,
): string | undefined | null {
  if (raw.state !== 'conditional')
    return raw.condition === undefined
      ? undefined
      : mechanismIssue(ctx, 'nonconditional facts cannot carry a hidden condition');
  const value = phrase(raw.condition, source, ctx);
  return value && /^(?:if|unless|when|provided that|assuming)\s+\S/i.test(value)
    ? value
    : mechanismIssue(ctx, 'retain the complete explicit source condition');
}
function relation(
  raw: unknown,
  base: Base,
  tasks: readonly ExpansionLaneTask[],
  ctx: ParseContext,
  index: number,
): ExpansionLaneRelation | null {
  if (!isRec(raw) || !onlyFields(raw, [...FACT, 'type', 'from', 'to', 'state', 'condition'], ctx))
    return null;
  const input = fact(raw, base, ctx);
  const from = base.taskEntities.findIndex((e) => e.label === raw.from);
  const to = base.taskEntities.findIndex((e) => e.label === raw.to);
  if (
    !input ||
    from < 0 ||
    to < 0 ||
    from === to ||
    (raw.type !== 'concurrent' && raw.type !== 'before') ||
    !['known', 'conditional', 'unknown', 'missing', 'disputed'].includes(String(raw.state))
  )
    return mechanismIssue(
      ctx,
      'lane relations require distinct source tasks and explicit typed status',
    );
  const cond = condition(raw, input.source, ctx);
  if (cond === null) return null;
  const asserted = raw.state === 'known' || raw.state === 'conditional';
  const claim = asserted
    ? raw.type === 'concurrent'
      ? 'runs concurrently with'
      : 'runs before'
    : raw.type === 'concurrent'
      ? 'concurrency'
      : 'order';
  const body = asserted
    ? `${literal(base.actor.label)}\\s+(?:states|reports|records)\\s+${literal(String(raw.from))}\\s+${literal(claim)}\\s+${literal(String(raw.to))}`
    : `${literal(base.actor.label)}\\s+(?:states|reports|records)\\s+${claim}\\s+from\\s+${literal(String(raw.from))}\\s+to\\s+${literal(String(raw.to))}\\s+is\\s+${literal(String(raw.state))}`;
  if (raw.claim !== claim || !clause(input.source, scoped(body, base.scope, base.period), cond))
    return mechanismIssue(
      ctx,
      'concurrency/order/status must be explicitly asserted in this whole local clause',
    );
  const status =
    raw.state === 'conditional' && cond
      ? { state: 'conditional' as const, condition: cond }
      : { state: raw.state as 'known' | 'unknown' | 'missing' | 'disputed' };
  return {
    ...input.fact,
    ...status,
    id: `expansion-41-relation-${index}`,
    type: raw.type,
    fromId: tasks[from].id,
    toId: tasks[to].id,
  };
}

export function parseExpansionParallelLanes(
  raw: Rec,
  ctx: ParseContext,
): ExpansionParallelLanesScene | null {
  const base = envelope(raw, ctx, '41');
  if (!base) return null;
  const tasks: ExpansionLaneTask[] = [];
  for (const [i, entry] of (raw.tasks as Rec[]).entries()) {
    if (!isRec(entry) || !onlyFields(entry, ['task', 'duration'], ctx)) return null;
    const supplied =
      entry.duration === undefined
        ? undefined
        : duration(entry.duration, base.taskEntities[i], base, ctx);
    if (supplied === null) return null;
    tasks.push({
      id: `expansion-41-task-${i}`,
      entityId: base.taskEntities[i].id,
      ...(supplied ? { duration: supplied } : {}),
    });
  }
  if (!Array.isArray(raw.relations) || raw.relations.length > EXPANSION_LIMITS.relations)
    return mechanismIssue(
      ctx,
      'lanes need an explicit relation list of at most sixteen records, possibly empty',
    );
  const relations: ExpansionLaneRelation[] = [];
  for (const [i, value] of raw.relations.entries()) {
    const parsed = relation(value, base, tasks, ctx, i);
    if (!parsed) return null;
    if (
      relations.some(
        (r) =>
          r.type === parsed.type &&
          ((r.fromId === parsed.fromId && r.toId === parsed.toId) ||
            (r.type === 'concurrent' && r.fromId === parsed.toId && r.toId === parsed.fromId)),
      )
    )
      return mechanismIssue(ctx, 'duplicate relation assertions are not separate facts');
    relations.push(parsed);
  }
  if (
    tasks.some(
      (t) =>
        (!t.duration || t.duration.state === 'unknown' || t.duration.state === 'missing') &&
        !relations.some(
          (r) =>
            r.type === 'concurrent' &&
            (r.state === 'known' || r.state === 'conditional') &&
            (r.fromId === t.id || r.toId === t.id),
        ),
    )
  )
    return mechanismIssue(
      ctx,
      'each lane needs a supplied duration or explicit qualitative concurrency; absence is never zero',
    );
  if (!isRec(raw.result) || !onlyFields(raw.result, [...FACT, 'state', 'condition'], ctx))
    return null;
  const input = fact(raw.result, base, ctx);
  if (
    !input ||
    input.fact.claim !== 'task result' ||
    input.source.span.fromWord !== base.resolve.span.fromWord ||
    !['complete', 'unresolved', 'unknown', 'missing', 'disputed', 'conditional'].includes(
      String(raw.result.state),
    ) ||
    raw.outcome !== raw.result.state
  )
    return mechanismIssue(ctx, 'lane result must retain the final explicit source state');
  const cond = condition(raw.result, input.source, ctx);
  if (
    cond === null ||
    !clause(
      input.source,
      scoped(
        `${literal(base.actor.label)}\\s+(?:reports|states|records)\\s+task\\s+result\\s+is\\s+${literal(String(raw.result.state))}`,
        base.scope,
        base.period,
      ),
      cond,
    )
  )
    return mechanismIssue(ctx, 'do not infer task completion or discard a result condition');
  const result: ExpansionLaneResult =
    raw.result.state === 'conditional' && cond
      ? { ...input.fact, id: 'expansion-41-result', state: 'conditional', condition: cond }
      : {
          ...input.fact,
          id: 'expansion-41-result',
          state: raw.result.state as 'complete' | 'unresolved' | 'unknown' | 'missing' | 'disputed',
        };
  return {
    ...base.story,
    kind: 'temporal-structure',
    storyId: '41',
    preset: 'parallel-lanes',
    template: 'task-lanes',
    actorId: base.actor.id,
    scope: base.scope,
    period: base.period,
    entities: base.entities,
    tasks,
    relations,
    result,
  };
}

/** Bounded topological order; edges are supplied prerequisite facts, never inferred order. */
function topological(tasks: readonly ExpansionCriticalTask[]): ExpansionCriticalTask[] | null {
  const pending = [...tasks],
    ordered: ExpansionCriticalTask[] = [];
  while (pending.length) {
    const index = pending.findIndex((t) =>
      t.prerequisites.prerequisiteIds.every((id) => ordered.some((p) => p.id === id)),
    );
    if (index < 0) return null;
    ordered.push(...pending.splice(index, 1));
  }
  return ordered;
}
function derive(
  tasks: readonly ExpansionCriticalTask[],
  relations: readonly ExpansionCriticalDependency[],
  basis: ExpansionScheduleBasis,
  request: ExpansionTemporalFact,
  ctx: ParseContext,
): ExpansionCriticalPathResult | null {
  const ordered = topological(tasks);
  if (!ordered) return mechanismIssue(ctx, 'critical-path dependencies must be acyclic');
  const finish = new Map<string, ExpansionRational>(),
    start = new Map<string, ExpansionRational>();
  const pathCounts = new Map<string, number>();
  let total = ZERO;
  for (const task of ordered) {
    let earliest = ZERO;
    for (const id of task.prerequisites.prerequisiteIds) {
      const value = finish.get(id);
      if (!value) return mechanismIssue(ctx, 'incomplete prerequisite operands');
      const ordering = compare(value, earliest);
      if (!ordering.ok) return mechanismIssue(ctx, 'exact duration comparison overflow');
      if (ordering.value > 0) earliest = value;
    }
    const sum = add(earliest, task.duration.amount.value);
    if (!sum.ok) return mechanismIssue(ctx, 'critical-path schedule overflow');
    start.set(task.id, earliest);
    finish.set(task.id, sum.value);
    const ordering = compare(sum.value, total);
    if (!ordering.ok) return mechanismIssue(ctx, 'exact duration comparison failed');
    if (ordering.value > 0) total = sum.value;
    let count = task.prerequisites.prerequisiteIds.length ? 0 : 1;
    for (const id of task.prerequisites.prerequisiteIds) {
      const value = finish.get(id);
      const equal = value ? compare(value, earliest) : null;
      if (!equal?.ok) return mechanismIssue(ctx, 'incomplete path-count operands');
      if (equal.value === 0) count += pathCounts.get(id) ?? 0;
    }
    pathCounts.set(task.id, count);
  }
  const latest = new Map<string, ExpansionRational>();
  const schedule = new Map<string, ExpansionDerivedTaskSchedule>();
  let pathCount = 0;
  for (const task of [...ordered].reverse()) {
    const successors = relations.filter((r) => r.fromId === task.id);
    let latestFinish = total;
    for (const successor of successors) {
      const value = latest.get(successor.toId);
      const ordering = value ? compare(value, latestFinish) : null;
      if (!value || !ordering?.ok) return mechanismIssue(ctx, 'incomplete latest-start operands');
      if (ordering.value < 0) latestFinish = value;
    }
    const earliestStart = start.get(task.id),
      earliestFinish = finish.get(task.id);
    const latestStart = subtract(latestFinish, task.duration.amount.value);
    if (!earliestStart || !earliestFinish || !latestStart.ok)
      return mechanismIssue(ctx, 'latest schedule overflow');
    const slack = subtract(latestStart.value, earliestStart);
    if (!slack.ok || slack.value.numerator < 0)
      return mechanismIssue(ctx, 'invalid exact schedule slack');
    latest.set(task.id, latestStart.value);
    schedule.set(task.id, {
      taskId: task.id,
      state: 'derived',
      earliestStart,
      earliestFinish,
      latestStart: latestStart.value,
      latestFinish,
      slack: slack.value,
    });
    if (!successors.length) {
      const equal = compare(earliestFinish, total);
      if (!equal.ok) return mechanismIssue(ctx, 'sink comparison failed');
      if (equal.value === 0) pathCount += pathCounts.get(task.id) ?? 0;
    }
  }
  if (!Number.isSafeInteger(pathCount) || pathCount < 1 || pathCount > 128)
    return mechanismIssue(ctx, 'bounded critical-path count exceeded');
  const schedules = tasks.map((t) => schedule.get(t.id));
  if (schedules.some((s) => !s)) return mechanismIssue(ctx, 'incomplete derived schedule');
  const complete = schedules as ExpansionDerivedTaskSchedule[];
  const criticalTaskIds = complete.filter((s) => s.slack.numerator === 0).map((s) => s.taskId);
  const criticalRelationIds = relations
    .filter((r) => {
      if (!criticalTaskIds.includes(r.fromId) || !criticalTaskIds.includes(r.toId)) return false;
      const left = finish.get(r.fromId),
        right = start.get(r.toId);
      const equal = left && right ? compare(left, right) : null;
      return equal?.ok && equal.value === 0;
    })
    .map((r) => r.id);
  return {
    ...request,
    id: 'expansion-42-result',
    state: 'derived',
    operation: 'critical-path',
    basis: tasks[0].duration.basis,
    scheduleBasis: basis,
    operands: tasks.map((t) => ({
      taskId: t.id,
      duration: t.duration,
      prerequisites: t.prerequisites,
    })),
    duration: total,
    schedule: complete,
    criticalTaskIds,
    criticalRelationIds,
    criticalPathCount: pathCount,
    pathMultiplicity: pathCount === 1 ? 'unique' : 'tied',
  };
}

export function parseExpansionCriticalPath(
  raw: Rec,
  ctx: ParseContext,
): ExpansionCriticalPathScene | null {
  const base = envelope(raw, ctx, '42');
  if (!base || !isDerivationAllowed('42', 'critical-path'))
    return mechanismIssue(ctx, 'critical-path derivation requires its explicit story whitelist');
  const tasks: ExpansionCriticalTask[] = [],
    relations: ExpansionCriticalDependency[] = [];
  for (const [i, entry] of (raw.tasks as Rec[]).entries()) {
    if (!isRec(entry) || !onlyFields(entry, ['task', 'duration', 'prerequisites'], ctx))
      return null;
    const value = duration(entry.duration, base.taskEntities[i], base, ctx);
    if (!value || value.state !== 'known' || value.amount.kind !== 'rational')
      return mechanismIssue(
        ctx,
        'critical-path requires COMPLETE known durations, never conditional/disputed/unknown teaching values',
      );
    if (tasks.length && !compatibleBasis(tasks[0].duration.basis, value.basis))
      return mechanismIssue(
        ctx,
        'critical-path durations must use the same explicit comparable unit/period/population',
      );
    const prereq = entry.prerequisites;
    if (!isRec(prereq) || !onlyFields(prereq, [...FACT, 'state', 'prerequisites'], ctx))
      return null;
    const input = fact(prereq, base, ctx);
    if (
      !input ||
      prereq.state !== 'known' ||
      prereq.claim !== 'prerequisites' ||
      !Array.isArray(prereq.prerequisites) ||
      prereq.prerequisites.length > 7
    )
      return mechanismIssue(
        ctx,
        'each task requires a complete known explicit prerequisite list, including explicit none',
      );
    const indices = prereq.prerequisites.map((label) =>
      base.taskEntities.findIndex((e) => e.label === label),
    );
    if (indices.some((n) => n < 0) || new Set(indices).size !== indices.length)
      return mechanismIssue(ctx, 'prerequisites must reference distinct declared task identities');
    const list = indices.length ? names(indices.map((n) => base.taskEntities[n].label)) : 'none';
    if (
      !clause(
        input.source,
        scoped(
          `${literal(base.actor.label)}\\s+(?:states|reports|records)\\s+${literal(base.taskEntities[i].label)}\\s+prerequisites\\s+are\\s+${list}`,
          base.scope,
          base.period,
        ),
      )
    )
      return mechanismIssue(
        ctx,
        'dependency lists must retain the full explicit source list; absence is not none',
      );
    const taskId = `expansion-42-task-${i}`;
    const prerequisites = {
      ...input.fact,
      claim: 'prerequisites' as const,
      state: 'known' as const,
      taskId,
      prerequisiteIds: indices.map((n) => `expansion-42-task-${n}`),
    };
    tasks.push({
      id: taskId,
      entityId: base.taskEntities[i].id,
      duration: value as ExpansionKnownTaskDuration,
      prerequisites,
    });
    for (const fromId of prerequisites.prerequisiteIds) {
      if (relations.length >= EXPANSION_LIMITS.relations)
        return mechanismIssue(ctx, 'at most sixteen explicit dependencies are allowed');
      relations.push({
        ...input.fact,
        id: `expansion-42-relation-${relations.length}`,
        type: 'dependency',
        state: 'known',
        fromId,
        toId: taskId,
      });
    }
  }
  if (
    !isRec(raw.basis) ||
    !onlyFields(raw.basis, [...FACT, 'state', 'origin', 'policy', 'resourceModel'], ctx)
  )
    return mechanismIssue(ctx, 'complete explicit schedule basis required');
  const suppliedBasis = fact(raw.basis, base, ctx);
  if (
    !suppliedBasis ||
    raw.basis.claim !== 'schedule basis' ||
    raw.basis.state !== 'known' ||
    raw.basis.origin !== 'project start' ||
    raw.basis.policy !== 'earliest-start' ||
    raw.basis.resourceModel !== 'independent' ||
    !clause(
      suppliedBasis.source,
      scoped(
        `${literal(base.actor.label)}\\s+(?:(?:states|reports)\\s+schedule\\s+basis\\s+is|records\\s+schedule\\s+basis\\s+as)\\s+earliest\\s+starts\\s+from\\s+project\\s+start\\s+with\\s+independent\\s+resources`,
        base.scope,
        base.period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'schedule needs explicit known project-start/earliest-start/independent-resource basis',
    );
  const basis: ExpansionScheduleBasis = {
    ...suppliedBasis.fact,
    claim: 'schedule basis',
    state: 'known',
    origin: 'project start',
    policy: 'earliest-start',
    resourceModel: 'independent',
  };
  if (!isRec(raw.result) || !onlyFields(raw.result, [...FACT, 'state', 'operation'], ctx))
    return null;
  const request = fact(raw.result, base, ctx);
  if (
    !request ||
    raw.result.claim !== 'critical path calculation' ||
    raw.result.state !== 'requested' ||
    raw.result.operation !== 'critical-path' ||
    raw.outcome !== 'critical path calculation' ||
    request.source.span.fromWord !== base.resolve.span.fromWord ||
    !clause(
      request.source,
      scoped(
        `${literal(base.actor.label)}\\s+requests\\s+critical\\s+path\\s+calculation`,
        base.scope,
        base.period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'result must request this bounded calculation, not supply a fabricated schedule/winner',
    );
  const result = derive(tasks, relations, basis, request.fact, ctx);
  return result
    ? {
        ...base.story,
        kind: 'temporal-structure',
        storyId: '42',
        preset: 'critical-path',
        template: 'dependency-schedule',
        actorId: base.actor.id,
        scope: base.scope,
        period: base.period,
        entities: base.entities,
        tasks,
        relations,
        basis,
        result,
      }
    : null;
}
