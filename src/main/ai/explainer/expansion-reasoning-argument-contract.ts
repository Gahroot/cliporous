/** Local source contracts for expansion stories 03–04; no global kind registration. */
import type {
  ArgumentMapReasonsObjectionsScene,
  ConditionalComparisonAssumptionToggleScene,
  ExpansionArgumentEdge,
  ExpansionArgumentEdgeState,
  ExpansionArgumentResolution,
  ExpansionArgumentRole,
} from '../../remotion/compositions/explainer/expansion/reasoning/argument-types';
import type { ExpansionEntity } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  EXPANSION_LIMITS,
  type ExpansionEvidenceSpan,
} from '../../remotion/compositions/explainer/expansion/value-types';
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

const WORD_FIELDS = [
  'setupWord',
  'actionWord',
  'responseWord',
  'checkWord',
  'resolveWord',
] as const;
type Base = NonNullable<ReturnType<typeof expansionStoryBase>>;

function normalized(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every interpolated value is escaped; the caller never supplies a pattern. */
function literal(text: string): string {
  return normalized(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}

function sameText(first: string, second: string): boolean {
  return normalized(first).toLowerCase() === normalized(second).toLowerCase();
}

function sameSpan(first: ExpansionEvidenceSpan, second: ExpansionEvidenceSpan): boolean {
  return first.fromWord === second.fromWord && first.toWord === second.toWord;
}

function matches(evidence: ExpansionSourceEvidence | string, body: string): boolean {
  const text = normalized(typeof evidence === 'string' ? evidence : evidence.text).replace(
    /\.$/,
    '',
  );
  return new RegExp(`^(?:${body})$`, 'iu').test(text);
}

function phrase(
  raw: unknown,
  evidence: ExpansionSourceEvidence | string,
  ctx: ParseContext,
  max: number,
): string | null {
  const text = expansionSourceLabel(raw, evidence, ctx, max);
  // Quotations are text, not nested quotes, executable snippets, paths or markup.
  return text && !/["“”{}[\]\\;]|=>/.test(text)
    ? text
    : mechanismIssue(ctx, 'reasoning text must be a bounded plain source quotation');
}

function entity(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const found = typeof raw === 'string' ? entities.find((entry) => entry.label === raw) : undefined;
  return (
    found ??
    mechanismIssue(
      ctx,
      'references must use an exact declared entity label, never a caller ID or alias',
    )
  );
}

function baseStory(
  raw: Rec,
  ctx: ParseContext,
  id: '03' | '04',
  fields: readonly string[],
): Base | null {
  const base = expansionStoryBase(raw, ctx, id, fields);
  if (!base) return null;
  // These stories have five complete local clauses, not five samples of a larger sentence.
  const indices = WORD_FIELDS.map((field) => ctx.inWin(raw[field]));
  if (indices[0] !== ctx.win.startWord)
    return mechanismIssue(ctx, 'setup must begin the complete source window');
  for (const [index, fromWord] of indices.entries()) {
    const next = indices[index + 1];
    const toWord =
      index === indices.length - 1
        ? ctx.win.endWord
        : next === null || next === undefined
          ? null
          : next - 1;
    if (fromWord === null || toWord === null || !expansionSourceSpan({ fromWord, toWord }, ctx))
      return mechanismIssue(
        ctx,
        'each of the five beats must begin a separate complete local clause',
      );
  }
  return base;
}

function localCondition(
  raw: unknown,
  evidence: ExpansionSourceEvidence,
  base: Base,
  ctx: ParseContext,
): string | undefined | null {
  if (raw === undefined) return undefined;
  const condition = phrase(raw, evidence, ctx, EXPANSION_LIMITS.qualifier);
  return condition && base.story.condition && sameText(condition, base.story.condition)
    ? base.story.condition
    : mechanismIssue(
        ctx,
        'a record condition must retain the exact stated scene condition in its own clause',
      );
}

function conditional(body: string, condition?: string): string {
  return condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
}

function resolution(
  raw: unknown,
  base: Base,
  owner: string,
  ctx: ParseContext,
): ExpansionArgumentResolution | null {
  if (raw !== 'unknown' && raw !== 'disputed' && raw !== 'unresolved')
    return mechanismIssue(
      ctx,
      'resolution must preserve unknown, disputed or unresolved status; no truth certification or winner',
    );
  if (
    !sameText(base.story.outcome, raw) ||
    !matches(base.spans.resolve, `${owner}\\s+(?:is|remains|stays|is still)\\s+${literal(raw)}`)
  )
    return mechanismIssue(
      ctx,
      'resolution and outcome must belong to the named claim/comparison in the complete final clause',
    );
  return raw;
}

interface NodeInput {
  entity: ExpansionEntity;
  actor: ExpansionEntity;
  role: ExpansionArgumentRole;
  statement: string;
  evidence: ExpansionSourceEvidence;
  condition?: string;
}
interface EdgeInput {
  from: NodeInput;
  to: NodeInput;
  role: 'support' | 'rebuttal';
  state: ExpansionArgumentEdgeState;
  evidence: ExpansionSourceEvidence;
  qualifier?: string;
  condition?: string;
}

function nodeName(node: NodeInput): string {
  return `(?:the\\s+)?${node.role}\\s+${literal(node.entity.label)}`;
}
function ownedNode(node: NodeInput): string {
  return `${literal(node.actor.label)}'s\\s+${nodeName(node)}`;
}
function targetName(node: NodeInput): string {
  return `(?:${nodeName(node)}|${ownedNode(node)})`;
}
function quotation(text: string): string {
  const escaped = literal(text);
  return `(?:"${escaped}"|${escaped})`;
}
function declaration(node: NodeInput): string {
  const text = quotation(node.statement);
  return `(?:${ownedNode(node)}\\s+(?:says|states|is|is that)\\s+${text}|${literal(node.actor.label)}\\s+(?:states|presents|describes)\\s+${nodeName(node)}\\s+(?:as|as saying|as the statement)\\s+${text})`;
}

/** Relation vocabulary is authored and endpoint-aware, not a label/co-occurrence check. */
function edgeVerb(edge: EdgeInput): string {
  const infinitive = edge.role === 'support' ? '(?:support|back)' : '(?:rebut|challenge)';
  const finite =
    edge.role === 'support'
      ? '(?:supports|backs|is a reason for)'
      : '(?:rebuts|challenges|is an objection to)';
  if (edge.state === 'stated') return finite;
  if (edge.state === 'qualified') return `${literal(edge.qualifier ?? '')}\\s+${infinitive}`;
  if (edge.state === 'negated') {
    const qualifier = edge.qualifier ?? '';
    return sameText(qualifier, 'never')
      ? `${literal(qualifier)}\\s+${finite}`
      : `${literal(qualifier)}\\s+${infinitive}`;
  }
  // Unknown/disputed links describe the relationship's status, not affirmative support.
  return `has\\s+${edge.state}\\s+${edge.role}\\s+(?:for|against)`;
}
function edgeTail(edge: EdgeInput): string {
  return `\\s+and\\s+${edgeVerb(edge)}\\s+${targetName(edge.to)}`;
}
function standaloneEdge(edge: EdgeInput): string {
  const direct = `${ownedNode(edge.from)}\\s+${edgeVerb(edge)}\\s+${targetName(edge.to)}`;
  if (edge.state === 'unknown' || edge.state === 'disputed') {
    return `(?:${direct}|${literal(edge.from.actor.label)}'s\\s+${edge.role}\\s+from\\s+${nodeName(edge.from)}\\s+to\\s+${targetName(edge.to)}\\s+(?:is|remains)\\s+${edge.state})`;
  }
  if (edge.state !== 'stated') return direct;
  const verb = edge.role === 'support' ? '(?:support|back)' : '(?:rebut|challenge)';
  const noun = edge.role === 'support' ? 'reason for' : 'objection to';
  return `(?:${direct}|${literal(edge.from.actor.label)}\\s+(?:uses|offers|cites)\\s+${nodeName(edge.from)}\\s+to\\s+${verb}\\s+${targetName(edge.to)}|${nodeName(edge.from)}\\s+is\\s+${literal(edge.from.actor.label)}'s\\s+${noun}\\s+${targetName(edge.to)})`;
}

function parseNodes(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  base: Base,
  ctx: ParseContext,
): NodeInput[] | null {
  if (
    !Array.isArray(raw) ||
    raw.length < 3 ||
    raw.length > Math.min(EXPANSION_LIMITS.actors, EXPANSION_LIMITS.records)
  )
    return mechanismIssue(ctx, 'argument needs bounded claim, premise and objection records');
  const nodes: NodeInput[] = [];
  for (const entry of raw) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['entity', 'actor', 'role', 'statement', 'evidence', 'condition'], ctx)
    )
      return null;
    const identity = entity(entry.entity, entities, ctx);
    const actor = entity(entry.actor, entities, ctx);
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    if (!identity || !actor || !evidence) return null;
    const statement = phrase(entry.statement, evidence, ctx, EXPANSION_LIMITS.claim);
    const condition = localCondition(entry.condition, evidence, base, ctx);
    if (!statement || condition === null) return null;
    if (entry.role !== 'claim' && entry.role !== 'premise' && entry.role !== 'objection')
      return mechanismIssue(ctx, 'node role must be claim, premise or objection');
    if (identity.id === actor.id || nodes.some((node) => node.entity.id === identity.id))
      return mechanismIssue(
        ctx,
        'argument nodes must have distinct identities separate from their actors',
      );
    nodes.push({
      entity: identity,
      actor,
      role: entry.role,
      statement,
      evidence,
      ...(condition ? { condition } : {}),
    });
  }
  if (nodes.some((node) => nodes.some((other) => other.entity.id === node.actor.id)))
    return mechanismIssue(ctx, 'an actor cannot also be a proposition node');
  if (
    nodes.filter((node) => node.role === 'claim').length !== 1 ||
    !nodes.some((node) => node.role === 'premise') ||
    !nodes.some((node) => node.role === 'objection')
  )
    return mechanismIssue(
      ctx,
      'exactly one named claim plus at least one premise and one objection are required',
    );
  return nodes;
}

