import { businessRecipe } from '../../remotion/compositions/explainer/business/catalog';
import type {
  BusinessIdentity,
  BusinessStory,
  BusinessWordSpan,
  TaskOwnership,
} from '../../remotion/compositions/explainer/business/types';
import { workPresentationFits } from '../../remotion/compositions/explainer/business/work/presentation';
import {
  type BusinessWorkScene,
  type CoordinationMapScene,
  type TaskMapScene,
  WORK_LIMITS,
  type WorkActionState,
  type WorkAllocation,
  type WorkCapability,
  type WorkCapture,
  type WorkComparison,
  type WorkConstraint,
  type WorkHandoff,
  type WorkHold,
  type WorkMeasure,
  type WorkPhase,
  type WorkPlaybookApproval,
  type WorkPlaybookUse,
  type WorkQueue,
  type WorkRedesignScene,
  type WorkReview,
  type WorkSplit,
} from '../../remotion/compositions/explainer/business/work/types';
import {
  boundedBusinessInput,
  businessEvidence,
  businessEvidenceText,
  businessIdentity,
  businessSpan,
  compatibleQuantityBases,
  quantityBasis,
  taskOwnership,
  versionedIdentity,
} from './business-contract';
import { escaped, quantityPattern } from './concept-business-operations-contract';
import { financeClaim, shareCount } from './finance-contract';
import {
  hybridPhrase,
  hybridStory,
  includesPhrase,
  normalizedPhrase,
  onlyFields,
} from './hybrid-contract';
import { isRec, type ParseContext } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const TASK_FIELDS = [
  'kind',
  'preset',
  'visualMode',
  'label',
  'subject',
  'outcome',
  'condition',
  'evidence',
  'startWord',
  'endWord',
  'layout',
  'setupWord',
  'actionWord',
  'responseWord',
  'checkWord',
  'resolveWord',
  'factEvidence',
  'actors',
  'tasks',
  'holds',
];

function identities(
  raw: unknown,
  category: 'actor' | 'task',
  minimum: number,
  ctx: ParseContext,
): BusinessIdentity[] | null {
  if (
    !Array.isArray(raw) ||
    raw.length < minimum ||
    raw.length > (category === 'task' ? WORK_LIMITS.tasks : WORK_LIMITS.entities)
  )
    return mechanismIssue(
      ctx,
      'work identities need a bounded array; split sources with more than four tasks',
    );
  const result: BusinessIdentity[] = [];
  for (const entry of raw) {
    const identity = businessIdentity(entry, ctx);
    if (!identity) return mechanismIssue(ctx, 'each identity needs its own local source evidence');
    if (category === 'task' && !classified(identity, 'task', ctx)) return null;
    result.push(identity);
  }
  return uniqueEntities(result, ctx) ? result : null;
}

/** Classification is explicit source text, never inferred from a job/skill label. */
function classified(
  identity: BusinessIdentity,
  category: 'task' | 'job',
  ctx: ParseContext,
): boolean {
  if (
    financeClaim(
      businessEvidenceText(identity.source, ctx),
      `${escaped(identity.label)} (?:is|remains) (?:a|the) ${category}`,
    )
  )
    return true;
  mechanismIssue(ctx, `the named ${category} must be explicitly identified as a ${category}`);
  return false;
}

function uniqueEntities(entries: readonly BusinessIdentity[], ctx: ParseContext): boolean {
  if (
    entries.length > WORK_LIMITS.entities ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length ||
    new Set(entries.map((entry) => normalizedPhrase(entry.label))).size !== entries.length
  ) {
    mechanismIssue(
      ctx,
      'task-map needs at most eight distinct semantic identities; actors, tasks and job cannot alias',
    );
    return false;
  }
  return true;
}

function phase(raw: unknown, ctx: ParseContext): WorkPhase | null {
  if (!isRec(raw) || !onlyFields(raw, ['label', 'source'], ctx))
    return mechanismIssue(ctx, 'condition needs only a local label and source span');
  const label = hybridPhrase(raw.label, ctx, WORK_LIMITS.phase);
  const source = businessSpan(raw.source, ctx);
  if (!label || !source || !includesPhrase(businessEvidenceText(source, ctx), label))
    return mechanismIssue(ctx, 'condition label must quote its own bounded source span');
  return { label, source };
}

/** Conditional assertions stay conditional; a clock or an omitted field never resolves them. */
function conditionFields(
  raw: unknown,
  state: string,
  source: BusinessWordSpan,
  storyCondition: string | undefined,
  ctx: ParseContext,
): { condition?: WorkPhase } | null {
  const text = businessEvidenceText(source, ctx);
  if (state !== 'conditional') {
    if (raw !== undefined || /\b(?:if|unless|when|provided that|assuming)\b/iu.test(text))
      return mechanismIssue(
        ctx,
        'conditional local evidence cannot become an unconditional capability or hold',
      );
    return {};
  }
  const condition = phase(raw, ctx);
  if (
    !condition ||
    !storyCondition ||
    normalizedPhrase(condition.label) !== normalizedPhrase(storyCondition) ||
    condition.source.fromWord < source.fromWord ||
    condition.source.toWord > source.toWord ||
    !includesPhrase(text, condition.label)
  )
    return mechanismIssue(
      ctx,
      'conditional state must retain the complete source condition within its relationship span',
    );
  return { condition };
}

function localClaim(
  source: BusinessWordSpan,
  pattern: string,
  condition: WorkPhase | undefined,
  ctx: ParseContext,
): boolean {
  return financeClaim(businessEvidenceText(source, ctx), pattern, condition?.label);
}

