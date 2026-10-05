import type {
  ExpansionReachabilityScene,
  ExpansionViewpointOcclusionScene,
  OcclusionRelation,
  ReachabilityOutcome,
  RouteConnection,
  RoutePermission,
  TargetExistence,
  TargetVisibility,
  VisibilityAccessBeatEvidence,
  VisibilityAccessState,
} from '../../remotion/compositions/explainer/expansion/geometry/visibility-access-types';
import {
  type ExpansionEntity,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  type ExpansionEvidenceSpan,
  EXPANSION_LIMITS as L,
} from '../../remotion/compositions/explainer/expansion/value-types';
import {
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const QUAL_FIELDS = ['state', 'value', 'condition', 'qualifier'] as const;
function key(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}
function lit(text: string): string {
  return key(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function same(a: ExpansionEvidenceSpan, b: ExpansionEvidenceSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function entries(raw: unknown, minimum: number, cap: number, ctx: ParseContext): Rec[] | null {
  return Array.isArray(raw) && raw.length >= minimum && raw.length <= cap && raw.every(isRec)
    ? raw
    : mechanismIssue(
        ctx,
        `include ${minimum}–${cap} complete local facts; do not truncate overflow`,
      );
}
function base(raw: Rec, ctx: ParseContext, id: '61' | '62') {
  if (
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
          word.start < ctx.win.startTime ||
          word.end > ctx.win.endTime ||
          (i > 0 && word.start < words[i - 1].end - 1e-7),
      )
  )
    return mechanismIssue(
      ctx,
      'all words must be finite, positive, inside the window and nonoverlapping',
    );
  const b = expansionStoryBase(raw, ctx, id, [
    'template',
    'entities',
    'records',
    'relations',
    'scope',
    'period',
    ...(id === '61' ? ['viewpoint'] : []),
  ]);
  if (
    !b ||
    !strictMechanismBeats(
      raw,
      ctx,
      PHASES.map((phase) => `${phase}Word`),
      [1, 1, 1, 1],
      0.8,
    )
  )
    return null;
  const entities = expansionEntities(raw.entities, ctx, id),
    scope = expansionSourceLabel(raw.scope, b.spans.setup, ctx, L.population),
    period = expansionSourceLabel(raw.period, b.spans.setup, ctx, L.period);
  if (!entities || !scope || !period)
    return mechanismIssue(ctx, 'introduce bounded source entities, scope and period in setup');
  const spans: ExpansionEvidenceSpan[] = [];
  for (const phase of PHASES) {
    const start = ctx.inWin(raw[`${phase}Word`]);
    if (start === null) return null;
    let end = start;
    while (end < ctx.win.endWord && !/[.!?;]$/.test(ctx.words[end].text)) end++;
    const evidence = expansionSourceSpan({ fromWord: start, toWord: end }, ctx);
    if (!evidence) return null;
    spans.push(evidence.span);
  }
  const [setup, action, response, check, resolve] = spans;
  if (!setup || !action || !response || !check || !resolve)
    return mechanismIssue(ctx, 'five distinct complete source clauses are required');
  const sourceSpans: VisibilityAccessBeatEvidence = { setup, action, response, check, resolve };
  const { treatment: _treatment, ...story } = b.story;
  return { ...b, story, entities, scope, period, sourceSpans };
}
type Base = NonNullable<ReturnType<typeof base>>;
function clause(text: string, body: string, condition?: string): boolean {
  // Full allowlisted predicates permit explicit absence/denial; never strip negations or guess from keywords.
  if (/[<>`{}]|https?:\/\/|www\./i.test(text) || text.split(/\s+/).length > L.evidenceWords)
    return false;
  const qualified = condition
    ? `(?:${lit(condition)},\\s*${body}|${body},?\\s+${lit(condition)})`
    : body;
  return new RegExp(`^(?:${qualified})[.;]$`, 'i').test(key(text));
}
function local(b: Base, body: string): string {
  return `(?:${body}\\s+at\\s+${lit(b.scope)}\\s+during\\s+${lit(b.period)}|At\\s+${lit(b.scope)}\\s+during\\s+${lit(b.period)},\\s*${body})`;
}
function reference(raw: unknown, b: Base, ctx: ParseContext): ExpansionEntity | null {
  return (
    (typeof raw === 'string'
      ? b.entities.find((entity) => key(entity.label) === key(raw))
      : undefined) ?? mechanismIssue(ctx, 'references must name source entities, never caller IDs')
  );
}
function qualification<V extends string>(
  raw: Rec,
  text: string,
  b: Base,
  ctx: ParseContext,
  values: readonly V[],
  body: (value: string) => string,
): VisibilityAccessState<V> | null {
  if (raw.state === 'unknown' || raw.state === 'missing' || raw.state === 'disputed') {
    if (
      'value' in raw ||
      'condition' in raw ||
      raw.qualifier !== raw.state ||
      !clause(text, local(b, body(lit(raw.state))))
    )
      return mechanismIssue(
        ctx,
        'retain explicit unknown/missing/disputed facts without inventing a value or zero',
      );
    return { state: raw.state, qualifier: raw.state };
  }
  if (typeof raw.value !== 'string' || !values.some((value) => value === raw.value))
    return mechanismIssue(ctx, 'only the exact source fact value is allowed');
  const value = raw.value as V,
    predicate = local(b, body(lit(value)));
  if (raw.state === 'known')
    return !('qualifier' in raw) && !('condition' in raw) && clause(text, predicate)
      ? { state: 'known', value }
      : mechanismIssue(ctx, 'known facts require their exact unqualified local assertion');
  if (raw.state === 'conditional')
    return typeof raw.condition === 'string' &&
      raw.condition === b.story.condition &&
      !('qualifier' in raw) &&
      clause(text, predicate, raw.condition)
      ? { state: 'conditional', value, condition: raw.condition }
      : mechanismIssue(ctx, 'retain the complete source condition without evaluating it');
  if (
    ((raw.state === 'illustrative' && raw.qualifier === 'teaching example') ||
      (raw.state === 'simulated' && raw.qualifier === 'simulation')) &&
    b.story.evidence === 'illustrative' &&
    !('condition' in raw) &&
    clause(text, `In\\s+this\\s+${lit(String(raw.qualifier))},\\s*${predicate}`)
  )
    return { state: raw.state, value, qualifier: String(raw.qualifier) };
  return mechanismIssue(
    ctx,
    'retain source simulation/illustration/status qualification on the complete fact',
  );
}
function setup(b: Base, tail = ''): boolean {
  return clause(
    b.spans.setup,
    local(
      b,
      `${lit(b.story.subject)}\\s+(?:lists|names)\\s+${b.entities.map((entity) => lit(entity.label)).join('\\s+and\\s+')}${tail}`,
    ),
  );
}
function fact(entry: Rec, b: Base, ctx: ParseContext, id: '61' | '62', index: number) {
  const actor = reference(entry.actor, b, ctx),
    evidence = expansionSourceSpan(entry.evidence, ctx);
  if (!actor || !evidence || entry.scope !== b.scope || entry.period !== b.period)
    return mechanismIssue(
      ctx,
      'each actor-owned claim must retain its local scope, period and complete evidence',
    );
  return {
    actor,
    evidence,
    common: {
      id: expansionEntityId(id, b.entities.length + index),
      actorId: actor.id,
      scope: b.scope,
      period: b.period,
      evidence: evidence.span,
    },
  };
}
function knownValue<V extends string>(q: VisibilityAccessState<V>, value: V): boolean {
  return q.state === 'known' && q.value === value;
}

export function parseExpansionViewpointOcclusion(
  raw: Rec,
  ctx: ParseContext,
): ExpansionViewpointOcclusionScene | null {
  const b = base(raw, ctx, '61');
  if (!b) return null;
  if (
    (raw.template !== 'robot-panel' && raw.template !== 'robot-box') ||
    (raw.viewpoint !== 'front' && raw.viewpoint !== 'isometric')
  )
    return mechanismIssue(
      ctx,
      'select only authored robot-panel/robot-box and front/isometric viewpoint templates',
    );
  if (!setup(b, `\\s+from\\s+${lit(raw.viewpoint)}\\s+viewpoint`))
    return mechanismIssue(
      ctx,
      'setup must explicitly introduce all identities and the supplied authored viewpoint',
    );
  const inputs = entries(raw.records, 2, L.records, ctx),
    pairs = entries(raw.relations, 1, L.relations, ctx);
  if (!inputs || !pairs) return null;
  const records: (TargetExistence | TargetVisibility)[] = [];
  const relations: OcclusionRelation[] = [];
  for (const [index, entry] of [...inputs, ...pairs].entries()) {
    const relation = index >= inputs.length;
    if (
      !onlyFields(
        entry,
        [
          'actor',
          'target',
          'scope',
          'period',
          'role',
          'evidence',
          ...QUAL_FIELDS,
          ...(entry.role === 'existence' ? [] : ['occluder', 'viewpoint']),
        ],
        ctx,
      )
    )
      return null;
    const f = fact(entry, b, ctx, '61', index),
      target = reference(entry.target, b, ctx);
    if (
      !f ||
      !target ||
      f.actor.id === target.id ||
      (relation
        ? entry.role !== 'occlusion'
        : entry.role !== 'existence' && entry.role !== 'visibility')
    )
      return mechanismIssue(
        ctx,
        'retain distinct observer/target identities and the exact existence, visibility or occlusion claim role',
      );
    if (entry.role === 'existence') {
      const q = qualification(
        entry,
        f.evidence.text,
        b,
        ctx,
        ['present', 'absent'] as const,
        (value) =>
          `${lit(f.actor.label)}\\s+(?:reports|states)\\s+${lit(target.label)}\\s+existence\\s+(?:as|is)\\s+${value}`,
      );
      if (
        !q ||
        records.some(
          (record) =>
            record.role === 'existence' &&
            record.actorId === f.actor.id &&
            record.targetId === target.id,
        )
      )
        return mechanismIssue(
          ctx,
          'existence must be independently supplied, unique and never inferred from visibility',
        );
      records.push({ ...f.common, role: 'existence', targetId: target.id, ...q });
      continue;
    }
    const occluder = reference(entry.occluder, b, ctx);
    if (
      !occluder ||
      new Set([f.actor.id, target.id, occluder.id]).size !== 3 ||
      entry.viewpoint !== raw.viewpoint
    )
      return mechanismIssue(
        ctx,
        'retain distinct target/occluder/observer identities and the exact authored viewpoint',
      );
    const tail = `\\s+by\\s+${lit(occluder.label)}\\s+from\\s+${lit(raw.viewpoint)}\\s+viewpoint`;
    if (!relation) {
      const q = qualification(
        entry,
        f.evidence.text,
        b,
        ctx,
        ['hidden', 'visible'] as const,
        (value) =>
          `${lit(f.actor.label)}\\s+(?:reports|states)\\s+${lit(target.label)}\\s+visibility\\s+(?:as|is)\\s+${value}${tail}`,
      );
      if (
        !q ||
        records.some(
          (record) =>
            record.role === 'visibility' &&
            record.actorId === f.actor.id &&
            record.targetId === target.id &&
            record.occluderId === occluder.id,
        )
      )
        return mechanismIssue(
          ctx,
          'visibility requires a unique complete source assertion, not camera-derived existence',
        );
      records.push({
        ...f.common,
        role: 'visibility',
        targetId: target.id,
        occluderId: occluder.id,
        viewpoint: raw.viewpoint,
        ...q,
      });
    } else {
      const q = qualification(
        entry,
        f.evidence.text,
        b,
        ctx,
        ['blocked', 'clear'] as const,
        (value) =>
          `${lit(f.actor.label)}\\s+(?:reports|states)\\s+${lit(target.label)}\\s+occlusion\\s+(?:as|is)\\s+${value}${tail}`,
      );
      if (
        !q ||
        relations.some(
          (pair) =>
            pair.actorId === f.actor.id &&
            pair.targetId === target.id &&
            pair.occluderId === occluder.id,
        )
      )
        return mechanismIssue(
          ctx,
          'occlusion relations must be unique and source-stated, never raycast or computed',
        );
      relations.push({
        ...f.common,
        role: 'occlusion',
        targetId: target.id,
        occluderId: occluder.id,
        viewpoint: raw.viewpoint,
        ...q,
      });
    }
  }
  for (const record of records)
    if (record.role === 'visibility') {
      const existence = records.find(
        (other) =>
          other.role === 'existence' &&
          other.actorId === record.actorId &&
          other.targetId === record.targetId,
      );
      if (!existence || (knownValue(existence, 'absent') && record.state === 'known'))
        return mechanismIssue(
          ctx,
          'hidden is not absent; retain independent existence evidence without converting an unknown to present',
        );
      for (const relation of relations.filter(
        (pair) =>
          pair.actorId === record.actorId &&
          pair.targetId === record.targetId &&
          pair.occluderId === record.occluderId,
      ))
        if (
          relation.state === 'known' &&
          record.state === 'known' &&
          (relation.value === 'blocked') !== (record.value === 'hidden')
        )
          return mechanismIssue(
            ctx,
            'source visibility and source occlusion assertions contradict each other',
          );
    }
  if (
    !records.some(
      (record) => record.role === 'existence' && same(record.evidence, b.sourceSpans.action),
    ) ||
    !records.some(
      (record) => record.role === 'visibility' && same(record.evidence, b.sourceSpans.response),
    ) ||
    !relations.some((record) => same(record.evidence, b.sourceSpans.check)) ||
    !clause(
      b.spans.resolve,
      `${lit(b.story.subject)}\\s+(?:keeps|preserves)\\s+existence\\s+separate\\s+from\\s+visibility`,
    )
  )
    return mechanismIssue(
      ctx,
      'five beats must reveal independent existence, visibility, occlusion and the hidden-not-absent distinction',
    );
  return {
    ...b.story,
    storyId: '61',
    kind: 'robot-perception',
    preset: 'viewpoint-occlusion',
    template: raw.template,
    viewpoint: raw.viewpoint,
    entities: b.entities,
    records,
    relations,
    scope: b.scope,
    period: b.period,
    sourceSpans: b.sourceSpans,
    meaning: 'hidden-is-not-absent',
    geometryQualification: 'schematic',
  };
}

export function parseExpansionReachability(
  raw: Rec,
  ctx: ParseContext,
): ExpansionReachabilityScene | null {
  const b = base(raw, ctx, '62');
  if (!b) return null;
  if (raw.template !== 'gate-route' && raw.template !== 'courtyard-route')
    return mechanismIssue(
      ctx,
      'reachability uses only authored gate-route/courtyard-route templates',
    );
  if (!setup(b))
    return mechanismIssue(
      ctx,
      'introduce exactly the observer, places and route identities with source scope and period',
    );
  const inputs = entries(raw.records, 2, L.records, ctx),
    pairs = entries(raw.relations, 1, L.relations, ctx);
  if (!inputs || !pairs) return null;
  const records: (RouteConnection | RoutePermission)[] = [],
    relations: ReachabilityOutcome[] = [];
  for (const [index, entry] of [...inputs, ...pairs].entries()) {
    const relation = index >= inputs.length;
    if (
      !onlyFields(
        entry,
        ['actor', 'from', 'to', 'route', 'scope', 'period', 'role', 'evidence', ...QUAL_FIELDS],
        ctx,
      )
    )
      return null;
    const f = fact(entry, b, ctx, '62', index),
      from = reference(entry.from, b, ctx),
      to = reference(entry.to, b, ctx),
      route = reference(entry.route, b, ctx);
    if (
      !f ||
      !from ||
      !to ||
      !route ||
      new Set([f.actor.id, from.id, to.id, route.id]).size !== 4 ||
      (relation
        ? entry.role !== 'reachability'
        : entry.role !== 'route' && entry.role !== 'permission')
    )
      return mechanismIssue(
        ctx,
        'each route claim needs distinct actor/from/to/route identities and its exact role',
      );
    const common = { ...f.common, fromId: from.id, toId: to.id, routeId: route.id };
    const body = (value: string) =>
      `${lit(f.actor.label)}\\s+(?:reports|states)\\s+${lit(String(entry.role))}\\s+on\\s+${lit(route.label)}\\s+from\\s+${lit(from.label)}\\s+to\\s+${lit(to.label)}\\s+(?:as|is)\\s+${value}`;
    if (entry.role === 'route') {
      const q = qualification(
        entry,
        f.evidence.text,
        b,
        ctx,
        ['connected', 'disconnected'] as const,
        body,
      );
      if (
        !q ||
        records.some(
          (r) =>
            r.role === 'route' &&
            r.actorId === f.actor.id &&
            r.routeId === route.id &&
            r.fromId === from.id &&
            r.toId === to.id,
        )
      )
        return mechanismIssue(
          ctx,
          'retain unique source route connection facts, never inferred paths',
        );
      records.push({ ...common, role: 'route', ...q });
    } else if (entry.role === 'permission') {
      const q = qualification(entry, f.evidence.text, b, ctx, ['allowed', 'denied'] as const, body);
      if (
        !q ||
        records.some(
          (r) =>
            r.role === 'permission' &&
            r.actorId === f.actor.id &&
            r.routeId === route.id &&
            r.fromId === from.id &&
            r.toId === to.id,
        )
      )
        return mechanismIssue(
          ctx,
          'permission is a separate actor-owned source claim, not a connection or access inference',
        );
      records.push({ ...common, role: 'permission', ...q });
    } else {
      const q = qualification(
        entry,
        f.evidence.text,
        b,
        ctx,
        ['reachable', 'unreachable'] as const,
        body,
      );
      if (
        !q ||
        relations.some(
          (r) =>
            r.actorId === f.actor.id &&
            r.routeId === route.id &&
            r.fromId === from.id &&
            r.toId === to.id,
        )
      )
        return mechanismIssue(
          ctx,
          'reachability requires its own unique stated outcome and unaltered access condition',
        );
      relations.push({ ...common, role: 'reachability', ...q });
    }
  }
  for (const relation of relations)
    for (const role of ['route', 'permission'] as const)
      if (
        !records.some(
          (record) =>
            record.role === role &&
            record.actorId === relation.actorId &&
            record.routeId === relation.routeId &&
            record.fromId === relation.fromId &&
            record.toId === relation.toId,
        )
      )
        return mechanismIssue(
          ctx,
          'every stated outcome must retain separate matching route and permission facts, including unknown states',
        );
  if (
    !records.some((r) => r.role === 'route' && same(r.evidence, b.sourceSpans.action)) ||
    !records.some((r) => r.role === 'permission' && same(r.evidence, b.sourceSpans.response)) ||
    !relations.some((r) => same(r.evidence, b.sourceSpans.check)) ||
    !clause(
      b.spans.resolve,
      `${lit(b.story.subject)}\\s+(?:keeps|preserves)\\s+stated\\s+reachability\\s+separate\\s+from\\s+permission`,
    )
  )
    return mechanismIssue(
      ctx,
      'five beats must separately evidence the route, permission and stated access outcome',
    );
  return {
    ...b.story,
    storyId: '62',
    kind: 'property-access',
    preset: 'reachability',
    template: raw.template,
    entities: b.entities,
    records,
    relations,
    scope: b.scope,
    period: b.period,
    sourceSpans: b.sourceSpans,
    meaning: 'connection-is-not-permission-or-reachability',
    geographyQualification: 'schematic',
  };
}
