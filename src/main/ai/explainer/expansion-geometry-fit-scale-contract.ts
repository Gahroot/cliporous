/** Source-only packing and linked scale. No clearance subtraction, fit policy or scale ratios. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionFitScaleScene,
  ExpansionLinkedScaleScene,
  ExpansionPackingClearanceScene,
  FitScaleDimension,
  FitScaleFact,
  FitScaleQualification,
  FitScaleRelation,
  LinkedScaleRecord,
  LinkedScaleResult,
  PackingRecord,
  PackingResult,
} from '../../remotion/compositions/explainer/expansion/geometry/fit-scale-types';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
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
const BEATS = PHASES.map((p) => `${p}Word`);
const FIELDS = ['actor', 'scope', 'period', 'state', 'condition', 'qualifier', 'evidence'];
const LEVELS = ['object', 'room', 'building'] as const;
function safe(text: string): boolean {
  return (
    !/[<>`{}[\]\\()]|=>|\w+:\/\/|www\.|javascript:|data:|\b(?:eval|function)\b|\b\S+\.(?:svg|html|png|js|tsx)\b|(?:^|\s)\//i.test(
      text,
    ) && ![...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function lit(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function label(
  raw: unknown,
  s: ExpansionSourceEvidence,
  ctx: ParseContext,
  max = 28,
): string | null {
  const v = expansionSourceLabel(raw, s, ctx, max);
  return v && safe(v) ? v : mechanismIssue(ctx, 'bounded plain source labels required');
}
function names(v: readonly string[]): string {
  return v.length === 1
    ? lit(v[0])
    : v.length === 2
      ? v.map(lit).join('\\s+and\\s+')
      : `${v.slice(0, -1).map(lit).join(',\\s*')},?\\s+and\\s+${lit(v[v.length - 1])}`;
}
function qual(
  raw: Rec,
  s: ExpansionSourceEvidence,
  ctx: ParseContext,
): FitScaleQualification | null {
  if (raw.state === 'known' && raw.condition === undefined && raw.qualifier === undefined)
    return { state: 'known' };
  if (raw.state === 'conditional' && raw.qualifier === undefined) {
    const condition = label(raw.condition, s, ctx, 96);
    if (condition && /^(?:if|unless|when|assuming|provided that)\s+\S/i.test(condition))
      return { state: 'conditional', condition };
  }
  if (raw.condition === undefined) {
    const qualifier = label(raw.qualifier, s, ctx, 96);
    if (qualifier) {
      if (
        (raw.state === 'unknown' || raw.state === 'missing' || raw.state === 'disputed') &&
        qualifier === raw.state
      )
        return { state: raw.state, qualifier };
      if (
        (raw.state === 'simulated' || raw.state === 'illustrative') &&
        (raw.state === 'simulated'
          ? ['simulation', 'simulated run']
          : ['illustration', 'illustrative example']
        ).includes(qualifier)
      )
        return { state: raw.state, qualifier };
    }
  }
  return mechanismIssue(ctx, 'retain exact absence/dispute/condition/simulation qualification');
}
function unavailable(q: FitScaleQualification): boolean {
  return q.state === 'unknown' || q.state === 'missing' || q.state === 'disputed';
}
function assertion(
  s: ExpansionSourceEvidence,
  body: string,
  q: FitScaleQualification,
  labels: string[],
): boolean {
  const prefix =
    q.state === 'simulated' || q.state === 'illustrative'
      ? `in\\s+this\\s+${lit(q.qualifier)},\\s*`
      : '';
  return (
    safe(s.text) &&
    expansionAssertedRelation(
      s,
      new RegExp(prefix + body, 'iu'),
      q.state === 'conditional' ? q.condition : undefined,
      labels,
    )
  );
}
function parse(raw: Rec, ctx: ParseContext, id: '59' | '60'): ExpansionFitScaleScene | null {
  const entry = isRec(raw) ? expansionEntry(raw.kind, raw.preset) : null;
  if (
    !isRec(raw) ||
    entry?.id !== id ||
    raw.template !== (id === '59' ? 'tray-block' : 'object-room-building') ||
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
        'actor',
        'identity',
        'scope',
        'period',
        'entities',
        'records',
        'dimensions',
        'relations',
        'result',
        'layout',
        'startWord',
        'endWord',
        ...BEATS,
        'representation',
      ],
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'exact authored geometry preset/template and closed fields required',
    );
  const { win, words } = ctx,
    duration = win.endTime - win.startTime;
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
    (raw.layout !== undefined && !entry.layouts.some((l) => l === raw.layout))
  )
    return mechanismIssue(ctx, 'complete finite 5–12s offered source window and mode required');
  for (let i = win.startWord; i <= win.endWord; i++) {
    const w = words[i],
      p = i > win.startWord ? words[i - 1] : undefined;
    if (
      !w ||
      typeof w.text !== 'string' ||
      !w.text.trim() ||
      !safe(w.text) ||
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.end <= w.start ||
      w.start < win.startTime ||
      w.end > win.endTime ||
      (p && w.start < p.end - 1e-7)
    )
      return mechanismIssue(ctx, 'finite positive nonoverlapping in-window words required');
  }
  const clauses: ExpansionSourceEvidence[] = [];
  for (let fromWord = win.startWord; fromWord <= win.endWord; ) {
    let toWord = fromWord;
    while (toWord < win.endWord && !/[.!?;][”"’')\]]*$/.test(words[toWord].text)) toWord++;
    if (!/[.!?;][”"’')\]]*$/.test(words[toWord].text))
      return mechanismIssue(ctx, 'complete terminal source clauses required');
    const s = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!s) return null;
    clauses.push(s);
    if (clauses.length > 32) return mechanismIssue(ctx, 'bounded source clauses required');
    fromWord = toWord + 1;
  }
  const sources: ExpansionSourceEvidence[] = [];
  for (const field of BEATS) {
    const index = ctx.inWin(raw[field]),
      s = clauses.find((c) => c.span.fromWord === index);
    if (!s) return mechanismIssue(ctx, 'five beats must begin distinct complete source clauses');
    sources.push(s);
  }
  if (sources[0].span.fromWord !== win.startWord || sources[4].span.toWord !== win.endWord)
    return mechanismIssue(ctx, 'retain full setup and resolve window');
  const times = strictMechanismBeats(raw, ctx, BEATS, [1, 1, 1, 1], 0.8);
  if (!times || times.some((t, i) => i > 0 && t - times[i - 1] < 1) || win.endTime - times[4] < 0.8)
    return mechanismIssue(ctx, 'full 1s beat gaps and .8s final hold required');
  const title = label(raw.label, sources[0], ctx, 48),
    subject = label(raw.subject, sources[0], ctx, 34),
    outcome = label(raw.outcome, sources[4], ctx, 54),
    scope = label(raw.scope, sources[0], ctx, 40),
    period = label(raw.period, sources[0], ctx, 32),
    entities = expansionEntities(raw.entities, ctx, id);
  if (!title || !subject || !outcome || !scope || !period || !entities) return null;
  if (entities.some((e) => !safe(e.label)))
    return mechanismIssue(ctx, 'plain source actor/identity labels required');
  const actor = entities.find((e) => e.label === raw.actor),
    identity = entities.find((e) => e.label === raw.identity);
  if (!actor || !identity || subject !== identity.label)
    return mechanismIssue(ctx, 'one exact source actor and tracked identity required');
  const scoped = (body: string) =>
    `(?:${body}\\s+(?:for|within)\\s+${lit(scope)}\\s+(?:during|in)\\s+${lit(period)}|(?:for|within)\\s+${lit(scope)}\\s+(?:during|in)\\s+${lit(period)},\\s*${body})`;
  const representation = raw.representation;
  if (
    id === '59'
      ? representation !== 'schematic'
      : representation !== 'schematic' && representation !== 'measured'
  )
    return mechanismIssue(
      ctx,
      'authored packing geometry is schematic; linked scale requires an explicit schematic or measured basis',
    );
  const setup = `${lit(title)}\\s+(?:tracks|follows)\\s+${lit(actor.label)}'s\\s+${lit(identity.label)}${representation === 'schematic' ? '\\s+schematically' : '\\s+with\\s+supplied\\s+measurements'}`;
  if (
    !assertion(sources[0], scoped(setup), { state: 'known' }, [
      title,
      actor.label,
      identity.label,
      scope,
      period,
    ])
  )
    return mechanismIssue(
      ctx,
      'source setup must retain actor/identity/scope and schematic or measured basis',
    );
  const evidence = (value: unknown) => {
    const s = expansionSourceSpan(value, ctx);
    return s &&
      clauses.some((c) => c.span.fromWord === s.span.fromWord && c.span.toWord === s.span.toWord)
      ? s
      : mechanismIssue(ctx, 'exact complete local evidence required');
  };
  const fact = (value: Rec, s: ExpansionSourceEvidence, key: string): FitScaleFact | null => {
    const q = qual(value, s, ctx);
    return q && value.actor === actor.label && value.scope === scope && value.period === period
      ? { id: key, actorId: actor.id, scope, period, evidence: s.span, ...q }
      : mechanismIssue(ctx, 'exact fact actor/scope/period/qualification required');
  };
  const rows = (value: unknown, max: number, min = 1): Rec[] | null =>
    Array.isArray(value) && value.length >= min && value.length <= max && value.every(isRec)
      ? value
      : mechanismIssue(ctx, 'bounded complete records/relations required');
  const rawRecords = rows(raw.records, 12, 2),
    rawDimensions = rows(raw.dimensions, 12, 0),
    rawRelations = rows(raw.relations, 16);
  if (
    !rawRecords ||
    !rawDimensions ||
    !rawRelations ||
    rawRecords.length + rawDimensions.length + 1 > 12
  )
    return mechanismIssue(
      ctx,
      'caps: 8 entities, 12 record/dimension/result facts and 16 relations',
    );
  const packing: PackingRecord[] = [],
    levels: LinkedScaleRecord[] = [];
  for (const [i, v] of rawRecords.entries()) {
    if (
      !onlyFields(
        v,
        [...FIELDS, 'label', ...(id === '59' ? ['role', 'template'] : ['level', 'identity'])],
        ctx,
      )
    )
      return null;
    const s = evidence(v.evidence);
    if (!s) return null;
    const f = fact(v, s, `expansion-${id}-record-${i}`),
      name = label(v.label, s, ctx);
    if (!f || !name) return null;
    if (
      [...packing, ...levels].some(
        (r) => r.label.normalize('NFKC').toLowerCase() === name.normalize('NFKC').toLowerCase(),
      )
    )
      return mechanismIssue(ctx, 'distinct supplied record identities required');
    if (id === '59') {
      if (
        (v.role !== 'container' && v.role !== 'part') ||
        v.template !== (v.role === 'container' ? 'tray' : 'block')
      )
        return mechanismIssue(ctx, 'only authored tray container and block parts allowed');
      const description = `${lit(name)}\\s+as\\s+${v.template}\\s+${v.role}`,
        body = unavailable(f)
          ? `${lit(actor.label)}\\s+reports\\s+${description}\\s+is\\s+${f.state}`
          : `${lit(actor.label)}\\s+(?:supplies|provides)\\s+${description}`;
      if (!assertion(s, scoped(body), f, [actor.label, name, scope, period]))
        return mechanismIssue(
          ctx,
          'supplied shape/role/identity/status must bind its source clause',
        );
      packing.push({
        ...f,
        label: name,
        role: v.role,
        template: v.role === 'container' ? 'tray' : 'block',
      });
    } else {
      const level = LEVELS.find((l) => l === v.level);
      if (!level || v.identity !== identity.label || levels.some((r) => r.level === level))
        return mechanismIssue(
          ctx,
          'only one each authored object/room/building level, same tracked identity',
        );
      const description = `${lit(identity.label)}\\s+in\\s+${lit(name)}\\s+${level}\\s+level`,
        body = unavailable(f)
          ? `${lit(actor.label)}\\s+reports\\s+${description}\\s+is\\s+${f.state}`
          : `${lit(actor.label)}\\s+(?:shows|depicts)\\s+${description}`;
      if (!assertion(s, scoped(body), f, [actor.label, identity.label, name, scope, period]))
        return mechanismIssue(ctx, 'same source identity at an authored enclosing level required');
      levels.push({ ...f, label: name, level, identityId: identity.id });
    }
  }
  const records = id === '59' ? packing : levels;
  if (
    id === '59' &&
    (packing.filter((r) => r.role === 'container').length !== 1 ||
      !packing.some((r) => r.role === 'part' && r.label === identity.label))
  )
    return mechanismIssue(ctx, 'one supplied container and the tracked part required');
  if (id === '60' && (levels.length !== 3 || levels.some((r, i) => r.level !== LEVELS[i])))
    return mechanismIssue(ctx, 'authored object/room/building order required; no invented levels');
  const record = (name: unknown) => records.find((r) => r.label === name);
  const dimensions: FitScaleDimension[] = [];
  for (const [i, v] of rawDimensions.entries()) {
    if (!onlyFields(v, ['record', 'axis', 'reference', 'quantity'], ctx)) return null;
    const r = record(v.record),
      axis = ['width', 'height', 'depth', 'clearance'].find((a) => a === v.axis),
      ref =
        v.reference === undefined
          ? undefined
          : packing.find((p) => p.label === v.reference && p.role === 'container'),
      q = parseExpansionQuantity(v.quantity, ctx);
    if (
      !r ||
      !axis ||
      !q ||
      !['millimetre', 'centimetre', 'metre'].includes(q.basis.unit) ||
      q.actor !== actor.label ||
      q.basis.period !== period ||
      q.basis.population !== scope ||
      q.claim !== `${r.label} ${axis}${axis === 'clearance' && ref ? ` to ${ref.label}` : ''}` ||
      !evidence(q.evidence) ||
      (axis === 'clearance'
        ? id !== '59' || !ref || !packing.some((p) => p.id === r.id && p.role === 'part')
        : v.reference !== undefined)
    )
      return mechanismIssue(
        ctx,
        'supplied local dimension/clearance must retain record/reference/actor/claim/length unit/basis',
      );
    const amounts = 'amount' in q ? [q.amount] : q.state === 'disputed' ? q.alternatives : [];
    if (
      amounts.some((a) => a.kind !== 'rational' || (axis !== 'clearance' && a.value.numerator <= 0))
    )
      return mechanismIssue(
        ctx,
        'exact finite positive physical dimensions; signed supplied clearance is not a fit verdict',
      );
    if (dimensions.some((d) => d.recordId === r.id && d.axis === axis && d.referenceId === ref?.id))
      return mechanismIssue(ctx, 'one supplied fact per dimension/reference');
    dimensions.push({
      id: `expansion-${id}-dimension-${i}`,
      recordId: r.id,
      axis: axis as FitScaleDimension['axis'],
      ...(ref ? { referenceId: ref.id } : {}),
      quantity: q,
    });
  }
  const relations: FitScaleRelation[] = [];
  for (const [i, v] of rawRelations.entries()) {
    if (!onlyFields(v, [...FIELDS, 'type', 'from', 'to', 'identity'], ctx)) return null;
    const s = evidence(v.evidence),
      from = record(v.from),
      to = record(v.to);
    if (!s || !from || !to)
      return mechanismIssue(ctx, 'relations require exact existing record endpoints');
    const f = fact(v, s, `expansion-${id}-relation-${i}`);
    if (!f || v.identity !== identity.label)
      return mechanismIssue(ctx, 'every relationship retains the same tracked identity');
    if (
      id === '59'
        ? v.type !== 'candidate' ||
          !packing.some((r) => r.id === from.id && r.role === 'part') ||
          !packing.some((r) => r.id === to.id && r.role === 'container')
        : v.type !== 'encloses' ||
          levels.findIndex((r) => r.id === to.id) !== levels.findIndex((r) => r.id === from.id) + 1
    )
      return mechanismIssue(
        ctx,
        'only supplied part/container candidate or adjacent enclosing levels allowed',
      );
    const body = unavailable(f)
      ? `${lit(actor.label)}\\s+reports\\s+${lit(from.label)}\\s+${id === '59' ? 'candidate' : 'enclosure'}\\s+in\\s+${lit(to.label)}\\s+is\\s+${f.state}`
      : id === '59'
        ? `${lit(actor.label)}\\s+(?:pairs|matches)\\s+${lit(from.label)}\\s+with\\s+${lit(to.label)}`
        : `${lit(actor.label)}\\s+(?:tracks|follows)\\s+${lit(identity.label)}\\s+from\\s+${lit(from.label)}\\s+into\\s+${lit(to.label)}`;
    if (
      !assertion(s, scoped(body), f, [
        actor.label,
        identity.label,
        from.label,
        to.label,
        scope,
        period,
      ]) ||
      relations.some((r) => r.fromId === from.id && r.toId === to.id)
    )
      return mechanismIssue(ctx, 'source-bound nonduplicate direction/identity/condition required');
    relations.push({
      ...f,
      type: id === '59' ? 'candidate' : 'encloses',
      fromId: from.id,
      toId: to.id,
      identityId: identity.id,
    });
  }
  if (id === '60' && relations.length !== 2)
    return mechanismIssue(ctx, 'supply both adjacent enclosures; never infer one');
  if (
    !isRec(raw.result) ||
    !onlyFields(
      raw.result,
      [...FIELDS, ...(id === '59' ? ['part', 'container', 'verdict'] : ['identity', 'levels'])],
      ctx,
    )
  )
    return mechanismIssue(ctx, 'explicit closed source result required');
  const resultRaw = raw.result;
  const s = evidence(resultRaw.evidence);
  if (!s || s.span.fromWord !== sources[4].span.fromWord)
    return mechanismIssue(ctx, 'result uses full resolve clause');
  const f = fact(raw.result, s, `expansion-${id}-result`);
  if (!f) return null;
  let result: PackingResult | LinkedScaleResult;
  if (id === '59') {
    const part = packing.find((r) => r.label === resultRaw.part && r.role === 'part'),
      container = packing.find((r) => r.label === resultRaw.container && r.role === 'container'),
      verdict = raw.result.verdict;
    if (
      !part ||
      !container ||
      (verdict !== 'fits' && verdict !== 'blocked' && verdict !== 'unknown') ||
      outcome !== (unavailable(f) ? f.state : verdict) ||
      !relations.some((r) => r.fromId === part.id && r.toId === container.id) ||
      (verdict === 'unknown' ? !unavailable(f) : unavailable(f))
    )
      return mechanismIssue(
        ctx,
        'explicit same-pair qualified fit verdict; unknown is not zero/permission',
      );
    const predicate =
      verdict === 'unknown'
        ? `fit\\s+of\\s+${lit(part.label)}\\s+in\\s+${lit(container.label)}\\s+is\\s+${f.state}`
        : verdict === 'fits'
          ? `${lit(part.label)}\\s+fits\\s+in\\s+${lit(container.label)}`
          : `${lit(part.label)}\\s+is\\s+blocked\\s+in\\s+${lit(container.label)}`;
    if (
      !assertion(s, scoped(`${lit(actor.label)}\\s+(?:reports|states)\\s+${predicate}`), f, [
        actor.label,
        part.label,
        container.label,
        scope,
        period,
      ])
    )
      return mechanismIssue(ctx, 'fit verdict must be supplied, never calculated from dimensions');
    const teaching = [...packing, ...relations, f, ...dimensions.map((d) => d.quantity)].some(
      (q) => q.state === 'simulated' || q.state === 'illustrative',
    );
    if (!dimensions.length && !teaching)
      return mechanismIssue(
        ctx,
        'supplied dimensions or explicitly qualified teaching fit example required',
      );
    result = { ...f, partId: part.id, containerId: container.id, verdict };
  } else {
    if (
      raw.result.identity !== identity.label ||
      !Array.isArray(raw.result.levels) ||
      raw.result.levels.length !== 3 ||
      raw.result.levels.some((l, i) => l !== levels[i].label) ||
      outcome !== (unavailable(f) ? f.state : 'retained')
    )
      return mechanismIssue(
        ctx,
        'resolve retains exact tracked identity and all enclosing level identities',
      );
    const body = `${lit(actor.label)}\\s+(?:reports|states)\\s+${lit(identity.label)}\\s+identity\\s+across\\s+${names(levels.map((r) => r.label))}\\s+is\\s+${unavailable(f) ? f.state : 'retained'}`;
    if (
      !assertion(s, scoped(body), f, [
        actor.label,
        identity.label,
        scope,
        period,
        ...levels.map((r) => r.label),
      ])
    )
      return mechanismIssue(
        ctx,
        'no invented identity recovery, geographic levels or scale result',
      );
    if (
      representation === 'measured' &&
      levels.some(
        (r) => !dimensions.some((d) => d.recordId === r.id && d.quantity.state === 'known'),
      )
    )
      return mechanismIssue(
        ctx,
        'every measured level requires actually supplied known dimensions',
      );
    result = { ...f, identityId: identity.id, levelIds: levels.map((r) => r.id) };
  }
  const coverage = [
    sources[0].span,
    ...records.map((r) => r.evidence),
    ...dimensions.map((d) => d.quantity.evidence),
    ...relations.map((r) => r.evidence),
    result.evidence,
  ];
  if (
    clauses.some(
      (c) => !coverage.some((s) => s.fromWord === c.span.fromWord && s.toWord === c.span.toWord),
    ) ||
    !records.some((r) => r.evidence.fromWord === sources[1].span.fromWord) ||
    !records.some((r) => r.evidence.fromWord === sources[2].span.fromWord) ||
    !relations.some((r) => r.evidence.fromWord === sources[3].span.fromWord)
  )
    return mechanismIssue(
      ctx,
      'retain all facts and five distinct complete setup/record/record/relation/result clauses',
    );
  if (
    [...records, ...relations, result, ...dimensions.map((d) => d.quantity)].some(
      (q) => q.state === 'simulated' || q.state === 'illustrative',
    ) &&
    raw.evidence !== 'illustrative'
  )
    return mechanismIssue(ctx, 'teaching/simulation never becomes a measured assertion');
  const base: ExpansionStoryBase = {
    storyId: id,
    visualMode: raw.visualMode,
    evidence: raw.evidence,
    label: title,
    subject,
    outcome,
    setupAt: times[0],
    actionAt: times[1],
    responseAt: times[2],
    checkAt: times[3],
    resolveAt: times[4],
  };
  const common = {
    ...base,
    actorId: actor.id,
    identityId: identity.id,
    scope,
    period,
    entities,
    dimensions,
    relations,
    sourceSpans: {
      setup: sources[0].span,
      action: sources[1].span,
      response: sources[2].span,
      check: sources[3].span,
      resolve: sources[4].span,
    },
  };
  if (id === '59' && 'verdict' in result)
    return {
      ...common,
      storyId: '59',
      kind: 'floorplan-fit',
      preset: 'packing-clearance',
      template: 'tray-block',
      representation: 'schematic',
      records: packing,
      result,
    };
  if (
    id === '60' &&
    'levelIds' in result &&
    (representation === 'schematic' || representation === 'measured')
  )
    return {
      ...common,
      storyId: '60',
      kind: 'scale-hierarchy',
      preset: 'linked-scale',
      template: 'object-room-building',
      representation,
      records: levels,
      result,
    };
  return mechanismIssue(ctx, 'exact local scene result required');
}
export function parseExpansionPackingClearance(
  raw: Rec,
  ctx: ParseContext,
): ExpansionPackingClearanceScene | null {
  const scene = parse(raw, ctx, '59');
  return scene?.storyId === '59' ? scene : null;
}
export function parseExpansionLinkedScale(
  raw: Rec,
  ctx: ParseContext,
): ExpansionLinkedScaleScene | null {
  const scene = parse(raw, ctx, '60');
  return scene?.storyId === '60' ? scene : null;
}