function holds(
  raw: unknown,
  actors: readonly BusinessIdentity[],
  tasks: readonly BusinessIdentity[],
  storyCondition: string | undefined,
  ctx: ParseContext,
): WorkHold[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 2)
    return mechanismIssue(ctx, 'native work views permit at most two explicit holds');
  const result: WorkHold[] = [];
  for (const entry of raw) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['actorId', 'taskId', 'state', 'source', 'condition'], ctx)
    )
      return mechanismIssue(ctx, 'hold contains unsupported fields');
    const actor = actors.find((candidate) => candidate.id === entry.actorId);
    const task = tasks.find((candidate) => candidate.id === entry.taskId);
    const state = entry.state;
    const source = businessSpan(entry.source, ctx);
    if (
      !actor ||
      !task ||
      !source ||
      (state !== 'pending' && state !== 'denied' && state !== 'unknown' && state !== 'conditional')
    )
      return mechanismIssue(
        ctx,
        'hold must reference an actual actor/task with an explicit unresolved state',
      );
    const extra = conditionFields(entry.condition, state, source, storyCondition, ctx);
    if (!extra) return null;
    const a = escaped(actor.label),
      t = escaped(task.label);
    const pattern =
      state === 'pending'
        ? `(?:${a} (?:has|keeps) ${t} pending|${t} (?:is|remains) pending (?:with|for) ${a})`
        : `${t} (?:is|remains) ${state} (?:for|with) ${a}`;
    if (!localClaim(source, pattern, extra.condition, ctx))
      return mechanismIssue(
        ctx,
        'hold evidence must anchor the actual actor, task and pending/denied/unknown/conditional state',
      );
    if (result.some((hold) => hold.actorId === actor.id && hold.taskId === task.id))
      return mechanismIssue(
        ctx,
        'duplicate or conflicting holds for the same actor/task are not supported',
      );
    result.push({ actorId: actor.id, taskId: task.id, state, source, ...extra });
  }
  return result;
}

function ownership(
  raw: unknown,
  actors: readonly BusinessIdentity[],
  tasks: readonly BusinessIdentity[],
  ctx: ParseContext,
): TaskOwnership[] | null {
  if (!Array.isArray(raw) || raw.length > 3 || tasks.length > 3 || raw.length !== tasks.length)
    return mechanismIssue(
      ctx,
      'ownership permits at most three tasks, each with exactly one explicit row',
    );
  const result: TaskOwnership[] = [];
  for (const entry of raw) {
    if (
      !isRec(entry) ||
      !onlyFields(
        entry,
        ['taskId', 'performerId', 'approverId', 'accountableOwnerId', 'source'],
        ctx,
      )
    )
      return mechanismIssue(ctx, 'ownership contains unsupported fields');
    if (
      !tasks.some((task) => task.id === entry.taskId) ||
      !actors.some((actor) => actor.id === entry.performerId) ||
      !actors.some((actor) => actor.id === entry.accountableOwnerId) ||
      (entry.approverId !== null && !actors.some((actor) => actor.id === entry.approverId))
    )
      return mechanismIssue(
        ctx,
        'performer, approver and accountable owner must be actors, not task/job aliases',
      );
    const row = taskOwnership(entry, [...actors, ...tasks], ctx);
    if (!row || result.some((existing) => existing.taskId === row.taskId))
      return mechanismIssue(
        ctx,
        'ownership requires unique task rows and explicit local actor/verb/task claims for every role',
      );
    // Reusing an actor across roles is valid only because taskOwnership checks each role claim.
    // approverId:null means explicitly no approval, never an unknown or missing approver.
    result.push(row);
  }
  return result;
}

function splits(
  raw: unknown,
  job: BusinessIdentity,
  tasks: readonly BusinessIdentity[],
  ctx: ParseContext,
): WorkSplit[] | null {
  if (!Array.isArray(raw) || raw.length !== tasks.length)
    return mechanismIssue(
      ctx,
      'task-split needs one source-supported job/child relationship per task',
    );
  const result: WorkSplit[] = [];
  for (const entry of raw) {
    if (!isRec(entry) || !onlyFields(entry, ['jobId', 'taskId', 'source'], ctx))
      return mechanismIssue(ctx, 'job/task relationship contains unsupported fields');
    const task = tasks.find((candidate) => candidate.id === entry.taskId);
    const source = businessSpan(entry.source, ctx);
    if (
      !task ||
      !source ||
      entry.jobId !== job.id ||
      result.some((split) => split.taskId === task.id) ||
      !localClaim(
        source,
        `${escaped(job.label)} (?:includes?|contains?|comprises?) ${escaped(task.label)}`,
        undefined,
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'job must explicitly include each named task; reverse, negated or invented child relationships are rejected',
      );
    result.push({ jobId: job.id, taskId: task.id, source });
  }
  return result;
}

function capabilities(
  raw: unknown,
  actors: readonly BusinessIdentity[],
  tasks: readonly BusinessIdentity[],
  storyCondition: string | undefined,
  ctx: ParseContext,
): WorkCapability[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4)
    return mechanismIssue(ctx, 'capability-boundary permits one to four explicit capability rows');
  const result: WorkCapability[] = [];
  for (const entry of raw) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['actorId', 'taskId', 'state', 'source', 'condition'], ctx)
    )
      return mechanismIssue(
        ctx,
        'capability contains unsupported fields; permission/performance is not capability',
      );
    const actor = actors.find((candidate) => candidate.id === entry.actorId);
    const task = tasks.find((candidate) => candidate.id === entry.taskId);
    const source = businessSpan(entry.source, ctx);
    const state = entry.state;
    if (
      !actor ||
      !task ||
      !source ||
      (state !== 'tested' &&
        state !== 'unavailable' &&
        state !== 'unknown' &&
        state !== 'conditional')
    )
      return mechanismIssue(
        ctx,
        'capability requires a named actor/task and explicit tested/unavailable/unknown/conditional state',
      );
    const extra = conditionFields(entry.condition, state, source, storyCondition, ctx);
    if (!extra) return null;
    const a = escaped(actor.label),
      t = escaped(task.label);
    const pattern =
      state === 'tested'
        ? `(?:${a} has tested capability (?:for|to perform) ${t}|${a}'s capability (?:for|to perform) ${t} (?:is|remains) tested)`
        : `${a}'s capability (?:for|to perform) ${t} (?:is|remains) ${state}`;
    if (
      !localClaim(source, pattern, extra.condition, ctx) ||
      result.some((capability) => capability.actorId === actor.id && capability.taskId === task.id)
    )
      return mechanismIssue(
        ctx,
        'capability claims must locally bind actor, capability state and task; permissions, observed task completion, swaps and negation cannot substitute',
      );
    result.push({ actorId: actor.id, taskId: task.id, state, source, ...extra });
  }
  if (tasks.some((task) => !result.some((capability) => capability.taskId === task.id)))
    return mechanismIssue(ctx, 'each displayed task needs an explicit capability boundary');
  return result;
}

