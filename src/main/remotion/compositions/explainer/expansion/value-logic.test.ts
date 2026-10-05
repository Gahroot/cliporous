import { describe, expect, it } from 'vitest';
import {
  add,
  compare,
  compatibleBasis,
  convertUnit,
  decimalRational,
  divide,
  isDerivationAllowed,
  multiply,
  rational,
  rationalPosition,
  subtract,
} from './value-logic';
import type { ExpansionBasis, ExpansionRational } from './value-types';

function value(numerator: number, denominator = 1): ExpansionRational {
  const result = rational(numerator, denominator);
  if (!result.ok) throw new Error(`Invalid test operand: ${result.error}`);
  return result.value;
}
const basis: ExpansionBasis = {
  unit: 'percent',
  population: 'all orders',
  period: 'March',
  denominator: { numerator: 100, denominator: 1 },
};

describe('exact bounded expansion quantities', () => {
  it('parses bounded exact decimal notation without exponent or expression execution', () => {
    expect(decimalRational('-2.50')).toEqual({ ok: true, value: value(-5, 2) });
    expect(decimalRational('1,000.250')).toEqual({ ok: true, value: value(4001, 4) });
    expect(decimalRational('1000000000.000000')).toEqual({ ok: true, value: value(1_000_000_000) });
    for (const bad of [
      '1,00',
      '1e2',
      '2+3',
      '0.0000001',
      'NaN',
      'Infinity',
      '5 USD',
      '9'.repeat(49),
    ])
      expect(decimalRational(bad).ok).toBe(false);
    expect(decimalRational('1000000000.1')).toEqual({ ok: false, error: 'overflow' });
  });

  it('reduces signs and zero without binary floating point or JSON BigInts', () => {
    expect(rational(6, -8)).toEqual({ ok: true, value: { numerator: -3, denominator: 4 } });
    expect(rational(-0, -3)).toEqual({ ok: true, value: { numerator: 0, denominator: 1 } });
    expect(JSON.stringify(value(1, 10))).toBe('{"numerator":1,"denominator":10}');
    expect(add(value(1, 10), value(2, 10))).toEqual({ ok: true, value: value(3, 10) });
    expect(subtract(value(1, 10), value(3, 10))).toEqual({ ok: true, value: value(-1, 5) });
    expect(multiply(value(-3, 7), value(14, 9))).toEqual({ ok: true, value: value(-2, 3) });
    expect(divide(value(2, 3), value(-4, 5))).toEqual({ ok: true, value: value(-5, 6) });
  });

  it('rejects decimals, nonfinite values, zero denominators and oversized input components', () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0.1,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(rational(bad)).toEqual({ ok: false, error: 'invalid-value' });
      expect(rational(1, bad)).toEqual({ ok: false, error: 'invalid-value' });
    }
    expect(rational(1, 0)).toEqual({ ok: false, error: 'zero-denominator' });
    expect(rational(1_000_000_001, 1_000_000_001)).toEqual({ ok: false, error: 'overflow' });
    expect(divide(value(1), value(0))).toEqual({ ok: false, error: 'zero-denominator' });
    expect(add(value(1_000_000_000), value(1))).toEqual({ ok: false, error: 'overflow' });
    expect(multiply(value(1_000_000_000), value(2))).toEqual({ ok: false, error: 'overflow' });
    expect(divide(value(1), value(1, 1_000_000_000))).toEqual({
      ok: true,
      value: value(1_000_000_000),
    });
    expect(divide(value(2), value(1, 1_000_000_000))).toEqual({ ok: false, error: 'overflow' });
  });

  it('reduces large exact intermediates before checking the final representable ceiling', () => {
    expect(multiply(value(1_000_000_000, 999_999_999), value(999_999_999, 1_000_000_000))).toEqual({
      ok: true,
      value: value(1),
    });
    expect(add(value(1, 1_000_000_000), value(999_999_999, 1_000_000_000))).toEqual({
      ok: true,
      value: value(1),
    });
    expect(compare(value(1_000_000_000, 999_999_999), value(999_999_999, 1_000_000_000))).toEqual({
      ok: true,
      value: 1,
    });
    expect(compare(value(-2, 3), value(-4, 6))).toEqual({ ok: true, value: 0 });
    expect(compare(value(-1), value(0))).toEqual({ ok: true, value: -1 });
  });

  it('revalidates malformed operands rather than returning nonfinite authored positions', () => {
    for (const operation of [add, subtract, multiply, divide, compare]) {
      expect(operation({ numerator: Number.NaN, denominator: 1 }, value(1)).ok).toBe(false);
      expect(operation(value(1), { numerator: 1, denominator: 0 }).ok).toBe(false);
    }
  });

  it('projects exact close domains before rounding, without shifting source operands', () => {
    const lo = value(999999998, 999999999);
    const hi = value(999999999, 1000000000);
    expect(lo.numerator / lo.denominator).toBe(hi.numerator / hi.denominator);
    expect(rationalPosition(lo, lo, hi)).toEqual({ ok: true, value: 0 });
    expect(rationalPosition(hi, lo, hi)).toEqual({ ok: true, value: 1 });
    expect(rationalPosition(value(1), value(-1), value(3))).toEqual({ ok: true, value: 0.5 });
    for (const [point, lower, upper] of [
      [value(1), value(0), value(0)],
      [value(4), value(0), value(3)],
      [value(-1), value(0), value(3)],
      [value(1), value(3), value(0)],
    ])
      expect(rationalPosition(point, lower, upper).ok).toBe(false);
  });

  it('requires identical units, periods, populations and explicit compatible denominators', () => {
    expect(
      compatibleBasis(basis, { ...basis, period: ' march ', population: 'All   orders' }),
    ).toBe(true);
    expect(compatibleBasis(basis, { ...basis, denominator: value(200, 2) })).toBe(true);
    for (const other of [
      { ...basis, unit: 'percentage-point' as const },
      { ...basis, unit: 'percent-change' as const },
      { ...basis, period: 'April' },
      { ...basis, population: 'selected orders' },
      { ...basis, denominator: value(50) },
      { ...basis, denominator: undefined },
      { ...basis, denominator: value(0) },
      { ...basis, denominator: { numerator: 100, denominator: 0 } },
      { ...basis, period: '' },
    ])
      expect(compatibleBasis(basis, other)).toBe(false);
    expect(
      compatibleBasis(
        { unit: 'count', period: 'March', population: 'orders' },
        { unit: 'count', period: 'March', population: 'orders' },
      ),
    ).toBe(true);
  });

  it('converts only exact authored compatible units and round-trips without losing sign', () => {
    for (const [from, to, input, expected] of [
      ['metre', 'centimetre', value(3, 2), value(150)],
      ['millimetre', 'metre', value(-3), value(-3, 1000)],
      ['hour', 'second', value(1, 2), value(1800)],
      ['second', 'day', value(86400), value(1)],
      ['kilogram', 'gram', value(2), value(2000)],
      ['kilojoule', 'joule', value(3, 2), value(1500)],
    ] as const) {
      const result = convertUnit(input, from, to);
      expect(result).toEqual({ ok: true, value: expected });
      if (result.ok)
        expect(convertUnit(result.value, to, from)).toEqual({ ok: true, value: input });
    }
    for (const [from, to] of [
      ['metre', 'second'],
      ['USD', 'EUR'],
      ['percent', 'percentage-point'],
      ['ratio', 'percent'],
      ['degree', 'radian'],
    ] as const)
      expect(convertUnit(value(1), from, to)).toEqual({ ok: false, error: 'incompatible-basis' });
    expect(convertUnit(value(1_000_000_000), 'metre', 'centimetre')).toEqual({
      ok: false,
      error: 'overflow',
    });
    expect(convertUnit(value(1), 'USD', 'USD')).toEqual({ ok: true, value: value(1) });
  });

  it('never authorizes a derivation merely because its arithmetic is possible', () => {
    expect(isDerivationAllowed('49', 'unit-conversion')).toBe(true);
    expect(isDerivationAllowed('42', 'critical-path')).toBe(true);
    expect(isDerivationAllowed('18', 'subgroup-total')).toBe(true);
    expect(isDerivationAllowed('79', 'difference')).toBe(false);
    expect(isDerivationAllowed('73', 'subgroup-total')).toBe(false);
    expect(isDerivationAllowed('09', 'percent-change')).toBe(false);
  });
});
