/** Stories 51–52. Validate supplied record correspondence and loss, never compute outputs. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionAggregationLossScene,
  ExpansionCompressionLossScene,
  ExpansionInformationLossScene,
  InformationLossQualification,
  InformationLossRecord,
  InformationLossRelation,
  InformationLossResult,
  InformationLossValue,
} from '../../remotion/compositions/explainer/expansion/representations/information-loss-types';
import type { ExpansionEntity } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  type ExpansionSourceEvidence,
  expansionAssertedRelation,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const WORDS = PHASES.map((phase) => `${phase}Word`);
const QUAL_FIELDS = ['state', 'condition', 'qualifier', 'evidence'] as const;
const CONTEXT_FIELDS = ['actor', 'scope', 'period'] as const;
function plain(text: string): boolean {
  return (
    !/[<>`{}[\]\\()]|=>|\w+:\/\/|www\.|javascript:|data:|\b(?:eval|function)\b|\b\S+\.(?:html|svg|png|tsx|js)\b|(?:^|\s)\//i.test(
      text,
    ) && ![...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function literal(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function same(a: ExpansionEvidenceSpan, b: ExpansionEvidenceSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function label(
  raw: unknown,
  source: ExpansionSourceEvidence,
  ctx: ParseContext,
  max = 28,
): string | null {
  const value = expansionSourceLabel(raw, source, ctx, max);
  return value && plain(value) ? value : mechanismIssue(ctx, 'bounded plain source label required');
}
function list(raw: unknown, max: number, ctx: ParseContext, min = 1): Rec[] | null {
  return Array.isArray(raw) && raw.length >= min && raw.length <= max && raw.every(isRec)
    ? raw
    : mechanismIssue(ctx, `bounded local list requires ${min}–${max} records`);
}
function qualified(
  raw: Rec,
  source: ExpansionSourceEvidence,
  ctx: ParseContext,
): InformationLossQualification | null {
  const condition = raw.condition === undefined ? undefined : label(raw.condition, source, ctx, 96);
  const qualifier = raw.qualifier === undefined ? undefined : label(raw.qualifier, source, ctx, 96);
  if (condition === null || qualifier === null) return null;
  if (raw.state === 'known' && condition === undefined && qualifier === undefined)
    return { state: 'known' };
  if (
    raw.state === 'conditional' &&
    condition &&
    qualifier === undefined &&
    /^(?:if|unless|when|provided that|assuming)\s+\S/i.test(condition)
  )
    return { state: 'conditional', condition };
  if (condition === undefined) {
    if (
      (raw.state === 'unknown' || raw.state === 'missing' || raw.state === 'disputed') &&
      qualifier === raw.state
    )
      return { state: raw.state, qualifier };
    if (
      (raw.state === 'simulated' || raw.state === 'illustrative') &&
      qualifier &&
      (raw.state === 'simulated'
        ? ['simulated', 'simulation', 'simulated run']
        : ['illustrative', 'illustration', 'illustrative example']
      ).includes(qualifier)
    )
      return { state: raw.state, qualifier };
  }
  return mechanismIssue(
    ctx,
    'preserve exact known/absent/disputed/conditional/example qualification',
  );
}
function assertion(
  source: ExpansionSourceEvidence,
  body: string,
  qual: InformationLossQualification,
  labels: string[],
): boolean {
  const prefix =
    qual.state === 'simulated' || qual.state === 'illustrative'
      ? `in\\s+this\\s+${literal(qual.qualifier)},\\s*`
      : '';
  return (
    plain(source.text) &&
    expansionAssertedRelation(
      source,
      new RegExp(prefix + body, 'iu'),
      qual.state === 'conditional' ? qual.condition : undefined,
      labels,
    )
  );
}
function scoped(body: string, scope: string, period: string): string {
  const tail = `(?:for|within)\\s+${literal(scope)}\\s+(?:during|in)\\s+${literal(period)}`;
  return `(?:${body}\\s+${tail}|${tail},\\s*${body})`;
}
function detailList(details: readonly string[]): string {
  if (!details.length) return 'no\\s+details';
  if (details.length === 1) return literal(details[0]);
  if (details.length === 2) return details.map(literal).join('\\s+and\\s+');
  return `${details.slice(0, -1).map(literal).join(',\\s*')},?\\s+and\\s+${literal(details[details.length - 1])}`;
}
function alignedAssertion(
  a: InformationLossQualification,
  b: InformationLossQualification,
): boolean {
  if (a.state === 'known' && b.state === 'known') return true;
  if (a.state === 'conditional' && b.state === 'conditional') return a.condition === b.condition;
  return (
    (a.state === 'simulated' || a.state === 'illustrative') &&
    b.state === a.state &&
    'qualifier' in b &&
    a.qualifier === b.qualifier
  );
}
function unavailable(qual: InformationLossQualification): boolean {
  return qual.state === 'unknown' || qual.state === 'missing' || qual.state === 'disputed';
}
function parse(raw: Rec, ctx: ParseContext, id: '51' | '52'): ExpansionInformationLossScene | null {
  const entry = isRec(raw) ? expansionEntry(raw.kind, raw.preset) : null;
  const template = id === '51' ? 'grouped-records' : 'paired-records';
  if (
    !isRec(raw) ||
    entry?.id !== id ||
    raw.template !== template ||
    !onlyFields(
      raw,
      [
        'kind',
        'preset',
        'template',
        'visualMode',
        'evidence',
        'label',
        'subject',
        'outcome',
        'layout',
        'startWord',
        'endWord',
        ...WORDS,
        ...CONTEXT_FIELDS,
        'entities',
        'records',
        'quantities',
        'relations',
        'result',
      ],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'exact information-loss preset and authored record template required',
    );
  const { words, win } = ctx;
  const duration = win.endTime - win.startTime;
  if (
    !Number.isFinite(win.startTime) ||
    !Number.isFinite(win.endTime) ||
    duration < 5 ||
    duration > 12 ||
    !Number.isSafeInteger(win.startWord) ||
    !Number.isSafeInteger(win.endWord) ||
    win.startWord < 0 ||
    win.endWord < win.startWord ||
    win.endWord >= words.length ||
    (raw.startWord !== undefined && raw.startWord !== win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== win.endWord) ||
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid') ||
    (raw.evidence !== 'source-stated' && raw.evidence !== 'illustrative') ||
    (raw.layout !== undefined && !entry.layouts.some((layout) => layout === raw.layout))
  )
    return mechanismIssue(
      ctx,
      'complete finite 5–12s source window, offered layout and exact mode/evidence required',
    );
  for (let i = win.startWord; i <= win.endWord; i++) {
    const word = words[i],
      previous = i > win.startWord ? words[i - 1] : undefined;
    if (
      !word ||
      typeof word.text !== 'string' ||
      !word.text.trim() ||
      !plain(word.text) ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.end <= word.start ||
      word.start < win.startTime ||
      word.end > win.endTime ||
      (previous && word.start < previous.end - 1e-7)
    )
      return mechanismIssue(
        ctx,
        'finite positive in-window word intervals, nonoverlapping within 1e-7 required',
      );
  }
  const clauses: ExpansionSourceEvidence[] = [];
  for (let fromWord = win.startWord; fromWord <= win.endWord; ) {
    let toWord = fromWord;
    while (toWord < win.endWord && !/[.!?;][”"’')\]]*$/.test(words[toWord].text)) toWord++;
    if (!/[.!?;][”"’')\]]*$/.test(words[toWord].text))
      return mechanismIssue(ctx, 'complete terminal source clauses required');
    const source = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!source) return null;
    clauses.push(source);
    if (clauses.length > 32) return mechanismIssue(ctx, 'too many local source clauses');
    fromWord = toWord + 1;
  }
  const sources: ExpansionSourceEvidence[] = [];
  for (const field of WORDS) {
    const index = ctx.inWin(raw[field]);
    const source = clauses.find((c) => c.span.fromWord === index);
    if (!source)
      return mechanismIssue(ctx, 'five distinct beats must start complete source clauses');
    sources.push(source);
  }
  if (sources[0].span.fromWord !== win.startWord || sources[4].span.toWord !== win.endWord)
    return mechanismIssue(ctx, 'retain the complete setup and resolve');
  const times = strictMechanismBeats(raw, ctx, WORDS, [1, 1, 1, 1], 0.8);
  if (
    !times ||
    times.some((time, i) => i > 0 && time - times[i - 1] < 1) ||
    win.endTime - times[4] < 0.8
  )
    return mechanismIssue(
      ctx,
      'five distinct source clauses require full 1s gaps and 0.8s final hold',
    );
  const title = label(raw.label, sources[0], ctx, 48),
    subject = label(raw.subject, sources[0], ctx, 34),
    outcome = label(raw.outcome, sources[4], ctx, 54);
  const scope = label(raw.scope, sources[0], ctx, 40),
    period = label(raw.period, sources[0], ctx, 32);
  const entities = expansionEntities(raw.entities, ctx, id);
  if (
    !title ||
    !subject ||
    !outcome ||
    !scope ||
    !period ||
    !entities ||
    entities.some((e) => !plain(e.label) || !same(e.evidence, sources[0].span))
  )
    return null;
  const actor = entities.find((e) => e.label === raw.actor);
  if (!actor || subject !== actor.label)
    return mechanismIssue(ctx, 'subject/actor must be an exact introduced entity');
  const actors = detailList(entities.map((e) => e.label));
  const setup = `${literal(title)}\\s+(?:identifies|names)\\s+${actors}\\s+(?:for|within)\\s+${literal(scope)}\\s+(?:during|in)\\s+${literal(period)}`;
  if (
    !assertion(
      sources[0],
      setup,
      { state: 'known' },
      [title, scope, period, ...entities.map((e) => e.label)].slice(0, 8),
    )
  )
    return mechanismIssue(ctx, 'setup must supply all actor identities, scope and period');
  const evidence = (value: unknown): ExpansionSourceEvidence | null => {
    const source = expansionSourceSpan(value, ctx);
    return source && clauses.some((c) => same(c.span, source.span))
      ? source
      : mechanismIssue(ctx, 'facts need exact complete local clauses');
  };
  const context = (value: Rec): ExpansionEntity | null => {
    const owner = entities.find((e) => e.label === value.actor);
    return owner && value.scope === scope && value.period === period
      ? owner
      : mechanismIssue(ctx, 'fact actor/scope/period must retain the exact declared context');
  };
  const rawRecords = list(raw.records, 12, ctx, 2),
    rawValues = list(raw.quantities, 12, ctx, 0),
    rawRelations = list(raw.relations, 16, ctx);
  if (!rawRecords || !rawValues || !rawRelations || rawRecords.length + rawValues.length + 1 > 12)
    return mechanismIssue(ctx, 'at most 12 record/value/result facts and 16 relations');
  const records: InformationLossRecord[] = [];
  for (const [i, value] of rawRecords.entries()) {
    if (!onlyFields(value, [...CONTEXT_FIELDS, ...QUAL_FIELDS, 'label', 'stage', 'details'], ctx))
      return null;
    const source = evidence(value.evidence),
      owner = context(value);
    if (!source || !owner) return null;
    const name = label(value.label, source, ctx),
      qual = qualified(value, source, ctx);
    if (
      !name ||
      !qual ||
      (value.stage !== 'input' && value.stage !== 'output') ||
      !Array.isArray(value.details) ||
      value.details.length > 4
    )
      return mechanismIssue(
        ctx,
        'record requires bounded identity, input/output stage and zero to four declared details',
      );
    if (
      records.some(
        (r) => r.label.normalize('NFKC').toLowerCase() === name.normalize('NFKC').toLowerCase(),
      )
    )
      return mechanismIssue(ctx, 'record labels must be distinct source identities');
    const details: string[] = [];
    for (const item of value.details) {
      const detail = label(item, source, ctx);
      if (!detail || details.some((d) => d.toLowerCase() === detail.toLowerCase()))
        return mechanismIssue(ctx, 'distinct declared detail labels required');
      details.push(detail);
    }
    const description = `${literal(name)}\\s+${value.stage}\\s+with\\s+${detailList(details)}`;
    const body = unavailable(qual)
      ? `${literal(owner.label)}\\s+reports\\s+${description}\\s+is\\s+${qual.state}`
      : `${literal(owner.label)}\\s+(?:supplies|provides)\\s+${description}`;
    if (
      !assertion(source, scoped(body, scope, period), qual, [
        owner.label,
        name,
        scope,
        period,
        ...details,
      ])
    )
      return mechanismIssue(
        ctx,
        'record identity/details/status must match their whole local source clause',
      );
    records.push({
      id: `expansion-${id}-record-${i}`,
      actorId: owner.id,
      scope,
      period,
      evidence: source.span,
      label: name,
      stage: value.stage,
      details,
      ...qual,
    });
  }
  const record = (value: unknown, stage?: 'input' | 'output') =>
    records.find((r) => r.label === value && (stage === undefined || r.stage === stage));
  const quantities: InformationLossValue[] = [];
  for (const [i, value] of rawValues.entries()) {
    if (!onlyFields(value, ['record', 'detail', 'quantity'], ctx)) return null;
    const target = record(value.record),
      quantity = parseExpansionQuantity(value.quantity, ctx);
    if (
      !target ||
      !quantity ||
      !target.details.includes(String(value.detail)) ||
      !entities.some((e) => e.id === target.actorId && e.label === quantity.actor) ||
      quantity.claim !== `${target.label} ${value.detail}` ||
      quantity.basis.period !== period ||
      quantity.basis.population !== scope ||
      !clauses.some((c) => same(c.span, quantity.evidence))
    )
      return mechanismIssue(
        ctx,
        'numeric detail must preserve its exact record/actor/claim/scope/period/local evidence',
      );
    const source = evidence(quantity.evidence);
    if (
      !source ||
      !plain(source.text) ||
      quantities.some((q) => q.recordId === target.id && q.detail === value.detail)
    )
      return mechanismIssue(
        ctx,
        'one bounded supplied numeric value per record detail; no executable text or inferred operands',
      );
    quantities.push({
      id: `expansion-${id}-value-${i}`,
      recordId: target.id,
      detail: String(value.detail),
      quantity,
    });
  }
  const relations: InformationLossRelation[] = [];
  const bridgeType = id === '51' ? 'grouping' : 'correspondence';
  for (const [i, value] of rawRelations.entries()) {
    if (
      !onlyFields(value, [...CONTEXT_FIELDS, ...QUAL_FIELDS, 'type', 'from', 'to', 'detail'], ctx)
    )
      return null;
    const source = evidence(value.evidence),
      owner = context(value),
      from = record(value.from, 'input'),
      to = record(value.to, 'output');
    if (!source || !owner || !from || !to || from.actorId !== owner.id || to.actorId !== owner.id)
      return mechanismIssue(ctx, 'relations must bind same-actor input/output record identities');
    const qual = qualified(value, source, ctx);
    if (!qual) return null;
    if (value.type !== bridgeType && value.type !== 'retained' && value.type !== 'omitted')
      return mechanismIssue(
        ctx,
        'aggregation grouping and compression correspondence are distinct authored relations',
      );
    const detail = value.type === bridgeType ? undefined : label(value.detail, source, ctx);
    if (
      (value.type === bridgeType && value.detail !== undefined) ||
      detail === null ||
      (detail && !from.details.includes(detail))
    )
      return mechanismIssue(ctx, 'relation detail must belong to its exact input record');
    if (
      detail &&
      (qual.state === 'known' || alignedAssertion(qual, to)) &&
      ((value.type === 'retained' && !to.details.includes(detail)) ||
        (value.type === 'omitted' && to.details.includes(detail)))
    )
      return mechanismIssue(
        ctx,
        'asserted retained/omitted details must agree with supplied output details',
      );
    const a = literal(owner.label),
      f = literal(from.label),
      t = literal(to.label),
      d = detail ? literal(detail) : '';
    const noun =
      value.type === bridgeType
        ? `${f}\\s+${value.type}\\s+(?:into|to)\\s+${t}`
        : `${f}\\s+${d}\\s+${value.type}\\s+(?:in|from)\\s+${t}`;
    const predicate =
      value.type === 'grouping'
        ? `(?:groups\\s+${f}\\s+into\\s+${t}|places\\s+${f}\\s+in\\s+group\\s+${t})`
        : value.type === 'correspondence'
          ? `(?:maps|pairs)\\s+${f}\\s+(?:to|with)\\s+${t}`
          : value.type === 'retained'
            ? `(?:retains|keeps)\\s+${f}\\s+${d}\\s+in\\s+${t}`
            : `(?:omits|drops)\\s+${f}\\s+${d}\\s+from\\s+${t}`;
    const body = unavailable(qual)
      ? `${a}\\s+reports\\s+${noun}\\s+is\\s+${qual.state}`
      : `${a}\\s+${predicate}`;
    if (
      !assertion(source, scoped(body, scope, period), qual, [
        owner.label,
        from.label,
        to.label,
        scope,
        period,
        ...(detail ? [detail] : []),
      ])
    )
      return mechanismIssue(
        ctx,
        'whole asserted source relation must preserve direction/group/detail/status/condition',
      );
    if (
      relations.some(
        (r) =>
          r.type === value.type && r.fromId === from.id && r.toId === to.id && r.detail === detail,
      )
    )
      return mechanismIssue(
        ctx,
        'duplicate correspondence/detail assertions are not separate facts',
      );
    relations.push({
      id: `expansion-${id}-relation-${i}`,
      type:
        value.type === bridgeType ? bridgeType : value.type === 'retained' ? 'retained' : 'omitted',
      actorId: owner.id,
      scope,
      period,
      evidence: source.span,
      fromId: from.id,
      toId: to.id,
      ...(detail ? { detail } : {}),
      ...qual,
    });
  }
  if (
    !relations.some((r) => r.type === bridgeType) ||
    !relations.some((r) => r.type === 'retained' || r.type === 'omitted')
  )
    return mechanismIssue(
      ctx,
      'supply grouping/correspondence separately from retained/omitted detail evidence',
    );
  if (
    relations.some(
      (r) =>
        r.type !== bridgeType &&
        !relations.some((b) => b.type === bridgeType && b.fromId === r.fromId && b.toId === r.toId),
    )
  )
    return mechanismIssue(
      ctx,
      'detail relations need the exact supplied correspondence, never inferred pairing',
    );
  for (const r of relations) {
    if (
      r.type === 'retained' &&
      relations.some(
        (o) =>
          o.type === 'omitted' &&
          alignedAssertion(r, o) &&
          o.fromId === r.fromId &&
          o.toId === r.toId &&
          o.detail === r.detail,
      )
    )
      return mechanismIssue(ctx, 'same asserted detail cannot be both retained and omitted');
  }
  if (
    !isRec(raw.result) ||
    !onlyFields(raw.result, [...CONTEXT_FIELDS, ...QUAL_FIELDS, 'from', 'to', 'behavior'], ctx)
  )
    return mechanismIssue(
      ctx,
      'explicit source behavior result required; no derived output/recovery',
    );
  const resultRaw = raw.result,
    resultSource = evidence(resultRaw.evidence),
    resultOwner = context(resultRaw),
    from = record(resultRaw.from, 'input'),
    to = record(resultRaw.to, 'output');
  if (
    !resultSource ||
    !resultOwner ||
    !from ||
    !to ||
    from.actorId !== resultOwner.id ||
    to.actorId !== resultOwner.id ||
    !same(resultSource.span, sources[4].span)
  )
    return mechanismIssue(
      ctx,
      'result must use its exact source actor/pair and complete resolve clause',
    );
  const resultQual = qualified(resultRaw, resultSource, ctx),
    behavior = resultRaw.behavior;
  if (
    !resultQual ||
    (behavior !== 'lossless' && behavior !== 'lossy' && behavior !== 'unknown') ||
    behavior !== outcome ||
    (behavior === 'unknown' && resultQual.state !== 'unknown') ||
    (resultQual.state === 'unknown' && behavior !== 'unknown') ||
    !relations.some((r) => r.type === bridgeType && r.fromId === from.id && r.toId === to.id)
  )
    return mechanismIssue(
      ctx,
      'result behavior/status must be explicitly supplied for the exact correspondence',
    );
  const resultBody = `${literal(resultOwner.label)}\\s+(?:reports|states)\\s+transformation\\s+of\\s+${literal(from.label)}\\s+into\\s+${literal(to.label)}\\s+is\\s+${behavior}`;
  if (
    !assertion(resultSource, scoped(resultBody, scope, period), resultQual, [
      resultOwner.label,
      from.label,
      to.label,
      scope,
      period,
    ])
  )
    return mechanismIssue(
      ctx,
      'lossless/lossy/unknown result and its qualification must match the complete source assertion',
    );
  // Check consistency of asserted facts, not a compression policy or numerical derivation.
  if (
    behavior === 'lossless' &&
    relations.some(
      (r) =>
        r.type === 'omitted' &&
        alignedAssertion(resultQual, r) &&
        r.fromId === from.id &&
        r.toId === to.id,
    )
  )
    return mechanismIssue(ctx, 'source-stated lossless result conflicts with asserted omission');
  const result: InformationLossResult = {
    id: `expansion-${id}-result`,
    actorId: resultOwner.id,
    scope,
    period,
    evidence: resultSource.span,
    fromId: from.id,
    toId: to.id,
    behavior,
    ...resultQual,
  };
  const coverage = [
    sources[0].span,
    ...records.map((r) => r.evidence),
    ...quantities.map((q) => q.quantity.evidence),
    ...relations.map((r) => r.evidence),
    result.evidence,
  ];
  if (
    clauses.some((c) => !coverage.some((s) => same(s, c.span))) ||
    !records.some((r) => r.stage === 'input' && same(r.evidence, sources[1].span)) ||
    !records.some((r) => r.stage === 'output' && same(r.evidence, sources[2].span)) ||
    !relations.some(
      (r) => (r.type === 'retained' || r.type === 'omitted') && same(r.evidence, sources[3].span),
    )
  )
    return mechanismIssue(
      ctx,
      'all source facts retained; five distinct complete setup/input/output/detail/result clauses required',
    );
  const allQuals = [...records, ...relations, result, ...quantities.map((q) => q.quantity)];
  if (
    allQuals.some((q) => q.state === 'simulated' || q.state === 'illustrative') &&
    raw.evidence !== 'illustrative'
  )
    return mechanismIssue(
      ctx,
      'retain authored simulation/illustration as visibly illustrative, not measured',
    );
  const common = {
    kind: 'information-transform' as const,
    visualMode: raw.visualMode === 'diagram' ? ('diagram' as const) : ('hybrid' as const),
    evidence:
      raw.evidence === 'source-stated' ? ('source-stated' as const) : ('illustrative' as const),
    label: title,
    subject,
    outcome,
    actorId: actor.id,
    scope,
    period,
    entities,
    records,
    quantities,
    relations,
    result,
    sourceSpans: {
      setup: sources[0].span,
      action: sources[1].span,
      response: sources[2].span,
      check: sources[3].span,
      resolve: sources[4].span,
    },
    setupAt: times[0],
    actionAt: times[1],
    responseAt: times[2],
    checkAt: times[3],
    resolveAt: times[4],
  };
  return id === '51'
    ? { ...common, storyId: '51', preset: 'aggregation-loss', template: 'grouped-records' }
    : { ...common, storyId: '52', preset: 'compression-loss', template: 'paired-records' };
}
export function parseExpansionAggregationLoss(
  raw: Rec,
  ctx: ParseContext,
): ExpansionAggregationLossScene | null {
  const scene = parse(raw, ctx, '51');
  return scene?.storyId === '51' ? scene : null;
}
export function parseExpansionCompressionLoss(
  raw: Rec,
  ctx: ParseContext,
): ExpansionCompressionLossScene | null {
  const scene = parse(raw, ctx, '52');
  return scene?.storyId === '52' ? scene : null;
}