function parseEdges(
  raw: unknown,
  nodes: readonly NodeInput[],
  base: Base,
  ctx: ParseContext,
): EdgeInput[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > EXPANSION_LIMITS.relations)
    return mechanismIssue(ctx, 'argument needs two to sixteen explicit typed edges');
  const edges: EdgeInput[] = [];
  for (const entry of raw) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['from', 'to', 'role', 'state', 'evidence', 'qualifier', 'condition'], ctx)
    )
      return null;
    const from = nodes.find((node) => node.entity.label === entry.from);
    const to = nodes.find((node) => node.entity.label === entry.to);
    if (!from || !to || from === to || (entry.role !== 'support' && entry.role !== 'rebuttal'))
      return mechanismIssue(ctx, 'typed argument edges need distinct bound proposition endpoints');
    if (
      from.role === 'claim' ||
      (entry.role === 'support' ? from.role !== 'premise' : from.role !== 'objection')
    )
      return mechanismIssue(
        ctx,
        'support must point from a premise and rebuttal from an objection toward the root, never out of the claim',
      );
    if (
      entry.state !== 'stated' &&
      entry.state !== 'qualified' &&
      entry.state !== 'unknown' &&
      entry.state !== 'disputed' &&
      entry.state !== 'negated'
    )
      return mechanismIssue(
        ctx,
        'edge state must retain stated, qualified, unknown, disputed or negated argumentation',
      );
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    if (!evidence) return null;
    const condition = localCondition(entry.condition, evidence, base, ctx);
    if (condition === null) return null;
    let qualifier: string | undefined;
    if (entry.state === 'stated') {
      if (entry.qualifier !== undefined)
        return mechanismIssue(ctx, 'a stated edge cannot hide a qualification');
    } else {
      const supplied =
        entry.qualifier === undefined && (entry.state === 'unknown' || entry.state === 'disputed')
          ? entry.state
          : entry.qualifier;
      const parsed = phrase(supplied, evidence, ctx, EXPANSION_LIMITS.qualifier);
      if (!parsed) return null;
      qualifier = normalized(parsed).toLowerCase();
      if (
        (entry.state === 'qualified' && !['may', 'might', 'could', 'would'].includes(qualifier)) ||
        (entry.state === 'negated' &&
          !['does not', 'did not', "doesn't", "didn't", 'cannot', 'never'].includes(qualifier)) ||
        ((entry.state === 'unknown' || entry.state === 'disputed') && qualifier !== entry.state)
      )
        return mechanismIssue(
          ctx,
          'edge qualifier must be an authored literal matching its local state',
        );
      qualifier = parsed;
    }
    edges.push({
      from,
      to,
      role: entry.role,
      state: entry.state,
      evidence,
      ...(qualifier ? { qualifier } : {}),
      ...(condition ? { condition } : {}),
    });
  }
  return edges;
}

