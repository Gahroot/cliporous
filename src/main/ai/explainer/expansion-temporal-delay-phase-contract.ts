/** Local stories 45–46. Comparisons reject contradictions; they never produce numeric results. */
import {
  type ExpansionEntity,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  DELAY_PHASE_LIMITS as D,
  type DelayComparison,
  type DelayDimensionRecord,
  type DelayPhaseBeatEvidence,
  type DelayPhaseQualification,
  type ExpansionDelayThroughputScene,
  type ExpansionPeriodicPhaseScene,
  type PeriodicPhaseRelation,
  type PeriodicQuantityRecord,
  type PeriodicSignal,
} from '../../remotion/compositions/explainer/expansion/temporal/delay-phase-types';
import {
  compare,
  compatibleBasis,
  decimalRational,
  divide,
  rational,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  type ExpansionBasis,
  type ExpansionEvidenceSpan,
  type ExpansionQuantity,
  type ExpansionRational,
  type ExpansionUnit,
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
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const WORDS = PHASES.map((phase) => `${phase}Word`);
const TIME_UNITS = ['second', 'minute', 'hour', 'day'] as const;
const TIME_NOTATION = {
  second: '(?:seconds?|s)',
  minute: '(?:minutes?|min)',
  hour: '(?:hours?|hr)',
  day: 'days?',
} as const;
const SCALAR = '[+]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,6})?(?:\\s*/\\s*\\d+)?';
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
function named(text: string): string {
  return `(?:the\\s+)?${literal(text)}`;
}
/** Complete authored predicates, including unknown/negated meanings. No substring/keyword guessing. */
function clause(text: string, body: string, condition?: string): boolean {
  if (
    /[<>`{}]|https?:\/\/|www\./i.test(text) ||
    text.split(/\s+/).length > L.evidenceWords ||
    [...text].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return false;
  const grammar = condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
  return new RegExp(`^(?:${grammar})[.;]$`, 'i').test(key(text));
}
function scope(period: string, population: string, body: string, denominator = ''): string {
  const group = `(?:among|for)\\s+${literal(population)}${denominator}`;
  return `(?:${body}\\s+(?:during|in|for)\\s+${literal(period)}\\s+${group}|(?:during|in|for)\\s+${literal(period)}\\s+${group},\\s*${body})`;
}
function sameSpan(a: ExpansionEvidenceSpan, b: ExpansionEvidenceSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function localBase(raw: Rec, ctx: ParseContext, id: '45' | '46') {
  if (
    !Number.isSafeInteger(ctx.win.startWord) ||
    !Number.isSafeInteger(ctx.win.endWord) ||
    ctx.win.startWord < 0 ||
    ctx.win.endWord < ctx.win.startWord ||
    ctx.win.endWord >= ctx.words.length ||
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .some(
        (word, index, words) =>
          !Number.isFinite(word.start) ||
          !Number.isFinite(word.end) ||
          word.start < ctx.win.startTime ||
          word.end > ctx.win.endTime ||
          word.end <= word.start ||
          (index > 0 && word.start < (words[index - 1]?.end ?? word.start) - 1e-7),
      )
  )
    return mechanismIssue(
      ctx,
      'all source words must be finite, positive, nonoverlapping and inside the complete window',
    );
  const b = expansionStoryBase(raw, ctx, id, [
    'template',
    'entities',
    'period',
    'population',
    'records',
    'relations',
    ...(id === '46' ? ['signals'] : []),
  ]);
  if (!b || !strictMechanismBeats(raw, ctx, WORDS, [1, 1, 1, 1], 0.8)) return null;
  if (raw.template !== (id === '45' ? 'separate-dimensions' : 'bounded-cycles'))
    return mechanismIssue(ctx, 'only the exact authored temporal template is accepted');
  const entities = expansionEntities(raw.entities, ctx, id);
  const period = expansionSourceLabel(raw.period, b.spans.setup, ctx, L.period);
  const population = expansionSourceLabel(raw.population, b.spans.setup, ctx, L.population);
  if (!entities || !period || !population || (id === '46' && entities.length < 2)) return null;
  const group = entities.map((entity) => named(entity.label)).join('\\s+and\\s+');
  if (
    !clause(
      b.spans.setup,
      scope(
        period,
        population,
        `(?:${named(b.story.subject)}\\s+lists\\s+${group}|${named(b.story.subject)}\\s+names\\s+${group})`,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must introduce exactly the supplied entity set and its period/population',
    );
  const spans: ExpansionEvidenceSpan[] = [];
  for (const phase of PHASES) {
    const index = ctx.inWin(raw[`${phase}Word`]);
    if (index === null) return null;
    let fromWord = index,
      toWord = index;
    while (
      fromWord > ctx.win.startWord &&
      !/[.!?;][”"’')\]]*$/.test(ctx.words[fromWord - 1]?.text ?? '')
    )
      fromWord--;
    while (toWord < ctx.win.endWord && !/[.!?;][”"’')\]]*$/.test(ctx.words[toWord]?.text ?? ''))
      toWord++;
    const evidence = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!evidence || fromWord !== index)
      return mechanismIssue(ctx, 'beat anchors must start their distinct complete source clauses');
    spans.push(evidence.span);
  }
  const [setup, action, response, check, resolve] = spans;
  if (!setup || !action || !response || !check || !resolve) return null;
  const sourceSpans: DelayPhaseBeatEvidence = { setup, action, response, check, resolve };
  const { treatment: _treatment, ...story } = b.story;
  return { story, spans: b.spans, entities, period, population, sourceSpans };
}
type Base = NonNullable<ReturnType<typeof localBase>>;
function reference(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  return (
    (typeof raw === 'string'
      ? entities.find((entity) => key(entity.label) === key(raw))
      : undefined) ??
    mechanismIssue(ctx, 'references must name a supplied source entity, never a caller ID')
  );
}
function entries(raw: unknown, cap: number, minimum: number, ctx: ParseContext): Rec[] | null {
  return Array.isArray(raw) && raw.length >= minimum && raw.length <= cap && raw.every(isRec)
    ? raw
    : mechanismIssue(
        ctx,
        `include ${minimum}–${cap} bounded complete records; never truncate overflow`,
      );
}
function unresolved(state: unknown): boolean {
  return state === 'unknown' || state === 'missing' || state === 'disputed';
}
function unresolvedQualification(
  fact: DelayPhaseQualification,
): fact is { readonly state: 'unknown' | 'missing' | 'disputed'; readonly qualifier: string } {
  return unresolved(fact.state);
}
function qualification(
  raw: Rec,
  text: string,
  b: Base,
  ctx: ParseContext,
  asserted: string,
  absent: (qualifier: string) => string,
): DelayPhaseQualification | null {
  if (raw.state === 'known') {
    return !('qualifier' in raw) && !('condition' in raw) && clause(text, asserted)
      ? { state: 'known' }
      : mechanismIssue(ctx, 'known facts require an exact unqualified local assertion');
  }
  if (raw.state === 'conditional') {
    const condition = expansionSourceLabel(raw.condition, text, ctx, L.qualifier);
    return condition &&
      condition === b.story.condition &&
      !('qualifier' in raw) &&
      clause(text, asserted, condition)
      ? { state: 'conditional', condition }
      : mechanismIssue(ctx, 'retain the exact local source condition without evaluating it');
  }
  if (raw.state === 'unknown' || raw.state === 'missing' || raw.state === 'disputed') {
    const qualifier = expansionSourceLabel(raw.qualifier, text, ctx, L.qualifier);
    return qualifier === raw.state && !('condition' in raw) && clause(text, absent(qualifier))
      ? { state: raw.state, qualifier }
      : mechanismIssue(
          ctx,
          'absence/dispute retains its status, never a known zero or a chosen result',
        );
  }
  if (raw.state === 'illustrative' || raw.state === 'simulated') {
    const qualifier = expansionSourceLabel(raw.qualifier, text, ctx, L.qualifier);
    const allowed =
      raw.state === 'illustrative'
        ? ['teaching example', 'illustrative example']
        : ['simulation', 'simulated example'];
    return qualifier &&
      allowed.includes(qualifier) &&
      b.story.evidence === 'illustrative' &&
      !('condition' in raw) &&
      clause(text, `In\\s+this\\s+${literal(qualifier)},\\s*${asserted}`)
      ? { state: raw.state, qualifier }
      : mechanismIssue(ctx, 'authored teaching/simulated signals keep their source qualification');
  }
  return mechanismIssue(ctx, 'unsupported temporal fact state');
}
function quantities(quantity: ExpansionQuantity) {
  return quantity.state === 'disputed'
    ? quantity.alternatives
    : 'amount' in quantity
      ? [quantity.amount]
      : [];
}
function bounded(
  quantity: ExpansionQuantity,
  lower: ExpansionRational,
  upper: ExpansionRational,
): boolean {
  return quantities(quantity).every((amount) => {
    if (amount.kind !== 'rational') return false;
    const lo = compare(amount.value, lower),
      hi = compare(amount.value, upper);
    return lo.ok && hi.ok && lo.value >= 0 && hi.value <= 0;
  });
}
function quantityFor(
  raw: unknown,
  actor: ExpansionEntity,
  claim: string,
  b: Base,
  ctx: ParseContext,
): ExpansionQuantity | null {
  const quantity = parseExpansionQuantity(raw, ctx);
  if (
    !quantity ||
    key(quantity.actor) !== key(actor.label) ||
    key(quantity.claim) !== key(claim) ||
    key(quantity.basis.period) !== key(b.period) ||
    key(quantity.basis.population) !== key(b.population) ||
    (quantity.state === 'conditional' && quantity.condition !== b.story.condition) ||
    ((quantity.state === 'illustrative' || quantity.state === 'simulated') &&
      b.story.evidence !== 'illustrative')
  )
    return mechanismIssue(
      ctx,
      'quantity must retain this actor, dimension/claim, scope, source state and condition',
    );
  return quantity;
}
function timeUnit(unit: ExpansionUnit): unit is (typeof TIME_UNITS)[number] {
  return TIME_UNITS.some((value) => value === unit);
}
function scalar(text: string): ExpansionRational | null {
  const [first, second] = text.split('/').map((part) => part.trim());
  const a = decimalRational(first ?? '');
  if (!a.ok) return null;
  if (second === undefined) return a.value;
  const d = decimalRational(second);
  const result = d.ok && d.value.numerator > 0 ? divide(a.value, d.value) : null;
  return result?.ok ? result.value : null;
}
function comparisonBasis(
  raw: unknown,
  text: string,
  b: Base,
  dimension: 'latency' | 'throughput',
  ctx: ParseContext,
): ExpansionBasis | null {
  if (!isRec(raw) || !onlyFields(raw, ['unit', 'period', 'population', 'denominator'], ctx))
    return null;
  const unit = raw.unit;
  if (
    !(dimension === 'latency' ? TIME_UNITS.some((value) => value === unit) : unit === 'item/second')
  )
    return null;
  const period = expansionSourceLabel(raw.period, text, ctx, L.period);
  const population = expansionSourceLabel(raw.population, text, ctx, L.population);
  if (
    !period ||
    !population ||
    key(period) !== key(b.period) ||
    key(population) !== key(b.population)
  )
    return null;
  let denominator: ExpansionRational | undefined;
  if (raw.denominator !== undefined) {
    if (
      !isRec(raw.denominator) ||
      !onlyFields(raw.denominator, ['numerator', 'denominator'], ctx) ||
      typeof raw.denominator.numerator !== 'number' ||
      typeof raw.denominator.denominator !== 'number' ||
      raw.denominator.denominator <= 0
    )
      return null;
    const parsed = rational(raw.denominator.numerator, raw.denominator.denominator);
    const match = new RegExp(`\\bwith\\s+denominator\\s+(${SCALAR})(?=[.;,]|\\s|$)`, 'i').exec(
      text,
    );
    const stated = match?.[1] ? scalar(match[1]) : null;
    const equal = parsed.ok && stated ? compare(parsed.value, stated) : null;
    if (!parsed.ok || parsed.value.numerator <= 0 || !equal?.ok || equal.value !== 0) return null;
    denominator = parsed.value;
  }
  return {
    unit: unit as ExpansionUnit,
    period,
    population,
    ...(denominator ? { denominator } : {}),
  };
}
function compatibleContext(a: ExpansionBasis, b: ExpansionBasis): boolean {
  // Compare context only, not the distinct time/rate/angle units. No conversion is emitted.
  return compatibleBasis({ ...a, unit: b.unit }, b);
}

export function parseExpansionDelayThroughput(
  raw: Rec,
  ctx: ParseContext,
): ExpansionDelayThroughputScene | null {
  const b = localBase(raw, ctx, '45');
  if (!b) return null;
  const supplied = entries(raw.records, L.records, 0, ctx),
    pairs = entries(raw.relations, L.relations, 0, ctx);
  if (!supplied || !pairs) return null;
  const records: DelayDimensionRecord[] = [];
  for (const [index, entry] of supplied.entries()) {
    if (!onlyFields(entry, ['actor', 'dimension', 'quantity'], ctx)) return null;
    const actor = reference(entry.actor, b.entities, ctx);
    const dimension = entry.dimension;
    if (!actor || (dimension !== 'latency' && dimension !== 'throughput'))
      return mechanismIssue(
        ctx,
        'a delay record needs its declared actor and an independent latency or throughput dimension',
      );
    const quantity = quantityFor(entry.quantity, actor, dimension, b, ctx);
    if (!quantity) return null;
    const unit = quantity.basis.unit;
    if (
      dimension === 'latency'
        ? !timeUnit(unit) ||
          !bounded(
            quantity,
            { numerator: 0, denominator: 1 },
            { numerator: D.latency[unit], denominator: 1 },
          )
        : unit !== 'item/second' ||
          !bounded(
            quantity,
            { numerator: 0, denominator: 1 },
            { numerator: D.throughput, denominator: 1 },
          )
    )
      return mechanismIssue(
        ctx,
        'latency uses bounded supplied durations; throughput uses a separate bounded supplied item/second rate',
      );
    if (records.some((record) => record.actorId === actor.id && record.dimension === dimension))
      return mechanismIssue(
        ctx,
        'each actor/dimension has only one supplied status, never conflicting duplicates',
      );
    records.push({
      id: expansionEntityId('45', b.entities.length + index),
      actorId: actor.id,
      dimension,
      quantity,
    });
  }
  const relations: DelayComparison[] = [];
  for (const [index, entry] of pairs.entries()) {
    if (
      !onlyFields(
        entry,
        [
          'from',
          'to',
          'dimension',
          'basis',
          'comparisonLabel',
          'order',
          'state',
          'qualifier',
          'condition',
          'evidence',
        ],
        ctx,
      )
    )
      return null;
    const from = reference(entry.from, b.entities, ctx),
      to = reference(entry.to, b.entities, ctx);
    const evidence = expansionSourceSpan(entry.evidence, ctx),
      dimension = entry.dimension;
    if (
      !from ||
      !to ||
      from.id === to.id ||
      !evidence ||
      (dimension !== 'latency' && dimension !== 'throughput')
    )
      return mechanismIssue(
        ctx,
        'a comparison needs distinct declared actors, complete source evidence and its latency or throughput dimension',
      );
    const basis = comparisonBasis(entry.basis, evidence.text, b, dimension, ctx);
    if (
      !basis ||
      entry.comparisonLabel !== 'qualitative comparison' ||
      !expansionSourceLabel(entry.comparisonLabel, evidence, ctx, 32) ||
      (unresolved(entry.state)
        ? 'order' in entry
        : !['lower', 'higher', 'equal'].includes(String(entry.order)))
    )
      return mechanismIssue(
        ctx,
        'comparisons require explicit qualitative qualification, compatible supplied basis and no invented result',
      );
    if (
      relations.some(
        (relation) =>
          relation.fromId === from.id &&
          relation.toId === to.id &&
          relation.dimension === dimension,
      )
    )
      return mechanismIssue(
        ctx,
        'a delay comparison cannot repeat the same actor pair and dimension',
      );
    const unit = timeUnit(basis.unit)
      ? TIME_NOTATION[basis.unit]
      : '(?:items? per second|items?/second)';
    const denom = basis.denominator ? `\\s+with\\s+denominator\\s+${SCALAR}` : '';
    const a = named(from.label),
      z = named(to.label),
      d = literal(dimension),
      order = literal(String(entry.order));
    const comparison = `In\\s+this\\s+qualitative\\s+comparison,\\s*`;
    const body = `(?:${a}\\s+has\\s+${order}\\s+${d}\\s+${entry.order === 'equal' ? 'to' : 'than'}\\s+${z}|${d}\\s+of\\s+${a}\\s+is\\s+${order}\\s+${entry.order === 'equal' ? 'to' : 'than'}\\s+${d}\\s+of\\s+${z})\\s+in\\s+${unit}`;
    const fact = qualification(
      entry,
      evidence.text,
      b,
      ctx,
      `${comparison}${scope(b.period, b.population, body, denom)}`,
      (qualifier) =>
        `${comparison}${scope(b.period, b.population, `${d}\\s+comparison\\s+from\\s+${a}\\s+to\\s+${z}\\s+(?:is|remains)\\s+${literal(qualifier)}\\s+in\\s+${unit}`, denom)}`,
    );
    if (!fact) return null;
    const operands = records.filter(
      (record) =>
        record.dimension === dimension && (record.actorId === from.id || record.actorId === to.id),
    );
    if (operands.some((record) => !compatibleBasis(record.quantity.basis, basis)))
      return mechanismIssue(
        ctx,
        'a comparison cannot silently change unit, period, population or denominator',
      );
    const left = operands.find((record) => record.actorId === from.id)?.quantity;
    const right = operands.find((record) => record.actorId === to.id)?.quantity;
    if (
      fact.state === 'known' &&
      left?.state === 'known' &&
      right?.state === 'known' &&
      left.amount.kind === 'rational' &&
      right.amount.kind === 'rational'
    ) {
      const cmp = compare(left.amount.value, right.amount.value);
      if (
        !cmp.ok ||
        cmp.value !== (entry.order === 'lower' ? -1 : entry.order === 'higher' ? 1 : 0)
      )
        return mechanismIssue(
          ctx,
          'quoted comparison contradicts its supplied operands; never invent an alternative winner',
        );
    }
    const common = {
      id: expansionEntityId('45', b.entities.length + records.length + index),
      fromId: from.id,
      toId: to.id,
      dimension,
      basis,
      comparisonLabel: 'qualitative comparison',
      evidence: evidence.span,
    } as const;
    if (unresolvedQualification(fact)) relations.push({ ...common, ...fact });
    else relations.push({ ...common, ...fact, order: entry.order as 'lower' | 'higher' | 'equal' });
  }
  const allEvidence = [
    ...records.map((record) => record.quantity.evidence),
    ...relations.map((relation) => relation.evidence),
  ];
  if (
    ['latency', 'throughput'].some(
      (dimension) =>
        !records.some((record) => record.dimension === dimension) &&
        !relations.some((relation) => relation.dimension === dimension),
    ) ||
    !allEvidence.some((span) => sameSpan(span, b.sourceSpans.action)) ||
    !allEvidence.some((span) => sameSpan(span, b.sourceSpans.response)) ||
    (!allEvidence.some((span) => sameSpan(span, b.sourceSpans.check)) &&
      !clause(
        b.spans.check,
        scope(
          b.period,
          b.population,
          `${named(b.story.subject)}\\s+reports\\s+latency\\s+and\\s+throughput\\s+without\\s+conversion`,
        ),
      )) ||
    !clause(
      b.spans.resolve,
      `(?:${named(b.story.subject)}\\s+keeps\\s+latency\\s+separate\\s+from\\s+throughput|${named(b.story.subject)}\\s+preserves\\s+independent\\s+latency\\s+and\\s+throughput)`,
    )
  )
    return mechanismIssue(
      ctx,
      'beats must retain both distinct dimensions and resolve without reciprocal/rate/winner derivations',
    );
  return {
    ...b.story,
    storyId: '45',
    kind: 'temporal-structure',
    preset: 'delay-throughput',
    template: 'separate-dimensions',
    entities: b.entities,
    period: b.period,
    population: b.population,
    records,
    relations,
    sourceSpans: b.sourceSpans,
    meaning: 'latency-and-throughput-independent',
  };
}

export function parseExpansionPeriodicPhase(
  raw: Rec,
  ctx: ParseContext,
): ExpansionPeriodicPhaseScene | null {
  const b = localBase(raw, ctx, '46');
  if (!b) return null;
  const suppliedSignals = entries(raw.signals, L.actors, 2, ctx),
    suppliedRecords = entries(raw.records, L.records, 2, ctx),
    pairs = entries(raw.relations, L.relations, 1, ctx);
  if (!suppliedSignals || !suppliedRecords || !pairs) return null;
  const signals: PeriodicSignal[] = [];
  for (const [index, entry] of suppliedSignals.entries()) {
    if (
      !onlyFields(
        entry,
        ['actor', 'template', 'direction', 'state', 'qualifier', 'condition', 'evidence'],
        ctx,
      )
    )
      return null;
    const actor = reference(entry.actor, b.entities, ctx),
      evidence = expansionSourceSpan(entry.evidence, ctx);
    const template = (['cycle-dial', 'sine', 'pulse'] as const).find(
      (value) => value === entry.template,
    );
    if (
      !actor ||
      !evidence ||
      !template ||
      signals.some((signal) => signal.actorId === actor.id) ||
      (unresolved(entry.state)
        ? 'direction' in entry
        : entry.direction !== 'clockwise' && entry.direction !== 'counterclockwise') ||
      (template !== 'cycle-dial' && entry.state !== 'illustrative' && entry.state !== 'simulated')
    )
      return mechanismIssue(
        ctx,
        'signals use unique entities, source directions and fixed dial or explicitly qualified sine/pulse templates',
      );
    const a = named(actor.label),
      direction = literal(String(entry.direction));
    const body =
      template === 'cycle-dial'
        ? `(?:${a}\\s+cycles\\s+${direction}|${a}\\s+repeats\\s+${direction})`
        : `(?:${a}\\s+is\\s+a\\s+${template}\\s+signal\\s+cycling\\s+${direction}|${a}\\s+repeats\\s+${direction}\\s+as\\s+a\\s+${template}\\s+signal)`;
    const fact = qualification(
      entry,
      evidence.text,
      b,
      ctx,
      scope(b.period, b.population, body),
      (qualifier) =>
        scope(
          b.period,
          b.population,
          `${a}\\s+cycle\\s+direction\\s+(?:is|remains)\\s+${literal(qualifier)}`,
        ),
    );
    if (!fact) return null;
    const common = {
      id: expansionEntityId('46', b.entities.length + index),
      actorId: actor.id,
      template,
      evidence: evidence.span,
    };
    if (unresolvedQualification(fact)) signals.push({ ...common, ...fact });
    else
      signals.push({
        ...common,
        ...fact,
        direction: entry.direction as 'clockwise' | 'counterclockwise',
      });
  }
  if (signals.length !== b.entities.length)
    return mechanismIssue(
      ctx,
      'every named entity needs exactly one supplied periodic signal status',
    );
  const records: PeriodicQuantityRecord[] = [];
  for (const [index, entry] of suppliedRecords.entries()) {
    if (!onlyFields(entry, ['actor', 'dimension', 'reference', 'quantity'], ctx)) return null;
    const actor = reference(entry.actor, b.entities, ctx),
      dimension = entry.dimension;
    const target = dimension === 'phase' ? reference(entry.reference, b.entities, ctx) : undefined;
    if (
      !actor ||
      (dimension !== 'period' && dimension !== 'phase') ||
      (dimension === 'period' ? 'reference' in entry : !target || target.id === actor.id)
    )
      return mechanismIssue(
        ctx,
        'a periodic record needs its declared actor and dimension; phase must reference a distinct declared signal, period must not have a reference',
      );
    const quantity = quantityFor(
      entry.quantity,
      actor,
      dimension === 'period' ? 'period' : `phase relative to ${target?.label}`,
      b,
      ctx,
    );
    if (!quantity) return null;
    const unit = quantity.basis.unit;
    if (
      dimension === 'period'
        ? unit !== 'second' || !bounded(quantity, D.cyclePeriodMinimum, D.cyclePeriodMaximum)
        : (unit !== 'degree' && unit !== 'radian') ||
          !bounded(
            quantity,
            { numerator: -D.phase[unit], denominator: 1 },
            { numerator: D.phase[unit], denominator: 1 },
          )
    )
      return mechanismIssue(
        ctx,
        'periods are supplied 0.1–60 seconds; signed phases stay within ±360 degrees or ±8 radians without conversion/wrapping',
      );
    if (
      records.some(
        (record) =>
          record.actorId === actor.id &&
          record.dimension === dimension &&
          (dimension === 'period' || record.referenceId === target?.id),
      )
    )
      return mechanismIssue(
        ctx,
        'a periodic record cannot duplicate the same actor, dimension and phase reference',
      );
    const common = {
      id: expansionEntityId('46', b.entities.length + signals.length + index),
      actorId: actor.id,
      quantity,
    };
    if (dimension === 'period') records.push({ ...common, dimension });
    else if (target) records.push({ ...common, dimension, referenceId: target.id });
  }
  if (
    b.entities.some(
      (entity) =>
        !records.some((record) => record.actorId === entity.id && record.dimension === 'period'),
    )
  )
    return mechanismIssue(
      ctx,
      'each cycle needs its own supplied period or explicit absent/disputed period status',
    );
  const relations: PeriodicPhaseRelation[] = [];
  for (const [index, entry] of pairs.entries()) {
    if (
      !onlyFields(
        entry,
        ['from', 'to', 'relationship', 'state', 'qualifier', 'condition', 'evidence'],
        ctx,
      )
    )
      return null;
    const from = reference(entry.from, b.entities, ctx),
      to = reference(entry.to, b.entities, ctx),
      evidence = expansionSourceSpan(entry.evidence, ctx);
    if (
      !from ||
      !to ||
      from.id === to.id ||
      !evidence ||
      (unresolved(entry.state)
        ? 'relationship' in entry
        : !['leads', 'lags', 'aligned'].includes(String(entry.relationship))) ||
      relations.some((relation) => relation.fromId === from.id && relation.toId === to.id)
    )
      return mechanismIssue(
        ctx,
        'a phase relation needs distinct declared signals, complete source evidence and a nonduplicated source-backed relationship or explicit unknown state',
      );
    const a = named(from.label),
      z = named(to.label);
    const body =
      entry.relationship === 'aligned'
        ? `(?:${a}\\s+is\\s+in\\s+phase\\s+with\\s+${z}|${a}\\s+and\\s+${z}\\s+are\\s+phase\\s+aligned)`
        : entry.relationship === 'leads'
          ? `(?:${a}\\s+leads\\s+${z}|${z}\\s+lags\\s+behind\\s+${a})`
          : `(?:${a}\\s+lags\\s+behind\\s+${z}|${z}\\s+leads\\s+${a})`;
    const fact = qualification(
      entry,
      evidence.text,
      b,
      ctx,
      scope(b.period, b.population, body),
      (qualifier) =>
        scope(
          b.period,
          b.population,
          `(?:${a}\\s+phase\\s+relationship\\s+to\\s+${z}\\s+(?:is|remains)\\s+${literal(qualifier)}|Phase\\s+relationship\\s+from\\s+${a}\\s+to\\s+${z}\\s+(?:is|remains)\\s+${literal(qualifier)})`,
        ),
    );
    if (!fact) return null;
    const left = records.find(
        (record) => record.dimension === 'period' && record.actorId === from.id,
      ),
      right = records.find((record) => record.dimension === 'period' && record.actorId === to.id);
    const phase = records.find(
      (record) =>
        record.dimension === 'phase' && record.actorId === from.id && record.referenceId === to.id,
    );
    if (
      !left ||
      !right ||
      !compatibleBasis(left.quantity.basis, right.quantity.basis) ||
      (phase && !compatibleContext(phase.quantity.basis, left.quantity.basis))
    )
      return mechanismIssue(
        ctx,
        'periodic endpoints and supplied phase must retain one exact context/denominator basis',
      );
    if (
      fact.state === 'known' &&
      phase?.quantity.state === 'known' &&
      phase.quantity.amount.kind === 'rational'
    ) {
      // Authored convention: positive relative phase leads, negative lags. Never wrap or calculate an offset.
      const sign = compare(phase.quantity.amount.value, { numerator: 0, denominator: 1 });
      if (
        !sign.ok ||
        sign.value !== (entry.relationship === 'leads' ? 1 : entry.relationship === 'lags' ? -1 : 0)
      )
        return mechanismIssue(
          ctx,
          'source phase relationship contradicts its supplied signed relative phase',
        );
    }
    const common = {
      id: expansionEntityId('46', b.entities.length + signals.length + records.length + index),
      fromId: from.id,
      toId: to.id,
      evidence: evidence.span,
    };
    if (unresolvedQualification(fact)) relations.push({ ...common, ...fact });
    else
      relations.push({
        ...common,
        ...fact,
        relationship: entry.relationship as 'leads' | 'lags' | 'aligned',
      });
  }
  if (
    records.some(
      (record) =>
        record.dimension === 'phase' &&
        !relations.some(
          (relation) => relation.fromId === record.actorId && relation.toId === record.referenceId,
        ),
    ) ||
    !records.some((record) => sameSpan(record.quantity.evidence, b.sourceSpans.action)) ||
    !records.some((record) => sameSpan(record.quantity.evidence, b.sourceSpans.response)) ||
    !relations.some((relation) => sameSpan(relation.evidence, b.sourceSpans.check)) ||
    !clause(
      b.spans.resolve,
      `(?:${named(b.story.subject)}\\s+preserves\\s+supplied\\s+periods\\s+and\\s+phases|${named(b.story.subject)}\\s+keeps\\s+only\\s+stated\\s+periods\\s+and\\s+phases)`,
    )
  )
    return mechanismIssue(
      ctx,
      'periodic beats preserve supplied facts and phase relationships, not invented frequency/offset/synchronization results',
    );
  return {
    ...b.story,
    storyId: '46',
    kind: 'synchronization',
    preset: 'periodic-phase',
    template: 'bounded-cycles',
    entities: b.entities,
    period: b.period,
    population: b.population,
    signals,
    records,
    relations,
    sourceSpans: b.sourceSpans,
    meaning: 'supplied-period-phase-direction-only',
  };
}
