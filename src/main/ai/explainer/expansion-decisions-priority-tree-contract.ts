/** Local source contracts for 27–28. No arithmetic, evaluator or automatic winner. */
import type {
  ExpansionCandidateEffect,
  ExpansionDecisionBranch,
  ExpansionDecisionNode,
  ExpansionDecisionResolution,
  ExpansionDecisionState,
  ExpansionDecisionText,
  ExpansionDecisionTreeScene,
  ExpansionWeightedCriteriaScene,
  ExpansionWeightedCriterion,
} from '../../remotion/compositions/explainer/expansion/decisions/priority-tree-types';
import type { ExpansionEntity } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  compare,
  compatibleBasis,
  rational,
} from '../../remotion/compositions/explainer/expansion/value-logic';
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
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

type Base = NonNullable<ReturnType<typeof expansionStoryBase>>;
function normalized(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
function literal(text: string): string {
  return normalized(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function match(text: string, body: string): boolean {
  return new RegExp(`^(?:${body})$`, 'iu').test(normalized(text).replace(/\.$/, ''));
}
function quote(text: string): string {
  return `(?:"${literal(text)}"|${literal(text)})`;
}
function ref(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  return (
    (typeof raw === 'string' ? entities.find((entity) => entity.label === raw) : undefined) ??
    mechanismIssue(
      ctx,
      'references must use exact declared source entity labels, never IDs or aliases',
    )
  );
}
function phrase(
  raw: unknown,
  evidence: ExpansionSourceEvidence,
  ctx: ParseContext,
  max = 96,
): string | null {
  const text = expansionSourceLabel(raw, evidence, ctx, max);
  return text && !/["“”{}[\]\\;`<>]|=>/.test(text)
    ? text
    : mechanismIssue(
        ctx,
        'decision text must be bounded plain source text, not markup, code or geometry',
      );
}
function same(a: string, b: string): boolean {
  return normalized(a).toLowerCase() === normalized(b).toLowerCase();
}
function wrap(body: string, condition?: string): string {
  return condition
    ? `(?:${literal(condition)},\\s+${body}|${body},?\\s+${literal(condition)})`
    : body;
}
function quantity(raw: unknown, ctx: ParseContext): ExpansionQuantity | null {
  const parsed = parseExpansionQuantity(raw, ctx);
  return (
    parsed ?? mechanismIssue(ctx, 'a weight or score needs complete source-owned quantity fields')
  );
}
interface TextInput extends ExpansionDecisionText {
  source: ExpansionSourceEvidence;
}
function textInput(raw: Rec, base: Base, ctx: ParseContext): TextInput | null {
  const source = expansionSourceSpan(raw.evidence, ctx);
  if (!source) return null;
  const text = phrase(raw.text, source, ctx);
  if (!text) return null;
  const state = raw.state;
  if (
    state !== 'known' &&
    state !== 'missing' &&
    state !== 'unknown' &&
    state !== 'disputed' &&
    state !== 'conditional' &&
    state !== 'simulated' &&
    state !== 'illustrative'
  )
    return mechanismIssue(ctx, 'decision text needs an explicit source qualification state');
  let qualifier: string | undefined;
  if (state === 'known') {
    if (
      raw.qualifier !== undefined ||
      /\b(?:unknown|missing|disputed|unresolved|may|might|could|would|should|will|simulation|simulated|illustrative|example)\b/i.test(
        text,
      )
    )
      return mechanismIssue(
        ctx,
        'qualified text cannot be promoted into a known outcome or effect',
      );
  } else {
    const parsed = phrase(raw.qualifier, source, ctx, 32);
    if (!parsed) return null;
    const allowed =
      state === 'conditional'
        ? /^(?:may|might|could|would|should|will)$/i
        : state === 'simulated'
          ? /^(?:simulation|simulated)$/i
          : state === 'illustrative'
            ? /^(?:illustrative|example|teaching example)$/i
            : state === 'unknown'
              ? /^(?:unknown|unresolved)$/i
              : new RegExp(`^${state}$`, 'i');
    if (
      !allowed.test(parsed) ||
      !new RegExp(`(?:^|\\b)${literal(parsed)}(?:\\b|$)`, 'iu').test(text)
    )
      return mechanismIssue(
        ctx,
        'qualification must belong to the complete local actor-owned text, not another sentence or effect',
      );
    qualifier = parsed;
  }
  let condition: string | undefined;
  if (raw.condition !== undefined) {
    const parsed = phrase(raw.condition, source, ctx);
    if (
      !parsed ||
      !base.story.condition ||
      !same(parsed, base.story.condition) ||
      state !== 'conditional'
    )
      return mechanismIssue(
        ctx,
        'record condition must retain the exact stated scene condition locally',
      );
    condition = base.story.condition;
  }
  return {
    text,
    state: state as ExpansionDecisionState,
    ...(qualifier ? { qualifier } : {}),
    ...(condition ? { condition } : {}),
    evidence: source.span,
    source,
  };
}
function resolution(
  raw: unknown,
  owner: ExpansionEntity,
  choices: readonly { entity: ExpansionEntity; available: boolean }[],
  base: Base,
  ctx: ParseContext,
): ExpansionDecisionResolution | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'choice'], ctx))
    return mechanismIssue(
      ctx,
      'resolution must be an explicit local source state, never an inferred winner',
    );
  // Resolve timing is checked by the shared source envelope.
  const source = base.spans.resolve;
  const clause = ctx.words
    .slice(ctx.win.startWord, ctx.win.endWord + 1)
    .findIndex((word) => word.start >= base.story.resolveAt);
  const fromWord = ctx.win.startWord + clause;
  const actual =
    clause >= 0 ? expansionSourceSpan({ fromWord, toWord: ctx.win.endWord }, ctx) : null;
  if (!actual || actual.text !== source)
    return mechanismIssue(ctx, 'resolution must retain the complete final source clause');
  const prefix = `${literal(owner.label)}'s\\s+choice`;
  if (raw.state === 'source-chosen') {
    const choice = choices.find((entry) => entry.entity.label === raw.choice);
    if (
      !choice?.available ||
      !match(
        source,
        `${prefix}\\s+(?:is|names)\\s+${literal(choice.entity.label)}(?:\\s+as the chosen option)?`,
      )
    )
      return mechanismIssue(
        ctx,
        'a choice requires its explicit known source result and source-owned selection; no ranking-based or unresolved winner',
      );
    return { state: 'source-chosen', choiceId: choice.entity.id, evidence: actual.span };
  }
  if (
    (raw.state !== 'unknown' && raw.state !== 'unresolved' && raw.state !== 'disputed') ||
    raw.choice !== undefined ||
    !same(base.story.outcome, raw.state) ||
    !match(
      source,
      `${prefix}\\s+(?:is|remains|stays|is still)\\s+${raw.state}(?:\\s+for both candidates)?`,
    )
  )
    return mechanismIssue(
      ctx,
      'unknown/unresolved/disputed choice must remain source-owned and cannot acquire a candidate',
    );
  return { state: raw.state, evidence: actual.span };
}
function orderedLabels(
  raw: unknown,
  criteria: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity[] | null {
  if (!Array.isArray(raw) || raw.length !== criteria.length)
    return mechanismIssue(ctx, 'a priority order must explicitly include every stated criterion');
  const order = raw.map((name) => criteria.find((criterion) => criterion.label === name));
  if (
    order.some((entry) => entry === undefined) ||
    new Set(order.map((entry) => entry?.id)).size !== criteria.length
  )
    return mechanismIssue(
      ctx,
      'priority order contains an invented, missing or repeated criterion',
    );
  return order as ExpansionEntity[];
}

export function parseExpansionWeightedCriteria(
  raw: Rec,
  ctx: ParseContext,
): ExpansionWeightedCriteriaScene | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'weighted criteria proposal must be an object');
  const base = expansionStoryBase(raw, ctx, '27', [
    'entities',
    'owner',
    'candidates',
    'criteria',
    'priorities',
    'effects',
    'scores',
    'resolution',
  ]);
  if (!base) return null;
  const entities = expansionEntities(raw.entities, ctx, '27');
  if (!entities) return null;
  const owner = ref(raw.owner, entities, ctx);
  if (!owner) return null;
  if (
    base.story.subject !== owner.label ||
    !Array.isArray(raw.candidates) ||
    raw.candidates.length !== 2 ||
    !Array.isArray(raw.criteria) ||
    raw.criteria.length < 2 ||
    raw.criteria.length > 4
  )
    return mechanismIssue(
      ctx,
      'weighted criteria needs its source owner, two candidates and 2–4 criteria',
    );
  const candidates = raw.candidates.map((value) => ref(value, entities, ctx));
  if (candidates.some((value) => !value)) return null;
  const options = candidates as ExpansionEntity[];
  const criteria: ExpansionWeightedCriterion[] = [],
    criterionEntities: ExpansionEntity[] = [];
  for (const entry of raw.criteria) {
    if (!isRec(entry) || !onlyFields(entry, ['entity', 'weight'], ctx))
      return mechanismIssue(ctx, 'criteria accept only exact entity and optional source weight');
    const entity = ref(entry.entity, entities, ctx);
    if (!entity) return null;
    const weight = entry.weight === undefined ? undefined : quantity(entry.weight, ctx);
    if (weight === null) return null;
    if (
      weight &&
      (weight.actor !== owner.label ||
        weight.claim !== `${entity.label} weight` ||
        weight.basis.population !== base.story.label ||
        !['count', 'ratio', 'percent'].includes(weight.basis.unit))
    )
      return mechanismIssue(
        ctx,
        'weight must bind its actual actor, criterion and priority scope with explicit source units',
      );
    if (weight) {
      const amounts =
        weight.state === 'disputed'
          ? weight.alternatives
          : 'amount' in weight
            ? [weight.amount]
            : [];
      for (const amount of amounts) {
        if (amount.kind !== 'rational' || amount.value.numerator < 0)
          return mechanismIssue(
            ctx,
            'weights must be explicit nonnegative rational source values, not currencies or anonymous defaults',
          );
        const cap =
          weight.basis.unit === 'percent' ? 100 : weight.basis.unit === 'ratio' ? 1 : undefined;
        if (cap !== undefined) {
          const bound = rational(cap);
          const comparison = bound.ok ? compare(amount.value, bound.value) : bound;
          if (!comparison.ok || comparison.value > 0)
            return mechanismIssue(ctx, 'a source weight exceeds its stated percent/ratio scale');
        }
      }
    }
    criterionEntities.push(entity);
    criteria.push({ entityId: entity.id, ...(weight ? { weight } : {}) });
  }
  if (
    new Set([
      owner.id,
      ...options.map((value) => value.id),
      ...criterionEntities.map((value) => value.id),
    ]).size !== entities.length ||
    entities.length !== 1 + options.length + criteria.length
  )
    return mechanismIssue(
      ctx,
      'owner, candidates and criteria must be distinct source entities without unused options',
    );
  const weights = criteria.flatMap((entry) => (entry.weight ? [entry.weight] : []));
  if (
    weights.some((weight) => weights.some((other) => !compatibleBasis(weight.basis, other.basis)))
  )
    return mechanismIssue(ctx, 'source weights need compatible units, populations and periods');
  const title = `${literal(owner.label)}'s\\s+${literal(base.story.label)}`;
  let priorities: ExpansionWeightedCriteriaScene['priorities'];
  if (raw.priorities !== undefined) {
    const input = raw.priorities;
    if (!isRec(input) || !onlyFields(input, ['before', 'after'], ctx))
      return mechanismIssue(
        ctx,
        'qualitative priorities need both explicit before and after source orders',
      );
    const parseOrder = (value: unknown, after: boolean) => {
      if (!isRec(value) || !onlyFields(value, ['order', 'evidence'], ctx))
        return mechanismIssue(
          ctx,
          'priority order needs only actual labels and complete local evidence',
        );
      const order = orderedLabels(value.order, criterionEntities, ctx),
        evidence = expansionSourceSpan(value.evidence, ctx);
      if (!order || !evidence) return null;
      const chain = order.map((entity) => literal(entity.label)).join('\\s+before\\s+');
      if (
        !match(
          evidence.text,
          `${title}\\s+${after ? '(?:now\\s+)?' : ''}(?:ranks?|places?|puts)\\s+${chain}`,
        )
      )
        return mechanismIssue(
          ctx,
          'priority order must be explicitly actor- and endpoint-bound in its own complete source clause',
        );
      return { order: order.map((entity) => entity.id), evidence: evidence.span };
    };
    const before = parseOrder(input.before, false),
      after = parseOrder(input.after, true);
    if (!before || !after) return null;
    if (before.evidence.fromWord >= after.evidence.fromWord)
      return mechanismIssue(ctx, 'before/after priorities must retain the source chronology');
    priorities = { before, after };
  } else if (
    weights.length !== criteria.length ||
    !match(
      base.spans.setup,
      `${title}\\s+(?:includes?|lists?)\\s+criteria\\s+${criterionEntities.map((entity) => literal(entity.label)).join('\\s+and\\s+')}`,
    )
  )
    return mechanismIssue(
      ctx,
      'supply every stated weight or explicit before/after qualitative priorities; never fill a missing weight',
    );
  if (priorities && priorities.before.evidence.fromWord !== ctx.win.startWord)
    return mechanismIssue(ctx, 'initial priority order belongs to setup');
  if (
    !Array.isArray(raw.effects) ||
    raw.effects.length !== options.length * criteria.length ||
    raw.effects.length > EXPANSION_LIMITS.records
  )
    return mechanismIssue(
      ctx,
      'effects need the complete bounded source candidate/criterion matrix',
    );
  const effects: ExpansionCandidateEffect[] = [];
  const inputs: { candidate: ExpansionEntity; criterion: ExpansionEntity; value: TextInput }[] = [];
  for (const entry of raw.effects) {
    if (
      !isRec(entry) ||
      !onlyFields(
        entry,
        ['candidate', 'criterion', 'actor', 'text', 'state', 'qualifier', 'condition', 'evidence'],
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'effects accept only source-owned candidate, criterion, text and qualification',
      );
    const candidate = options.find((option) => option.label === entry.candidate),
      criterion = criterionEntities.find((value) => value.label === entry.criterion),
      actor = ref(entry.actor, entities, ctx),
      value = textInput(entry, base, ctx);
    if (!candidate || !criterion || !actor || !value)
      return mechanismIssue(ctx, 'effect endpoints and source qualification must be bound');
    if (
      actor.id !== owner.id ||
      inputs.some(
        (input) => input.candidate.id === candidate.id && input.criterion.id === criterion.id,
      )
    )
      return mechanismIssue(
        ctx,
        'effects must retain the actual actor and unique candidate/criterion pair',
      );
    inputs.push({ candidate, criterion, value });
    effects.push({
      actorId: actor.id,
      candidateId: candidate.id,
      criterionId: criterion.id,
      text: value.text,
      state: value.state,
      ...(value.qualifier ? { qualifier: value.qualifier } : {}),
      ...(value.condition ? { condition: value.condition } : {}),
      evidence: value.evidence,
    });
  }
  for (const input of inputs) {
    const local = inputs.filter(
      (other) =>
        other.candidate.id === input.candidate.id &&
        other.value.evidence.fromWord === input.value.evidence.fromWord &&
        other.value.evidence.toWord === input.value.evidence.toWord,
    );
    if (local.some((other) => other.value.condition !== input.value.condition))
      return mechanismIssue(ctx, 'a local candidate clause cannot lose or change its condition');
    const body = `${literal(owner.label)}'s\\s+candidate\\s+${literal(input.candidate.label)}\\s+(?:has|carries)\\s+(?:the\\s+)?${local.map((other) => `${literal(other.criterion.label)}\\s+effect\\s+${quote(other.value.text)}`).join('\\s+(?:and|while)\\s+')}`;
    if (!match(input.value.source.text, wrap(body, input.value.condition)))
      return mechanismIssue(
        ctx,
        'effects must be complete local actor/candidate/criterion propositions, not word co-occurrence across sentences',
      );
  }
  const scores: { candidateId: string; quantity: ExpansionQuantity }[] = [];
  if (raw.scores !== undefined) {
    if (!Array.isArray(raw.scores) || raw.scores.length > options.length)
      return mechanismIssue(
        ctx,
        'scores are optional explicit source values, never calculated or repeated',
      );
    for (const entry of raw.scores) {
      if (!isRec(entry) || !onlyFields(entry, ['candidate', 'quantity'], ctx))
        return mechanismIssue(ctx, 'a source score needs only its candidate and supplied quantity');
      const candidate = options.find((option) => option.label === entry.candidate),
        value = quantity(entry.quantity, ctx);
      if (
        !candidate ||
        !value ||
        value.actor !== owner.label ||
        value.claim !== `${candidate.label} score` ||
        value.basis.population !== base.story.label ||
        scores.some((score) => score.candidateId === candidate.id)
      )
        return mechanismIssue(
          ctx,
          'score must bind its actual actor, candidate and priority scope locally',
        );
      scores.push({ candidateId: candidate.id, quantity: value });
    }
  }
  if (
    effects.length + weights.length + scores.length > EXPANSION_LIMITS.records ||
    effects.length + (priorities ? 2 * (criteria.length - 1) : 0) > EXPANSION_LIMITS.relations
  )
    return mechanismIssue(ctx, 'decision records/relationships exceed approved bounds');
  const result = resolution(
    raw.resolution,
    owner,
    options.map((option) => ({
      entity: option,
      available: effects
        .filter((effect) => effect.candidateId === option.id)
        .every((effect) => effect.state === 'known'),
    })),
    base,
    ctx,
  );
  if (!result) return null;
  return {
    ...base.story,
    storyId: '27',
    kind: 'constraint-choice',
    preset: 'weighted-criteria',
    entities,
    ownerId: owner.id,
    candidateIds: options.map((option) => option.id),
    criteria,
    ...(priorities ? { priorities } : {}),
    effects,
    scores,
    resolution: result,
    resolutionText: base.spans.resolve,
  };
}