function linkBudget(count: number, ctx: ParseContext): boolean {
  if (count <= WORK_LIMITS.links) return true;
  mechanismIssue(
    ctx,
    'task-map exceeds twelve supported relationships, including roles, job splits and holds',
  );
  return false;
}

/** One concrete kind, three frozen catalog routes; no graph/asset/rendering directives. */
function parseTaskMapFacts(raw: unknown, ctx: ParseContext): TaskMapScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  if (raw.kind !== 'task-map') return mechanismIssue(ctx, 'parseTaskMap accepts only task-map');
  const preset = raw.preset;
  if (preset !== 'task-split' && preset !== 'capability-boundary' && preset !== 'responsibility')
    return mechanismIssue(ctx, 'unsupported task-map preset');
  const extraFields =
    preset === 'task-split'
      ? ['job', 'splits', 'ownership']
      : preset === 'responsibility'
        ? ['ownership']
        : ['capabilities'];
  if (!onlyFields(raw, [...TASK_FIELDS, ...extraFields], ctx)) return null;
  const mode = raw.visualMode;
  const recipe = businessRecipe('task-map', preset);
  const expectedRecipe =
    preset === 'task-split' ? 'OP-01' : preset === 'responsibility' ? 'OP-04' : 'OP-02';
  if (
    (mode !== 'diagram' && mode !== 'hybrid') ||
    !recipe ||
    recipe.owner !== 'work' ||
    recipe.id !== expectedRecipe ||
    !recipe.modes.includes(mode) ||
    (preset === 'capability-boundary' && mode !== 'diagram')
  )
    return mechanismIssue(
      ctx,
      'task-map mode must follow its frozen businessRecipe route; OP-02 is diagram only',
    );
  if (
    (raw.startWord !== undefined && ctx.inWin(raw.startWord) !== ctx.win.startWord) ||
    (raw.endWord !== undefined && ctx.inWin(raw.endWord) !== ctx.win.endWord) ||
    (raw.layout !== undefined &&
      (typeof raw.layout !== 'string' ||
        !['stack', 'stack-flipped', 'takeover', 'pip', 'over'].includes(raw.layout)))
  )
    return mechanismIssue(ctx, 'task-map window/layout must match the bounded planner window');
  if (
    !hybridPhrase(raw.label, ctx, WORK_LIMITS.label) ||
    !hybridPhrase(raw.subject, ctx, WORK_LIMITS.label) ||
    !hybridPhrase(raw.outcome, ctx, WORK_LIMITS.phase)
  )
    return mechanismIssue(
      ctx,
      'task-map labels are bounded to 28 characters and phase/outcome text to 40',
    );
  const parsed = hybridStory(raw, ctx, [
    'factEvidence',
    'actors',
    'tasks',
    'holds',
    ...extraFields,
  ]);
  const factEvidence = businessEvidence(raw.factEvidence, ctx);
  const actorList = identities(raw.actors, 'actor', 1, ctx);
  const taskList = identities(raw.tasks, 'task', preset === 'task-split' ? 2 : 1, ctx);
  if (
    !parsed ||
    !factEvidence ||
    !actorList ||
    !taskList ||
    !uniqueEntities([...actorList, ...taskList], ctx)
  )
    return mechanismIssue(
      ctx,
      'task-map needs five source-indexed beats, final hold, fact evidence and distinct local actors/tasks',
    );
  const holdList = holds(raw.holds, actorList, taskList, parsed.story.condition, ctx);
  if (!holdList) return null;
  const base = {
    ...parsed.story,
    factEvidence,
    actors: actorList,
    tasks: taskList,
    holds: holdList,
  };
  if (preset === 'capability-boundary') {
    const capabilityList = capabilities(
      raw.capabilities,
      actorList,
      taskList,
      parsed.story.condition,
      ctx,
    );
    if (!capabilityList || !linkBudget(capabilityList.length + holdList.length, ctx)) return null;
    return {
      ...base,
      kind: 'task-map',
      preset,
      recipeId: 'OP-02',
      visualMode: 'diagram',
      capabilities: capabilityList,
    };
  }
  const ownerList = ownership(raw.ownership, actorList, taskList, ctx);
  if (!ownerList) return null;
  const roleLinks = ownerList.reduce((count, row) => count + (row.approverId === null ? 2 : 3), 0);
  if (preset === 'responsibility') {
    if (!linkBudget(roleLinks + holdList.length, ctx)) return null;
    return { ...base, kind: 'task-map', preset, recipeId: 'OP-04', ownership: ownerList };
  }
  const job = businessIdentity(raw.job, ctx);
  if (
    !job ||
    !classified(job, 'job', ctx) ||
    !uniqueEntities([job, ...actorList, ...taskList], ctx)
  )
    return mechanismIssue(
      ctx,
      'task-split requires a distinct source-named job, not an actor or child task',
    );
  const splitList = splits(raw.splits, job, taskList, ctx);
  if (!splitList || !linkBudget(roleLinks + splitList.length + holdList.length, ctx)) return null;
  return {
    ...base,
    kind: 'task-map',
    preset,
    recipeId: 'OP-01',
    job,
    splits: splitList,
    ownership: ownerList,
  };
}

