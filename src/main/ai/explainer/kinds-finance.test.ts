import { describe, expect, it } from 'vitest';
import { fundFixture, ownershipFixture, portfolioFixture } from './hybrid-test-fixtures';
import { makeParseContext } from './kind-spec';
import { fundFlowSpec, ownershipChangeSpec, portfolioExposureSpec } from './kinds-finance';

describe('shared portfolio identities', () => {
  for (const preset of ['shared-holdings', 'shared-driver'])
    for (const mode of ['diagram', 'hybrid'])
      it(`${preset}/${mode}`, () => {
        const f = portfolioFixture(preset, mode);
        expect(portfolioExposureSpec.parse(f.raw, f.ctx), f.ctx.issues.join('; ')).not.toBeNull();
      });
  for (const change of [
    { correlation: 0.8 },
    { weights: [50, 50] },
    { holdings: [] },
    { exposure: { id: 'fake', label: 'ExampleCo' } },
    {
      holdings: Array(7).fill({
        fundId: 'fund-a',
        holding: { id: 'exposure', label: 'ExampleCo' },
      }),
    },
  ])
    it(`rejects unsupported exposure ${JSON.stringify(change)}`, () => {
      const f = portfolioFixture();
      expect(portfolioExposureSpec.parse({ ...f.raw, ...change }, f.ctx)).toBeNull();
    });
  it('preserves an example disclosure and rejects negated outcomes', () => {
    const f = portfolioFixture();
    expect(portfolioExposureSpec.parse({ ...f.raw, evidence: 'source-stated' }, f.ctx)).toBeNull();
    const words = f.words.map((word, i) => ({
      ...word,
      text: i === f.raw.resolveWord ? `No ${word.text}` : word.text,
    }));
    expect(portfolioExposureSpec.parse(f.raw, makeParseContext(words, f.ctx.win))).toBeNull();
  });
});

describe('ownership source and arithmetic', () => {
  for (const preset of ['share-issue', 'stake-value-separation'])
    for (const mode of ['diagram', 'hybrid'])
      it(`${preset}/${mode}`, () => {
        const f = ownershipFixture(preset, mode);
        expect(ownershipChangeSpec.parse(f.raw, f.ctx), f.ctx.issues.join('; ')).not.toBeNull();
      });
  for (const [field, value] of [
    ['shares', 20],
    ['afterTotal', 100],
    ['issued', 10.5],
    ['afterPercent', 40],
    ['beforePercent', NaN],
    [
      'valuation',
      {
        state: 'measured',
        before: { minorUnits: 100, currency: 'USD' },
        after: { minorUnits: 50, currency: 'USD' },
      },
    ],
  ])
    it(`rejects unsupported ${field}`, () => {
      const f = ownershipFixture();
      expect(ownershipChangeSpec.parse({ ...f.raw, [String(field)]: value }, f.ctx)).toBeNull();
    });
});

describe('fund-flow source and quantity contract', () => {
  for (const preset of ['capital-deployment', 'proceeds-distribution'])
    for (const mode of ['diagram', 'hybrid'])
      for (const measured of [true, false]) {
        it(`${preset}/${mode}/${measured ? 'measured' : 'qualitative'}`, () => {
          const f = fundFixture(preset, mode, measured);
          const scene = fundFlowSpec.parse(f.raw, f.ctx);
          expect(scene, f.ctx.issues.join('; ')).not.toBeNull();
          expect(scene).toEqual(fundFlowSpec.parse(f.raw, f.ctx));
          expect(scene?.visualMode).toBe(mode);
        });
      }
  for (const replacement of ['70 EUR', '71 USD', '70 USD per year', '-70 USD'])
    it(`rejects mismatched source ${replacement}`, () => {
      const f = fundFixture();
      const words = f.words.map((w) => ({ ...w }));
      const index = words.findIndex((w) => w.text === '70');
      const [value, ...unit] = replacement.split(' ');
      words[index].text = value;
      words[index + 1].text = unit.join(' ');
      const ctx = makeParseContext(words, f.ctx.win);
      expect(fundFlowSpec.parse(f.raw, ctx)).toBeNull();
    });
  it('rejects a role swap and a fabricated retained balance', () => {
    const f = fundFixture();
    expect(
      fundFlowSpec.parse(
        {
          ...f.raw,
          sources: [
            { id: 'first', label: 'Bo' },
            { id: 'second', label: 'Ada' },
          ],
        },
        f.ctx,
      ),
    ).toBeNull();
    expect(
      fundFlowSpec.parse({ ...f.raw, retained: { minorUnits: 1, currency: 'USD' } }, f.ctx),
    ).toBeNull();
    expect(fundFlowSpec.parse({ ...f.raw, weights: [0.8, 0.2] }, f.ctx)).toBeNull();
  });
});
