/** Bounded quantity assertions, not a general natural-language/math evaluator. */
import {
  compare,
  decimalRational,
  divide,
  rational,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  EXPANSION_UNITS,
  type ExpansionAmount,
  type ExpansionBasis,
  type ExpansionQuantity,
  type ExpansionRational,
  type ExpansionUnit,
} from '../../remotion/compositions/explainer/expansion/value-types';
import {
  type ExpansionSourceEvidence,
  expansionAssertedRelation,
  expansionSourceLabel,
  expansionSourceSpan,
} from './expansion-source-contract';
import { parseMoney } from './finance-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const UNSIGNED_SCALAR = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,6})?(?:\\s*/\\s*\\d+)?';
const SCALAR = `[+-]?${UNSIGNED_SCALAR}`;
const UNIT_NOTATION: Readonly<Record<ExpansionUnit, string>> = {
  count: '(?:count|items?|records?|members?)',
  ratio: 'ratio',
  percent: '(?:%|percent|percentage)',
  'percentage-point': '(?:percentage-points?|percentage points?)',
  'percent-change': '(?:percent-change|percent(?:age)? change)',
  second: '(?:seconds?|s)',
  minute: '(?:minutes?|min)',
  hour: '(?:hours?|hr)',
  day: 'days?',
  millimetre: '(?:millimetres?|millimeters?|mm)',
  centimetre: '(?:centimetres?|centimeters?|cm)',
  metre: '(?:metres?|meters?|m)',
  'square-metre': '(?:square-metres?|square metres?|m²)',
  'cubic-metre': '(?:cubic-metres?|cubic metres?|m³)',
  gram: '(?:grams?|g)',
  kilogram: '(?:kilograms?|kg)',
  joule: '(?:joules?|J)',
  kilojoule: '(?:kilojoules?|kJ)',
  watt: '(?:watts?|W)',
  hertz: '(?:hertz|Hz)',
  radian: '(?:radians?|rad)',
  degree: '(?:degrees?|°)',
  byte: 'bytes?',
  'item/second': '(?:items?/second|items? per second)',
  USD: '(?:USD|dollars?)',
  EUR: '(?:EUR|euros?)',
  GBP: '(?:GBP|pounds?)',
};
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}
function currency(unit: ExpansionUnit): boolean {
  return unit === 'USD' || unit === 'EUR' || unit === 'GBP';
}
function inputRational(raw: unknown, ctx: ParseContext): ExpansionRational | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['numerator', 'denominator'], ctx) ||
    typeof raw.numerator !== 'number' ||
    typeof raw.denominator !== 'number' ||
    raw.denominator <= 0
  )
    return mechanismIssue(
      ctx,
      'rational values require bounded signed integers and a positive denominator',
    );
  const value = rational(raw.numerator, raw.denominator);
  return value.ok ? value.value : mechanismIssue(ctx, `rational quantity rejected: ${value.error}`);
}
function inputAmount(raw: unknown, unit: ExpansionUnit, ctx: ParseContext): ExpansionAmount | null {
  if (!isRec(raw) || !onlyFields(raw, ['kind', 'value'], ctx)) return null;
  if (raw.kind === 'rational' && !currency(unit)) {
    const value = inputRational(raw.value, ctx);
    return value ? { kind: 'rational', value } : null;
  }
  if (
    raw.kind === 'money' &&
    currency(unit) &&
    isRec(raw.value) &&
    onlyFields(raw.value, ['currency', 'minorUnits'], ctx)
  ) {
    const supplied = raw.value.minorUnits;
    const negative = typeof supplied === 'number' && supplied < 0;
    // Reuse bounded unsigned minor-unit validation, then restore the actual source sign.
    const value = parseMoney(negative ? { ...raw.value, minorUnits: -supplied } : raw.value, ctx);
    if (value && value.currency === unit && value.minorUnits <= EXPANSION_LIMITS.rationalComponent)
      return {
        kind: 'money',
        value: { ...value, minorUnits: negative ? -value.minorUnits : value.minorUnits },
      };
  }
  return mechanismIssue(
    ctx,
    'money/unit kinds must agree and minor units remain exact and bounded',
  );
}
function sourceRational(notation: string): ExpansionRational | null {
  const [first, second] = notation
    .replace(/−/g, '-')
    .split('/')
    .map((part) => part.trim());
  if (!first) return null;
  const value = decimalRational(first.replace(/^([+-]?)[$€£]\s*/, '$1'));
  if (!value.ok) return null;
  if (second === undefined) return value.value;
  const denominator = decimalRational(second);
  if (!denominator.ok || denominator.value.numerator <= 0) return null;
  const ratio = divide(value.value, denominator.value);
  return ratio.ok ? ratio.value : null;
}
function evidencedAmount(amount: ExpansionAmount, notation: string): ExpansionAmount | null {
  const stated = sourceRational(notation);
  if (!stated) return null;
  const value =
    amount.kind === 'rational'
      ? { ok: true as const, value: amount.value }
      : rational(amount.value.minorUnits, 100);
  if (!value.ok) return null;
  const equal = compare(stated, value.value);
  return equal.ok && equal.value === 0 ? { ...amount, notation } : null;
}
function basisFrom(
  raw: unknown,
  evidence: ExpansionSourceEvidence,
  ctx: ParseContext,
): ExpansionBasis | null {
  if (!isRec(raw) || !onlyFields(raw, ['unit', 'period', 'population', 'denominator'], ctx))
    return null;
  const unit = EXPANSION_UNITS.find((candidate) => candidate === raw.unit);
  const period = expansionSourceLabel(raw.period, evidence, ctx, EXPANSION_LIMITS.period);
  const population = expansionSourceLabel(
    raw.population,
    evidence,
    ctx,
    EXPANSION_LIMITS.population,
  );
  if (!unit || !period || !population)
    return mechanismIssue(
      ctx,
      'unit, period and population must have explicit compatible local evidence',
    );
  const denominator =
    raw.denominator === undefined ? undefined : inputRational(raw.denominator, ctx);
  if (denominator === null || (denominator && denominator.numerator <= 0))
    return mechanismIssue(ctx, 'represented population denominator must be explicitly positive');
  return { unit, period, population, ...(denominator ? { denominator } : {}) };
}