function workStory(
  raw: unknown,
  kind: 'coordination-map' | 'work-redesign',
  fields: readonly string[],
  ctx: ParseContext,
): { story: BusinessStory } | null {
  if (
    !boundedBusinessInput(raw, ctx) ||
    !isRec(raw) ||
    raw.kind !== kind ||
    typeof raw.preset !== 'string'
  )
    return mechanismIssue(ctx, 'work story requires bounded JSON and a concrete kind/preset');
  const common = TASK_FIELDS.filter((field) => field !== 'actors' && field !== 'tasks');
  if (!onlyFields(raw, [...common, ...fields], ctx)) return null;
  const recipe = businessRecipe(kind, raw.preset);
  const mode = raw.visualMode;
  if (
    !recipe ||
    recipe.owner !== 'work' ||
    (mode !== 'diagram' && mode !== 'hybrid') ||
    !recipe.modes.includes(mode)
  )
    return mechanismIssue(ctx, 'work story must use its frozen catalog recipe and mode');
  if (
    !hybridPhrase(raw.label, ctx, 28) ||
    !hybridPhrase(raw.subject, ctx, 28) ||
    !hybridPhrase(raw.outcome, ctx, 40)
  )
    return mechanismIssue(ctx, 'work labels/phase text exceed 28/40 characters');
  const parsed = hybridStory(raw, ctx, ['factEvidence', 'holds', ...fields]);
  const factEvidence = businessEvidence(raw.factEvidence, ctx);
  if (!parsed || !factEvidence)
    return mechanismIssue(
      ctx,
      'work story needs fact evidence and five indexed beats with final hold',
    );
  return { story: { ...parsed.story, factEvidence } };
}

