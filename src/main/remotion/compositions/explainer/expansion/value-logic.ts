/** Exact bounded arithmetic for authored templates; no expression evaluator. */
import { type ExpansionStoryId, expansionStory } from './catalog';
import {
  EXPANSION_LIMITS,
  EXPANSION_UNITS,
  type ExpansionBasis,
  type ExpansionDerivation,
  type ExpansionRational,
  type ExpansionUnit,
  type ExpansionValueResult,
} from './value-types';

const MAX_COMPONENT = BigInt(EXPANSION_LIMITS.rationalComponent);
function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}
function gcd(left: bigint, right: bigint): bigint {
  let a = abs(left);
  let b = abs(right);
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}
function reduced(numerator: bigint, denominator: bigint): ExpansionValueResult<ExpansionRational> {
  if (denominator === 0n) return { ok: false, error: 'zero-denominator' };
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  const n = (numerator * sign) / divisor;
  const d = (denominator * sign) / divisor;
  if (abs(n) > MAX_COMPONENT || d > MAX_COMPONENT) return { ok: false, error: 'overflow' };
  return { ok: true, value: { numerator: Number(n), denominator: Number(d) } };
}

export function rational(
  numerator: number,
  denominator = 1,
): ExpansionValueResult<ExpansionRational> {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator))
    return { ok: false, error: 'invalid-value' };
  if (denominator === 0) return { ok: false, error: 'zero-denominator' };
  if (
    Math.abs(numerator) > EXPANSION_LIMITS.rationalComponent ||
    Math.abs(denominator) > EXPANSION_LIMITS.rationalComponent
  )
    return { ok: false, error: 'overflow' };
  return reduced(BigInt(numerator), BigInt(denominator));
}

/** Exact authored decimal notation, with grouping validated before removing commas. */
export function decimalRational(text: string): ExpansionValueResult<ExpansionRational> {
  if (text.length > 48 || !/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,6})?$/.test(text))
    return { ok: false, error: 'invalid-value' };
  const normalized = text.replace(/,/g, '');
  const parts = normalized.split('.');
  const whole = parts[0];
  if (whole === undefined) return { ok: false, error: 'invalid-value' };
  const fraction = parts[1] ?? '';
  const sign = whole.startsWith('-') ? -1n : 1n;
  const magnitude = `${whole.replace(/^[+-]/, '')}${fraction}`;
  return reduced(sign * BigInt(magnitude), 10n ** BigInt(fraction.length));
}

function operands(
  left: ExpansionRational,
  right: ExpansionRational,
): ExpansionValueResult<readonly [ExpansionRational, ExpansionRational]> {
  const a = rational(left.numerator, left.denominator);
  if (!a.ok) return a;
  const b = rational(right.numerator, right.denominator);
  if (!b.ok) return b;
  return { ok: true, value: [a.value, b.value] };
}

export function add(
  left: ExpansionRational,
  right: ExpansionRational,
): ExpansionValueResult<ExpansionRational> {
  const input = operands(left, right);
  if (!input.ok) return input;
  const [a, b] = input.value;
  return reduced(
    BigInt(a.numerator) * BigInt(b.denominator) + BigInt(b.numerator) * BigInt(a.denominator),
    BigInt(a.denominator) * BigInt(b.denominator),
  );
}

export function subtract(
  left: ExpansionRational,
  right: ExpansionRational,
): ExpansionValueResult<ExpansionRational> {
  return add(left, { numerator: -right.numerator, denominator: right.denominator });
}

export function multiply(
  left: ExpansionRational,
  right: ExpansionRational,
): ExpansionValueResult<ExpansionRational> {
  const input = operands(left, right);
  if (!input.ok) return input;
  const [a, b] = input.value;
  return reduced(
    BigInt(a.numerator) * BigInt(b.numerator),
    BigInt(a.denominator) * BigInt(b.denominator),
  );
}

export function divide(
  left: ExpansionRational,
  right: ExpansionRational,
): ExpansionValueResult<ExpansionRational> {
  const input = operands(left, right);
  if (!input.ok) return input;
  const [a, b] = input.value;
  if (b.numerator === 0) return { ok: false, error: 'zero-denominator' };
  return reduced(
    BigInt(a.numerator) * BigInt(b.denominator),
    BigInt(a.denominator) * BigInt(b.numerator),
  );
}