interface NodeInput {
  entity: ExpansionEntity;
  role: 'condition' | 'outcome';
  value: TextInput;
}
function declaration(owner: ExpansionEntity, title: string, local: readonly NodeInput[]): string {
  return `${literal(owner.label)}'s\\s+${literal(title)}\\s+(?:defines|gives|states)\\s+${local.map((node) => `${node.role}\\s+${literal(node.entity.label)}\\s+as\\s+${quote(node.value.text)}`).join('\\s+(?:and|while)\\s+')}`;
}
export function parseExpansionDecisionTree(
  raw: Rec,
  ctx: ParseContext,
): ExpansionDecisionTreeScene | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'decision tree proposal must be an object');
  const base = expansionStoryBase(raw, ctx, '28', [
    'entities',
    'owner',
    'root',
    'nodes',
    'branches',
    'resolution',
  ]);
  if (!base) return null;
  const entities = expansionEntities(raw.entities, ctx, '28');
  if (!entities) return null;
  const owner = ref(raw.owner, entities, ctx),
    root = ref(raw.root, entities, ctx);
  if (!owner || !root) return null;
  if (
    base.story.subject !== owner.label ||
    owner.id === root.id ||
    !Array.isArray(raw.nodes) ||
    raw.nodes.length < 3 ||
    raw.nodes.length > 7 ||
    raw.nodes.length > EXPANSION_LIMITS.records
  )
    return mechanismIssue(ctx, 'tree needs one named owner and 3–7 explicitly sourced nodes');
  const inputs: NodeInput[] = [],
    nodes: ExpansionDecisionNode[] = [];
  for (const entry of raw.nodes) {
    if (
      !isRec(entry) ||
      !onlyFields(
        entry,
        ['entity', 'actor', 'role', 'text', 'state', 'qualifier', 'condition', 'evidence'],
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'nodes need source entity, actor, condition/outcome role and qualified text',
      );
    const entity = ref(entry.entity, entities, ctx),
      actor = ref(entry.actor, entities, ctx),
      value = textInput(entry, base, ctx);
    if (!entity || !actor || !value) return null;
    if (
      actor.id !== owner.id ||
      entity.id === owner.id ||
      (entry.role !== 'condition' && entry.role !== 'outcome') ||
      inputs.some((node) => node.entity.id === entity.id)
    )
      return mechanismIssue(
        ctx,
        'tree node identities, actors and roles must remain distinct and source-owned',
      );
    inputs.push({ entity, role: entry.role, value });
    nodes.push({
      entityId: entity.id,
      actorId: actor.id,
      role: entry.role,
      text: value.text,
      state: value.state,
      ...(value.qualifier ? { qualifier: value.qualifier } : {}),
      ...(value.condition ? { condition: value.condition } : {}),
      evidence: value.evidence,
    });
  }
  if (
    entities.length !== nodes.length + 1 ||
    !inputs.some((node) => node.entity.id === root.id && node.role === 'condition')
  )
    return mechanismIssue(
      ctx,
      'all named entities must be bound nodes and the root must be a condition, not an inferred result',
    );
  for (const input of inputs) {
    const local = inputs.filter(
      (other) =>
        other.value.evidence.fromWord === input.value.evidence.fromWord &&
        other.value.evidence.toWord === input.value.evidence.toWord,
    );
    if (
      local.some((other) => other.value.condition !== input.value.condition) ||
      !match(
        input.value.source.text,
        wrap(declaration(owner, base.story.label, local), input.value.condition),
      )
    )
      return mechanismIssue(
        ctx,
        'node declarations must be actor-, node- and role-bound complete local source propositions',
      );
  }
  const rootNode = inputs.find((node) => node.entity.id === root.id);
  if (!rootNode || rootNode.value.source.text !== base.spans.setup)
    return mechanismIssue(
      ctx,
      'root condition definition must belong to setup, never a condition assumed true',
    );
  if (
    !Array.isArray(raw.branches) ||
    raw.branches.length < 2 ||
    raw.branches.length > EXPANSION_LIMITS.relations ||
    raw.branches.length !== nodes.length - 1
  )
    return mechanismIssue(
      ctx,
      'branches need a bounded connected source tree, not detached or extra edges',
    );
  const branches: ExpansionDecisionBranch[] = [];
  for (const entry of raw.branches) {
    if (!isRec(entry) || !onlyFields(entry, ['from', 'to', 'test', 'evidence'], ctx))
      return mechanismIssue(
        ctx,
        'branches accept only exact node endpoints and a source test, not evaluators',
      );
    const from = inputs.find((node) => node.entity.label === entry.from),
      to = inputs.find((node) => node.entity.label === entry.to),
      evidence = expansionSourceSpan(entry.evidence, ctx);
    if (
      !from ||
      !to ||
      !evidence ||
      from.role !== 'condition' ||
      from === to ||
      to.entity.id === root.id
    )
      return mechanismIssue(
        ctx,
        'branch directions must connect an actual condition to an actual non-root node',
      );
    const test = phrase(entry.test, evidence, ctx);
    if (!test) return null;
    if (
      branches.some(
        (branch) =>
          branch.toId === to.entity.id ||
          (branch.fromId === from.entity.id && same(branch.test, test)),
      )
    )
      return mechanismIssue(
        ctx,
        'tree nodes have one parent and each condition needs distinct source branch tests',
      );
    const body = `${literal(owner.label)}'s\\s+(?:${literal(base.story.label)}\\s+)?condition\\s+${literal(from.entity.label)}\\s+(?:leads|points|routes)\\s+to\\s+${to.role}\\s+${literal(to.entity.label)}\\s+(?:on branch|for case)\\s+${quote(test)}`;
    if (!match(evidence.text, body))
      return mechanismIssue(
        ctx,
        'branch meaning must bind its actor, exact condition, predicate and outcome endpoints in one local clause',
      );
    branches.push({
      fromId: from.entity.id,
      toId: to.entity.id,
      role: 'conditional',
      test,
      evidence: evidence.span,
    });
  }
  for (const node of inputs) {
    const outgoing = branches.filter((branch) => branch.fromId === node.entity.id);
    if (
      (node.role === 'condition' && (outgoing.length < 2 || outgoing.length > 4)) ||
      (node.role === 'outcome' && outgoing.length !== 0)
    )
      return mechanismIssue(
        ctx,
        'conditions need 2–4 explicit alternatives; outcomes cannot invent further decisions',
      );
  }
  const reached = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string): boolean => {
    if (active.has(id)) return false;
    if (reached.has(id)) return true;
    active.add(id);
    for (const branch of branches.filter((edge) => edge.fromId === id))
      if (!visit(branch.toId)) return false;
    active.delete(id);
    reached.add(id);
    return true;
  };
  if (!visit(root.id) || reached.size !== nodes.length)
    return mechanismIssue(
      ctx,
      'tree must be connected and acyclic; no unbound or unreachable result',
    );
  const result = resolution(
    raw.resolution,
    owner,
    inputs
      .filter((node) => node.role === 'outcome')
      .map((node) => ({ entity: node.entity, available: node.value.state === 'known' })),
    base,
    ctx,
  );
  if (!result) return null;
  return {
    ...base.story,
    storyId: '28',
    kind: 'conditional-choice',
    preset: 'decision-tree',
    entities,
    ownerId: owner.id,
    rootId: root.id,
    nodes,
    branches,
    resolution: result,
    resolutionText: base.spans.resolve,
  };
}