type ActionMeta = { state: WorkActionState; source: BusinessWordSpan; condition?: WorkPhase };
function actionMeta(
  raw: unknown,
  fields: readonly string[],
  condition: string | undefined,
  ctx: ParseContext,
): ActionMeta | null {
  if (!isRec(raw) || !onlyFields(raw, [...fields, 'state', 'source', 'condition'], ctx))
    return null;
  const state = raw.state;
  if (
    state !== 'observed' &&
    state !== 'configured' &&
    state !== 'pending' &&
    state !== 'denied' &&
    state !== 'unknown' &&
    state !== 'conditional'
  )
    return mechanismIssue(ctx, 'action state must be explicit; configured is not observed');
  const source = businessSpan(raw.source, ctx);
  if (!source) return null;
  const extra = conditionFields(raw.condition, state, source, condition, ctx);
  return extra ? { state, source, ...extra } : null;
}
function actionClaim(
  meta: ActionMeta,
  actor: BusinessIdentity,
  verb: string,
  infinitive: string,
  noun: string,
  ctx: ParseContext,
): boolean {
  const a = escaped(actor.label);
  const pattern =
    meta.state === 'observed' || meta.state === 'conditional'
      ? `${a} ${verb}`
      : meta.state === 'configured'
        ? `${a} is configured to ${infinitive}`
        : meta.state === 'pending'
          ? `${a} has ${noun} pending`
          : meta.state === 'denied'
            ? `${a} is denied ${noun}`
            : `${a}'s ${noun} is unknown`;
  if (localClaim(meta.source, pattern, meta.condition, ctx)) return true;
  mechanismIssue(
    ctx,
    'action must bind the actual actor, verb, target and declared state in one local clause',
  );
  return false;
}
function rows<T>(raw: unknown, parse: (entry: unknown) => T | null, ctx: ParseContext): T[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12)
    return mechanismIssue(ctx, 'work relationship array must contain 1–12 entries');
  const result: T[] = [];
  for (const entry of raw) {
    const value = parse(entry);
    if (!value) return null;
    result.push(value);
  }
  return result;
}
function handoffs(
  raw: unknown,
  actors: readonly BusinessIdentity[],
  tasks: readonly BusinessIdentity[],
  condition: string | undefined,
  ctx: ParseContext,
): WorkHandoff[] | null {
  if (!Array.isArray(raw) || raw.length > 4)
    return mechanismIssue(ctx, 'coordination permits at most four explicit handoffs');
  const result = rows(
    raw,
    (entry): WorkHandoff | null => {
      const meta = actionMeta(entry, ['fromActorId', 'toActorId', 'taskId'], condition, ctx);
      if (!meta || !isRec(entry)) return null;
      const from = actors.find((a) => a.id === entry.fromActorId),
        to = actors.find((a) => a.id === entry.toActorId),
        task = tasks.find((t) => t.id === entry.taskId);
      if (!from || !to || from.id === to.id || !task)
        return mechanismIssue(ctx, 'handoff needs distinct supported actors and an actual task');
      const target = `${escaped(task.label)} to ${escaped(to.label)}`;
      if (
        !actionClaim(meta, from, `hands ${target}`, `hand ${target}`, `handoff of ${target}`, ctx)
      )
        return null;
      return { fromActorId: from.id, toActorId: to.id, taskId: task.id, ...meta };
    },
    ctx,
  );
  if (
    result &&
    new Set(result.map((r) => `${r.fromActorId}/${r.toActorId}/${r.taskId}`)).size !== result.length
  )
    return mechanismIssue(ctx, 'duplicate handoff relationship');
  return result;
}
function reviews(
  raw: unknown,
  actors: readonly BusinessIdentity[],
  tasks: readonly BusinessIdentity[],
  condition: string | undefined,
  ctx: ParseContext,
): WorkReview[] | null {
  if (!Array.isArray(raw) || raw.length > 4)
    return mechanismIssue(ctx, 'coordination permits at most four explicit reviews');
  const result = rows(
    raw,
    (entry): WorkReview | null => {
      const meta = actionMeta(entry, ['reviewerId', 'performerId', 'taskId'], condition, ctx);
      if (!meta || !isRec(entry)) return null;
      const reviewer = actors.find((a) => a.id === entry.reviewerId),
        performer = actors.find((a) => a.id === entry.performerId),
        task = tasks.find((t) => t.id === entry.taskId);
      if (!reviewer || !performer || reviewer.id === performer.id || !task)
        return mechanismIssue(ctx, 'review needs distinct named reviewer/performer and task');
      const target = `${escaped(task.label)} from ${escaped(performer.label)}`;
      if (
        !actionClaim(
          meta,
          reviewer,
          `reviews ${target}`,
          `review ${target}`,
          `review of ${target}`,
          ctx,
        )
      )
        return null;
      return { reviewerId: reviewer.id, performerId: performer.id, taskId: task.id, ...meta };
    },
    ctx,
  );
  if (
    result &&
    new Set(result.map((r) => `${r.reviewerId}/${r.performerId}/${r.taskId}`)).size !==
      result.length
  )
    return mechanismIssue(ctx, 'duplicate review relationship');
  return result;
}
function measure(
  raw: unknown,
  subject: BusinessIdentity,
  pool: readonly BusinessIdentity[],
  metric: string,
  ctx: ParseContext,
): WorkMeasure | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'value', 'basis', 'source'], ctx)) return null;
  const source = businessSpan(raw.source, ctx);
  if (!source) return null;
  if (raw.state === 'unknown') {
    const basis = raw.basis === null ? null : quantityBasis(raw.basis, pool, ctx);
    if (
      raw.value !== null ||
      (raw.basis !== null && !basis) ||
      (basis && basis.subjectId !== subject.id) ||
      !localClaim(
        source,
        `${escaped(subject.label)}'s ${escaped(metric)} is unknown`,
        undefined,
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'unknown quantity needs an explicit unknown claim, null value and only a stated basis',
      );
    return { state: 'unknown', value: null, basis, source };
  }
  if (raw.state !== 'observed' && raw.state !== 'configured')
    return mechanismIssue(ctx, 'quantity state is observed, configured or explicitly unknown');
  const value = shareCount(raw.value, true),
    basis = quantityBasis(raw.basis, pool, ctx);
  if (value === null || !basis || basis.denominator === null || basis.subjectId !== subject.id)
    return mechanismIssue(
      ctx,
      'numeric work load requires its own explicit compatible population/unit/period/denominator',
    );
  const verb = raw.state === 'observed' ? '(?:has|reports)' : 'has configured';
  const pattern = `${escaped(subject.label)} ${verb} ${quantityPattern(value, basis.unit)} (?:per|of|over|among|from) ${quantityPattern(basis.denominator, basis.population)} (?:during|in|for) ${escaped(basis.period)}`;
  if (!localClaim(source, pattern, undefined, ctx))
    return mechanismIssue(
      ctx,
      'quantity evidence must anchor subject, state, value and complete basis; no implicit load metric',
    );
  return { state: raw.state, value, basis, source };
}
function queue(
  raw: unknown,
  actors: readonly BusinessIdentity[],
  condition: string | undefined,
  ctx: ParseContext,
): WorkQueue | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['identity', 'reviewerId', 'state', 'source', 'condition'], ctx)
  )
    return null;
  const identity = businessIdentity(raw.identity, ctx),
    reviewer = actors.find((a) => a.id === raw.reviewerId),
    source = businessSpan(raw.source, ctx),
    state = raw.state;
  if (
    !identity ||
    !reviewer ||
    !source ||
    (state !== 'pending' && state !== 'denied' && state !== 'unknown' && state !== 'conditional')
  )
    return mechanismIssue(
      ctx,
      'review queue needs its own identity, reviewer and unresolved state',
    );
  if (
    !localClaim(
      identity.source,
      `${escaped(identity.label)} (?:is|remains) (?:an|the) approval queue`,
      undefined,
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'approval-load requires an explicitly source-stated approval queue, not an ordinary peer-review queue',
    );
  const extra = conditionFields(raw.condition, state, source, condition, ctx);
  if (
    !extra ||
    !localClaim(
      source,
      `${escaped(identity.label)} (?:is|remains) ${state} with ${escaped(reviewer.label)}`,
      extra.condition,
      ctx,
    )
  )
    return mechanismIssue(ctx, 'queue state must be locally bound to its reviewer');
  return { identity, reviewerId: reviewer.id, state, source, ...extra };
}
function constraint(
  raw: unknown,
  actors: readonly BusinessIdentity[],
  tasks: readonly BusinessIdentity[],
  condition: string | undefined,
  ctx: ParseContext,
): WorkConstraint | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['actorId', 'taskId', 'state', 'phase', 'source', 'condition'], ctx)
  )
    return null;
  const actor = actors.find((a) => a.id === raw.actorId),
    task = tasks.find((t) => t.id === raw.taskId),
    period = phase(raw.phase, ctx),
    source = businessSpan(raw.source, ctx),
    state = raw.state;
  if (
    !actor ||
    !task ||
    !period ||
    !source ||
    (state !== 'constrained' &&
      state !== 'released' &&
      state !== 'pending' &&
      state !== 'denied' &&
      state !== 'unknown' &&
      state !== 'conditional')
  )
    return mechanismIssue(
      ctx,
      'constraint must retain actor, task, source phase and explicit state',
    );
  const extra = conditionFields(raw.condition, state, source, condition, ctx);
  if (
    !extra ||
    !localClaim(
      source,
      `${escaped(actor.label)}'s ${escaped(task.label)} constraint is ${state} during ${escaped(period.label)}`,
      extra.condition,
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'before/after constraints need explicit claims; time alone cannot free a bottleneck',
    );
  return { actorId: actor.id, taskId: task.id, state, phase: period, source, ...extra };
}
function comparison(
  raw: unknown,
  subject: BusinessIdentity,
  pool: readonly BusinessIdentity[],
  ctx: ParseContext,
): WorkComparison | null {
  if (!isRec(raw) || !onlyFields(raw, ['before', 'after', 'source'], ctx)) return null;
  const before = measure(raw.before, subject, pool, 'load', ctx),
    after = measure(raw.after, subject, pool, 'load', ctx),
    source = businessSpan(raw.source, ctx);
  if (
    !before ||
    !after ||
    !source ||
    before.state !== 'observed' ||
    after.state !== 'observed' ||
    !compatibleQuantityBases(before.basis, after.basis)
  )
    return mechanismIssue(
      ctx,
      'quantity comparison requires two observed values with compatible explicit bases',
    );
  const basis = before.basis;
  if (
    basis.denominator === null ||
    !localClaim(
      source,
      `${escaped(subject.label)} changes from ${quantityPattern(before.value, basis.unit)} to ${quantityPattern(after.value, basis.unit)} per ${quantityPattern(basis.denominator, basis.population)} in ${escaped(basis.period)}`,
      undefined,
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'comparison itself must be explicitly stated, not inferred from two quantities',
    );
  return { before, after, source };
}

function parseCoordinationMapFacts(raw: unknown, ctx: ParseContext): CoordinationMapScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  const preset = raw.preset;
  if (
    preset !== 'cross-function' &&
    preset !== 'supervised-fanout' &&
    preset !== 'handoff-load' &&
    preset !== 'approval-load' &&
    preset !== 'bottleneck-shift'
  )
    return mechanismIssue(ctx, 'unsupported coordination-map preset');
  const fields =
    preset === 'supervised-fanout'
      ? ['supervisor', 'delegates', 'tasks', 'reviews', 'reviewCapacity']
      : preset === 'bottleneck-shift'
        ? ['actors', 'tasks', 'before', 'after', 'comparison']
        : preset === 'approval-load'
          ? ['actors', 'tasks', 'queue', 'reviews', 'load', 'reviewCapacity']
          : ['actors', 'tasks', 'handoffs', ...(preset === 'handoff-load' ? ['load'] : [])];
  const parsed = workStory(raw, 'coordination-map', fields, ctx);
  if (!parsed) return null;
  const supervisor = preset === 'supervised-fanout' ? businessIdentity(raw.supervisor, ctx) : null;
  const delegates =
    preset === 'supervised-fanout' ? identities(raw.delegates, 'actor', 1, ctx) : null;
  const actors =
    preset === 'supervised-fanout'
      ? supervisor && delegates
        ? [supervisor, ...delegates]
        : null
      : identities(raw.actors, 'actor', 2, ctx);
  const tasks = identities(raw.tasks, 'task', 1, ctx);
  if (!actors || !tasks || !uniqueEntities([...actors, ...tasks], ctx)) return null;
  const holdList = holds(raw.holds, actors, tasks, parsed.story.condition, ctx);
  if (!holdList) return null;
  const base = { ...parsed.story, holds: holdList, actors, tasks };
  if (preset === 'cross-function' || preset === 'handoff-load') {
    const edges = handoffs(raw.handoffs, actors, tasks, parsed.story.condition, ctx);
    if (
      !edges ||
      !linkBudget(edges.length * 2 + holdList.length + (preset === 'handoff-load' ? 1 : 0), ctx)
    )
      return null;
    if (preset === 'cross-function')
      return { ...base, kind: 'coordination-map', preset, recipeId: 'OP-03', handoffs: edges };
    const subject = actors.find((a) => a.label === parsed.story.subject);
    const load = subject
      ? measure(raw.load, subject, [...actors, ...tasks], 'handoff load', ctx)
      : null;
    return load
      ? { ...base, kind: 'coordination-map', preset, recipeId: 'OP-08', handoffs: edges, load }
      : mechanismIssue(ctx, 'handoff load subject must be an actual named actor');
  }
  if (preset === 'supervised-fanout') {
    if (!supervisor || !delegates) return null;
    const reviewList = reviews(raw.reviews, actors, tasks, parsed.story.condition, ctx);
    const reviewCapacity = measure(
      raw.reviewCapacity,
      supervisor,
      [...actors, ...tasks],
      'review capacity',
      ctx,
    );
    if (
      !reviewList ||
      !reviewCapacity ||
      reviewList.some(
        (r) => r.reviewerId !== supervisor.id || !delegates.some((a) => a.id === r.performerId),
      ) ||
      delegates.some((a) => !reviewList.some((r) => r.performerId === a.id)) ||
      !linkBudget(reviewList.length * 2 + holdList.length + 1, ctx)
    )
      return mechanismIssue(
        ctx,
        'fanout requires each supported delegate to have an explicit supervisor review link and capacity state',
      );
    return {
      ...parsed.story,
      holds: holdList,
      kind: 'coordination-map',
      preset,
      recipeId: 'OP-07',
      supervisor,
      delegates,
      tasks,
      reviews: reviewList,
      reviewCapacity,
    };
  }
  if (preset === 'approval-load') {
    const reviewQueue = queue(raw.queue, actors, parsed.story.condition, ctx);
    if (!reviewQueue || !uniqueEntities([...actors, ...tasks, reviewQueue.identity], ctx))
      return null;
    const reviewer = actors.find((a) => a.id === reviewQueue.reviewerId);
    const reviewList = reviews(raw.reviews, actors, tasks, parsed.story.condition, ctx);
    const load = measure(
      raw.load,
      reviewQueue.identity,
      [...actors, ...tasks, reviewQueue.identity],
      'approval load',
      ctx,
    );
    const reviewCapacity = reviewer
      ? measure(raw.reviewCapacity, reviewer, [...actors, ...tasks], 'review capacity', ctx)
      : null;
    if (
      !reviewList ||
      !load ||
      !reviewCapacity ||
      reviewList.some((r) => r.reviewerId !== reviewQueue.reviewerId) ||
      !linkBudget(reviewList.length * 2 + holdList.length + 3, ctx)
    )
      return null;
    for (const review of reviewList) {
      const task = tasks.find((entry) => entry.id === review.taskId);
      if (
        !reviewer ||
        !task ||
        !localClaim(
          reviewer.source,
          `${escaped(reviewer.label)} (?:approves|is approver for) ${escaped(task.label)}`,
          undefined,
          ctx,
        )
      )
        return mechanismIssue(
          ctx,
          'approval-load reviewer needs explicit approval authority for every queued task; peer review is not approval',
        );
    }
    return {
      ...base,
      kind: 'coordination-map',
      preset,
      recipeId: 'OP-32',
      queue: reviewQueue,
      reviews: reviewList,
      load,
      reviewCapacity,
    };
  }
  const before = constraint(raw.before, actors, tasks, parsed.story.condition, ctx),
    after = constraint(raw.after, actors, tasks, parsed.story.condition, ctx);
  const subject = actors.find((a) => a.label === parsed.story.subject);
  const measured =
    raw.comparison === undefined || raw.comparison === null
      ? null
      : subject
        ? comparison(raw.comparison, subject, [...actors, ...tasks], ctx)
        : null;
  if (
    !before ||
    !after ||
    (raw.comparison !== undefined && raw.comparison !== null && !measured) ||
    before.phase.label === after.phase.label ||
    before.phase.source.toWord >= after.phase.source.fromWord ||
    !linkBudget(2 + holdList.length + (measured ? 3 : 0), ctx)
  )
    return mechanismIssue(
      ctx,
      'bottleneck shift requires ordered source-stated phases and no fabricated throughput result',
    );
  return {
    ...base,
    kind: 'coordination-map',
    preset,
    recipeId: 'OP-80',
    before,
    after,
    comparison: measured,
  };
}

