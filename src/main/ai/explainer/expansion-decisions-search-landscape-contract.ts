import type {
  ExpansionFrontierRouteScene,
  ExpansionGridSlot,
  ExpansionLandscapeWell,
  ExpansionLocalGlobalScene,
  ExpansionMapQualification,
  ExpansionSearchLandscapeBeatEvidence,
  ExpansionSearchLink,
  ExpansionSearchNode,
} from '../../remotion/compositions/explainer/expansion/decisions/search-landscape-types';
import {
  type ExpansionEntity,
  type ExpansionStoryBase,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  add,
  compare,
  compatibleBasis,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  type ExpansionEvidenceSpan,
  type ExpansionQuantity,
  type ExpansionRational,
  EXPANSION_LIMITS as L,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

interface Evidence {
  span: ExpansionEvidenceSpan;
  text: string;
}
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const SLOTS: readonly ExpansionGridSlot[] = ['start', 'upper', 'lower', 'goal'];
const STATUSES = ['open', 'blocked', 'unknown', 'missing', 'disputed'] as const;
// Fixed 2x2 authored grid. No coordinates, dimensions, arbitrary graph or input node IDs.
const EDGES = new Set(['start:upper', 'start:lower', 'upper:goal', 'lower:goal']);
function norm(text: string): string {
  return text.normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}
function lit(text: string): string {
  return norm(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function joined(labels: readonly string[], connector = 'and'): string {
  if (labels.length === 1) return lit(labels[0]);
  if (connector === 'then') return labels.map(lit).join(' then ');
  if (labels.length === 2) return `${lit(labels[0])} and ${lit(labels[1])}`;
  return `${labels.slice(0, -1).map(lit).join(', ')},? and ${lit(labels[labels.length - 1])}`;
}
function match(e: Evidence, body: string, condition?: string): boolean {
  const full = condition ? `(?:${lit(condition)}, ${body}|${body},? ${lit(condition)})` : body;
  return new RegExp(`^(?:${full})[.;]?$`, 'iu').test(norm(e.text));
}
function local(
  raw: unknown,
  ctx: ParseContext,
  fields: readonly string[],
): { raw: Rec; evidence: Evidence; condition?: string } | null {
  if (!isRec(raw) || !onlyFields(raw, fields, ctx))
    return mechanismIssue(ctx, 'only authored local fields are accepted');
  const evidence = expansionSourceSpan(raw.evidence, ctx);
  if (!evidence) return null;
  const condition =
    raw.condition === undefined
      ? undefined
      : expansionSourceLabel(raw.condition, evidence, ctx, L.qualifier);
  if (condition === null) return null;
  return { raw, evidence, ...(condition ? { condition } : {}) };
}
function ref(
  value: unknown,
  evidence: Evidence,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = expansionSourceLabel(value, evidence, ctx, L.actorLabel);
  return label
    ? (entities.find((e) => norm(e.label) === norm(label)) ??
        mechanismIssue(ctx, 'endpoint must name an existing source-bound entity, not an input ID'))
    : null;
}
function bounded(value: unknown, min: number, max: number): value is unknown[] {
  return Array.isArray(value) && value.length >= min && value.length <= max;
}
function envelope(
  raw: Rec,
  ctx: ParseContext,
  id: '29' | '30',
  fields: readonly string[],
):
  | (Omit<ExpansionStoryBase, 'treatment'> & {
      readonly sourceSpans: ExpansionSearchLandscapeBeatEvidence;
    })
  | null {
  if (
    (raw.continues !== undefined && typeof raw.continues !== 'boolean') ||
    (raw.transition !== undefined && !['slide', 'fade', 'grow'].includes(String(raw.transition)))
  )
    return mechanismIssue(ctx, 'invalid authored continuation/transition');
  const base = expansionStoryBase(raw, ctx, id, fields);
  if (!base) return null;
  const evidence: ExpansionEvidenceSpan[] = [];
  let last = -1;
  for (const field of BEATS) {
    const index = ctx.inWin(raw[field]);
    if (
      index === null ||
      index <= last ||
      (index > 0 && !/[.!?;]["'”’\])]*$/.test(ctx.words[index - 1]?.text ?? ''))
    )
      return mechanismIssue(ctx, 'five beats must start distinct complete source clauses');
    let end = index;
    while (end < ctx.win.endWord && !/[.!?;]["'”’\])]*$/.test(ctx.words[end]?.text ?? '')) end++;
    const source = expansionSourceSpan({ fromWord: index, toWord: end }, ctx);
    if (!source) return null;
    evidence.push(source.span);
    last = end;
  }
  const [setup, action, response, check, resolve] = evidence;
  if (!setup || !action || !response || !check || !resolve) return null;
  return { ...base.story, sourceSpans: { setup, action, response, check, resolve } };
}
function suppliedQuantity(
  raw: unknown,
  actor: string,
  claim: string,
  ctx: ParseContext,
): ExpansionQuantity | null {
  const q = parseExpansionQuantity(raw, ctx);
  return q && norm(q.actor) === norm(actor) && norm(q.claim) === norm(claim)
    ? q
    : mechanismIssue(
        ctx,
        'quantity must retain the exact local actor/claim, qualification, signed value, precision and full basis',
      );
}
function suppliedValue(q: ExpansionQuantity): ExpansionRational | null {
  if (!('amount' in q)) return null;
  return q.amount.kind === 'rational'
    ? q.amount.value
    : { numerator: q.amount.value.minorUnits, denominator: 1 };
}

/** 29: fixed four-slot grid, named source links/frontier/route, never a generated shortest path. */
export function parseExpansionFrontierRoute(
  raw: Rec,
  ctx: ParseContext,
): ExpansionFrontierRouteScene | null {
  if (
    !isRec(raw) ||
    raw.kind !== 'spatial-search' ||
    raw.preset !== 'frontier-route' ||
    raw.template !== 'grid-route'
  )
    return mechanismIssue(
      ctx,
      'expected authored story 29 spatial-search/frontier-route/grid-route',
    );
  const story = envelope(raw, ctx, '29', [
    'template',
    'qualification',
    'entities',
    'nodes',
    'links',
    'goal',
    'rule',
    'frontier',
    'route',
    'result',
  ]);
  if (!story) return null;
  const qualification: ExpansionMapQualification | null =
    raw.qualification === 'source' ||
    raw.qualification === 'illustrative' ||
    raw.qualification === 'simulated'
      ? raw.qualification
      : null;
  const entities = expansionEntities(raw.entities, ctx, '29');
  if (
    !qualification ||
    !entities ||
    entities.length !== 4 ||
    !bounded(raw.nodes, 4, 4) ||
    !bounded(raw.links, 1, 4) ||
    (qualification !== 'source' && story.evidence !== 'illustrative')
  )
    return mechanismIssue(
      ctx,
      'grid-route needs exactly four named authored nodes, 1–4 source links and explicit source/illustrative/simulated qualification',
    );
  const validatedEntities: readonly ExpansionEntity[] = entities;
  const nodes: ExpansionSearchNode[] = [],
    nodeLabels = new Map<string, string>(),
    slots = new Set<string>();
  for (const entry of raw.nodes) {
    const item = local(entry, ctx, ['node', 'slot', 'status', 'evidence', 'condition']);
    if (!item) return null;
    const e = ref(item.raw.node, item.evidence, entities, ctx),
      slot = SLOTS.find((v) => v === item.raw.slot),
      status = STATUSES.find((v) => v === item.raw.status);
    if (
      !e ||
      !slot ||
      !status ||
      slots.has(slot) ||
      nodes.some((n) => n.entityId === e.id) ||
      !match(
        item.evidence,
        `(?:${lit(e.label)} is the ${status} ${slot} node on the ${qualification} grid|on the ${qualification} grid, ${lit(e.label)} is the ${status} ${slot} node)`,
        item.condition,
      )
    )
      return mechanismIssue(
        ctx,
        'each slot/status must bind its exact named node in one full qualified map clause',
      );
    slots.add(slot);
    const id = expansionEntityId('29', L.actors + SLOTS.indexOf(slot));
    nodeLabels.set(id, e.label);
    nodes.push({
      id,
      entityId: e.id,
      slot,
      status,
      evidence: item.evidence.span,
      ...(item.condition ? { condition: item.condition } : {}),
    });
  }
  const start = nodes.find((n) => n.slot === 'start'),
    goal = nodes.find((n) => n.slot === 'goal');
  if (!start || !goal || norm(String(raw.goal)) !== norm(nodeLabels.get(goal.id) ?? ''))
    return mechanismIssue(ctx, 'goal must name the actual source-supported authored goal node');
  const links: ExpansionSearchLink[] = [],
    edges = new Set<string>();
  for (const entry of raw.links) {
    const item = local(entry, ctx, ['from', 'to', 'status', 'cost', 'evidence', 'condition']);
    if (!item) return null;
    const f = ref(item.raw.from, item.evidence, entities, ctx),
      t = ref(item.raw.to, item.evidence, entities, ctx),
      from = nodes.find((n) => n.entityId === f?.id),
      to = nodes.find((n) => n.entityId === t?.id),
      status = STATUSES.find((v) => v === item.raw.status);
    if (
      !f ||
      !t ||
      !from ||
      !to ||
      !status ||
      !EDGES.has(`${from.slot}:${to.slot}`) ||
      edges.has(`${from.id}:${to.id}`) ||
      !match(
        item.evidence,
        `(?:${lit(f.label)} connects to ${lit(t.label)} as an? ${status} link on the ${qualification} grid|on the ${qualification} grid, the link from ${lit(f.label)} to ${lit(t.label)} is ${status})`,
        item.condition,
      )
    )
      return mechanismIssue(
        ctx,
        'link must bind actual adjacent authored endpoint labels, status and qualification; missing branches are not inferred',
      );
    const cost =
      item.raw.cost === undefined
        ? undefined
        : suppliedQuantity(item.raw.cost, f.label, `${t.label} link cost`, ctx);
    if (cost === null) return null;
    edges.add(`${from.id}:${to.id}`);
    links.push({
      fromId: from.id,
      toId: to.id,
      status,
      evidence: item.evidence.span,
      ...(cost ? { cost } : {}),
      ...(item.condition ? { condition: item.condition } : {}),
    });
  }
  const rule = local(raw.rule, ctx, ['kind', 'evidence']),
    frontier = local(raw.frontier, ctx, ['nodes', 'evidence']),
    route = local(raw.route, ctx, ['nodes', 'cost', 'evidence']),
    result = local(raw.result, ctx, ['status', 'evidence']);
  if (
    !rule ||
    !frontier ||
    !route ||
    !result ||
    !['equal-cost', 'supplied-cost'].includes(String(rule.raw.kind)) ||
    !match(
      rule.evidence,
      rule.raw.kind === 'equal-cost'
        ? `every open link on the ${qualification} grid has equal cost`
        : `every used link on the ${qualification} grid has its own supplied cost`,
    )
  )
    return mechanismIssue(
      ctx,
      'cost rule must be explicitly source-stated, not an invented unit cost or shortest-path rule',
    );
  function nodeList(values: unknown, e: Evidence, empty: boolean): ExpansionSearchNode[] | null {
    if (!bounded(values, empty ? 0 : 1, 4))
      return mechanismIssue(ctx, 'frontier/route must be an authored bounded ordered node list');
    const chosen: ExpansionSearchNode[] = [];
    for (const value of values) {
      const named = ref(value, e, validatedEntities, ctx),
        n = nodes.find((v) => v.entityId === named?.id);
      if (!n || chosen.some((v) => v.id === n.id))
        return mechanismIssue(ctx, 'frontier/route contains an invented or duplicate node');
      chosen.push(n);
    }
    return chosen;
  }
  const orderedFrontier = nodeList(frontier.raw.nodes, frontier.evidence, false),
    orderedRoute = nodeList(route.raw.nodes, route.evidence, true);
  if (!orderedFrontier || !orderedRoute) return null;
  const frontierNames = orderedFrontier.map((n) => nodeLabels.get(n.id) ?? ''),
    routeNames = orderedRoute.map((n) => nodeLabels.get(n.id) ?? ''),
    s = lit(nodeLabels.get(start.id) ?? ''),
    g = lit(nodeLabels.get(goal.id) ?? '');
  if (
    frontier.evidence.span.fromWord !== ctx.inWin(raw.responseWord) ||
    route.evidence.span.fromWord !== ctx.inWin(raw.checkWord) ||
    result.evidence.span.fromWord !== ctx.inWin(raw.resolveWord) ||
    !match(
      frontier.evidence,
      `(?:the frontier (?:contains|includes) ${joined(frontierNames)} in that order on the ${qualification} grid|on the ${qualification} grid, the stated frontier is ${joined(frontierNames)})`,
    )
  )
    return mechanismIssue(
      ctx,
      'frontier, route and result must use their actual source response/check/resolve clauses',
    );
  const status =
    result.raw.status === 'supplied' || result.raw.status === 'unresolved'
      ? result.raw.status
      : null;
  const used: ExpansionSearchLink[] = [];
  if (status === 'supplied') {
    if (
      orderedRoute.length < 2 ||
      orderedRoute[0].id !== start.id ||
      orderedRoute.at(-1)?.id !== goal.id ||
      orderedRoute.some((n) => n.status !== 'open') ||
      !match(
        route.evidence,
        `(?:the stated route runs ${joined(routeNames, 'then')} on the ${qualification} grid|on the ${qualification} grid, the supplied route is ${joined(routeNames, 'then')})`,
      )
    )
      return mechanismIssue(
        ctx,
        'supplied route must quote the actual ordered start-to-goal open nodes; no computed route/winner',
      );
    for (let i = 1; i < orderedRoute.length; i++) {
      const link = links.find(
        (l) => l.fromId === orderedRoute[i - 1].id && l.toId === orderedRoute[i].id,
      );
      if (!link || link.status !== 'open' || (rule.raw.kind === 'supplied-cost' && !link.cost))
        return mechanismIssue(
          ctx,
          'every route branch must be explicitly open with any required supplied cost',
        );
      used.push(link);
    }
    if (
      !match(
        result.evidence,
        `the ${s} to ${g} route is supplied only for the ${qualification} grid`,
      )
    )
      return mechanismIssue(
        ctx,
        'supplied result must retain its qualified map endpoints, not a shortest or measured optimum',
      );
  } else if (
    status !== 'unresolved' ||
    orderedRoute.length !== 0 ||
    route.raw.cost !== undefined ||
    !match(route.evidence, `no route from ${s} to ${g} is supplied on the ${qualification} grid`) ||
    !match(
      result.evidence,
      `the ${s} to ${g} route remains unresolved on the ${qualification} grid`,
    )
  )
    return mechanismIssue(
      ctx,
      'missing route/result must explicitly stay unresolved, never become a guessed branch',
    );
  const cost =
    route.raw.cost === undefined
      ? undefined
      : suppliedQuantity(route.raw.cost, nodeLabels.get(start.id) ?? '', 'route cost', ctx);
  if (cost === null) return null;
  // Arithmetic is consistency validation only. Never emit a sum, fabricated cost or derivation.
  const operands = used.flatMap((link) => (link.cost ? [link.cost] : []));
  const basis = cost?.basis ?? operands[0]?.basis;
  if (basis && operands.some((q) => !compatibleBasis(q.basis, basis)))
    return mechanismIssue(ctx, 'route/link cost bases are incompatible');
  if (
    cost &&
    suppliedValue(cost) &&
    used.length &&
    operands.length === used.length &&
    operands.every((q) => suppliedValue(q))
  ) {
    let sum: ExpansionRational = { numerator: 0, denominator: 1 };
    for (const q of operands) {
      const value = suppliedValue(q);
      if (!value) return null;
      const next = add(sum, value);
      if (!next.ok) return mechanismIssue(ctx, 'cost validation overflow');
      sum = next.value;
    }
    const expected = suppliedValue(cost),
      equal = expected ? compare(sum, expected) : null;
    if (!equal?.ok || equal.value !== 0)
      return mechanismIssue(ctx, 'supplied route cost disagrees with its supplied operands');
  }
  return {
    ...story,
    storyId: '29',
    kind: 'spatial-search',
    preset: 'frontier-route',
    template: 'grid-route',
    qualification,
    entities,
    nodes,
    links,
    goalId: goal.id,
    rule: { kind: rule.raw.kind as 'equal-cost' | 'supplied-cost', evidence: rule.evidence.span },
    frontier: { nodeIds: orderedFrontier.map((n) => n.id), evidence: frontier.evidence.span },
    route: {
      nodeIds: orderedRoute.map((n) => n.id),
      evidence: route.evidence.span,
      ...(cost ? { cost } : {}),
    },
    result: { status, evidence: result.evidence.span },
  };
}

/** 30: qualified authored two-well distinction, never an arbitrary analytic function/business optimum. */
export function parseExpansionLocalGlobal(
  raw: Rec,
  ctx: ParseContext,
): ExpansionLocalGlobalScene | null {
  if (
    !isRec(raw) ||
    raw.kind !== 'optimization-landscape' ||
    raw.preset !== 'local-global' ||
    raw.template !== 'two-well'
  )
    return mechanismIssue(
      ctx,
      'expected authored story 30 optimization-landscape/local-global/two-well',
    );
  const story = envelope(raw, ctx, '30', [
    'template',
    'qualification',
    'entities',
    'objective',
    'wells',
    'branch',
    'result',
  ]);
  if (!story) return null;
  const qualification =
      raw.qualification === 'illustrative' || raw.qualification === 'simulated'
        ? raw.qualification
        : null,
    entities = expansionEntities(raw.entities, ctx, '30'),
    objective = local(raw.objective, ctx, ['label', 'direction', 'evidence']);
  if (
    !qualification ||
    story.evidence !== 'illustrative' ||
    !entities ||
    entities.length !== 2 ||
    !objective ||
    objective.raw.direction !== 'minimize' ||
    !bounded(raw.wells, 2, 2)
  )
    return mechanismIssue(
      ctx,
      'two-well requires exactly two named wells, explicit teaching/simulation qualification and source-stated minimize objective',
    );
  const label = expansionSourceLabel(objective.raw.label, objective.evidence, ctx, L.actorLabel);
  if (
    !label ||
    !match(
      objective.evidence,
      `(?:the ${qualification} ${lit(label)} landscape minimizes stated ${lit(label)}|stated ${lit(label)} is minimized in the ${qualification} ${lit(label)} landscape)`,
    )
  )
    return mechanismIssue(
      ctx,
      'objective must be local to the qualified authored landscape, not a generic best choice or a user function',
    );
  const wells: ExpansionLandscapeWell[] = [],
    wellLabels = new Map<string, string>();
  for (const entry of raw.wells) {
    const item = local(entry, ctx, ['option', 'role', 'value', 'evidence', 'condition']);
    if (!item) return null;
    const option = ref(item.raw.option, item.evidence, entities, ctx),
      role =
        item.raw.role === 'local' || item.raw.role === 'global' || item.raw.role === 'unresolved'
          ? item.raw.role
          : null;
    if (
      !option ||
      !role ||
      wells.some((w) => w.entityId === option.id || w.role === role) ||
      !match(
        item.evidence,
        role === 'unresolved'
          ? `${lit(option.label)} role remains unresolved on the ${qualification} ${lit(label)} landscape`
          : `(?:${lit(option.label)} is the ${role} well of the ${qualification} ${lit(label)} landscape|in the ${qualification} ${lit(label)} landscape, ${lit(option.label)} is the ${role} well)`,
        item.condition,
      )
    )
      return mechanismIssue(
        ctx,
        'local/global/unresolved role must bind its own option and explicit schematic qualification',
      );
    const value =
      item.raw.value === undefined
        ? undefined
        : suppliedQuantity(item.raw.value, option.label, `${label} objective`, ctx);
    if (value === null) return null;
    const id = expansionEntityId('30', L.actors + entities.findIndex((e) => e.id === option.id));
    wellLabels.set(id, option.label);
    wells.push({
      id,
      entityId: option.id,
      role,
      evidence: item.evidence.span,
      ...(value ? { value } : {}),
      ...(item.condition ? { condition: item.condition } : {}),
    });
  }
  const localWell = wells.find((w) => w.role === 'local'),
    other = wells.find((w) => w.role !== 'local'),
    branch = local(raw.branch, ctx, ['from', 'to', 'status', 'evidence', 'condition']),
    result = local(raw.result, ctx, ['status', 'evidence']);
  if (
    !localWell ||
    !other ||
    !branch ||
    !result ||
    branch.evidence.span.fromWord !== ctx.inWin(raw.checkWord) ||
    result.evidence.span.fromWord !== ctx.inWin(raw.resolveWord) ||
    norm(String(branch.raw.from)) !== norm(wellLabels.get(localWell.id) ?? '') ||
    norm(String(branch.raw.to)) !== norm(wellLabels.get(other.id) ?? '')
  )
    return mechanismIssue(
      ctx,
      'branch/result must bind the actual local-to-other wells and source check/resolve evidence',
    );
  const f = lit(wellLabels.get(localWell.id) ?? ''),
    t = lit(wellLabels.get(other.id) ?? ''),
    q = `${qualification} ${lit(label)} landscape`;
  const supplied =
    branch.raw.status === 'supplied' && other.role === 'global' && result.raw.status === 'scoped';
  const unresolved = branch.raw.status === 'unresolved' && result.raw.status === 'unresolved';
  if (
    supplied
      ? !match(
          branch.evidence,
          `(?:${f} connects to ${t} only on the ${q}|on the ${q}, the stated branch runs from ${f} to ${t})`,
          branch.condition,
        ) || !match(result.evidence, `local and global refer only to ${f} and ${t} on the ${q}`)
      : !unresolved ||
        !match(
          branch.evidence,
          `no branch from ${f} to ${t} is supplied on the ${q}`,
          branch.condition,
        ) ||
        !match(result.evidence, `the distinction for ${f} and ${t} remains unresolved on the ${q}`)
  )
    return mechanismIssue(
      ctx,
      'source must state the branch or its absence and a qualified scoped/unresolved result; no inferred real-world optimum',
    );
  if (localWell.value && other.value) {
    if (!compatibleBasis(localWell.value.basis, other.value.basis))
      return mechanismIssue(
        ctx,
        'supplied objective values need identical metric/time/population/denominator',
      );
    const left = suppliedValue(localWell.value),
      right = suppliedValue(other.value);
    if (left && right && other.role === 'global') {
      const order = compare(right, left);
      if (!order.ok || order.value > 0)
        return mechanismIssue(
          ctx,
          'source-supplied global value cannot contradict the stated minimize objective',
        );
    }
  }
  return {
    ...story,
    storyId: '30',
    kind: 'optimization-landscape',
    preset: 'local-global',
    template: 'two-well',
    qualification,
    entities,
    objective: { label, direction: 'minimize', evidence: objective.evidence.span },
    wells: [wells[0], wells[1]],
    branch: {
      fromId: localWell.id,
      toId: other.id,
      status: supplied ? 'supplied' : 'unresolved',
      evidence: branch.evidence.span,
      ...(branch.condition ? { condition: branch.condition } : {}),
    },
    result: { status: supplied ? 'scoped' : 'unresolved', evidence: result.evidence.span },
  };
}