function rootedTree(
  nodes: readonly NodeInput[],
  edges: readonly EdgeInput[],
  root: NodeInput,
  ctx: ParseContext,
): boolean {
  if (edges.length !== nodes.length - 1) {
    mechanismIssue(
      ctx,
      'argument must be a connected tree with exactly one parent per non-root node',
    );
    return false;
  }
  const parents = new Map<string, NodeInput>();
  for (const edge of edges) {
    if (edge.from === root || parents.has(edge.from.entity.id)) {
      mechanismIssue(
        ctx,
        'argument directions must have one parent per non-root node and no parent for the claim',
      );
      return false;
    }
    parents.set(edge.from.entity.id, edge.to);
  }
  for (const node of nodes) {
    let cursor = node;
    const visited = new Set<string>();
    while (cursor !== root) {
      if (visited.has(cursor.entity.id)) {
        mechanismIssue(ctx, 'argument cycles are not permitted');
        return false;
      }
      visited.add(cursor.entity.id);
      const parent = parents.get(cursor.entity.id);
      if (!parent) {
        mechanismIssue(ctx, 'every argument node must reach the named claim');
        return false;
      }
      cursor = parent;
    }
  }
  return true;
}

/** Raw references are entity LABELS. Statements are whole speaker-owned quotations, not facts
 * reconstructed from words elsewhere. Edges mean argumentation, never truth certification. */