function rolePool(
  actors: readonly BusinessIdentity[],
  objects: readonly BusinessIdentity[],
  ctx: ParseContext,
): BusinessIdentity[] | null {
  const unique: BusinessIdentity[] = [];
  for (const actor of actors) {
    const existing = unique.find((a) => a.id === actor.id);
    if (existing && normalizedPhrase(existing.label) !== normalizedPhrase(actor.label))
      return mechanismIssue(ctx, 'repeated role identity cannot change actor label');
    if (!existing) unique.push(actor);
  }
  return uniqueEntities([...unique, ...objects], ctx) ? unique : null;
}
function parseWorkRedesignFacts(raw: unknown, ctx: ParseContext): WorkRedesignScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  const preset = raw.preset;
  if (preset !== 'expertise-transfer' && preset !== 'redeployment' && preset !== 'owner-playbook')
    return mechanismIssue(ctx, 'unsupported work-redesign preset');
  const fields =
    preset === 'redeployment'
      ? ['worker', 'beforeTasks', 'afterTasks', 'before', 'after', 'allocations']
      : [
          'recorder',
          'receiver',
          'approver',
          'task',
          'record',
          'playbook',
          'capture',
          'approval',
          'use',
          ...(preset === 'expertise-transfer'
            ? ['expert', 'expertiseSource']
            : ['owner', 'ownerSource']),
        ];
  const parsed = workStory(raw, 'work-redesign', fields, ctx);
  if (!parsed) return null;
  if (/\b(?:layoffs?|job loss|retraining|retrained|fired)\b/iu.test(parsed.story.outcome))
    return mechanismIssue(
      ctx,
      'this recipe explains tasks and records, not inferred job loss or model retraining',
    );
  if (preset === 'redeployment') {
    const worker = businessIdentity(raw.worker, ctx),
      beforeTasks = identities(raw.beforeTasks, 'task', 1, ctx),
      afterTasks = identities(raw.afterTasks, 'task', 1, ctx),
      before = phase(raw.before, ctx),
      after = phase(raw.after, ctx);
    if (
      !worker ||
      !beforeTasks ||
      !afterTasks ||
      !before ||
      !after ||
      before.label === after.label ||
      before.source.toWord >= after.source.fromWord
    )
      return mechanismIssue(
        ctx,
        'redeployment keeps one worker and ordered source-stated before/after phases',
      );
    const taskPool: BusinessIdentity[] = [];
    for (const task of [...beforeTasks, ...afterTasks]) {
      const existing = taskPool.find((t) => t.id === task.id);
      if (existing && existing.label !== task.label)
        return mechanismIssue(ctx, 'before/after task identity cannot be renamed');
      if (!existing) taskPool.push(task);
    }
    if (taskPool.length > WORK_LIMITS.tasks || !uniqueEntities([worker, ...taskPool], ctx))
      return mechanismIssue(ctx, 'redeployment has at most four retained task identities');
    const allocations = rows(
      raw.allocations,
      (entry): WorkAllocation | null => {
        const meta = actionMeta(entry, ['actorId', 'taskId', 'phase'], parsed.story.condition, ctx);
        if (
          !meta ||
          !isRec(entry) ||
          entry.actorId !== worker.id ||
          (entry.phase !== 'before' && entry.phase !== 'after')
        )
          return mechanismIssue(
            ctx,
            'redeployment must retain the exact same actor in both phases',
          );
        const task = (entry.phase === 'before' ? beforeTasks : afterTasks).find(
            (t) => t.id === entry.taskId,
          ),
          period = entry.phase === 'before' ? before : after;
        if (
          !task ||
          !actionClaim(
            meta,
            worker,
            `performs ${escaped(task.label)} during ${escaped(period.label)}`,
            `perform ${escaped(task.label)} during ${escaped(period.label)}`,
            `allocation to ${escaped(task.label)} during ${escaped(period.label)}`,
            ctx,
          )
        )
          return null;
        return { actorId: worker.id, taskId: task.id, phase: entry.phase, ...meta };
      },
      ctx,
    );
    const holdList = holds(raw.holds, [worker], taskPool, parsed.story.condition, ctx);
    if (
      !allocations ||
      !holdList ||
      new Set(allocations.map((a) => `${a.phase}/${a.taskId}`)).size !== allocations.length ||
      beforeTasks.some(
        (t) => !allocations.some((a) => a.phase === 'before' && a.taskId === t.id),
      ) ||
      afterTasks.some((t) => !allocations.some((a) => a.phase === 'after' && a.taskId === t.id)) ||
      !linkBudget(allocations.length + holdList.length, ctx)
    )
      return null;
    return {
      ...parsed.story,
      holds: holdList,
      kind: 'work-redesign',
      preset,
      recipeId: 'OP-06',
      worker,
      beforeTasks,
      afterTasks,
      before,
      after,
      allocations,
    };
  }
  const origin = businessIdentity(preset === 'expertise-transfer' ? raw.expert : raw.owner, ctx),
    recorder = businessIdentity(raw.recorder, ctx),
    receiver = businessIdentity(raw.receiver, ctx),
    approver = businessIdentity(raw.approver, ctx),
    task = businessIdentity(raw.task, ctx),
    record = businessIdentity(raw.record, ctx),
    playbook = versionedIdentity(raw.playbook, ctx);
  const roleSource = businessSpan(
    preset === 'expertise-transfer' ? raw.expertiseSource : raw.ownerSource,
    ctx,
  );
  if (
    !origin ||
    !recorder ||
    !receiver ||
    !approver ||
    !task ||
    !classified(task, 'task', ctx) ||
    !record ||
    !playbook ||
    !roleSource ||
    !localClaim(
      roleSource,
      `${escaped(origin.label)} ${preset === 'expertise-transfer' ? 'has expertise for' : 'owns'} ${escaped(task.label)}`,
      undefined,
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'playbook origin must have an explicit source expertise/ownership claim for the task',
    );
  const actors = rolePool(
    [origin, recorder, receiver, approver],
    [task, record, playbook.identity],
    ctx,
  );
  if (!actors) return null;
  const captureMeta = actionMeta(
    raw.capture,
    ['recorderId', 'expertId', 'taskId', 'recordId'],
    parsed.story.condition,
    ctx,
  );
  if (
    !captureMeta ||
    !isRec(raw.capture) ||
    raw.capture.recorderId !== recorder.id ||
    raw.capture.expertId !== origin.id ||
    raw.capture.taskId !== task.id ||
    raw.capture.recordId !== record.id
  )
    return mechanismIssue(
      ctx,
      'capture must retain source expert/owner, recorder, task and record identities',
    );
  const content = `expertise from ${escaped(origin.label)} for ${escaped(task.label)} in ${escaped(record.label)}`;
  if (
    !actionClaim(
      captureMeta,
      recorder,
      `records ${content}`,
      `record ${content}`,
      `recording of ${content}`,
      ctx,
    )
  )
    return null;
  const capture: WorkCapture = {
    recorderId: recorder.id,
    expertId: origin.id,
    taskId: task.id,
    recordId: record.id,
    ...captureMeta,
  };
  const value = raw.approval;
  if (
    !isRec(value) ||
    !onlyFields(
      value,
      ['approverId', 'taskId', 'playbookId', 'version', 'state', 'source', 'condition'],
      ctx,
    )
  )
    return null;
  const state = value.state,
    source = businessSpan(value.source, ctx);
  if (
    !source ||
    value.approverId !== approver.id ||
    value.taskId !== task.id ||
    value.playbookId !== playbook.identity.id ||
    value.version !== playbook.version ||
    (state !== 'approved' &&
      state !== 'pending' &&
      state !== 'denied' &&
      state !== 'unknown' &&
      state !== 'conditional')
  )
    return mechanismIssue(
      ctx,
      'approval must bind the actual reviewer, task, playbook revision and state',
    );
  const extra = conditionFields(value.condition, state, source, parsed.story.condition, ctx);
  const target = `${escaped(playbook.identity.label)} ${escaped(playbook.version)} for ${escaped(task.label)}`;
  const approvalPattern =
    state === 'approved' || state === 'conditional'
      ? `${escaped(approver.label)} approves ${target}`
      : `approval of ${target} is ${state} with ${escaped(approver.label)}`;
  if (
    !extra ||
    !localClaim(source, approvalPattern, extra.condition, ctx) ||
    (state === 'approved' &&
      (capture.state !== 'observed' || capture.source.toWord >= source.fromWord))
  )
    return mechanismIssue(
      ctx,
      'recording expertise is not approval: require a separate ordered source-bound revision approval',
    );
  const approval: WorkPlaybookApproval = {
    approverId: approver.id,
    taskId: task.id,
    playbookId: playbook.identity.id,
    version: playbook.version,
    state,
    source,
    ...extra,
  };
  const useMeta = actionMeta(
    raw.use,
    ['actorId', 'taskId', 'playbookId', 'version'],
    parsed.story.condition,
    ctx,
  );
  if (
    !useMeta ||
    !isRec(raw.use) ||
    raw.use.actorId !== receiver.id ||
    raw.use.taskId !== task.id ||
    raw.use.playbookId !== playbook.identity.id ||
    raw.use.version !== playbook.version ||
    !actionClaim(useMeta, receiver, `uses ${target}`, `use ${target}`, `use of ${target}`, ctx)
  )
    return mechanismIssue(
      ctx,
      'later use must name the receiving actor, unchanged task and exact revision',
    );
  if (
    useMeta.state === 'observed' &&
    (approval.state !== 'approved' ||
      capture.state !== 'observed' ||
      approval.source.toWord >= useMeta.source.fromWord)
  )
    return mechanismIssue(
      ctx,
      'pending/denied/unknown/conditional approval cannot become observed approved playbook use',
    );
  const use: WorkPlaybookUse = {
    actorId: receiver.id,
    taskId: task.id,
    playbookId: playbook.identity.id,
    version: playbook.version,
    ...useMeta,
  };
  const holdList = holds(raw.holds, actors, [task], parsed.story.condition, ctx);
  if (!holdList || !linkBudget(7 + holdList.length + (preset === 'owner-playbook' ? 1 : 0), ctx))
    return null;
  const base = {
    ...parsed.story,
    holds: holdList,
    recorder,
    receiver,
    approver,
    task,
    record,
    playbook,
    capture,
    approval,
    use,
  };
  return preset === 'expertise-transfer'
    ? {
        ...base,
        kind: 'work-redesign',
        preset,
        recipeId: 'OP-05',
        expert: origin,
        expertiseSource: roleSource,
      }
    : {
        ...base,
        kind: 'work-redesign',
        preset,
        recipeId: 'OP-18',
        owner: origin,
        ownerSource: roleSource,
      };
}

function acceptedWork<S extends BusinessWorkScene>(scene: S | null, ctx: ParseContext): S | null {
  if (!scene) return null;
  if (!workPresentationFits(scene))
    return mechanismIssue(
      ctx,
      'fixed-font work presentation exceeds 478px; split the source rather than shrink text or omit facts',
    );
  return scene;
}

export function parseTaskMap(raw: unknown, ctx: ParseContext): TaskMapScene | null {
  return acceptedWork(parseTaskMapFacts(raw, ctx), ctx);
}
export function parseCoordinationMap(raw: unknown, ctx: ParseContext): CoordinationMapScene | null {
  return acceptedWork(parseCoordinationMapFacts(raw, ctx), ctx);
}
export function parseWorkRedesign(raw: unknown, ctx: ParseContext): WorkRedesignScene | null {
  return acceptedWork(parseWorkRedesignFacts(raw, ctx), ctx);
}