interface QuantityMatch {
  readonly first?: string;
  readonly second?: string;
  readonly denominator?: string;
}
function matchAssertion(
  raw: Rec,
  actor: string,
  claim: string,
  basis: ExpansionBasis,
  evidence: ExpansionSourceEvidence,
  ctx: ParseContext,
): QuantityMatch | null {
  const state = raw.state;
  const qualifier =
    raw.qualifier === undefined
      ? undefined
      : expansionSourceLabel(raw.qualifier, evidence, ctx, EXPANSION_LIMITS.qualifier);
  const condition =
    raw.condition === undefined
      ? undefined
      : expansionSourceLabel(raw.condition, evidence, ctx, EXPANSION_LIMITS.qualifier);
  if (qualifier === null || condition === null) return null;
  if (state === 'known' && (qualifier !== undefined || condition !== undefined)) return null;
  if (state === 'conditional' && (!condition || qualifier !== undefined)) return null;
  if (state !== 'conditional' && condition !== undefined) return null;
  if ((state === 'missing' || state === 'unknown' || state === 'disputed') && qualifier !== state)
    return null;
  if (
    state === 'illustrative' &&
    (!qualifier || !/\b(?:illustrative|illustration|teaching example)\b/i.test(qualifier))
  )
    return null;
  if (state === 'simulated' && (!qualifier || !/\b(?:simulated|simulation)\b/i.test(qualifier)))
    return null;
  const intro = `(?:${literal(actor)}\\s+${literal(claim)}\\s+(?:is|was|equals|totals|stands at)\\s+|${literal(actor)}\\s+(?:recorded|reported|observed)\\s+${literal(claim)}\\s+(?:of|at|as)\\s+)`;
  const symbol = basis.unit === 'USD' ? '\\$' : basis.unit === 'EUR' ? '€' : '£';
  const number = currency(basis.unit)
    ? `(?:(?:${symbol}\\s*)?${SCALAR}|[+-]${symbol}\\s*${UNSIGNED_SCALAR})`
    : SCALAR;
  const values =
    state === 'unknown' || state === 'missing'
      ? literal(state)
      : state === 'disputed'
        ? `disputed\\s+between\\s+(${number})\\s+and\\s+(${number})`
        : `(${number})`;
  const amountAndUnit =
    basis.unit === 'percent'
      ? `${values}(?:\\s*%|\\s+(?:percent|percentage))`
      : `${values}\\s+${UNIT_NOTATION[basis.unit]}`;
  const denominator = basis.denominator ? `\\s+with\\s+denominator\\s+(${SCALAR})` : '';
  const among = `\\s+(?:among|for)\\s+${literal(basis.population)}${denominator}`;
  const ordinary = `${intro}${amountAndUnit}\\s+(?:during|in|for)\\s+${literal(basis.period)}${among}`;
  const periodFirst = `(?:during|in|for)\\s+${literal(basis.period)},\\s*${intro}${amountAndUnit}${among}`;
  for (const body of [ordinary, periodFirst]) {
    const qualified =
      state === 'illustrative' || state === 'simulated'
        ? `(?:in\\s+this|in\\s+the)\\s+${literal(qualifier ?? '')},\\s*${body}`
        : body;
    const pattern = new RegExp(qualified, 'i');
    if (
      !expansionAssertedRelation(evidence, pattern, condition, [
        actor,
        claim,
        basis.period,
        basis.population,
        ...(qualifier ? [qualifier] : []),
      ])
    )
      continue;
    const full = condition
      ? `(?:${literal(condition)},\\s*${qualified}|${qualified},?\\s+${literal(condition)})`
      : qualified;
    const text = evidence.text
      .normalize('NFKC')
      .replace(/’/g, "'")
      .replace(/−/g, '-')
      .trim()
      .replace(/[.;]$/, '');
    const match = new RegExp(`^(?:${full})$`, 'i').exec(text);
    if (!match) continue;
    // Conditional alternatives duplicate capture slots; find only the populated authored branch.
    const captured = match.slice(1).filter((value): value is string => value !== undefined);
    const amountCount =
      state === 'unknown' || state === 'missing' ? 0 : state === 'disputed' ? 2 : 1;
    const result: QuantityMatch = {
      first: captured[0],
      second: amountCount === 2 ? captured[1] : undefined,
      denominator: basis.denominator ? captured[amountCount] : undefined,
    };
    if (basis.denominator) {
      const stated = result.denominator ? sourceRational(result.denominator) : null;
      const equal = stated ? compare(stated, basis.denominator) : null;
      if (!equal?.ok || equal.value !== 0) continue;
    }
    return result;
  }
  return mechanismIssue(
    ctx,
    'quantity must bind actor, claim, status, amount, unit, period and population in one complete assertion; ambiguous clauses are not inferred',
  );
}

