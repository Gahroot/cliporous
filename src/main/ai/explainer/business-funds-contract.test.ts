import { describe, expect, it } from 'vitest';
import {
  createFundsFixture,
  FUNDS_ACCEPTED_VARIANTS,
  FUNDS_SOURCE_FIXTURES,
  type FundsSourceFixture,
  fundsFixtureContext,
  parseFundsFixture,
} from '../../remotion/compositions/explainer/business/funds/fixtures';
import {
  fundsAmounts,
  fundsObserved,
  FUNDS_METRICS as M,
} from '../../remotion/compositions/explainer/business/funds/types';
import {
  parseDistributionWaterfallScene,
  parseFundLifecycleScene,
  parseFundLiquidityScene,
} from './business-funds-contract';
import { isRec, type Rec } from './kind-spec';

function at(fixture: FundsSourceFixture, ...path: string[]): Rec {
  let value: unknown = fixture.raw;
  for (const key of path) {
    if (Array.isArray(value)) value = value[Number(key)];
    else if (isRec(value)) value = value[key];
    else throw new Error(`Invalid fixture path ${path.join('.')}`);
  }
  if (!isRec(value)) throw new Error(`Expected fixture record at ${path.join('.')}`);
  return value;
}
function reject(fixture: FundsSourceFixture): void {
  const result = parseFundsFixture(fixture);
  expect(result.scene).toBeNull();
  expect(result.issues.length).toBeGreaterThan(0);
}
function replaceInSpan(fixture: FundsSourceFixture, span: Rec, from: string, to: string): void {
  if (typeof span.fromWord !== 'number' || typeof span.toWord !== 'number')
    throw new Error('Invalid span');
  let changed = false;
  for (let index = span.fromWord; index <= span.toWord; index++)
    if (fixture.words[index].text === from) {
      fixture.words[index].text = to;
      changed = true;
      break;
    }
  if (!changed) throw new Error(`Missing authored token ${from}`);
}
const primaryAmounts = [
  { id: 'OP-49', path: ['contributed'] },
  { id: 'OP-50', path: ['subscriptions'] },
  { id: 'OP-51', path: ['tiers', '0', 'allocation'] },
  { id: 'OP-52', path: ['costs', '0', 'amount'] },
  { id: 'OP-53', path: ['periods', '0', 'value'] },
  { id: 'OP-54', path: ['allocated'] },
  { id: 'OP-55', path: ['requests', '0', 'amount'] },
  { id: 'OP-56', path: ['valuation'] },
] as const;
function primary(id: string): FundsSourceFixture {
  const fixture = FUNDS_SOURCE_FIXTURES.find((item) => item.id === id);
  if (!fixture) throw new Error('Missing primary');
  return structuredClone(fixture);
}
describe('concrete funds source contracts', () => {
  it.each(
    primaryAmounts,
  )('$id binds money to its actual actor/action/value/currency/period/population/denominator', ({
    id,
    path,
  }) => {
    for (const mutation of [
      'actor',
      'action',
      'value',
      'currency',
      'period',
      'population',
      'denominator',
      'basis-source',
      'cropped',
      'opaque-field',
    ]) {
      const fixture = primary(id),
        value = at(fixture, ...path),
        basis = at(fixture, ...path, 'basis'),
        money = at(fixture, ...path, 'amount');
      switch (mutation) {
        case 'actor':
          replaceInSpan(
            fixture,
            at(fixture, ...path, 'source'),
            String(fixture.raw.subject),
            'Impostor',
          );
          break;
        case 'action': {
          const span = at(fixture, ...path, 'source');
          replaceInSpan(fixture, span, 'states', 'predicts');
          break;
        }
        case 'value':
          money.minorUnits = Number(money.minorUnits) + 1;
          break;
        case 'currency':
          money.currency = 'GBP';
          break;
        case 'period':
          basis.period = 'September';
          break;
        case 'population':
          basis.population = 'investors';
          break;
        case 'denominator':
          basis.denominator = 2;
          break;
        case 'basis-source':
          basis.source = structuredClone(at(fixture, 'fund', 'source'));
          break;
        case 'cropped': {
          const span = at(fixture, ...path, 'source');
          span.fromWord = Number(span.fromWord) + 1;
          break;
        }
        case 'opaque-field':
          value.payoutAlgorithm = 'invent';
          break;
      }
      reject(fixture);
    }
  });
  it.each(
    FUNDS_SOURCE_FIXTURES,
  )('$id rejects extra fields, role swaps, malformed beats and missing asset evidence', (fixture) => {
    for (const mutation of ['root', 'identity', 'role', 'beats', 'carrier', 'money-flow']) {
      const copy = structuredClone(fixture);
      switch (mutation) {
        case 'root':
          copy.raw.renderer = 'user supplied code';
          break;
        case 'identity':
          at(copy, 'operator').id = at(copy, 'fund').id;
          break;
        case 'role':
          at(copy, 'operator').source = structuredClone(at(copy, 'fund', 'source'));
          break;
        case 'beats':
          copy.raw.responseWord = copy.raw.actionWord;
          break;
        case 'carrier':
          copy.raw.carrierSource =
            copy.id === 'OP-52' ? structuredClone(at(copy, 'fund', 'source')) : null;
          break;
        case 'money-flow':
          copy.raw.transfer = { payment: true };
          break;
      }
      reject(copy);
    }
  });
  it.each([
    NaN,
    Infinity,
    -Infinity,
    -1,
    0.5,
    100_000_000_001,
    Number.MAX_SAFE_INTEGER,
  ])('rejects nonfinite/negative/fractional/overflow minorUnits %s', (minor) => {
    const fixture = primary('OP-49');
    at(fixture, 'contributed', 'amount').minorUnits = minor;
    reject(fixture);
  });
  it.each(['JPY', 'usd', '', null])('rejects unsupported currency %s', (code) => {
    const fixture = primary('OP-49');
    at(fixture, 'contributed', 'amount').currency = code;
    reject(fixture);
  });
  it.each([
    { id: 'OP-49', options: { contributedMinor: 5001 } },
    { id: 'OP-49', options: { calledMinor: 11000 } },
    { id: 'OP-51', options: { proceedsMinor: 5001 } },
    {
      id: 'OP-51',
      options: {
        tierAmounts: [2500, 500],
        tierCeilings: [2000, 3000],
        proceedsMinor: 5000,
        retainedMinor: 2000,
      },
    },
    {
      id: 'OP-51',
      options: {
        tierAmounts: [999, 1],
        tierCeilings: [1000, 1000],
        proceedsMinor: 1000,
        retainedMinor: 0,
      },
    },
    { id: 'OP-52', options: { remainderMinor: 1 } },
    { id: 'OP-54', options: { retainedMinor: 2001 } },
    { id: 'OP-55', options: { interval: false } },
    { id: 'OP-55', options: { capMinor: 0 } },
    { id: 'OP-55', options: { cashMinor: 0 } },
  ] as const)('$id rejects source-built unsupported conservation/cap/fund-type $options', ({
    id,
    options,
  }) => reject(createFundsFixture(id, options)));
  it('rejects duplicate costs, priorities, request owners and snapshots without hiding a fact', () => {
    for (const [id, field] of [
      ['OP-51', 'tiers'],
      ['OP-52', 'costs'],
      ['OP-53', 'periods'],
      ['OP-55', 'requests'],
    ] as const) {
      const fixture = primary(id),
        entries = fixture.raw[field];
      if (!Array.isArray(entries)) throw new Error('Missing records');
      entries[1] = structuredClone(entries[0]);
      reject(fixture);
    }
    const fixture = primary('OP-51');
    at(fixture, 'tiers', '1').priority = 1;
    reject(fixture);
  });
  it('rejects condition omission/swap, cropped modal body and promoting a contingent amount to cash', () => {
    const accepted = createFundsFixture('OP-54', {
      qualification: { metric: M.allocated, state: 'conditional' },
    });
    for (const mutation of [
      'story-omission',
      'fact-omission',
      'condition-swap',
      'promotion',
      'crop',
      'body-source-swap',
    ]) {
      const fixture = structuredClone(accepted),
        allocated = at(fixture, 'allocated');
      switch (mutation) {
        case 'story-omission':
          delete fixture.raw.condition;
          break;
        case 'fact-omission':
          allocated.condition = null;
          break;
        case 'condition-swap':
          allocated.condition = 'If council rejects';
          break;
        case 'promotion':
          allocated.state = 'source-stated';
          allocated.condition = null;
          break;
        case 'crop': {
          const source = at(fixture, 'allocated', 'source');
          source.fromWord = Number(source.fromWord) + 3;
          break;
        }
        case 'body-source-swap':
          at(fixture, 'allocated', 'basis').source = structuredClone(
            at(fixture, 'retained', 'source'),
          );
          break;
      }
      reject(fixture);
    }
  });
  it('preserves complete contingent values without arithmetic or satisfying the condition', () => {
    const fixture = createFundsFixture('OP-54', {
      retainedMinor: 1,
      qualification: { metric: M.allocated, state: 'conditional' },
    });
    const { scene, issues } = parseFundsFixture(fixture);
    if (!scene || scene.preset !== 'retained-follow-on-capital') throw new Error(issues.join('; '));
    expect(scene.allocated.amount?.minorUnits).toBe(2000);
    expect(scene.allocated.condition).toBe('If council approves');
    expect(fundsObserved(scene.allocated)).toBe(false);
    expect(scene.retained.amount?.minorUnits).toBe(1);
  });
  it.each([
    'unknown',
    'negative',
    'pending',
  ] as const)('never promotes %s source amounts to zero cash', (state) => {
    const fixture = createFundsFixture('OP-49', {
      qualification: { metric: M.contributed, state },
    });
    const accepted = parseFundsFixture(fixture);
    expect(accepted.scene).not.toBeNull();
    const copy = structuredClone(fixture);
    at(copy, 'contributed').amount = { currency: 'USD', minorUnits: 0 };
    reject(copy);
  });
  it('rejects source period relabeling, NAV account merge and request state/owner/window swaps', () => {
    const periods = primary('OP-53');
    at(periods, 'periods', '0').date = 'August';
    reject(periods);
    const nav = primary('OP-56');
    at(nav, 'cash', 'basis').population = 'assets';
    reject(nav);
    for (const key of ['state', 'source', 'period', 'window']) {
      const fixture = primary('OP-55');
      if (key === 'state') at(fixture, 'requests', '0').state = 'fulfilled';
      if (key === 'source')
        at(fixture, 'requests', '0').source = structuredClone(
          at(fixture, 'requests', '1', 'source'),
        );
      if (key === 'period') at(fixture, 'requests', '0', 'amount', 'basis').period = 'August';
      if (key === 'window') at(fixture, 'window').label = 'August';
      reject(fixture);
    }
  });
  it('rejects fulfilled requests backed only by unknown cash or contingent request amounts', () => {
    reject(createFundsFixture('OP-55', { qualification: { metric: M.cash, state: 'unknown' } }));
    reject(
      createFundsFixture('OP-55', {
        qualification: { metric: "Bo's repurchase request", state: 'conditional' },
      }),
    );
  });
  it('keeps unknown retained explicitly null instead of using conservesMoney default zero', () => {
    const fixture = createFundsFixture('OP-51', { unknownRetained: true });
    const { scene, issues } = parseFundsFixture(fixture);
    if (!scene || scene.preset !== 'stated-priority-tiers') throw new Error(issues.join('; '));
    expect(scene.retained.amount).toBeNull();
    expect(fundsAmounts(scene).every(fundsObserved)).toBe(false);
  });
  it.each([
    null,
    7,
    [],
    { padding: 'x'.repeat(17000) },
    { padding: 'x'.repeat(513) },
    { padding: Array.from({ length: 13 }, () => 0) },
    { padding: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } },
  ])('bounded input fails closed before interpreting untrusted fields %#', (raw) => {
    for (const parse of [
      parseFundLifecycleScene,
      parseDistributionWaterfallScene,
      parseFundLiquidityScene,
    ]) {
      const ctx = fundsFixtureContext(primary('OP-49'));
      expect(parse(raw, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
  it('rejects cycles/shared object input and overlong local spans', () => {
    const fixture = primary('OP-49');
    fixture.raw.circular = fixture.raw;
    reject(fixture);
    const copy = primary('OP-49');
    copy.raw.contributed = copy.raw.called;
    reject(copy);
    const long = primary('OP-49');
    const span = at(long, 'contributed', 'source');
    span.toWord = Number(span.fromWord) + 64;
    reject(long);
  });
  it('rejects complexity above source-gated 8 entities/12 edges/4 holds and rejects insufficient windows', () => {
    reject(
      createFundsFixture('OP-51', {
        tierAmounts: [1, 1, 1, 1, 1],
        tierCeilings: [1, 1, 1, 1, 1],
        proceedsMinor: 5,
        retainedMinor: 0,
      }),
    );
    reject(createFundsFixture('OP-53', { periodCount: 5 }));
    const fixture = primary('OP-55');
    fixture.window.endTime = fixture.window.startTime + 4;
    reject(fixture);
    const tooLong = primary('OP-49');
    tooLong.window.endTime = 13;
    reject(tooLong);
    const noHold = primary('OP-49');
    noHold.window.endTime = 10.1;
    reject(noHold);
    const op52 = primary('OP-52');
    op52.raw.visualMode = 'hybrid';
    reject(op52);
  });
  it('every authored accepted qualification remains source-identical after parsing', () => {
    for (const fixture of FUNDS_ACCEPTED_VARIANTS) {
      const before = structuredClone(fixture);
      expect(parseFundsFixture(fixture).scene).not.toBeNull();
      expect(fixture).toEqual(before);
    }
  });
});
