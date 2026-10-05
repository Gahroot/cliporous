/** Authored representations, not a model-selected evaluator or geometry language. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionConversionResult,
  ExpansionEquivalenceResult,
  ExpansionEquivalenceScene,
  ExpansionEquivalentView,
  ExpansionRepresentationFact,
  ExpansionRepresentationRecord,
  ExpansionUnitConversionScene,
} from '../../remotion/compositions/explainer/expansion/representations/units-equivalence-types';
import type {
  ExpansionEntity,
  ExpansionStoryBase,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  compare,
  compatibleBasis,
  convertUnit,
  decimalRational,
  divide,
  isDerivationAllowed,
  multiply,
  rational,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  type ExpansionAmount,
  type ExpansionQuantity,
  type ExpansionRational,
  type ExpansionUnit,
} from '../../remotion/compositions/explainer/expansion/value-types';
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

const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const FACT = ['actor', 'identity', 'population', 'period', 'evidence'] as const;
/** Deliberately explicit directed pairs. No identity, money, temperature, angle or rate conversions. */
export const EXPANSION_CONVERSION_PAIRS = [
  ['second', 'minute'],
  ['second', 'hour'],
  ['second', 'day'],
  ['minute', 'second'],
  ['minute', 'hour'],
  ['minute', 'day'],
  ['hour', 'second'],
  ['hour', 'minute'],
  ['hour', 'day'],
  ['day', 'second'],
  ['day', 'minute'],
  ['day', 'hour'],
  ['millimetre', 'centimetre'],
  ['millimetre', 'metre'],
  ['centimetre', 'millimetre'],
  ['centimetre', 'metre'],
  ['metre', 'millimetre'],
  ['metre', 'centimetre'],
  ['gram', 'kilogram'],
  ['kilogram', 'gram'],
  ['joule', 'kilojoule'],
  ['kilojoule', 'joule'],
] as const satisfies readonly (readonly [ExpansionUnit, ExpansionUnit])[];
function literal(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function safe(text: string): boolean {
  return (
    !/[<>`{}[\]\\()]|=>|\b(?:https?|file|data|javascript):|www\.|\b(?:function|eval)\b|(?:^|\s)(?:\.{0,2}\/|~\/)\S+|\S+\.(?:svg|html|js|tsx|png|mp4)\b/i.test(
      text,
    ) && ![...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function phrase(
  raw: unknown,
  source: ExpansionSourceEvidence,
  ctx: ParseContext,
  max: number,
): string | null {
  const value = expansionSourceLabel(raw, source, ctx, max);
  return value && safe(value)
    ? value
    : mechanismIssue(ctx, 'bounded plain local source label required');
}
function list(values: readonly string[]): string {
  if (values.length === 1) return literal(values[0]);
  if (values.length === 2) return values.map(literal).join('\\s+and\\s+');
  return `${values.slice(0, -1).map(literal).join(',\\s*')},?\\s+and\\s+${literal(values[values.length - 1])}`;
}
function scoped(body: string, population: string, period: string): string {
  const scope = `(?:for|among)\\s+${literal(population)}\\s+(?:during|in)\\s+${literal(period)}`;
  return `(?:${body}\\s+${scope}|${scope},\\s*${body})`;
}
interface Base {
  story: ExpansionStoryBase;
  actors: ExpansionEntity[];
  identity: string;
  population: string;
  period: string;
  clauses: ExpansionSourceEvidence[];
}
function asserted(
  source: ExpansionSourceEvidence,
  body: string,
  labels: readonly string[],
): boolean {
  return (
    safe(source.text) &&
    expansionAssertedRelation(source, new RegExp(body, 'iu'), undefined, labels)
  );
}
function envelope(raw: Rec, ctx: ParseContext, id: '49' | '50'): Base | null {
  if (
    !isRec(raw) ||
    !onlyFields(
      raw,
      [
        'kind',
        'preset',
        'visualMode',
        'template',
        'label',
        'subject',
        'outcome',
        'evidence',
        'startWord',
        'endWord',
        'layout',
        'actors',
        'identity',
        'population',
        'period',
        'result',
        ...BEATS,
        ...(id === '49' ? ['quantity', 'conversion'] : ['quantities', 'views', 'aggregation']),
      ],
      ctx,
    )
  )
    return mechanismIssue(ctx, 'closed representation proposal required');
  const entry = expansionEntry(raw.kind, raw.preset),
    win = ctx.win,
    duration = win.endTime - win.startTime;
  if (
    !entry ||
    entry.id !== id ||
    raw.template !== (id === '49' ? 'compatible-units' : 'equivalent-views') ||
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid') ||
    raw.evidence !== 'source-stated' ||
    (raw.layout !== undefined && !entry.layouts.some((l) => l === raw.layout)) ||
    (raw.startWord !== undefined && raw.startWord !== win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== win.endWord)
  )
    return mechanismIssue(ctx, 'exact preset/template/mode and complete offered envelope required');
  if (
    !Number.isFinite(win.startTime) ||
    !Number.isFinite(win.endTime) ||
    duration < 5 ||
    duration > 12 ||
    !Number.isSafeInteger(win.startWord) ||
    !Number.isSafeInteger(win.endWord) ||
    win.startWord < 0 ||
    win.endWord < win.startWord ||
    win.endWord >= ctx.words.length
  )
    return mechanismIssue(ctx, 'finite complete 5–12s source window required');
  const words = ctx.words.slice(win.startWord, win.endWord + 1);
  if (
    words.some(
      (w, i) =>
        !safe(w.text) ||
        !Number.isFinite(w.start) ||
        !Number.isFinite(w.end) ||
        w.end <= w.start ||
        w.start < win.startTime ||
        w.end > win.endTime ||
        (i > 0 && w.start < words[i - 1].end - 1e-7),
    ) ||
    words[0].start < win.startTime + 0.25 - 1e-7 ||
    words[words.length - 1].end > win.endTime - 0.35 + 1e-7
  )
    return mechanismIssue(
      ctx,
      'source words need positive finite nonoverlapping bounded intervals and production padding',
    );
  const clauses: ExpansionSourceEvidence[] = [];
  for (const field of BEATS) {
    const index = ctx.inWin(raw[field]);
    if (index === null) return mechanismIssue(ctx, 'five complete source clauses required');
    let end = index;
    while (end < win.endWord && !/[.!?;]$/.test(ctx.words[end].text)) end++;
    if (!/[.!?;]$/.test(ctx.words[end].text))
      return mechanismIssue(ctx, 'source clause is incomplete');
    const source = expansionSourceSpan({ fromWord: index, toWord: end }, ctx);
    if (!source) return null;
    clauses.push(source);
  }
  if (
    new Set(clauses.map((c) => c.span.fromWord)).size !== 5 ||
    clauses[0].span.fromWord !== win.startWord ||
    clauses[4].span.toWord !== win.endWord
  )
    return mechanismIssue(ctx, 'five distinct whole clauses must cover setup through resolve');
  const beats = strictMechanismBeats(raw, ctx, BEATS, [1, 1, 1, 1], 0.8);
  const actors = expansionEntities(raw.actors, ctx, id);
  const identity = phrase(raw.identity, clauses[0], ctx, 28),
    population = phrase(raw.population, clauses[0], ctx, 40),
    period = phrase(raw.period, clauses[0], ctx, 32);
  const label = phrase(raw.label, clauses[0], ctx, 48),
    subject = phrase(raw.subject, clauses[0], ctx, 34),
    outcome = phrase(raw.outcome, clauses[4], ctx, 54);
  if (!beats || !actors || !identity || !population || !period || !label || !subject || !outcome)
    return null;
  if (
    actors.some(
      (a) =>
        !safe(a.label) ||
        a.evidence.fromWord !== clauses[0].span.fromWord ||
        a.evidence.toWord !== clauses[0].span.toWord,
    ) ||
    !actors.some((a) => a.label === subject) ||
    !asserted(
      clauses[0],
      scoped(
        `${literal(identity)}\\s+(?:lists|records)\\s+${list(actors.map((a) => a.label))}\\s+as\\s+actors?`,
        population,
        period,
      ),
      [identity, population, period, ...actors.map((a) => a.label)].slice(0, 8),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must introduce exactly these actors and represented identity/scope',
    );
  // Conditions/status live on each supplied quantity, not a misleading blanket story condition.
  return {
    story: {
      storyId: id,
      visualMode: raw.visualMode,
      evidence: 'source-stated',
      label,
      subject,
      outcome,
      setupAt: beats[0],
      actionAt: beats[1],
      responseAt: beats[2],
      checkAt: beats[3],
      resolveAt: beats[4],
    },
    actors,
    identity,
    population,
    period,
    clauses,
  };
}
function fact(
  raw: unknown,
  base: Base,
  ctx: ParseContext,
  clauseIndex: number,
  extras: readonly string[] = [],
): { value: ExpansionRepresentationFact; source: ExpansionSourceEvidence; raw: Rec } | null {
  if (!isRec(raw) || !onlyFields(raw, [...FACT, ...extras], ctx))
    return mechanismIssue(ctx, 'complete closed representation fact required');
  const source = expansionSourceSpan(raw.evidence, ctx);
  if (!source) return null;
  const actor = base.actors.find((a) => a.label === raw.actor);
  if (
    !actor ||
    !phrase(raw.actor, source, ctx, 28) ||
    raw.identity !== base.identity ||
    raw.population !== base.population ||
    raw.period !== base.period ||
    !phrase(raw.identity, source, ctx, 28) ||
    !phrase(raw.population, source, ctx, 40) ||
    !phrase(raw.period, source, ctx, 32) ||
    source.span.fromWord !== base.clauses[clauseIndex].span.fromWord
  )
    return mechanismIssue(ctx, 'fact must retain its local actor, identity, period and population');
  return {
    value: {
      actorId: actor.id,
      identity: base.identity,
      population: base.population,
      period: base.period,
      evidence: source.span,
    },
    source,
    raw,
  };
}
function record(
  raw: unknown,
  base: Base,
  ctx: ParseContext,
  id: '49' | '50',
  index: number,
  claim: string,
  clauseIndex: number,
): ExpansionRepresentationRecord | null {
  const quantity = parseExpansionQuantity(raw, ctx);
  const actor = quantity && base.actors.find((a) => a.label === quantity.actor);
  if (
    !quantity ||
    !actor ||
    quantity.claim !== claim ||
    quantity.basis.population !== base.population ||
    quantity.basis.period !== base.period ||
    quantity.evidence.fromWord !== base.clauses[clauseIndex].span.fromWord
  )
    return mechanismIssue(
      ctx,
      'operand must retain this actor/claim/unit/scope in its complete source clause',
    );
  return {
    id: `expansion-${id}-record-${index}`,
    actorId: actor.id,
    identity: base.identity,
    quantity,
  };
}
function amounts(quantity: ExpansionQuantity): readonly ExpansionAmount[] {
  return quantity.state === 'disputed'
    ? quantity.alternatives
    : 'amount' in quantity
      ? [quantity.amount]
      : [];
}
function same(a: ExpansionRational, b: ExpansionRational): boolean {
  const c = compare(a, b);
  return c.ok && c.value === 0;
}

export function parseExpansionUnitConversion(
  raw: Rec,
  ctx: ParseContext,
): ExpansionUnitConversionScene | null {
  const base = envelope(raw, ctx, '49');
  if (!base || !isDerivationAllowed('49', 'unit-conversion'))
    return mechanismIssue(ctx, '49 permits only unit-conversion');
  const operand = record(raw.quantity, base, ctx, '49', 0, base.identity, 1);
  const conversion = fact(raw.conversion, base, ctx, 2, ['fromUnit', 'toUnit']);
  const request = fact(raw.result, base, ctx, 4, ['operation']);
  if (!operand || !conversion || !request) return null;
  const pair = EXPANSION_CONVERSION_PAIRS.find(
    ([from, to]) => from === conversion.raw.fromUnit && to === conversion.raw.toUnit,
  );
  const actor = operand.quantity.actor;
  if (
    !pair ||
    pair[0] !== operand.quantity.basis.unit ||
    conversion.value.actorId !== operand.actorId ||
    request.value.actorId !== operand.actorId ||
    request.raw.operation !== 'unit-conversion' ||
    raw.outcome !== 'conversion' ||
    !asserted(
      conversion.source,
      scoped(
        `${literal(actor)}\\s+(?:requests|specifies)\\s+${literal(base.identity)}\\s+conversion\\s+from\\s+${literal(pair[0])}\\s+to\\s+${literal(pair[1])}`,
        base.population,
        base.period,
      ),
      [actor, base.identity, base.population, base.period],
    ) ||
    !asserted(
      base.clauses[3],
      scoped(
        `${literal(actor)}\\s+(?:confirms|states)\\s+${literal(base.identity)}\\s+conversion\\s+preserves\\s+amount`,
        base.population,
        base.period,
      ),
      [actor, base.identity, base.population, base.period],
    ) ||
    !asserted(
      request.source,
      scoped(
        `${literal(actor)}\\s+requests\\s+${literal(base.identity)}\\s+conversion`,
        base.population,
        base.period,
      ),
      [actor, base.identity, base.population, base.period],
    )
  )
    return mechanismIssue(
      ctx,
      'explicit authored compatible pair, preservation assertion and scoped conversion request required',
    );
  const quantity = operand.quantity,
    basis = { ...quantity.basis, unit: pair[1] };
  const common = {
    id: 'expansion-49-result',
    operation: 'unit-conversion' as const,
    sourceState: quantity.state,
    operand: quantity,
    originalBasis: quantity.basis,
    basis,
    evidence: request.source.span,
  };
  let result: ExpansionConversionResult;
  if (quantity.state === 'unknown' || quantity.state === 'missing')
    result = { ...common, state: quantity.state };
  else {
    const values: { state: 'derived'; value: ExpansionRational }[] = [];
    for (const amount of amounts(quantity)) {
      if (amount.kind !== 'rational')
        return mechanismIssue(ctx, 'money is not an authored conversion operand');
      const converted = convertUnit(amount.value, pair[0], pair[1]);
      if (!converted.ok)
        return mechanismIssue(ctx, `exact conversion rejected: ${converted.error}`);
      values.push({ state: 'derived', value: converted.value });
    }
    result = { ...common, state: 'derived', values };
  }
  return {
    ...base.story,
    kind: 'representation-transform',
    storyId: '49',
    preset: 'unit-conversion',
    template: 'compatible-units',
    actors: base.actors,
    identity: base.identity,
    population: base.population,
    period: base.period,
    record: operand,
    conversion: { ...conversion.value, fromUnit: pair[0], toUnit: pair[1] },
    result,
  };
}
function suppliedRational(raw: unknown, ctx: ParseContext): ExpansionRational | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['numerator', 'denominator'], ctx) ||
    typeof raw.numerator !== 'number' ||
    typeof raw.denominator !== 'number' ||
    raw.denominator <= 0
  )
    return mechanismIssue(ctx, 'exact bounded rational aggregation required');
  const value = rational(raw.numerator, raw.denominator);
  return value.ok ? value.value : mechanismIssue(ctx, `aggregation rejected: ${value.error}`);
}
export function parseExpansionEquivalence(
  raw: Rec,
  ctx: ParseContext,
): ExpansionEquivalenceScene | null {
  const base = envelope(raw, ctx, '50');
  if (!base || !isDerivationAllowed('50', 'ratio'))
    return mechanismIssue(ctx, '50 permits only ratio');
  if (
    !Array.isArray(raw.quantities) ||
    raw.quantities.length !== 2 ||
    !Array.isArray(raw.views) ||
    raw.views.length < 2 ||
    raw.views.length > 3 ||
    new Set(raw.views).size !== raw.views.length ||
    raw.views.some((v) => !['set', 'area', 'length'].includes(String(v)))
  )
    return mechanismIssue(
      ctx,
      'two supplied operands and two/three authored distinct equivalent views required',
    );
  const selected = record(raw.quantities[0], base, ctx, '50', 0, `${base.identity} selected`, 1);
  const total = record(raw.quantities[1], base, ctx, '50', 1, `${base.identity} total`, 2);
  const aggregation = fact(raw.aggregation, base, ctx, 3, ['marks', 'unitsPerMark']);
  const request = fact(raw.result, base, ctx, 4, ['operation']);
  if (!selected || !total || !aggregation || !request) return null;
  const a = selected.quantity,
    b = total.quantity,
    actor = a.actor;
  if (
    selected.actorId !== total.actorId ||
    aggregation.value.actorId !== selected.actorId ||
    request.value.actorId !== selected.actorId ||
    a.basis.unit !== 'count' ||
    !compatibleBasis(a.basis, b.basis) ||
    request.raw.operation !== 'ratio' ||
    raw.outcome !== 'equivalent views' ||
    !asserted(
      request.source,
      scoped(
        `${literal(actor)}\\s+requests\\s+${literal(base.identity)}\\s+equivalent\\s+views`,
        base.population,
        base.period,
      ),
      [actor, base.identity, base.population, base.period],
    )
  )
    return mechanismIssue(
      ctx,
      'equivalence must keep actor, identity, count unit, scope and denominator exactly compatible',
    );
  if (a.state === 'conditional' && b.state === 'conditional' && a.condition !== b.condition)
    return mechanismIssue(
      ctx,
      'independent conditions cannot be merged into an invented common scenario',
    );
  const common = {
    id: 'expansion-50-result',
    operation: 'ratio' as const,
    sourceStates: [a.state, b.state] as const,
    operands: [a, b] as const,
    basis: a.basis,
    evidence: request.source.span,
  };
  const unavailable = [a, b].find(
    (q) => q.state === 'disputed' || q.state === 'missing' || q.state === 'unknown',
  );
  let result: ExpansionEquivalenceResult;
  let marks: number | undefined,
    unitsPerMark: ExpansionRational | undefined,
    selectedMarks: number | undefined;
  const prefix = `${literal(actor)}\\s+(?:states|records)\\s+${literal(base.identity)}\\s+views\\s+are\\s+${list(raw.views as string[])}`;
  if (unavailable) {
    if (
      aggregation.raw.marks !== undefined ||
      aggregation.raw.unitsPerMark !== undefined ||
      !asserted(
        aggregation.source,
        scoped(`${prefix}\\s+with\\s+no\\s+resolved\\s+marks`, base.population, base.period),
        [actor, base.identity, base.population, base.period, 'no resolved marks'],
      )
    )
      return mechanismIssue(
        ctx,
        'unknown/missing/disputed operands cannot invent marks or a ratio',
      );
    result = { ...common, state: unavailable.state as 'unknown' | 'missing' | 'disputed' };
  } else {
    if (
      !('amount' in a) ||
      !('amount' in b) ||
      a.amount.kind !== 'rational' ||
      b.amount.kind !== 'rational' ||
      a.amount.value.denominator !== 1 ||
      b.amount.value.denominator !== 1 ||
      a.amount.value.numerator < 0 ||
      b.amount.value.numerator <= 0 ||
      a.amount.value.numerator > b.amount.value.numerator ||
      (a.basis.denominator && !same(a.basis.denominator, b.amount.value))
    )
      return mechanismIssue(
        ctx,
        'set equivalence requires explicit nonnegative whole selected/positive total counts and supplied denominator',
      );
    marks = aggregation.raw.marks as number;
    unitsPerMark = suppliedRational(aggregation.raw.unitsPerMark, ctx) ?? undefined;
    if (
      !Number.isSafeInteger(marks) ||
      marks < 1 ||
      marks * raw.views.length > EXPANSION_LIMITS.populationMarks ||
      !unitsPerMark ||
      unitsPerMark.denominator !== 1 ||
      unitsPerMark.numerator < 1
    )
      return mechanismIssue(
        ctx,
        'at most 100 displayed aggregate marks across views; explicit positive whole units per mark required',
      );
    const text = aggregation.source.text;
    const match =
      /\bwith\s+(\d+)\s+marks\s+each\s+representing\s+([+-]?\d+(?:\.\d{1,6})?)\s+count\b/i.exec(
        text,
      );
    const stated = match ? decimalRational(match[2]) : null;
    if (
      !match ||
      Number(match[1]) !== marks ||
      !stated?.ok ||
      !same(stated.value, unitsPerMark) ||
      !asserted(
        aggregation.source,
        scoped(
          `${prefix}\\s+with\\s+${literal(match[1])}\\s+marks\\s+each\\s+representing\\s+${literal(match[2])}\\s+count`,
          base.population,
          base.period,
        ),
        [actor, base.identity, base.population, base.period],
      )
    )
      return mechanismIssue(
        ctx,
        'aggregation must exactly quote its authored count/mark scale, not round or invent members',
      );
    const coverage = multiply({ numerator: marks, denominator: 1 }, unitsPerMark),
      groups = divide(a.amount.value, unitsPerMark),
      ratio = divide(a.amount.value, b.amount.value);
    if (!coverage.ok || !groups.ok || !ratio.ok)
      return mechanismIssue(ctx, 'exact equivalence arithmetic overflow');
    if (!same(coverage.value, b.amount.value) || groups.value.denominator !== 1)
      return mechanismIssue(
        ctx,
        'aggregation must exactly cover supplied total and selected counts without partial invented members',
      );
    selectedMarks = groups.value.numerator;
    result = { ...common, state: 'derived', ratio: ratio.value };
  }
  const ids = [selected.id, total.id] as const;
  const views: ExpansionEquivalentView[] = raw.views.map((kind, i) => ({
    id: `expansion-50-view-${i}`,
    kind: kind as ExpansionEquivalentView['kind'],
    quantityIds: ids,
    ...(result.state === 'derived'
      ? { marks, unitsPerMark, selectedMarks, ratio: result.ratio }
      : {}),
  }));
  return {
    ...base.story,
    kind: 'representation-transform',
    storyId: '50',
    preset: 'equivalence',
    template: 'equivalent-views',
    actors: base.actors,
    identity: base.identity,
    population: base.population,
    period: base.period,
    records: [selected, total],
    views,
    aggregation: { ...aggregation.value, ...(marks !== undefined ? { marks, unitsPerMark } : {}) },
    result,
  };
}
