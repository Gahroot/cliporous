import type {
  ExpansionInterferenceCycleScene,
  InterferenceCycleFact,
  InterferenceCycleState,
  InterferenceWave,
} from '../../remotion/compositions/explainer/expansion/physical/interference-cycle-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  expansionAssertedRelation,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const states: readonly InterferenceCycleState[] = [
  'known',
  'unknown',
  'missing',
  'disputed',
  'conditional',
  'simulated',
  'illustrative',
];
function lit(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}
function parse(
  raw: Rec,
  ctx: ParseContext,
  id: '77' | '78',
): ExpansionInterferenceCycleScene | null {
  const fail = (message: string) => mechanismIssue(ctx, message);
  const duration = ctx.win.endTime - ctx.win.startTime;
  if (
    !Number.isFinite(duration) ||
    duration < 5 ||
    duration > 12 ||
    !Number.isSafeInteger(ctx.win.startWord) ||
    !Number.isSafeInteger(ctx.win.endWord) ||
    ctx.win.startWord < 0 ||
    ctx.win.endWord >= ctx.words.length ||
    ctx.win.endWord < ctx.win.startWord ||
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .some(
        (word, i, words) =>
          !Number.isFinite(word.start) ||
          !Number.isFinite(word.end) ||
          word.end <= word.start ||
          word.start < ctx.win.startTime + 0.25 - 1e-7 ||
          word.end > ctx.win.endTime - 0.35 + 1e-7 ||
          (i > 0 && word.start < words[i - 1].end - 1e-7),
      )
  )
    return fail(
      'complete source words require finite positive nonoverlap, 5–12s and .25/.35 padding',
    );
  const b = expansionStoryBase(raw, ctx, id, [
    'template',
    'entities',
    'scope',
    'period',
    'records',
    'relations',
    ...(id === '77' ? ['waves'] : []),
  ]);
  if (
    !b ||
    !strictMechanismBeats(
      raw,
      ctx,
      phases.map((p) => `${p}Word`),
      [1, 1, 1, 1],
      0.8,
    )
  )
    return null;
  for (const phase of phases) {
    const index = ctx.inWin(raw[`${phase}Word`]);
    if (index === null || (index > 0 && !/[.!?;][”"’')\]]*$/.test(ctx.words[index - 1].text)))
      return fail('each beat must begin a complete distinct source clause');
  }
  const template = id === '77' ? 'analytic-superposition' : 'source-state-cycle';
  if (raw.template !== template) return fail('only the closed authored template is accepted');
  const entities = expansionEntities(raw.entities, ctx, id);
  const scope = expansionSourceLabel(raw.scope, b.spans.setup, ctx, 40);
  const period = expansionSourceLabel(raw.period, b.spans.setup, ctx, 32);
  if (!entities || !scope || !period || entities.length !== (id === '77' ? 3 : 2))
    return fail('authored template needs exact source actor identities, scope and period');
  const local = (body: string) =>
    `(?:${body} at ${lit(scope)} during ${lit(period)}|At ${lit(scope)} during ${lit(period)}, ${body})`;
  if (
    !expansionAssertedRelation(
      b.spans.setup,
      new RegExp(
        local(
          `${lit(b.story.subject)} (?:lists|names) ${entities.map((e) => lit(e.label)).join(' and ')}`,
        ),
        'i',
      ),
      undefined,
      [b.story.subject, scope, period, ...entities.map((e) => e.label)],
    )
  )
    return fail('setup must assert every source identity in local scope and period');
  const roles =
    id === '77'
      ? ['composition', 'result']
      : ['initial-state', 'forward-transition', 'return-transition', 'result'];
  if (
    !Array.isArray(raw.records) ||
    raw.records.length !== roles.length - 1 ||
    !Array.isArray(raw.relations) ||
    raw.relations.length !== 1
  )
    return fail('authored records/relations use tighter bounds than 12/16');
  const facts: InterferenceCycleFact[] = [];
  for (const [index, row] of [...raw.records, ...raw.relations].entries()) {
    if (
      !isRec(row) ||
      !onlyFields(
        row,
        [
          'actor',
          'targets',
          'role',
          'scope',
          'period',
          'state',
          'value',
          'condition',
          'qualifier',
          'evidence',
        ],
        ctx,
      )
    )
      return fail('invalid source fact');
    const evidence = expansionSourceSpan(row.evidence, ctx);
    if (!evidence) return null;
    const actor = entities.find((e) => e.label === row.actor);
    const targets = Array.isArray(row.targets)
      ? row.targets.map((t) => entities.find((e) => e.label === t))
      : [];
    const state = states.find((s) => s === row.state);
    const value =
      row.value === undefined ? undefined : expansionSourceLabel(row.value, evidence, ctx, 54);
    const condition =
      row.condition === undefined
        ? undefined
        : expansionSourceLabel(row.condition, evidence, ctx, 96);
    const qualifier =
      row.qualifier === undefined
        ? undefined
        : expansionSourceLabel(row.qualifier, evidence, ctx, 96);
    if (
      !actor ||
      actor !== entities[0] ||
      targets.length !== entities.length - 1 ||
      targets.some((t, i) => !t || t !== entities[i + 1]) ||
      !state ||
      row.role !== roles[index] ||
      row.scope !== scope ||
      row.period !== period ||
      value === null ||
      condition === null ||
      qualifier === null
    )
      return fail('fact must bind exact source actor, targets, role, scope and period');
    if (state === 'known' && (condition !== undefined || qualifier !== undefined || !value))
      return fail('known facts cannot erase qualifications');
    if (
      state === 'conditional'
        ? !condition || !value || qualifier !== undefined || condition !== b.story.condition
        : condition !== undefined
    )
      return fail('preserve explicit local condition');
    if (
      ['unknown', 'missing', 'disputed'].includes(state)
        ? value !== undefined || qualifier !== state
        : ['simulated', 'illustrative'].includes(state)
          ? !value ||
            !qualifier ||
            !(
              state === 'simulated'
                ? /^(?:simulation|simulated)$/i
                : /^(?:illustrative|illustration|teaching example)$/i
            ).test(qualifier) ||
            b.story.evidence !== 'illustrative'
          : qualifier !== undefined
    )
      return fail('retain uncertain or example status, never measured zero');
    if (value && /\d|[<>`]|https?:|\b(?:diagnosis|healthy|disease)\b/i.test(value))
      return fail('qualitative source states/results only; no numeric simulation or diagnosis');
    if (
      id === '77' &&
      value &&
      !(
        index === 0 ? ['superposition'] : ['constructive', 'destructive', 'mixed', 'unresolved']
      ).includes(value)
    )
      return fail('interference result must be a closed source-stated qualitative relation');
    if (
      id === '78' &&
      value &&
      !(
        index === 0
          ? /^(?:solid|liquid|gas)$/
          : index === 3
            ? /^(?:closed cycle|unresolved)$/
            : /^(?:solid|liquid|gas) to (?:solid|liquid|gas) under (?:heating|cooling|compression|decompression)$/
      ).test(value)
    )
      return fail(
        'closed source states and explicit process conditions required; no physical simulation',
      );
    const expectedBeat = id === '77' ? ['check', 'resolve'][index] : phases[index + 1];
    if (evidence.span.fromWord !== raw[`${expectedBeat}Word`])
      return fail('facts must occupy their complete source beat clauses');
    const body = local(
      `${lit(actor.label)} (?:reports|describes) ${targets.map((t) => lit(t?.label ?? '')).join(' and ')} ${lit(roles[index])} as ${lit(value ?? state)}`,
    );
    const qualified =
      state === 'simulated' || state === 'illustrative'
        ? `In (?:this|the) ${lit(qualifier ?? '')}, ${body}`
        : body;
    if (
      !expansionAssertedRelation(evidence, new RegExp(qualified, 'i'), condition, [
        actor.label,
        ...targets.map((t) => t?.label ?? ''),
        scope,
        period,
        ...(value ? [value] : []),
        ...(qualifier ? [qualifier] : []),
      ])
    )
      return fail('complete local source must assert this exact fact and qualification');
    facts.push({
      id: `expansion-${id}-fact-${index}`,
      actorId: actor.id,
      targetIds: targets.map((t) => t?.id ?? ''),
      role: roles[index],
      state,
      ...(value ? { value } : {}),
      ...(condition ? { condition } : {}),
      ...(qualifier ? { qualifier } : {}),
      scope,
      period,
      evidence: evidence.span,
    });
  }
  if (id === '78' && facts.slice(0, 3).every((f) => f.value !== undefined)) {
    const initial = facts[0].value,
      forward = facts[1].value?.split(' '),
      back = facts[2].value?.split(' ');
    if (
      forward?.[0] !== initial ||
      back?.[0] !== forward?.[2] ||
      back?.[2] !== initial ||
      initial === forward?.[2]
    )
      return fail('source transitions must name a distinct state and the explicit return state');
  }
  const result = facts.at(-1);
  if (
    !result ||
    b.story.outcome !== (result.value ?? result.state) ||
    result.evidence.fromWord !== raw.resolveWord
  )
    return fail('result must be the complete resolve clause, not an invented outcome');
  const common = {
    ...b.story,
    entities,
    scope,
    period,
    records: facts.slice(0, -1),
    relations: facts.slice(-1),
  };
  if (id === '78')
    return {
      ...common,
      storyId: '78',
      kind: 'material-process',
      preset: 'state-cycle',
      template: 'source-state-cycle',
    };
  if (!Array.isArray(raw.waves) || raw.waves.length !== 2)
    return fail('exactly two authored analytic sine waves');
  const waves: InterferenceWave[] = [];
  for (const [index, row] of raw.waves.entries()) {
    if (
      !isRec(row) ||
      !onlyFields(
        row,
        ['actor', 'model', 'amplitude', 'frequency', 'phaseData', 'domainDuration'],
        ctx,
      ) ||
      row.model !== 'sine' ||
      row.actor !== entities[index + 1].label
    )
      return fail('closed analytic waves, no evaluator or caller IDs');
    const amplitude = parseExpansionQuantity(row.amplitude, ctx),
      frequency = parseExpansionQuantity(row.frequency, ctx),
      phaseData = parseExpansionQuantity(row.phaseData, ctx),
      domainDuration = parseExpansionQuantity(row.domainDuration, ctx);
    if (!amplitude || !frequency || !phaseData || !domainDuration)
      return fail('each wave parameter requires complete local source evidence');
    const parameters = [amplitude, frequency, phaseData, domainDuration];
    if (
      parameters.some(
        (q, i) =>
          q.actor !== row.actor ||
          q.claim !== ['amplitude', 'frequency', 'phase', 'duration'][i] ||
          q.basis.unit !== ['metre', 'hertz', 'radian', 'second'][i] ||
          q.basis.period !== period ||
          q.basis.population !== scope ||
          (q.state === 'conditional' && q.condition !== b.story.condition) ||
          ((q.state === 'simulated' || q.state === 'illustrative') &&
            b.story.evidence !== 'illustrative'),
      )
    )
      return fail('parameter actor, unit, period and population must agree locally');
    for (const [i, q] of parameters.entries()) {
      const amounts = 'amount' in q ? [q.amount] : q.state === 'disputed' ? q.alternatives : [];
      if (
        amounts.some(
          (a) =>
            a.kind !== 'rational' ||
            a.value.numerator / a.value.denominator < (i === 3 ? 1e-9 : 0) ||
            a.value.numerator / a.value.denominator > [1000000, 1000, 6.283185307179586, 10000][i],
        )
      )
        return fail('bounded nonnegative authored parameters and positive domain extent');
    }
    waves.push({
      id: `expansion-77-wave-${index}`,
      entityId: entities[index + 1].id,
      model: 'sine',
      amplitude,
      frequency,
      phaseData,
      domainDuration,
    });
  }
  // No numeric outcome is inferred here. signal-sum is the only frozen permitted derivation,
  // and later authored visual sampling is not a new measured source assertion.
  return {
    ...common,
    storyId: '77',
    kind: 'signal-composition',
    preset: 'interference',
    template: 'analytic-superposition',
    waves,
  };
}
export function parseExpansionInterference(
  raw: Rec,
  ctx: ParseContext,
): ExpansionInterferenceCycleScene | null {
  return parse(raw, ctx, '77');
}
export function parseExpansionMaterialStateCycle(
  raw: Rec,
  ctx: ParseContext,
): ExpansionInterferenceCycleScene | null {
  return parse(raw, ctx, '78');
}