export function parseArgumentMapReasonsObjections(
  raw: Rec,
  ctx: ParseContext,
): ArgumentMapReasonsObjectionsScene | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'argument-map proposal must be an object');
  const base = baseStory(raw, ctx, '03', ['entities', 'claim', 'nodes', 'edges', 'resolution']);
  if (!base) return null;
  const entities = expansionEntities(raw.entities, ctx, '03');
  if (!entities) return null;
  const nodes = parseNodes(raw.nodes, entities, base, ctx);
  if (!nodes) return null;
  const root = nodes.find((node) => node.entity.label === raw.claim && node.role === 'claim');
  if (
    !root ||
    base.story.label !== root.entity.label ||
    base.story.subject !== root.actor.label ||
    !sameSpan(root.evidence.span, {
      fromWord: ctx.win.startWord,
      toWord: Number(raw.actionWord) - 1,
    })
  )
    return mechanismIssue(
      ctx,
      'claim, title and subject must identify the actor-owned claim in setup',
    );
  const edges = parseEdges(raw.edges, nodes, base, ctx);
  if (!edges || !rootedTree(nodes, edges, root, ctx)) return null;
  const used = new Set(nodes.flatMap((node) => [node.entity.id, node.actor.id]));
  if (entities.some((entry) => !used.has(entry.id)))
    return mechanismIssue(
      ctx,
      'argument entities must be used actors or proposition nodes, not unbound extras',
    );
  for (const node of nodes) {
    const localEdge = edges.find(
      (edge) => edge.from === node && sameSpan(edge.evidence.span, node.evidence.span),
    );
    if (localEdge && localEdge.condition !== node.condition)
      return mechanismIssue(
        ctx,
        'a proposition and its local edge must retain the same conditional scope',
      );
    const body = declaration(node) + (localEdge ? edgeTail(localEdge) : '');
    if (!matches(node.evidence, conditional(body, node.condition)))
      return mechanismIssue(
        ctx,
        'each complete proposition must be attributed to its exact actor and named argument role; do not shorten or borrow a statement',
      );
  }
  for (const edge of edges) {
    const combined = sameSpan(edge.evidence.span, edge.from.evidence.span)
      ? declaration(edge.from) + edgeTail(edge)
      : standaloneEdge(edge);
    if (!matches(edge.evidence, conditional(combined, edge.condition)))
      return mechanismIssue(
        ctx,
        'support/rebuttal must explicitly bind the actor, named endpoints, direction and qualification in one entire local clause',
      );
  }
  // Non-fact review narration is bounded too: it cannot silently introduce another actor,
  // condition, unsupported result or adjudication during an otherwise unused beat.
  const review = `${literal(root.actor.label)}\\s+(?:reviews|checks|examines)\\s+(?:the\\s+)?(?:argument|premises and objections)\\s+(?:for|about)\\s+${targetName(root)}(?:\\s+without treating support as proof)?`;
  for (const text of [base.spans.setup, base.spans.action, base.spans.response, base.spans.check]) {
    if (
      !nodes.some((node) => node.evidence.text === text) &&
      !edges.some((edge) => edge.evidence.text === text) &&
      !matches(text, review)
    )
      return mechanismIssue(
        ctx,
        'each argument beat must contain a validated proposition, relation or claim-owned review',
      );
  }
  const final = resolution(
    raw.resolution,
    base,
    `(?:${targetName(root)}|${literal(root.entity.label)})`,
    ctx,
  );
  if (!final) return null;
  const parsedEdges: ExpansionArgumentEdge[] = edges.map((edge) => ({
    fromId: edge.from.entity.id,
    toId: edge.to.entity.id,
    role: edge.role,
    state: edge.state,
    evidence: edge.evidence.span,
    ...(edge.qualifier ? { qualifier: edge.qualifier } : {}),
    ...(edge.condition ? { condition: edge.condition } : {}),
  }));
  return {
    ...base.story,
    storyId: '03',
    kind: 'argument-map',
    preset: 'reasons-objections',
    entities,
    claimId: root.entity.id,
    nodes: nodes.map((node) => ({
      entityId: node.entity.id,
      actorId: node.actor.id,
      role: node.role,
      statement: node.statement,
      evidence: node.evidence.span,
      ...(node.condition ? { condition: node.condition } : {}),
    })),
    edges: parsedEdges,
    resolution: final,
  };
}