export function compare(
  left: ExpansionRational,
  right: ExpansionRational,
): ExpansionValueResult<-1 | 0 | 1> {
  const input = operands(left, right);
  if (!input.ok) return input;
  const [a, b] = input.value;
  const lhs = BigInt(a.numerator) * BigInt(b.denominator);
  const rhs = BigInt(b.numerator) * BigInt(a.denominator);
  return { ok: true, value: lhs < rhs ? -1 : lhs > rhs ? 1 : 0 };
}

/** Rendering-only projection: subtract exact cross-products before converting to pixels. */
export function rationalPosition(
  value: ExpansionRational,
  lower: ExpansionRational,
  upper: ExpansionRational,
): ExpansionValueResult<number> {
  const v = rational(value.numerator, value.denominator);
  const lo = rational(lower.numerator, lower.denominator);
  const hi = rational(upper.numerator, upper.denominator);
  if (!v.ok) return v;
  if (!lo.ok) return lo;
  if (!hi.ok) return hi;
  const a = BigInt(lo.value.numerator);
  const b = BigInt(lo.value.denominator);
  const c = BigInt(hi.value.numerator);
  const d = BigInt(hi.value.denominator);
  const n = BigInt(v.value.numerator);
  const q = BigInt(v.value.denominator);
  const range = c * b - a * d;
  const delta = n * b - a * q;
  if (range <= 0n || delta < 0n || n * d > c * q) return { ok: false, error: 'invalid-value' };
  return { ok: true, value: Number(delta * d) / Number(q * range) };
}

function basisText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
export function compatibleBasis(left: ExpansionBasis, right: ExpansionBasis): boolean {
  if (
    !EXPANSION_UNITS.includes(left.unit) ||
    left.unit !== right.unit ||
    !basisText(left.period) ||
    !basisText(left.population) ||
    basisText(left.period) !== basisText(right.period) ||
    basisText(left.population) !== basisText(right.population)
  )
    return false;
  if (!left.denominator || !right.denominator)
    return left.denominator === undefined && right.denominator === undefined;
  if (left.denominator.numerator <= 0 || right.denominator.numerator <= 0) return false;
  const same = compare(left.denominator, right.denominator);
  return same.ok && same.value === 0;
}

interface AuthoredUnit {
  readonly family: 'time' | 'length' | 'mass' | 'energy';
  readonly base: ExpansionRational;
}
const UNIT_TABLE: Partial<Readonly<Record<ExpansionUnit, AuthoredUnit>>> = {
  second: { family: 'time', base: { numerator: 1, denominator: 1 } },
  minute: { family: 'time', base: { numerator: 60, denominator: 1 } },
  hour: { family: 'time', base: { numerator: 3600, denominator: 1 } },
  day: { family: 'time', base: { numerator: 86400, denominator: 1 } },
  millimetre: { family: 'length', base: { numerator: 1, denominator: 1000 } },
  centimetre: { family: 'length', base: { numerator: 1, denominator: 100 } },
  metre: { family: 'length', base: { numerator: 1, denominator: 1 } },
  gram: { family: 'mass', base: { numerator: 1, denominator: 1 } },
  kilogram: { family: 'mass', base: { numerator: 1000, denominator: 1 } },
  joule: { family: 'energy', base: { numerator: 1, denominator: 1 } },
  kilojoule: { family: 'energy', base: { numerator: 1000, denominator: 1 } },
};

/** Currency, percentages, angle approximations and semantic rates are not converted implicitly. */
export function convertUnit(
  value: ExpansionRational,
  from: ExpansionUnit,
  to: ExpansionUnit,
): ExpansionValueResult<ExpansionRational> {
  const checked = rational(value.numerator, value.denominator);
  if (!checked.ok) return checked;
  if (!EXPANSION_UNITS.includes(from) || !EXPANSION_UNITS.includes(to))
    return { ok: false, error: 'incompatible-basis' };
  if (from === to) return checked;
  const source = UNIT_TABLE[from];
  const target = UNIT_TABLE[to];
  if (!source || !target || source.family !== target.family)
    return { ok: false, error: 'incompatible-basis' };
  // One exact expression, reducing once: a representable result must not fail on an intermediate.
  return reduced(
    BigInt(checked.value.numerator) *
      BigInt(source.base.numerator) *
      BigInt(target.base.denominator),
    BigInt(checked.value.denominator) *
      BigInt(source.base.denominator) *
      BigInt(target.base.numerator),
  );
}

export function isDerivationAllowed(
  storyId: ExpansionStoryId,
  operation: ExpansionDerivation,
): boolean {
  return expansionStory(storyId).allowedDerivations.includes(operation);
}
