/** Stories 33–34. Closed local schemas; no generated hierarchy, aggregate, owner or control. */
import type {
  ExpansionDualRightsScene,
  ExpansionTaxonomyScene,
  RightsEntity,
  RightsRecord,
  RightsRelation,
  RightsShare,
  SourceRelationshipState,
  TaxonomyEntity,
  TaxonomyRecord,
  TaxonomyRelation,
  TaxonomyRightsBeatEvidence,
} from '../../remotion/compositions/explainer/expansion/relationships/taxonomy-rights-types';
import {
  type ExpansionEntity,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  compare,
  compatibleBasis,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  type ExpansionEvidenceSpan,
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

const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const COMMON_FIELDS = [
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
  ...PHASES.map((phase) => `${phase}Word`),
  'template',
  'entities',
  'period',
  'scope',
  'records',
  'relations',
] as const;
const RELATION_FIELDS = [
  'scope',
  'period',
  'state',
  'status',
  'condition',
  'qualifier',
  'alternatives',
  'evidence',
] as const;
function key(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function literal(text: string): string {
  return key(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function unsafe(text: string): boolean {
  return (
    /[<>`{}]|[a-z]+:\/\/|www\.|javascript:|data:/i.test(text) ||
    [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function clause(text: string, body: string, condition?: string): boolean {
  if (unsafe(text) || text.split(/\s+/).length > EXPANSION_LIMITS.evidenceWords) return false;
  const source = key(text)
    .replace(/[.;][”"’')\]]*$/, '')
    .trim();
  const grammar = condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
  return new RegExp(`^(?:${grammar})$`, 'i').test(source);
}
function joined(labels: readonly string[]): string {
  return labels.map(literal).join('\\s+and\\s+');
}
function scoped(body: string, scope: string, period: string): string {
  const s = literal(scope),
    p = literal(period);
  return (
    `(?:${body}\\s+(?:for|within|among)\\s+${s}\\s+(?:during|in)\\s+${p}|` +
    `${body}\\s+(?:during|in)\\s+${p}\\s+(?:for|within|among)\\s+${s}|` +
    `(?:For|Within)\\s+${s}\\s+(?:during|in)\\s+${p},\\s*${body}|` +
    `(?:During|In)\\s+${p},\\s*${body}\\s+(?:for|within|among)\\s+${s})`
  );
}
function sameSpan(a: ExpansionEvidenceSpan, b: ExpansionEvidenceSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function rows(raw: unknown, max: number, ctx: ParseContext): Rec[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > max || !raw.every(isRec))
    return mechanismIssue(ctx, `include one to ${max} complete local records/relations`);
  return raw;
}
function reference<T extends ExpansionEntity>(
  raw: unknown,
  entities: readonly T[],
  ctx: ParseContext,
): T | null {
  return (
    (typeof raw === 'string' ? entities.find((e) => key(e.label) === key(raw)) : undefined) ??
    mechanismIssue(ctx, 'endpoints must reference declared source labels, never supplied IDs')
  );
}
function localBase(raw: Rec, ctx: ParseContext, id: '33' | '34') {
  if (!onlyFields(raw, COMMON_FIELDS, ctx)) return null;
  const { win, words } = ctx;
  if (
    !Number.isInteger(win.startWord) ||
    !Number.isInteger(win.endWord) ||
    win.startWord < 0 ||
    win.endWord >= words.length ||
    win.startWord > win.endWord ||
    !Number.isFinite(win.startTime) ||
    !Number.isFinite(win.endTime)
  )
    return mechanismIssue(ctx, 'complete finite source window required');
  for (let i = win.startWord; i <= win.endWord; i++) {
    const word = words[i],
      previous = i > win.startWord ? words[i - 1] : undefined;
    if (
      !word ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < win.startTime ||
      word.end > win.endTime ||
      word.end <= word.start ||
      (previous && word.start < previous.end - 1e-7)
    )
      return mechanismIssue(
        ctx,
        'word timing must be finite, positive, monotonic and inside the scene',
      );
  }
  const b = expansionStoryBase(raw, ctx, id, [
    'template',
    'entities',
    'period',
    'scope',
    'records',
    'relations',
  ]);
  if (!b) return null;
  const template = id === '33' ? 'nested-categories' : 'dual-rights-board';
  if (raw.template !== template)
    return mechanismIssue(
      ctx,
      'template must match this exact authored story; no geometry or code',
    );
  const entities = expansionEntities(raw.entities, ctx, id);
  const period = expansionSourceLabel(raw.period, b.spans.setup, ctx, EXPANSION_LIMITS.period);
  const scope = expansionSourceLabel(raw.scope, b.spans.setup, ctx, EXPANSION_LIMITS.population);
  if (!entities || !period || !scope || unsafe(scope) || unsafe(period)) return null;
  const sourceSpans: Partial<Record<(typeof PHASES)[number], ExpansionEvidenceSpan>> = {};
  let previous = Number.NEGATIVE_INFINITY;
  for (const phase of PHASES) {
    const index = ctx.inWin(raw[`${phase}Word`]);
    if (index === null)
      return mechanismIssue(ctx, 'five distinct complete source clauses required');
    let fromWord = index,
      toWord = index;
    while (fromWord > win.startWord && !/[.!?;][”"’')\]]*$/.test(words[fromWord - 1]?.text ?? ''))
      fromWord--;
    while (toWord < win.endWord && !/[.!?;][”"’')\]]*$/.test(words[toWord]?.text ?? '')) toWord++;
    const evidence = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!evidence) return null;
    sourceSpans[phase] = evidence.span;
    const at = b.story[`${phase}At`];
    if (at - previous < 1 - 1e-6)
      return mechanismIssue(
        ctx,
        'all five source beats need at least one second gaps, including setup',
      );
    previous = at;
  }
  if (win.endTime - b.story.resolveAt < 0.8 - 1e-6)
    return mechanismIssue(ctx, 'resolve must leave at least 0.8 seconds final hold');
  const { setup, action, response, check, resolve } = sourceSpans;
  if (!setup || !action || !response || !check || !resolve)
    return mechanismIssue(ctx, 'all five complete beat clauses required');
  const completeSpans: TaxonomyRightsBeatEvidence = { setup, action, response, check, resolve };
  const { treatment: _treatment, ...story } = b.story;
  return { story, spans: b.spans, sourceSpans: completeSpans, entities, period, scope };
}
/** Exactly one setup-owned type declaration per entity; labels alone never supply a type. */
function declarations<T extends string>(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  types: readonly T[],
  setup: ExpansionEvidenceSpan,
  ctx: ParseContext,
  id: '33' | '34',
): { id: string; entityId: string; type: T; evidence: ExpansionEvidenceSpan }[] | null {
  const entries = rows(raw, EXPANSION_LIMITS.records, ctx);
  if (!entries || entries.length !== entities.length)
    return mechanismIssue(
      ctx,
      'every entity needs exactly one explicit type record, at most twelve',
    );
  const records: { id: string; entityId: string; type: T; evidence: ExpansionEvidenceSpan }[] = [];
  for (const [index, entry] of entries.entries()) {
    if (!onlyFields(entry, ['entity', 'type', 'evidence'], ctx)) return null;
    const entity = reference(entry.entity, entities, ctx);
    const type = types.find((candidate) => candidate === entry.type);
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    if (
      !entity ||
      !type ||
      !evidence ||
      !sameSpan(evidence.span, setup) ||
      !sameSpan(entity.evidence, evidence.span) ||
      records.some((r) => r.entityId === entity.id)
    )
      return mechanismIssue(
        ctx,
        'types must be distinct setup-owned declarations, not aliases or guesses',
      );
    records.push({
      id: expansionEntityId(id, entities.length + index),
      entityId: entity.id,
      type,
      evidence: evidence.span,
    });
  }
  return records;
}
function state<T extends string>(
  entry: Rec,
  text: string,
  positive: T,
  negative: T,
  positiveBody: string,
  negativeBody: string,
  unresolvedBody: string,
  b: NonNullable<ReturnType<typeof localBase>>,
  ctx: ParseContext,
): SourceRelationshipState<T> | null {
  const status = entry.status === positive ? positive : entry.status === negative ? negative : null;
  const body = scoped(status === positive ? positiveBody : negativeBody, b.scope, b.period);
  if (entry.state === 'known') {
    if (
      !status ||
      'condition' in entry ||
      'qualifier' in entry ||
      'alternatives' in entry ||
      !clause(text, body)
    )
      return mechanismIssue(
        ctx,
        'known relationship must be explicitly stated for these endpoints and scope',
      );
    return { state: 'known', status };
  }
  if (entry.state === 'unknown' || entry.state === 'missing') {
    if (
      'status' in entry ||
      'condition' in entry ||
      'alternatives' in entry ||
      entry.qualifier !== entry.state ||
      !clause(
        text,
        scoped(
          `${unresolvedBody}\\s+(?:is|are|remains|remain)\\s+${entry.state}`,
          b.scope,
          b.period,
        ),
      )
    )
      return mechanismIssue(
        ctx,
        'unknown and missing remain distinct, never a fabricated relationship or zero',
      );
    return { state: entry.state, qualifier: entry.state };
  }
  if (entry.state === 'disputed') {
    if (
      'status' in entry ||
      'condition' in entry ||
      entry.qualifier !== 'disputed' ||
      !Array.isArray(entry.alternatives) ||
      entry.alternatives.length !== 2 ||
      entry.alternatives[0] !== positive ||
      entry.alternatives[1] !== negative ||
      !clause(
        text,
        scoped(
          `${unresolvedBody}\\s+(?:is|are|remains|remain)\\s+disputed\\s+between\\s+${positive}\\s+and\\s+${negative}`,
          b.scope,
          b.period,
        ),
      )
    )
      return mechanismIssue(
        ctx,
        'disputed relationships preserve both explicit alternatives, without adjudication',
      );
    return { state: 'disputed', alternatives: [positive, negative], qualifier: 'disputed' };
  }
  if (entry.state === 'conditional') {
    const condition = expansionSourceLabel(entry.condition, text, ctx, EXPANSION_LIMITS.qualifier);
    if (
      !status ||
      !condition ||
      condition !== b.story.condition ||
      unsafe(condition) ||
      'qualifier' in entry ||
      'alternatives' in entry ||
      !clause(text, body, condition)
    )
      return mechanismIssue(
        ctx,
        'conditional relationships must retain their own exact full source condition',
      );
    return { state: 'conditional', status, condition };
  }
  if (entry.state === 'illustrative' || entry.state === 'simulated') {
    const qualifier = expansionSourceLabel(entry.qualifier, text, ctx, EXPANSION_LIMITS.qualifier);
    const allowed =
      entry.state === 'illustrative'
        ? ['illustrative example', 'teaching example']
        : ['simulation', 'simulated example'];
    if (
      !status ||
      !qualifier ||
      !allowed.includes(key(qualifier)) ||
      b.story.evidence !== 'illustrative' ||
      'condition' in entry ||
      'alternatives' in entry ||
      !clause(text, `In\\s+this\\s+${literal(qualifier)},\\s*${body}`)
    )
      return mechanismIssue(
        ctx,
        'illustrative and simulated relationships retain their nonmeasured qualification',
      );
    return { state: entry.state, status, qualifier };
  }
  return mechanismIssue(ctx, 'unsupported relationship state');
}
function localScope(
  entry: Rec,
  evidence: string,
  b: NonNullable<ReturnType<typeof localBase>>,
  ctx: ParseContext,
): boolean {
  const scope = expansionSourceLabel(entry.scope, evidence, ctx, EXPANSION_LIMITS.population);
  const period = expansionSourceLabel(entry.period, evidence, ctx, EXPANSION_LIMITS.period);
  if (!scope || !period || key(scope) !== key(b.scope) || key(period) !== key(b.period)) {
    mechanismIssue(
      ctx,
      'each relation must retain its own compatible source-local scope and period',
    );
    return false;
  }
  return true;
}
function conditionRetained(
  b: NonNullable<ReturnType<typeof localBase>>,
  conditions: readonly (string | undefined)[],
  ctx: ParseContext,
): boolean {
  if (b.story.condition && !conditions.includes(b.story.condition)) {
    mechanismIssue(
      ctx,
      'a source condition cannot be reassigned to setup, resolve or a different relationship',
    );
    return false;
  }
  return true;
}

/** Raw: common envelope + template, entities[{label,evidence}], period, scope,
 * records[{entity,type:category|member,evidence}], relations[{from,to,role:parent|membership,
 * scope,period,evidence,...source state}]. Only supplied direct edges survive. */
export function parseExpansionTaxonomy(raw: Rec, ctx: ParseContext): ExpansionTaxonomyScene | null {
  const b = localBase(raw, ctx, '33');
  if (!b) return null;
  const records = declarations(
    raw.records,
    b.entities,
    ['category', 'member'] as const,
    b.sourceSpans.setup,
    ctx,
    '33',
  );
  if (!records) return null;
  const entities: TaxonomyEntity[] = b.entities.map((e) => ({
    ...e,
    type: records.find((r) => r.entityId === e.id)?.type ?? 'member',
  }));
  const categories = entities.filter((e) => e.type === 'category').map((e) => e.label);
  const members = entities.filter((e) => e.type === 'member').map((e) => e.label);
  if (categories.length < 2 || members.length < 1)
    return mechanismIssue(
      ctx,
      'taxonomy needs explicit parent/child categories and at least one member',
    );
  const setup = scoped(
    `${literal(b.story.subject)}\\s+(?:lists|classifies)\\s+categories\\s+${joined(categories)}\\s+and\\s+members?\\s+${joined(members)}`,
    b.scope,
    b.period,
  );
  const alternate = `In\\s+${literal(b.period)},\\s*${literal(b.story.subject)}\\s+(?:treats|uses)\\s+${joined(categories)}\\s+as\\s+categories\\s+and\\s+${joined(members)}\\s+as\\s+(?:a\\s+member|members)\\s+(?:for|within)\\s+${literal(b.scope)}`;
  if (!clause(b.spans.setup, `(?:${setup}|${alternate})`))
    return mechanismIssue(
      ctx,
      'setup must explicitly classify every category and member for this scope/period',
    );
  const entries = rows(raw.relations, EXPANSION_LIMITS.relations, ctx);
  if (!entries) return null;
  const relations: TaxonomyRelation[] = [];
  for (const [index, entry] of entries.entries()) {
    if (!onlyFields(entry, ['from', 'to', 'role', ...RELATION_FIELDS], ctx)) return null;
    const from = reference(entry.from, entities, ctx),
      to = reference(entry.to, entities, ctx);
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    if (!from || !to || !evidence || !localScope(entry, evidence.text, b, ctx)) return null;
    const role =
      entry.role === 'parent' ? 'parent' : entry.role === 'membership' ? 'membership' : null;
    if (
      !role ||
      from.id === to.id ||
      to.type !== 'category' ||
      (role === 'parent' ? from.type !== 'category' : from.type !== 'member') ||
      relations.some((r) => r.fromId === from.id && r.toId === to.id && r.role === role)
    )
      return mechanismIssue(
        ctx,
        'typed direct taxonomy edges must be distinct, consistent and non-self-referential',
      );
    const a = literal(from.label),
      z = literal(to.label);
    const positive =
      role === 'parent'
        ? `${a}\\s+(?:is\\s+a\\s+subcategory\\s+of|has\\s+parent\\s+category)\\s+${z}`
        : `${a}\\s+(?:is\\s+a\\s+member\\s+of|belongs\\s+to\\s+category)\\s+${z}`;
    const negative =
      role === 'parent'
        ? `${a}\\s+(?:is\\s+not\\s+a\\s+subcategory\\s+of|does\\s+not\\s+have\\s+parent\\s+category)\\s+${z}`
        : `${a}\\s+(?:is\\s+not\\s+a\\s+member\\s+of|does\\s+not\\s+belong\\s+to\\s+category)\\s+${z}`;
    const unresolved =
      role === 'parent'
        ? `${a}\\s+parent\\s+link\\s+to\\s+${z}`
        : `${a}\\s+membership\\s+in\\s+${z}`;
    const judgment = state(
      entry,
      evidence.text,
      'included',
      'excluded',
      positive,
      negative,
      unresolved,
      b,
      ctx,
    );
    if (!judgment) return null;
    relations.push({
      id: expansionEntityId('33', entities.length + records.length + index),
      fromId: from.id,
      toId: to.id,
      role,
      scope: b.scope,
      period: b.period,
      evidence: evidence.span,
      ...judgment,
    });
  }
  // Consider every possible parent, including uncertainty/conditions, so qualification cannot hide cycles.
  function cyclic(id: string, path: ReadonlySet<string>): boolean {
    if (path.has(id)) return true;
    const next = new Set(path).add(id);
    return relations.some(
      (r) =>
        r.role === 'parent' &&
        r.fromId === id &&
        (!('status' in r) || r.status !== 'excluded') &&
        cyclic(r.toId, next),
    );
  }
  if (
    !relations.some((r) => r.role === 'parent') ||
    !relations.some((r) => r.role === 'membership') ||
    entities.some((e) => !relations.some((r) => r.fromId === e.id || r.toId === e.id)) ||
    entities.some((e) => cyclic(e.id, new Set()))
  )
    return mechanismIssue(
      ctx,
      'taxonomy must be a bounded consistent acyclic hierarchy of supplied direct links',
    );
  if (
    !conditionRetained(
      b,
      relations.map((r) => ('condition' in r ? r.condition : undefined)),
      ctx,
    )
  )
    return null;
  if (
    !clause(
      b.spans.resolve,
      `${literal(b.story.subject)}\\s+(?:keeps|preserves)\\s+only\\s+stated\\s+links`,
    )
  )
    return mechanismIssue(
      ctx,
      'resolve preserves only stated taxonomy links, not transfers, dependencies or inferred membership',
    );
  return {
    ...b.story,
    storyId: '33',
    kind: 'relation-structure',
    preset: 'taxonomy',
    template: 'nested-categories',
    entities,
    records: records as TaxonomyRecord[],
    relations,
    scope: b.scope,
    period: b.period,
    sourceSpans: b.sourceSpans,
    meaning: 'explicit-hierarchy-not-dependency-or-transfer',
  };
}

function share(
  raw: unknown,
  actor: RightsEntity,
  resource: RightsEntity,
  right: RightsRelation['right'],
  b: NonNullable<ReturnType<typeof localBase>>,
  ctx: ParseContext,
): RightsShare | null {
  if (!isRec(raw) || !onlyFields(raw, ['quantity', 'denominatorUnit', 'basisEvidence'], ctx))
    return mechanismIssue(
      ctx,
      'a share needs only a supplied quantity and explicit denominator-unit evidence',
    );
  const quantity = parseExpansionQuantity(raw.quantity, ctx);
  if (!quantity) return mechanismIssue(ctx, 'share must be a complete actor-owned source quantity');
  const denominator = quantity.basis.denominator;
  const unit = quantity.basis.unit;
  if (
    right === 'control' ||
    key(quantity.actor) !== key(actor.label) ||
    key(quantity.claim) !== key(`${resource.label} ${right} share`) ||
    key(quantity.basis.period) !== key(b.period) ||
    key(quantity.basis.population) !== key(b.scope) ||
    (unit !== 'count' && unit !== 'percent' && unit !== 'ratio') ||
    raw.denominatorUnit !== unit ||
    !denominator ||
    denominator.numerator <= 0 ||
    denominator.denominator !== 1 ||
    (unit === 'percent' && denominator.numerator !== 100) ||
    (unit === 'ratio' && denominator.numerator !== 1)
  )
    return mechanismIssue(
      ctx,
      'shares need this actor/resource/right/scope/period and a supplied compatible positive denominator/unit',
    );
  if (quantity.state === 'conditional' && quantity.condition !== b.story.condition)
    return mechanismIssue(ctx, 'conditional share must retain its actual source condition');
  if (
    (quantity.state === 'illustrative' || quantity.state === 'simulated') &&
    b.story.evidence !== 'illustrative'
  )
    return mechanismIssue(ctx, 'nonmeasured shares cannot become source-stated rights');
  const denominatorProof = parseExpansionQuantity(
    {
      actor: actor.label,
      claim: `${resource.label} ${right} share denominator`,
      basis: { unit, period: b.period, population: b.scope },
      evidence: raw.basisEvidence,
      state:
        quantity.state === 'illustrative' || quantity.state === 'simulated'
          ? quantity.state
          : 'known',
      ...(quantity.state === 'illustrative' || quantity.state === 'simulated'
        ? { qualifier: quantity.qualifier }
        : {}),
      amount: { kind: 'rational', value: denominator },
    },
    ctx,
  );
  if (!denominatorProof)
    return mechanismIssue(
      ctx,
      'denominator unit/value must be separately explicit for this exact share owner and basis',
    );
  const amounts =
    quantity.state === 'disputed'
      ? quantity.alternatives
      : 'amount' in quantity
        ? [quantity.amount]
        : [];
  for (const amount of amounts) {
    if (amount.kind !== 'rational')
      return mechanismIssue(ctx, 'shares are exact nonmonetary supplied operands');
    const value = amount.value;
    const upper = compare(value, denominator);
    if (
      value.numerator < 0 ||
      (unit === 'count' && value.denominator !== 1) ||
      !upper.ok ||
      upper.value > 0
    )
      return mechanismIssue(
        ctx,
        'supplied shares must be within their exact stated denominator, without rounding or overflow',
      );
  }
  return { quantity, denominatorUnit: unit, basisEvidence: denominatorProof.evidence };
}

/** Raw: same envelope/arrays, records type actor|resource; relations[{actor,resource,
 * right:economic|voting|control,scope,period,evidence,...source state,share?}].
 * share={quantity:<expansion quantity>,denominatorUnit:count|percent|ratio,basisEvidence}.
 * No numeric derivation, aggregate, implied owner, control grant or winner is emitted. */
export function parseExpansionDualRights(
  raw: Rec,
  ctx: ParseContext,
): ExpansionDualRightsScene | null {
  const b = localBase(raw, ctx, '34');
  if (!b) return null;
  const records = declarations(
    raw.records,
    b.entities,
    ['actor', 'resource'] as const,
    b.sourceSpans.setup,
    ctx,
    '34',
  );
  if (!records) return null;
  const entities: RightsEntity[] = b.entities.map((e) => ({
    ...e,
    type: records.find((r) => r.entityId === e.id)?.type ?? 'resource',
  }));
  const actors = entities.filter((e) => e.type === 'actor').map((e) => e.label);
  const resources = entities.filter((e) => e.type === 'resource').map((e) => e.label);
  if (!actors.length || !resources.length)
    return mechanismIssue(ctx, 'rights need separately named actors and resources');
  const setup = scoped(
    `${literal(b.story.subject)}\\s+(?:compares|lists)\\s+actors?\\s+${joined(actors)}\\s+and\\s+resources?\\s+${joined(resources)}`,
    b.scope,
    b.period,
  );
  const alternate = `In\\s+${literal(b.period)},\\s*${literal(b.story.subject)}\\s+(?:names|identifies)\\s+${joined(actors)}\\s+as\\s+actors?\\s+and\\s+${joined(resources)}\\s+as\\s+(?:a\\s+resource|resources)\\s+(?:for|within)\\s+${literal(b.scope)}`;
  if (!clause(b.spans.setup, `(?:${setup}|${alternate})`))
    return mechanismIssue(
      ctx,
      'setup must explicitly name every actor/resource and the rights scope/period',
    );
  const entries = rows(raw.relations, EXPANSION_LIMITS.relations, ctx);
  if (!entries) return null;
  const relations: RightsRelation[] = [];
  for (const [index, entry] of entries.entries()) {
    if (!onlyFields(entry, ['actor', 'resource', 'right', 'share', ...RELATION_FIELDS], ctx))
      return null;
    const actor = reference(entry.actor, entities, ctx),
      resource = reference(entry.resource, entities, ctx);
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    const right =
      entry.right === 'economic'
        ? 'economic'
        : entry.right === 'voting'
          ? 'voting'
          : entry.right === 'control'
            ? 'control'
            : null;
    if (!actor || !resource || !evidence || !localScope(entry, evidence.text, b, ctx)) return null;
    if (
      actor.type !== 'actor' ||
      resource.type !== 'resource' ||
      !right ||
      relations.some(
        (r) => r.actorId === actor.id && r.resourceId === resource.id && r.right === right,
      )
    )
      return mechanismIssue(
        ctx,
        'rights must be distinct actor-to-resource economic, voting or control statements',
      );
    const a = literal(actor.label),
      z = literal(resource.label);
    const rights = `${right}\\s+rights\\s+(?:over|in)\\s+${z}`;
    const judgment = state(
      entry,
      evidence.text,
      'granted',
      'denied',
      `${a}\\s+(?:holds|has)\\s+${rights}`,
      `${a}\\s+(?:does\\s+not\\s+hold|has\\s+no)\\s+${rights}`,
      `${a}\\s+${rights}`,
      b,
      ctx,
    );
    if (!judgment) return null;
    const supplied =
      entry.share === undefined ? undefined : share(entry.share, actor, resource, right, b, ctx);
    if (supplied === null) return null;
    if (
      supplied &&
      (right === 'control' ||
        ('status' in judgment && judgment.status === 'denied') ||
        ((judgment.state === 'missing' ||
          judgment.state === 'unknown' ||
          judgment.state === 'disputed') &&
          supplied.quantity.state !== judgment.state) ||
        ((judgment.state === 'conditional' ||
          judgment.state === 'illustrative' ||
          judgment.state === 'simulated') &&
          supplied.quantity.state !== judgment.state))
    )
      return mechanismIssue(
        ctx,
        'a share cannot fabricate a denied, absent, disputed, conditional or nonmeasured right',
      );
    const prior = relations.find(
      (r) => r.right === right && r.resourceId === resource.id && r.share,
    );
    if (
      supplied &&
      prior?.share &&
      !compatibleBasis(prior.share.quantity.basis, supplied.quantity.basis)
    )
      return mechanismIssue(
        ctx,
        'shares of the same resource/right must use explicit compatible units and denominators',
      );
    relations.push({
      id: expansionEntityId('34', entities.length + records.length + index),
      actorId: actor.id,
      resourceId: resource.id,
      right,
      scope: b.scope,
      period: b.period,
      evidence: evidence.span,
      ...judgment,
      ...(supplied ? { share: supplied } : {}),
    });
  }
  if (
    !(['economic', 'voting', 'control'] as const).every((right) =>
      relations.some((r) => r.right === right),
    ) ||
    entities.some((e) => !relations.some((r) => r.actorId === e.id || r.resourceId === e.id))
  )
    return mechanismIssue(
      ctx,
      'separately source-ground economic, voting and control; do not infer a missing grant',
    );
  if (
    !conditionRetained(
      b,
      relations.flatMap((r) => [
        'condition' in r ? r.condition : undefined,
        r.share?.quantity.state === 'conditional' ? r.share.quantity.condition : undefined,
      ]),
      ctx,
    )
  )
    return null;
  if (
    !clause(
      b.spans.resolve,
      `${literal(b.story.subject)}\\s+(?:keeps|preserves)\\s+separate\\s+source-stated\\s+rights`,
    )
  )
    return mechanismIssue(
      ctx,
      'resolve must retain separate source-stated rights, not an invented owner, control grant or winner',
    );
  return {
    ...b.story,
    storyId: '34',
    kind: 'ownership-change',
    preset: 'dual-rights',
    template: 'dual-rights-board',
    entities,
    records: records as RightsRecord[],
    relations,
    scope: b.scope,
    period: b.period,
    sourceSpans: b.sourceSpans,
    meaning: 'separate-source-stated-rights-not-inferred-control',
  };
}