interface EffectInput {
  alternative: ExpansionEntity;
  actor: ExpansionEntity;
  text: string;
  condition: string;
  evidence: ExpansionSourceEvidence;
}
function effectBody(effect: EffectInput): string {
  return `${literal(effect.actor.label)}'s\\s+(?:alternative|option|plan)\\s+${literal(effect.alternative.label)}\\s+(?:has|carries)\\s+(?:the\\s+)?effect\\s+${quotation(effect.text)}`;
}

/** Both effects must be inside the SAME complete, explicitly conditioned assertion.
 * A condition in one sentence and an unrelated effect elsewhere cannot establish a result. */
export function parseConditionalComparisonAssumptionToggle(
  raw: Rec,
  ctx: ParseContext,
): ConditionalComparisonAssumptionToggleScene | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'conditional-comparison proposal must be an object');
  const base = baseStory(raw, ctx, '04', [
    'entities',
    'actor',
    'alternatives',
    'effects',
    'resolution',
  ]);
  if (!base) return null;
  const entities = expansionEntities(raw.entities, ctx, '04');
  if (!entities) return null;
  const actor = entity(raw.actor, entities, ctx);
  if (!actor || actor.label !== base.story.subject || !base.story.condition)
    return mechanismIssue(
      ctx,
      'comparison needs its named setup actor and the complete explicit source condition',
    );
  if (!Array.isArray(raw.alternatives) || raw.alternatives.length !== 2)
    return mechanismIssue(ctx, 'assumption-toggle needs exactly two named alternative labels');
  const first = entity(raw.alternatives[0], entities, ctx);
  const second = entity(raw.alternatives[1], entities, ctx);
  if (
    !first ||
    !second ||
    first.id === second.id ||
    first.id === actor.id ||
    second.id === actor.id
  )
    return mechanismIssue(
      ctx,
      'the two alternatives must be distinct from each other and the comparing actor',
    );
  const title = literal(base.story.label);
  const owner = `${literal(actor.label)}'s\\s+${title}`;
  const names = `${literal(first.label)}\\s+and\\s+${literal(second.label)}`;
  const setup = `(?:${owner}\\s+(?:compares|considers|weighs)\\s+(?:alternatives\\s+|options\\s+)?${names}|${literal(actor.label)}\\s+compares\\s+(?:alternatives\\s+|options\\s+)?${names}\\s+in\\s+(?:the\\s+)?${title})`;
  if (!matches(base.spans.setup, setup))
    return mechanismIssue(
      ctx,
      'setup must explicitly bind the comparing actor, named comparison and both alternatives',
    );
  if (
    !Array.isArray(raw.effects) ||
    raw.effects.length > EXPANSION_LIMITS.records ||
    raw.effects.length !== 2
  )
    return mechanismIssue(
      ctx,
      'include one explicitly stated effect for each alternative, never an invented branch result',
    );
  const effects: EffectInput[] = [];
  for (const entry of raw.effects) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['alternative', 'actor', 'text', 'condition', 'evidence'], ctx)
    )
      return null;
    const alternative = entity(entry.alternative, entities, ctx);
    const effectActor = entity(entry.actor, entities, ctx);
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    if (!alternative || !effectActor || !evidence) return null;
    const text = phrase(entry.text, evidence, ctx, EXPANSION_LIMITS.claim);
    const condition = localCondition(entry.condition, evidence, base, ctx);
    if (
      !text ||
      !condition ||
      ![first.id, second.id].includes(alternative.id) ||
      [first.id, second.id].includes(effectActor.id) ||
      effects.some((effect) => effect.alternative.id === alternative.id)
    )
      return mechanismIssue(
        ctx,
        'effects need distinct declared alternatives, actor-owned full text and the exact local condition',
      );
    effects.push({ alternative, actor: effectActor, text, condition, evidence });
  }
  const a = effects.find((effect) => effect.alternative.id === first.id);
  const b = effects.find((effect) => effect.alternative.id === second.id);
  if (
    !a ||
    !b ||
    !sameSpan(a.evidence.span, b.evidence.span) ||
    a.evidence.text !== base.spans.action
  )
    return mechanismIssue(
      ctx,
      'both stated effects must share the complete conditional action clause',
    );
  const pair = `(?:${effectBody(a)}\\s+(?:and|while|whereas)\\s+${effectBody(b)}|${effectBody(b)}\\s+(?:and|while|whereas)\\s+${effectBody(a)})`;
  if (!matches(a.evidence, conditional(pair, base.story.condition)))
    return mechanismIssue(
      ctx,
      'the exact condition must locally bind each named alternative and actor to its complete stated effect, including unknown/modal wording',
    );
  const response = `${literal(actor.label)}\\s+(?:keeps|retains|reviews)\\s+the stated (?:condition|assumption)\\s+for\\s+${owner}`;
  const check = `(?:${literal(actor.label)}\\s+(?:assigns|provides)\\s+no scores or winner\\s+(?:to|for)\\s+${owner}|${literal(actor.label)}\\s+(?:checks|compares|reviews)\\s+the stated effects\\s+for\\s+${owner}\\s+without (?:ranking the alternatives|choosing a winner))`;
  if (!matches(base.spans.response, response) || !matches(base.spans.check, check))
    return mechanismIssue(
      ctx,
      'response/check must preserve the actor-owned assumption and comparison without introducing scores or a winner',
    );
  const used = new Set([
    actor.id,
    first.id,
    second.id,
    ...effects.map((effect) => effect.actor.id),
  ]);
  if (entities.some((entry) => !used.has(entry.id)))
    return mechanismIssue(ctx, 'comparison entities must be bound actors or the two alternatives');
  const final = resolution(raw.resolution, base, owner, ctx);
  if (!final) return null;
  return {
    ...base.story,
    storyId: '04',
    kind: 'conditional-comparison',
    preset: 'assumption-toggle',
    condition: base.story.condition,
    entities,
    actorId: actor.id,
    alternativeIds: [first.id, second.id],
    effects: effects.map((effect) => ({
      alternativeId: effect.alternative.id,
      actorId: effect.actor.id,
      text: effect.text,
      condition: effect.condition,
      evidence: effect.evidence.span,
    })),
    resolution: final,
  };
}
