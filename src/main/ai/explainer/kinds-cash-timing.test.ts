import { describe, expect, it } from 'vitest';
import { cashFixture } from './hybrid-test-fixtures';
import { makeParseContext } from './kind-spec';
import { cashTimingSpec } from './kinds-cash-timing';

describe('cash timing source contract', () => {
  for (const preset of ['receivable-gap', 'inventory-before-sales'])
    for (const mode of ['diagram', 'hybrid'])
      it(`${preset}/${mode}`, () => {
        const f = cashFixture(preset, mode);
        expect(cashTimingSpec.parse(f.raw, f.ctx), f.ctx.issues.join('; ')).not.toBeNull();
      });
  for (const change of [
    { profitMinor: 4000 },
    { openingBalance: 9000 },
    { closingBalance: 3000 },
    { receivedWhen: 'today' },
    { totalCosts: { minorUnits: 7000, currency: 'EUR' } },
    { cashPaid: { minorUnits: 7001.5, currency: 'USD' } },
    { sales: null, profitMinor: 3000 },
    { outcome: 'Shop is safe' },
  ])
    it(`rejects unsupported ${JSON.stringify(change)}`, () => {
      const f = cashFixture();
      expect(cashTimingSpec.parse({ ...f.raw, ...change }, f.ctx)).toBeNull();
    });
  it('does not treat partial costs as all costs', () => {
    const f = cashFixture();
    const words = f.words.map((word) => ({
      ...word,
      text: word.text === 'total' ? 'partial' : word.text,
    }));
    expect(cashTimingSpec.parse(f.raw, makeParseContext(words, f.ctx.win))).toBeNull();
  });
});