export function parseExpansionQuantity(raw: unknown, ctx: ParseContext): ExpansionQuantity | null {
  if (
    !isRec(raw) ||
    !onlyFields(
      raw,
      [
        'actor',
        'claim',
        'basis',
        'evidence',
        'state',
        'amount',
        'condition',
        'qualifier',
        'alternatives',
      ],
      ctx,
    )
  )
    return null;
  const evidence = expansionSourceSpan(raw.evidence, ctx);
  if (!evidence) return null;
  const actor = expansionSourceLabel(raw.actor, evidence, ctx, EXPANSION_LIMITS.actorLabel);
  const claim = expansionSourceLabel(raw.claim, evidence, ctx, EXPANSION_LIMITS.claim);
  const basis = basisFrom(raw.basis, evidence, ctx);
  if (!actor || !claim || !basis) return null;
  if (
    typeof raw.state !== 'string' ||
    ![
      'known',
      'conditional',
      'illustrative',
      'simulated',
      'missing',
      'unknown',
      'disputed',
    ].includes(raw.state)
  )
    return mechanismIssue(
      ctx,
      'quantity state must distinguish fact, condition, absence, dispute and teaching values',
    );
  const match = matchAssertion(raw, actor, claim, basis, evidence, ctx);
  if (!match) return null;
  const common = { actor, claim, basis, evidence: evidence.span };
  if (raw.state === 'missing' || raw.state === 'unknown') {
    if (
      raw.amount !== undefined ||
      raw.alternatives !== undefined ||
      typeof raw.qualifier !== 'string'
    )
      return null;
    return { ...common, state: raw.state, qualifier: raw.qualifier };
  }
  if (raw.state === 'disputed') {
    if (
      raw.amount !== undefined ||
      !Array.isArray(raw.alternatives) ||
      raw.alternatives.length !== 2 ||
      typeof raw.qualifier !== 'string' ||
      !match.first ||
      !match.second
    )
      return null;
    const first = inputAmount(raw.alternatives[0], basis.unit, ctx);
    const second = inputAmount(raw.alternatives[1], basis.unit, ctx);
    const a = first ? evidencedAmount(first, match.first) : null;
    const b = second ? evidencedAmount(second, match.second) : null;
    return a && b
      ? { ...common, state: 'disputed', qualifier: raw.qualifier, alternatives: [a, b] }
      : mechanismIssue(ctx, 'both disputed alternatives must retain their supplied local operands');
  }
  if (raw.alternatives !== undefined || !match.first) return null;
  const supplied = inputAmount(raw.amount, basis.unit, ctx);
  const amount = supplied ? evidencedAmount(supplied, match.first) : null;
  if (!amount)
    return mechanismIssue(
      ctx,
      'amount must exactly match signed local numeric evidence without rounding',
    );
  if (raw.state === 'known') return { ...common, state: 'known', amount };
  if (raw.state === 'conditional' && typeof raw.condition === 'string')
    return { ...common, state: 'conditional', amount, condition: raw.condition };
  if (
    (raw.state === 'illustrative' || raw.state === 'simulated') &&
    typeof raw.qualifier === 'string'
  )
    return { ...common, state: raw.state, amount, qualifier: raw.qualifier };
  return null;
}
