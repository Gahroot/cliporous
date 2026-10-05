import { describe, expect, it } from 'vitest';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import { makeParseContext, type ParseContext, type Rec } from './kind-spec';

function fixture(text = 'Acme output is 5 count during March among orders.'): {
  ctx: ParseContext;
  raw: Rec;
} {
  const words = text
    .split(/\s+/)
    .map((word, index) => ({ text: word, start: 0.25 + index * 0.1, end: 0.33 + index * 0.1 }));
  return {
    ctx: makeParseContext(words, {
      startWord: 0,
      endWord: words.length - 1,
      startTime: 0,
      endTime: 10,
    }),
    raw: {
      actor: 'Acme',
      claim: 'output',
      basis: { unit: 'count', period: 'March', population: 'orders' },
      evidence: { fromWord: 0, toWord: words.length - 1 },
      state: 'known',
      amount: amount(5),
    },
  };
}
function amount(numerator: number, denominator = 1): Rec {
  return { kind: 'rational', value: { numerator, denominator } };
}
function missingAmount(raw: Rec): Rec {
  const { amount: _amount, ...rest } = raw;
  return rest;
}

describe('local actor/basis-bound quantities', () => {
  it('accepts a grounded count and ordinary paraphrase without changing identity or basis', () => {
    for (const text of [
      'Acme output is 5 count during March among orders.',
      'During March, Acme recorded output of 5 items among orders.',
    ]) {
      const { raw, ctx } = fixture(text);
      expect(parseExpansionQuantity(raw, ctx)).toMatchObject({
        actor: 'Acme',
        claim: 'output',
        state: 'known',
        amount: amount(5),
        basis: { unit: 'count', period: 'March', population: 'orders' },
        evidence: raw.evidence,
      });
      expect(ctx.issues).toEqual([]);
    }
  });

  it('accepts the source-bound month May and a named May without treating labels as modal grammar', () => {
    for (const text of [
      'May output is 5 count during May among orders.',
      'During may, May reported output of 5 items among orders.',
    ]) {
      const { raw, ctx } = fixture(text);
      expect(
        parseExpansionQuantity(
          { ...raw, actor: 'May', basis: { unit: 'count', period: 'May', population: 'orders' } },
          ctx,
        ),
      ).toMatchObject({
        actor: 'May',
        state: 'known',
        amount: amount(5),
        basis: { period: 'May' },
      });
      expect(ctx.issues).toEqual([]);
    }
    for (const text of [
      'May output may be 5 count during May among orders.',
      'May output is perhaps 5 count during May among orders.',
      'May output is not 5 count during May among orders.',
    ]) {
      const { raw, ctx } = fixture(text);
      expect(
        parseExpansionQuantity(
          { ...raw, actor: 'May', basis: { unit: 'count', period: 'May', population: 'orders' } },
          ctx,
        ),
      ).toBeNull();
    }
  });

  it('preserves signed exact decimals and does not round or drop a sign', () => {
    const { raw, ctx } = fixture('Acme output is -2.50 percent during March among orders.');
    const supported = {
      ...raw,
      basis: { unit: 'percent', period: 'March', population: 'orders' },
      amount: amount(-5, 2),
    };
    expect(parseExpansionQuantity(supported, ctx)).toMatchObject({
      amount: { ...amount(-5, 2), notation: '-2.50' },
    });
    for (const bad of [amount(5, 2), amount(-2), amount(-251, 100), amount(-25)])
      expect(parseExpansionQuantity({ ...supported, amount: bad }, ctx)).toBeNull();
  });

  it('retains shorthand percentages and bounded supplied fractions without evaluating expressions', () => {
    for (const [text, unit, value, notation] of [
      ['Acme output is 5% during March among orders.', 'percent', amount(5), '5'],
      ['Acme output is 2/3 ratio during March among orders.', 'ratio', amount(2, 3), '2/3'],
    ] as const) {
      const { raw, ctx } = fixture(text);
      expect(
        parseExpansionQuantity(
          { ...raw, basis: { unit, period: 'March', population: 'orders' }, amount: value },
          ctx,
        ),
      ).toMatchObject({ amount: { ...value, notation } });
    }
    const { raw, ctx } = fixture('Acme output is 2+3 count during March among orders.');
    expect(parseExpansionQuantity(raw, ctx)).toBeNull();
  });

  it('distinguishes percentage, percentage points and percentage change', () => {
    for (const unit of ['percent', 'percentage-point', 'percent-change']) {
      const { raw, ctx } = fixture(`Acme output is 5 ${unit} during March among orders.`);
      expect(
        parseExpansionQuantity(
          { ...raw, basis: { unit, period: 'March', population: 'orders' } },
          ctx,
        ),
      ).toMatchObject({ basis: { unit } });
      for (const other of ['percent', 'percentage-point', 'percent-change'].filter(
        (candidate) => candidate !== unit,
      ))
        expect(
          parseExpansionQuantity(
            { ...raw, basis: { unit: other, period: 'March', population: 'orders' } },
            ctx,
          ),
        ).toBeNull();
    }
  });

  it('does not borrow a value from another actor, claim, scope or repeated ambiguous number', () => {
    for (const change of [
      { actor: 'Beta' },
      { claim: 'revenue' },
      { basis: { unit: 'count', period: 'April', population: 'orders' } },
      { basis: { unit: 'count', period: 'March', population: 'customers' } },
      { amount: amount(7) },
    ]) {
      const { raw, ctx } = fixture(
        'Acme output is 5 count during March among orders. Beta revenue is 7 count during April among customers.',
      );
      raw.evidence = { fromWord: 0, toWord: 8 };
      expect(parseExpansionQuantity({ ...raw, ...change }, ctx)).toBeNull();
    }
    const { raw, ctx } = fixture(
      'Acme output is 7 count and Beta output is 5 count during March among orders.',
    );
    expect(parseExpansionQuantity(raw, ctx)).toBeNull();
    const repeated = fixture(
      'Acme output is 5 count and Acme refunds are 5 count during March among orders.',
    );
    expect(parseExpansionQuantity(repeated.raw, repeated.ctx)).toBeNull();
  });

  it('binds a positive denominator to the same clause and never accepts zero or absent basis', () => {
    const { raw, ctx } = fixture(
      'Acme output is 5 count during March among orders with denominator 100.',
    );
    const basis = {
      unit: 'count',
      period: 'March',
      population: 'orders',
      denominator: { numerator: 100, denominator: 1 },
    };
    expect(parseExpansionQuantity({ ...raw, basis }, ctx)).toMatchObject({ basis });
    for (const denominator of [
      { numerator: 0, denominator: 1 },
      { numerator: -100, denominator: 1 },
      { numerator: 100, denominator: 0 },
      { numerator: 50, denominator: 1 },
    ])
      expect(parseExpansionQuantity({ ...raw, basis: { ...basis, denominator } }, ctx)).toBeNull();
    const absent = fixture();
    expect(parseExpansionQuantity({ ...absent.raw, basis }, absent.ctx)).toBeNull();
  });

  it('retains missing and unknown states without invented zero values', () => {
    for (const state of ['unknown', 'missing']) {
      const { raw, ctx } = fixture(`Acme output is ${state} count during March among orders.`);
      const qualified = { ...missingAmount(raw), state, qualifier: state };
      const parsed = parseExpansionQuantity(qualified, ctx);
      expect(parsed).toMatchObject({ state, qualifier: state });
      expect(parsed && 'amount' in parsed).toBe(false);
      expect(parseExpansionQuantity({ ...qualified, amount: amount(0) }, ctx)).toBeNull();
      expect(parseExpansionQuantity({ ...qualified, qualifier: 'verified' }, ctx)).toBeNull();
    }
    const zero = fixture('Acme output is 0 count during March among orders.');
    expect(parseExpansionQuantity({ ...zero.raw, amount: amount(0) }, zero.ctx)).toMatchObject({
      state: 'known',
      amount: amount(0),
    });
  });

  it('keeps conditional, simulated, illustrative and disputed values distinct from known fact', () => {
    const conditional = fixture(
      'If approval is granted, Acme output is 5 count during March among orders.',
    );
    expect(
      parseExpansionQuantity(
        { ...conditional.raw, state: 'conditional', condition: 'If approval is granted' },
        conditional.ctx,
      ),
    ).toMatchObject({ state: 'conditional', condition: 'If approval is granted' });
    expect(parseExpansionQuantity(conditional.raw, conditional.ctx)).toBeNull();
    expect(
      parseExpansionQuantity(
        { ...conditional.raw, state: 'conditional', condition: 'If approval' },
        conditional.ctx,
      ),
    ).toBeNull();
    for (const [state, qualifier] of [
      ['illustrative', 'illustrative example'],
      ['simulated', 'simulated case'],
    ]) {
      const qualified = fixture(
        `In this ${qualifier}, Acme output is 5 count during March among orders.`,
      );
      expect(
        parseExpansionQuantity({ ...qualified.raw, state, qualifier }, qualified.ctx),
      ).toMatchObject({ state, qualifier });
      expect(parseExpansionQuantity(qualified.raw, qualified.ctx)).toBeNull();
    }
    const disputed = fixture(
      'Acme output is disputed between 5 and 7 count during March among orders.',
    );
    const raw = {
      ...missingAmount(disputed.raw),
      state: 'disputed',
      qualifier: 'disputed',
      alternatives: [amount(5), amount(7)],
    };
    expect(parseExpansionQuantity(raw, disputed.ctx)).toMatchObject({
      state: 'disputed',
      alternatives: [amount(5), amount(7)],
    });
    expect(
      parseExpansionQuantity({ ...raw, alternatives: [amount(5), amount(8)] }, disputed.ctx),
    ).toBeNull();
    expect(
      parseExpansionQuantity(
        { ...raw, alternatives: [amount(5), amount(7), amount(9)] },
        disputed.ctx,
      ),
    ).toBeNull();
  });

  it('reuses exact minor-unit money and rejects currency or amount mismatch', () => {
    const { raw, ctx } = fixture('Acme output is $12.50 USD during March among orders.');
    const supported = {
      ...raw,
      basis: { unit: 'USD', period: 'March', population: 'orders' },
      amount: { kind: 'money', value: { currency: 'USD', minorUnits: 1250 } },
    };
    expect(parseExpansionQuantity(supported, ctx)).toMatchObject({ amount: supported.amount });
    for (const money of [
      { currency: 'EUR', minorUnits: 1250 },
      { currency: 'USD', minorUnits: 1251 },
      { currency: 'USD', minorUnits: 12.5 },
      { currency: 'USD', minorUnits: Number.POSITIVE_INFINITY },
    ])
      expect(
        parseExpansionQuantity({ ...supported, amount: { kind: 'money', value: money } }, ctx),
      ).toBeNull();
    expect(
      parseExpansionQuantity(
        { ...supported, basis: { unit: 'count', period: 'March', population: 'orders' } },
        ctx,
      ),
    ).toBeNull();
  });

  it('retains signed exact minor-unit money through the shared source contract, never another amount or zero', () => {
    const { raw } = fixture('Acme output is -12.50 USD during March among orders.');
    const supported = {
      ...raw,
      basis: { unit: 'USD', period: 'March', population: 'orders' },
      amount: { kind: 'money', value: { currency: 'USD', minorUnits: -1250 } },
    };
    for (const notation of ['-12.50', '-$12.50', '$-12.50']) {
      const fresh = fixture(`Acme output is ${notation} USD during March among orders.`);
      expect(parseExpansionQuantity(supported, fresh.ctx)).toMatchObject({
        amount: { ...supported.amount, notation },
      });
      expect(fresh.ctx.issues).toEqual([]);
    }
    for (const minorUnits of [1250, 0, -1251, -12.5, -1_000_000_001, Number.NEGATIVE_INFINITY]) {
      const fresh = fixture('Acme output is -12.50 USD during March among orders.');
      expect(
        parseExpansionQuantity(
          { ...supported, amount: { kind: 'money', value: { currency: 'USD', minorUnits } } },
          fresh.ctx,
        ),
      ).toBeNull();
    }
    const positive = fixture('Acme output is 12.50 USD during March among orders.');
    expect(parseExpansionQuantity(supported, positive.ctx)).toBeNull();
  });

  it('rejects nonfinite/overflow/incompatible units, unknown fields and malformed amounts at the boundary', () => {
    for (const change of [
      { state: { toString: 'known' } },
      { amount: { ...amount(5), notation: 'invented format' } },
      { amount: amount(Number.NaN) },
      { amount: amount(Number.POSITIVE_INFINITY) },
      { amount: amount(1_000_000_001) },
      { amount: amount(5, 0) },
      { amount: { kind: 'expression', code: '5' } },
      { url: 'https://example.test' },
      { svg: '<svg/>' },
      { basis: { unit: 'custom', period: 'March', population: 'orders' } },
      { basis: { unit: 'count', period: '', population: 'orders' } },
    ]) {
      const { raw, ctx } = fixture();
      expect(parseExpansionQuantity({ ...raw, ...change }, ctx)).toBeNull();
    }
  });
});
