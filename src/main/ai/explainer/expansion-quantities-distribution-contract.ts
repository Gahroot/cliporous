/** Local distribution stories 17–18: supplied data and bounded authored arithmetic only. */
import type {
  DistributionSourceSpans,
  ExpansionHistogramScene,
  ExpansionSubgroupReversalScene,
  HistogramBoundary,
  HistogramRecord,
  SubgroupCountRecord,
} from '../../remotion/compositions/explainer/expansion/quantities/distribution-types';
import {
  type ExpansionEntity,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  add,
  compare,
  compatibleBasis,
  decimalRational,
  divide,
  isDerivationAllowed,
  rational,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  EXPANSION_UNITS,
  type ExpansionBasis,
  type ExpansionDerivedValue,
  type ExpansionEvidenceSpan,
  type ExpansionQuantity,
  type ExpansionRational,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  type ExpansionSourceEvidence,
  expansionAssertedRelation,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const BEATS = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const SCALAR = '[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,6})?';
function key(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function escaped(text: string): string {
  return key(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function name(text: string): string {
  return `(?:the\\s+)?${escaped(text)}`;
}
function equal(a: ExpansionRational, b: ExpansionRational): boolean {
  const result = compare(a, b);
  return result.ok && result.value === 0;
}
function asserted(
  evidence: string | ExpansionSourceEvidence,
  body: string,
  labels: readonly string[],
  condition?: string,
): boolean {
  return expansionAssertedRelation(evidence, new RegExp(body, 'i'), condition, labels);
}
function qualifiedCondition(text: string, condition?: string): string | undefined {
  return /\b(?:if|unless|when|provided that|assuming)\b/i.test(text) ? condition : undefined;
}
function resolveClause(text: string, body: string): boolean {
  return (
    !/[<>`{}]|https?:\/\/|www\./i.test(text) &&
    new RegExp(`^(?:${body})[.;]?$`, 'i').test(key(text))
  );
}
function base(raw: Rec, ctx: ParseContext, id: '17' | '18', fields: readonly string[]) {
  const parsed = expansionStoryBase(raw, ctx, id, fields);
  const entities = parsed ? expansionEntities(raw.entities, ctx, id) : null;
  if (!parsed || !entities) return null;
  const entries: ExpansionEvidenceSpan[] = [];
  for (const beat of BEATS) {
    const index = ctx.inWin(raw[`${beat}Word`]);
    if (index === null)
      return mechanismIssue(ctx, 'every distribution beat needs a source sentence');
    let fromWord = index;
    let toWord = index;
    while (
      fromWord > ctx.win.startWord &&
      !/[.!?;][”"’')\]]*$/.test(ctx.words[fromWord - 1]?.text ?? '')
    )
      fromWord--;
    while (toWord < ctx.win.endWord && !/[.!?;][”"’')\]]*$/.test(ctx.words[toWord]?.text ?? ''))
      toWord++;
    const local = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!local) return null;
    entries.push(local.span);
  }
  const [setup, action, response, check, resolve] = entries;
  if (
    !setup ||
    !action ||
    !response ||
    !check ||
    !resolve ||
    new Set(entries.map((e) => e.fromWord)).size !== 5
  )
    return mechanismIssue(ctx, 'five distinct complete source sentences must own the five beats');
  const sourceSpans: DistributionSourceSpans = { setup, action, response, check, resolve };
  const { treatment: _treatment, ...story } = parsed.story;
  return { story, spans: parsed.spans, entities, sourceSpans };
}
function ref(
  raw: unknown,
  evidence: string | ExpansionSourceEvidence,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = expansionSourceLabel(raw, evidence, ctx, EXPANSION_LIMITS.actorLabel);
  return (
    (label ? entities.find((e) => key(e.label) === key(label)) : undefined) ??
    mechanismIssue(ctx, 'references must name existing source-owned entity labels, never input IDs')
  );
}
function quantity(raw: unknown, ctx: ParseContext): ExpansionQuantity | null {
  return (
    parseExpansionQuantity(raw, ctx) ??
    mechanismIssue(ctx, 'complete actor-owned distribution quantity is required')
  );
}
function values(q: ExpansionQuantity): ExpansionRational[] | null {
  const amounts = q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : [];
  if (amounts.some((a) => a.kind !== 'rational')) return null;
  return amounts.flatMap((a) => (a.kind === 'rational' ? [a.value] : []));
}
function count(q: ExpansionQuantity, positive = false): boolean {
  const amounts = values(q);
  return (
    q.basis.unit === 'count' &&
    amounts !== null &&
    amounts.every((a) => a.denominator === 1 && (positive ? a.numerator > 0 : a.numerator >= 0))
  );
}
function known(q: ExpansionQuantity): ExpansionRational | null {
  return q.state === 'known' ? (values(q)?.[0] ?? null) : null;
}
function boundary(raw: unknown, notation: string, ctx: ParseContext): HistogramBoundary | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['numerator', 'denominator'], ctx) ||
    typeof raw.numerator !== 'number' ||
    typeof raw.denominator !== 'number' ||
    raw.denominator <= 0
  )
    return mechanismIssue(ctx, 'bin boundaries need exact bounded rationals, not directives');
  const supplied = rational(raw.numerator, raw.denominator),
    source = decimalRational(notation.replace(/−/g, '-'));
  if (!supplied.ok || !source.ok || !equal(supplied.value, source.value))
    return mechanismIssue(
      ctx,
      'bin boundary must retain the exact signed source value and precision',
    );
  return { value: supplied.value, notation };
}

export function parseExpansionHistogram(
  raw: Rec,
  ctx: ParseContext,
): ExpansionHistogramScene | null {
  const b = base(raw, ctx, '17', [
    'entities',
    'actor',
    'metric',
    'valueUnit',
    'representation',
    'records',
  ]);
  if (!b) return null;
  const actor = ref(raw.actor, b.spans.setup, b.entities, ctx);
  const metric = expansionSourceLabel(raw.metric, b.spans.setup, ctx, 48);
  const unit = EXPANSION_UNITS.find(
    (u) => u === raw.valueUnit && !['USD', 'EUR', 'GBP'].includes(u),
  );
  const representation = raw.representation;
  if (!actor || !metric || !unit)
    return mechanismIssue(ctx, 'histogram requires a source-owned actor, metric and scalar unit');
  if (b.entities.length !== 1 || (representation !== 'bins' && representation !== 'observations'))
    return mechanismIssue(
      ctx,
      'histogram has one named actor and supplied bins or observations; bins are not actors',
    );
  if (
    !Array.isArray(raw.records) ||
    raw.records.length < 2 ||
    raw.records.length > EXPANSION_LIMITS.records
  )
    return mechanismIssue(ctx, 'histogram needs two to twelve supplied records');
  const records: HistogramRecord[] = [];
  let basis: ExpansionBasis | undefined;
  for (const [index, entry] of raw.records.entries()) {
    if (
      !isRec(entry) ||
      !onlyFields(
        entry,
        representation === 'bins'
          ? ['label', 'lower', 'upper', 'rangeEvidence', 'count']
          : ['quantity'],
        ctx,
      )
    )
      return null;
    const q = quantity(representation === 'bins' ? entry.count : entry.quantity, ctx);
    if (!q || key(q.actor) !== key(actor.label))
      return mechanismIssue(ctx, 'each supplied datum must belong to the named histogram actor');
    if (basis && !compatibleBasis(basis, q.basis))
      return mechanismIssue(
        ctx,
        'histogram records must retain one compatible period, population, unit and denominator',
      );
    basis ??= q.basis;
    if (representation === 'observations') {
      if (key(q.claim) !== key(metric) || q.basis.unit !== unit || values(q) === null)
        return mechanismIssue(
          ctx,
          'observations must quote the same metric and unit; no sampled or fabricated data',
        );
      records.push({ id: expansionEntityId('17', 1 + index), role: 'observation', quantity: q });
      continue;
    }
    const evidence = expansionSourceSpan(entry.rangeEvidence, ctx);
    const label = evidence ? expansionSourceLabel(entry.label, evidence, ctx, 32) : null;
    if (!evidence || !label || !count(q) || key(q.claim) !== key(`${label} count`))
      return mechanismIssue(
        ctx,
        'each bin count must bind its own named bin and complete local count assertion',
      );
    const body = `${name(actor.label)}\\s+bin\\s+${escaped(label)}\\s+(?:spans|covers)\\s+(${SCALAR})\\s+to\\s+(${SCALAR})\\s+${escaped(unit)},\\s*including\\s+(?:the\\s+)?lower\\s+and\\s+excluding\\s+(?:the\\s+)?upper\\s+(?:during|in)\\s+${escaped(q.basis.period)}\\s+among\\s+${escaped(q.basis.population)}`;
    const condition = qualifiedCondition(evidence.text, b.story.condition);
    if (
      !asserted(evidence, body, [actor.label, label, q.basis.period, q.basis.population], condition)
    )
      return mechanismIssue(
        ctx,
        'bin bounds, endpoint inclusion and count basis must share an actor-owned local range clause',
      );
    const text = key(evidence.text).replace(/[.;]$/, '');
    const core = condition
      ? text
          .replace(new RegExp(`^${escaped(condition)},\\s*`, 'i'), '')
          .replace(new RegExp(`,?\\s+${escaped(condition)}$`, 'i'), '')
      : text;
    const match = new RegExp(`^(?:${body})$`, 'i').exec(core);
    const lower = match?.[1] ? boundary(entry.lower, match[1], ctx) : null;
    const upper = match?.[2] ? boundary(entry.upper, match[2], ctx) : null;
    const order = lower && upper ? compare(lower.value, upper.value) : null;
    if (!lower || !upper || !order?.ok || order.value >= 0)
      return mechanismIssue(ctx, 'each bin must have increasing exact source boundaries');
    const previous = records.at(-1);
    if (previous?.role === 'bin') {
      const sorted = compare(previous.upper.value, lower.value);
      if (
        !sorted.ok ||
        sorted.value > 0 ||
        records.some((r) => r.role === 'bin' && key(r.label) === key(label))
      )
        return mechanismIssue(
          ctx,
          'supplied bins must be ordered, distinct and nonoverlapping; no sorting repair',
        );
    }
    records.push({
      id: expansionEntityId('17', 1 + index),
      role: 'bin',
      label,
      lower,
      upper,
      lowerInclusive: true,
      upperInclusive: false,
      rangeEvidence: evidence.span,
      count: q,
    });
  }
  if (
    !basis ||
    !asserted(
      b.spans.setup,
      `(?:${name(b.story.subject)}:\\s*)?${name(actor.label)}\\s+(?:reports|describes)\\s+${escaped(metric)}\\s+distribution\\s+in\\s+${escaped(unit)}\\s+(?:during|in)\\s+${escaped(basis.period)}\\s+(?:among|for)\\s+${escaped(basis.population)}\\s+using\\s+supplied\\s+${representation}`,
      [actor.label, metric, basis.period, basis.population],
    )
  )
    return mechanismIssue(
      ctx,
      'setup must identify the actual distribution metric, owner, unit and scope',
    );
  if (representation === 'bins') {
    // Do not silently omit another complete supplied bin from this same owned distribution.
    const range = `${name(actor.label)}\\s+bin\\s+([a-z0-9 -]{1,32})\\s+(?:spans|covers)\\s+${SCALAR}\\s+to\\s+${SCALAR}\\s+${escaped(unit)},\\s*including\\s+(?:the\\s+)?lower\\s+and\\s+excluding\\s+(?:the\\s+)?upper\\s+(?:during|in)\\s+${escaped(basis.period)}\\s+among\\s+${escaped(basis.population)}`;
    let fromWord = ctx.win.startWord;
    for (let toWord = fromWord; toWord <= ctx.win.endWord; toWord++) {
      if (!/[.!?;][”"’')\]]*$/.test(ctx.words[toWord]?.text ?? '')) continue;
      const local = expansionSourceSpan({ fromWord, toWord }, ctx);
      if (!local) return null;
      if (
        asserted(
          local,
          range,
          [actor.label, basis.period, basis.population],
          qualifiedCondition(local.text, b.story.condition),
        ) &&
        !records.some(
          (record) =>
            record.role === 'bin' &&
            record.rangeEvidence.fromWord === fromWord &&
            record.rangeEvidence.toWord === toWord,
        )
      )
        return mechanismIssue(
          ctx,
          'retain every supplied bin in this actor, period and population; no selective omission',
        );
      fromWord = toWord + 1;
    }
  }
  if (
    !resolveClause(
      b.spans.resolve,
      `${name(b.story.subject)}\\s+(?:retains|keeps)\\s+(?:only\\s+)?supplied\\s+${representation}\\s+without\\s+(?:smoothing|generated\\s+samples)`,
    )
  )
    return mechanismIssue(
      ctx,
      'histogram resolve must retain supplied data only, without invented smoothing',
    );
  return {
    ...b.story,
    storyId: '17',
    kind: 'distribution-view',
    preset: 'histogram',
    entities: b.entities,
    actorId: actor.id,
    metric,
    valueUnit: unit,
    representation,
    records,
    sourceSpans: b.sourceSpans,
    dataMeaning: 'supplied-only-no-smoothing',
  };
}

function derive(
  operation: 'ratio' | 'subgroup-total',
  operands: readonly ExpansionRational[],
  basis: ExpansionBasis,
  evidence: readonly ExpansionEvidenceSpan[],
  ctx: ParseContext,
): ExpansionDerivedValue | null {
  if (!isDerivationAllowed('18', operation))
    return mechanismIssue(ctx, 'catalog does not allow this distribution operation');
  let result: ExpansionRational;
  if (operation === 'ratio') {
    const a = operands[0],
      d = operands[1];
    if (!a || !d || operands.length !== 2)
      return mechanismIssue(ctx, 'ratio needs the exact numerator and denominator');
    const value = divide(a, d);
    if (!value.ok) return mechanismIssue(ctx, `exact subgroup ratio rejected: ${value.error}`);
    result = value.value;
  } else {
    let total: ExpansionRational = { numerator: 0, denominator: 1 };
    for (const operand of operands) {
      const next = add(total, operand);
      if (!next.ok) return mechanismIssue(ctx, `exact subgroup total rejected: ${next.error}`);
      total = next.value;
    }
    result = total;
  }
  return { state: 'derived', operation, operands, result, basis, evidence };
}

export function parseExpansionSubgroupReversal(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSubgroupReversalScene | null {
  const b = base(raw, ctx, '18', [
    'entities',
    'actors',
    'groups',
    'metric',
    'aggregatePopulation',
    'records',
    'aggregateEvidence',
    'reversalEvidence',
    'subgroupHigher',
    'aggregateHigher',
  ]);
  if (!b) return null;
  if (
    !Array.isArray(raw.actors) ||
    raw.actors.length !== 2 ||
    !Array.isArray(raw.groups) ||
    raw.groups.length < 2 ||
    raw.groups.length > 4
  )
    return mechanismIssue(
      ctx,
      'reversal needs two actors and the same two to four complete subgroups',
    );
  const actors = raw.actors.map((value) => ref(value, b.spans.setup, b.entities, ctx));
  const groups = raw.groups.map((value) => ref(value, b.spans.setup, b.entities, ctx));
  const a = actors[0],
    z = actors[1];
  if (!a || !z || groups.some((g) => !g)) return null;
  const validGroups = groups.filter((g): g is ExpansionEntity => g !== null);
  if (
    new Set([...actors, ...validGroups].map((e) => e?.id)).size !== 2 + validGroups.length ||
    b.entities.length !== 2 + validGroups.length
  )
    return mechanismIssue(
      ctx,
      'compared actors and subgroup identities must be distinct; no unused entities',
    );
  const metric = expansionSourceLabel(raw.metric, b.spans.setup, ctx, 32);
  const population = expansionSourceLabel(
    raw.aggregatePopulation,
    b.spans.setup,
    ctx,
    EXPANSION_LIMITS.population,
  );
  const aggregateEvidence = expansionSourceSpan(raw.aggregateEvidence, ctx);
  const reversalEvidence = expansionSourceSpan(raw.reversalEvidence, ctx);
  if (!metric || !population || !aggregateEvidence || !reversalEvidence) return null;
  const high = ref(
    raw.subgroupHigher,
    reversalEvidence,
    actors.filter((e): e is ExpansionEntity => e !== null),
    ctx,
  );
  const aggregateHigh = ref(
    raw.aggregateHigher,
    reversalEvidence,
    actors.filter((e): e is ExpansionEntity => e !== null),
    ctx,
  );
  if (!high || !aggregateHigh || high.id === aggregateHigh.id)
    return mechanismIssue(
      ctx,
      'a reversal changes the higher-rate actor between subgroup and aggregate scopes',
    );
  if (
    !Array.isArray(raw.records) ||
    raw.records.length !== 2 * validGroups.length ||
    raw.records.length > EXPANSION_LIMITS.records
  )
    return mechanismIssue(
      ctx,
      'every actor needs one complete numerator/denominator record for every identical subgroup',
    );
  const records: SubgroupCountRecord[] = [];
  let period: string | undefined;
  for (const [index, entry] of raw.records.entries()) {
    if (!isRec(entry) || !onlyFields(entry, ['actor', 'group', 'numerator', 'denominator'], ctx))
      return null;
    const numerator = quantity(entry.numerator, ctx),
      denominator = quantity(entry.denominator, ctx);
    if (!numerator || !denominator) return null;
    const actor = actors.find(
      (e) => e && typeof entry.actor === 'string' && key(e.label) === key(entry.actor),
    );
    const group = validGroups.find(
      (e) => typeof entry.group === 'string' && key(e.label) === key(entry.group),
    );
    if (!actor || !group || records.some((r) => r.actorId === actor.id && r.groupId === group.id))
      return mechanismIssue(
        ctx,
        'subgroup record labels must identify one existing actor/group pair, never duplicate IDs',
      );
    if (
      key(numerator.actor) !== key(actor.label) ||
      key(denominator.actor) !== key(actor.label) ||
      key(numerator.claim) !== key(`${metric} numerator`) ||
      key(denominator.claim) !== key(`${metric} denominator`) ||
      key(numerator.basis.population) !== key(group.label) ||
      key(denominator.basis.population) !== key(group.label) ||
      key(numerator.basis.period) !== key(denominator.basis.period) ||
      !count(numerator) ||
      !count(denominator, true)
    )
      return mechanismIssue(
        ctx,
        'numerator and positive denominator must own the exact actor, subgroup, metric, count unit and period',
      );
    if (period && key(period) !== key(numerator.basis.period))
      return mechanismIssue(ctx, 'all compared quantities need one identical source period');
    period ??= numerator.basis.period;
    const n = known(numerator),
      d = known(denominator);
    if (n && d && n.numerator > d.numerator)
      return mechanismIssue(ctx, 'subgroup numerator cannot exceed its own denominator');
    if (
      denominator.basis.denominator ||
      (numerator.basis.denominator && (!d || !equal(numerator.basis.denominator, d)))
    )
      return mechanismIssue(
        ctx,
        'an explicit numerator denominator must equal this actor subgroup total',
      );
    records.push({
      id: expansionEntityId('18', b.entities.length + index),
      actorId: actor.id,
      groupId: group.id,
      numerator,
      denominator,
    });
  }
  if (!period) return mechanismIssue(ctx, 'common source period is required');
  const joined = validGroups.map((g) => name(g.label)).join('\\s+and\\s+');
  const condition = b.story.condition;
  if (
    !asserted(
      b.spans.setup,
      `(?:${name(b.story.subject)}:\\s*)?${name(a.label)}\\s+and\\s+${name(z.label)}\\s+(?:compare|report)\\s+${escaped(metric)}\\s+counts\\s+across\\s+${joined}\\s+within\\s+${escaped(population)}\\s+during\\s+${escaped(period)}`,
      // The authored adjacent basis phrase is one literal slot, not two actors.
      // Keep the shared eight-slot guard while supporting all four permitted groups.
      [
        a.label,
        z.label,
        metric,
        `${population} during ${period}`,
        ...validGroups.map((g) => g.label),
      ],
      qualifiedCondition(b.spans.setup, condition),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must identify both actors, the complete common subgroup list and aggregate metric scope',
    );
  if (
    !asserted(
      aggregateEvidence,
      `${joined}\\s+(?:partition|form\\s+the\\s+complete\\s+partition\\s+of)\\s+${escaped(population)}\\s+for\\s+${name(a.label)}\\s+and\\s+${name(z.label)}\\s+during\\s+${escaped(period)}`,
      [a.label, z.label, population, period, ...validGroups.map((g) => g.label)],
      qualifiedCondition(aggregateEvidence.text, condition),
    )
  )
    return mechanismIssue(
      ctx,
      'aggregate population must be explicitly partitioned by the same complete groups for both actors',
    );
  const reversal = `${name(high.label)}\\s+has\\s+(?:a\\s+)?higher\\s+${escaped(metric)}\\s+(?:ratio|rate)\\s+than\\s+${name(aggregateHigh.label)}\\s+within\\s+(?:every|each)\\s+supplied\\s+subgroup,\\s*but\\s+${name(aggregateHigh.label)}\\s+has\\s+(?:a\\s+)?higher\\s+${escaped(metric)}\\s+(?:ratio|rate)\\s+than\\s+${name(high.label)}\\s+within\\s+${escaped(population)}\\s+during\\s+${escaped(period)}`;
  if (
    !asserted(
      reversalEvidence,
      reversal,
      [high.label, aggregateHigh.label, metric, population, period],
      qualifiedCondition(reversalEvidence.text, condition),
    )
  )
    return mechanismIssue(
      ctx,
      'source must explicitly reverse the same actors and metric between every supplied subgroup and this aggregate',
    );
  if (
    !resolveClause(
      b.spans.resolve,
      `${name(b.story.subject)}\\s+(?:retains|keeps)\\s+(?:the\\s+)?scope-bound\\s+(?:reversal|comparison)(?:,\\s*not|\\s+excluding)\\s+(?:a\\s+)?universal\\s+winner`,
    )
  )
    return mechanismIssue(ctx, 'resolve must preserve scope and reject a universal winner');
  let result: ExpansionSubgroupReversalScene['result'] = { state: 'source-qualified' };
  if (
    !condition &&
    records.every((r) => r.numerator.state === 'known' && r.denominator.state === 'known')
  ) {
    const subgroupRates: Extract<
      ExpansionSubgroupReversalScene['result'],
      { state: 'derived' }
    >['subgroupRates'][number][] = [];
    for (const record of records) {
      const n = known(record.numerator),
        d = known(record.denominator);
      if (!n || !d) return mechanismIssue(ctx, 'derivation never substitutes unknown counts');
      const rate = derive(
        'ratio',
        [n, d],
        { unit: 'ratio', period, population: record.numerator.basis.population, denominator: d },
        [record.numerator.evidence, record.denominator.evidence],
        ctx,
      );
      if (!rate) return null;
      subgroupRates.push({
        recordId: record.id,
        actorId: record.actorId,
        groupId: record.groupId,
        value: rate,
      });
    }
    const aggregates: Extract<
      ExpansionSubgroupReversalScene['result'],
      { state: 'derived' }
    >['aggregates'][number][] = [];
    for (const actor of [a, z]) {
      const owned = validGroups.map((g) =>
        records.find((r) => r.actorId === actor.id && r.groupId === g.id),
      );
      const ns = owned.flatMap((r) => (r ? [known(r.numerator)] : [])),
        ds = owned.flatMap((r) => (r ? [known(r.denominator)] : []));
      if (ns.some((n) => !n) || ds.some((d) => !d))
        return mechanismIssue(ctx, 'complete owned subgroup operands are required');
      const basis = { unit: 'count' as const, period, population };
      const numerator = derive(
        'subgroup-total',
        ns.filter((n): n is ExpansionRational => n !== null),
        basis,
        [...owned.flatMap((r) => (r ? [r.numerator.evidence] : [])), aggregateEvidence.span],
        ctx,
      );
      const denominator = derive(
        'subgroup-total',
        ds.filter((d): d is ExpansionRational => d !== null),
        basis,
        [...owned.flatMap((r) => (r ? [r.denominator.evidence] : [])), aggregateEvidence.span],
        ctx,
      );
      if (!numerator || !denominator) return null;
      const rate = derive(
        'ratio',
        [numerator.result, denominator.result],
        { ...basis, unit: 'ratio', denominator: denominator.result },
        [
          aggregateEvidence.span,
          reversalEvidence.span,
          ...owned.flatMap((r) => (r ? [r.numerator.evidence, r.denominator.evidence] : [])),
        ],
        ctx,
      );
      if (!rate) return null;
      aggregates.push({ actorId: actor.id, numerator, denominator, rate });
    }
    for (const group of validGroups) {
      const hi = subgroupRates.find((r) => r.actorId === high.id && r.groupId === group.id),
        lo = subgroupRates.find((r) => r.actorId === aggregateHigh.id && r.groupId === group.id);
      const check = hi && lo ? compare(hi.value.result, lo.value.result) : null;
      if (!check?.ok || check.value !== 1)
        return mechanismIssue(
          ctx,
          'supplied subgroup counts do not support the named strictly higher rate',
        );
    }
    const hi = aggregates.find((r) => r.actorId === aggregateHigh.id),
      lo = aggregates.find((r) => r.actorId === high.id);
    const check = hi && lo ? compare(hi.rate.result, lo.rate.result) : null;
    if (!check?.ok || check.value !== 1)
      return mechanismIssue(
        ctx,
        'complete subgroup totals do not actually reverse the aggregate comparison',
      );
    result = { state: 'derived', subgroupRates, aggregates };
  }
  return {
    ...b.story,
    storyId: '18',
    kind: 'distribution-view',
    preset: 'subgroup-reversal',
    entities: b.entities,
    actorIds: [a.id, z.id],
    groupIds: validGroups.map((g) => g.id),
    metric,
    aggregatePopulation: population,
    records,
    aggregateEvidence: aggregateEvidence.span,
    reversalEvidence: reversalEvidence.span,
    sourceSpans: b.sourceSpans,
    subgroupHigherActorId: high.id,
    aggregateHigherActorId: aggregateHigh.id,
    result,
    meaning: 'scope-bound-not-universal-winner',
  };
}
