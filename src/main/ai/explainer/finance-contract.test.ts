import { describe, expect, it } from 'vitest';
import {
  compatibleBasis,
  conservesMoney,
  financeClaim,
  minorUnits,
  parseMoney,
  validOwnership,
} from './finance-contract';
import { makeParseContext } from './kind-spec';

describe('exact bounded financial evidence', () => {
  it('rejects unsafe or fractional minor units without rounding', () => {
    for (const value of [NaN, Infinity, -1, 10.1, Number.MAX_SAFE_INTEGER, '100'])
      expect(minorUnits(value)).toBeNull();
    expect(minorUnits(10001)).toBe(10001);
  });
  it('requires explicit supported currency and rejects extra rendering fields', () => {
    const ctx = makeParseContext([], { startWord: 0, endWord: 0, startTime: 0, endTime: 10 });
    expect(parseMoney({ minorUnits: 100, currency: 'USD' }, ctx)).toEqual({
      minorUnits: 100,
      currency: 'USD',
    });
    expect(parseMoney({ minorUnits: 100, currency: 'yen' }, ctx)).toBeNull();
    expect(parseMoney({ minorUnits: 100, currency: 'USD', url: 'remote' }, ctx)).toBeNull();
  });
  it('conserves integer cents and never exchanges currencies or periods', () => {
    const usd = (minorUnits: number) => ({ minorUnits, currency: 'USD' as const });
    expect(conservesMoney([usd(6000), usd(4000)], [usd(7000), usd(2000)], usd(1000))).toBe(true);
    expect(conservesMoney([usd(10000)], [usd(9999)], null)).toBe(false);
    expect(conservesMoney([usd(100)], [{ minorUnits: 100, currency: 'EUR' }], null)).toBe(false);
    expect(
      compatibleBasis({ currency: 'USD', period: 'month' }, { currency: 'USD', period: 'year' }),
    ).toBe(false);
    expect(
      compatibleBasis({ currency: 'USD', period: 'month' }, { currency: 'EUR', period: 'month' }),
    ).toBe(false);
  });
  it('checks share denominators and explicitly supplied percentage rounding', () => {
    expect(validOwnership(40, 100, 100, 200, 40, 20)).toBe(true);
    expect(validOwnership(1, 3, 1, 4, 33.33, 25)).toBe(true);
    expect(validOwnership(40, 100, 100, 150, 40, 20)).toBe(false);
    expect(validOwnership(40, 100, 100, 200, 40, 40)).toBe(false);
    expect(validOwnership(40.5, 100, 100, 200, 40, 20)).toBe(false);
  });
  it('binds actor, verb, amount and recipient within one asserted clause', () => {
    const pattern = 'Ada (?:contributes|invests) 60 USD (?:to|in) Example Fund';
    expect(financeClaim('Ada contributes 60 USD to Example Fund.', pattern)).toBe(true);
    expect(financeClaim('Ada invests 60 USD in Example Fund.', pattern)).toBe(true);
    for (const claim of [
      'Bo contributes 60 USD to Example Fund.',
      'Ada contributes 40 USD to Example Fund. Bo holds 60 USD.',
      'Ada never contributes 60 USD to Example Fund.',
      'Ada contributes 60 EUR to Example Fund.',
      'Ada may contribute 60 USD to Example Fund.',
    ]) {
      expect(financeClaim(claim, pattern)).toBe(false);
    }
  });
});
