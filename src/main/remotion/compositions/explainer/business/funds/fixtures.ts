import {
  FUNDS_CARRIER_LABELS,
  parseDistributionWaterfallScene,
  parseFundLifecycleScene,
  parseFundLiquidityScene,
} from '../../../../../ai/explainer/business-funds-contract';
import { moneyText } from '../../../../../ai/explainer/finance-contract';
import {
  isRec,
  makeParseContext,
  type PlannerWord,
  type Rec,
  type SceneWindow,
} from '../../../../../ai/explainer/kind-spec';
import type { Currency } from '../../finance/types';
import type { BusinessWordSpan } from '../types';
import { type FundsRecipeId, type FundsState, FUNDS_METRICS as M } from './types';

export interface FundsSourceFixture {
  id: FundsRecipeId;
  name: string;
  raw: Rec;
  words: PlannerWord[];
  window: SceneWindow;
}
export interface FundsFixtureOptions {
  name?: string;
  currency?: Currency;
  period?: string;
  denominator?: number | null;
  qualification?: { metric: string; state: FundsState; condition?: string; period?: string };
  tierAmounts?: readonly number[];
  tierCeilings?: readonly number[];
  proceedsMinor?: number;
  retainedMinor?: number;
  unknownTier?: number;
  unknownRetained?: boolean;
  costsMinor?: readonly number[];
  grossMinor?: number;
  netMinor?: number;
  remainderMinor?: number;
  committedMinor?: number;
  calledMinor?: number;
  contributedMinor?: number;
  deployedMinor?: number;
  closingState?: 'closed' | 'pending' | 'unknown' | 'negative';
  periodCount?: number;
  interval?: boolean;
  capMinor?: number;
  cashMinor?: number;
  requests?: readonly {
    name: string;
    state: 'pending' | 'fulfilled' | 'negative' | 'unknown';
    minorUnits: number;
    amountState?: FundsState;
  }[];
}
/** Authored synthetic speech. Mutable span offsets are finalized once, then JSON-cloned. */
class FundsSpeech {
  private phases: string[][] = [[], [], [], [], []];
  private spans: { phase: number; span: BusinessWordSpan }[] = [];
  readonly operator = 'Mara';
  constructor(
    readonly fund: string,
    readonly options: FundsFixtureOptions,
  ) {}
  say(phase: number, clause: string): BusinessWordSpan {
    const tokens = clause.split(/\s+/u),
      span = {
        fromWord: this.phases[phase].length,
        toWord: this.phases[phase].length + tokens.length - 1,
      };
    this.phases[phase].push(...tokens);
    this.spans.push({ phase, span });
    return span;
  }
  identity(label: string, clause: string) {
    return { id: label.toLowerCase(), label, source: this.say(0, clause) };
  }
  amount(
    metric: string,
    minor: number,
    extra: { population?: string; period?: string; state?: FundsState } = {},
  ): Rec {
    const qualification =
      this.options.qualification?.metric === metric ? this.options.qualification : undefined;
    const state = qualification?.state ?? extra.state ?? 'source-stated';
    const condition =
      state === 'conditional' ? (qualification?.condition ?? 'If council approves') : null;
    const code = this.options.currency ?? 'USD',
      period = qualification?.period ?? extra.period ?? this.options.period ?? 'July',
      population = extra.population ?? 'funds';
    const denominator = this.options.denominator === undefined ? 1 : this.options.denominator;
    const ending =
      denominator === null
        ? `with unknown ${population} denominator`
        : `per ${denominator} ${population}`;
    const suffix = `during ${period} ${ending}`,
      monetary = { minorUnits: minor, currency: code };
    const body =
      state === 'negative'
        ? `${this.fund} does not hold ${metric} in ${code} ${suffix}.`
        : state === 'pending' || state === 'unknown'
          ? `${this.fund} states ${metric} is ${state} in ${code} ${suffix}.`
          : `${this.fund} ${state === 'conditional' ? 'would state' : 'states'} ${metric} is ${moneyText(monetary)} ${suffix}.`;
    const source = this.say(2, condition ? `${condition}, ${body}` : body);
    let basisSource = source;
    if (condition) {
      basisSource = {
        fromWord: source.fromWord + condition.split(/\s+/u).length,
        toWord: source.toWord,
      };
      this.spans.push({ phase: 2, span: basisSource });
    } else if (state !== 'source-stated')
      basisSource = this.say(2, `${this.fund} states ${metric} basis is ${code} ${suffix}.`);
    return {
      state,
      amount: state === 'source-stated' || state === 'conditional' ? monetary : null,
      condition,
      source,
      basis: {
        subjectId: this.fund.toLowerCase(),
        population,
        unit: code,
        period,
        denominator,
        source: basisSource,
      },
    };
  }
  finish(
    id: FundsRecipeId,
    kind: string,
    preset: keyof typeof FUNDS_CARRIER_LABELS | 'gross-to-net',
    fields: Rec,
  ): FundsSourceFixture {
    const interval = id === 'OP-55' && this.options.interval !== false;
    const fund = this.identity(
      this.fund,
      `${this.fund} is ${interval ? 'an interval fund' : 'a fund'}.`,
    );
    const operator = this.identity(
      this.operator,
      `${this.operator} is the operator of ${this.fund}.`,
    );
    this.say(0, `${this.fund} accounts are separately stated.`);
    const carrierSource =
      preset === 'gross-to-net'
        ? null
        : this.say(1, `${this.fund} uses ${FUNDS_CARRIER_LABELS[preset]}.`);
    if (preset === 'gross-to-net') this.say(1, `${this.fund} reads complete stated costs.`);
    this.say(3, `${this.fund} checks the source accounts.`);
    const outcome = `${this.fund} accounts remain separate.`;
    const factSource = this.say(4, `${outcome}`);
    const offsets: number[] = [],
      words: PlannerWord[] = [],
      beats = [0.5, 1.8, 3.1, 4.4, 9.7],
      ends = [1.55, 2.8, 4.1, 9.4, 11.1];
    this.phases.forEach((phase, index) => {
      offsets.push(words.length);
      phase.forEach((token, position) => {
        const step = (ends[index] - beats[index]) / phase.length;
        const start = beats[index] + position * step;
        words.push({ text: token, start, end: start + step * 0.8 });
      });
    });
    for (const { phase, span } of this.spans) {
      span.fromWord += offsets[phase];
      span.toWord += offsets[phase];
    }
    const window = { startWord: 0, endWord: words.length - 1, startTime: 0.25, endTime: 11.4 };
    const raw: unknown = JSON.parse(
      JSON.stringify({
        kind,
        preset,
        visualMode: id === 'OP-52' ? 'diagram' : 'hybrid',
        label: `${this.fund} accounts`,
        subject: this.fund,
        outcome,
        evidence: 'illustrative',
        layout: 'stack',
        startWord: 0,
        endWord: window.endWord,
        setupWord: offsets[0],
        actionWord: offsets[1],
        responseWord: offsets[2],
        checkWord: offsets[3],
        resolveWord: offsets[4],
        ...(this.options.qualification?.state === 'conditional'
          ? { condition: this.options.qualification.condition ?? 'If council approves' }
          : {}),
        fund,
        operator,
        carrierSource,
        factEvidence: { state: 'source-stated', label: outcome, source: factSource },
        ...fields,
      }),
    );
    if (!isRec(raw)) throw new Error('Authored funds fixture must be a record');
    return { id, name: this.options.name ?? 'primary', raw, words, window };
  }
}
/** Concrete eight-recipe source builder, not a renderer selector or a general business DSL. */
export function createFundsFixture(
  id: FundsRecipeId,
  options: FundsFixtureOptions = {},
): FundsSourceFixture {
  const fund = {
    'OP-49': 'Atlas',
    'OP-50': 'Birch',
    'OP-51': 'Cedar',
    'OP-52': 'Dawn',
    'OP-53': 'Elm',
    'OP-54': 'Flint',
    'OP-55': 'Grove',
    'OP-56': 'Harbor',
  }[id];
  const speech = new FundsSpeech(fund, options),
    period = options.period ?? 'July';
  switch (id) {
    case 'OP-49':
      return speech.finish(id, 'fund-lifecycle', 'capital-states', {
        committed: speech.amount(M.committed, options.committedMinor ?? 10000),
        called: speech.amount(M.called, options.calledMinor ?? 6000),
        contributed: speech.amount(M.contributed, options.contributedMinor ?? 5000),
        deployed: speech.amount(M.deployed, options.deployedMinor ?? 3000),
        retained: speech.amount(M.retained, options.retainedMinor ?? 2000),
      });
    case 'OP-50': {
      const state = options.closingState ?? 'closed';
      const closing =
        state === 'closed'
          ? `${fund} closed subscriptions on ${period}.`
          : state === 'negative'
            ? `${fund} did not close subscriptions on ${period}.`
            : `${fund} states subscription close is ${state} on ${period}.`;
      return speech.finish(id, 'fund-lifecycle', 'subscriptions-and-close', {
        subscriptions: speech.amount(M.subscriptions, 10000),
        uncalled: speech.amount(M.uncalled, 7000),
        cash: speech.amount(M.cash, 0, { state: 'unknown' }),
        closing: { state, date: period, source: speech.say(1, closing) },
      });
    }
    case 'OP-51': {
      const paid = options.tierAmounts ?? [3000, 2000],
        ceilings = options.tierCeilings ?? [3000, 4000];
      const tiers = paid.map((minor, index) => {
        const label = ['First', 'Second', 'Third', 'Fourth', 'Fifth'][index] ?? 'Excess';
        return {
          identity: speech.identity(label, `${label} is a distribution tier at ${fund}.`),
          priority: index + 1,
          prioritySource: speech.say(
            1,
            `${fund} states priority ${index + 1} belongs to ${label}.`,
          ),
          ceiling: speech.amount(`${label} ceiling`, ceilings[index]),
          allocation: speech.amount(`${label} distribution`, minor, {
            state: options.unknownTier === index ? 'unknown' : 'source-stated',
          }),
        };
      });
      return speech.finish(id, 'distribution-waterfall', 'stated-priority-tiers', {
        proceeds: speech.amount(M.proceeds, options.proceedsMinor ?? 7000),
        retained: speech.amount(M.distributionRetained, options.retainedMinor ?? 2000, {
          state: options.unknownRetained ? 'unknown' : 'source-stated',
        }),
        tiers,
      });
    }
    case 'OP-52': {
      const costs = (options.costsMinor ?? [1000, 500]).map((minor, index) => {
        const label = ['Review', 'Admin', 'Custody', 'Extra'][index];
        return {
          identity: speech.identity(label, `${label} is a stated cost at ${fund}.`),
          amount: speech.amount(`${label} cost`, minor),
        };
      });
      return speech.finish(id, 'distribution-waterfall', 'gross-to-net', {
        gross: speech.amount(M.gross, options.grossMinor ?? 10000),
        net: speech.amount(M.net, options.netMinor ?? 8000),
        remainder: speech.amount(M.remainder, options.remainderMinor ?? 500),
        costs,
        costsSource: speech.say(
          3,
          `${fund} states ${costs.map((cost) => cost.identity.label).join(' and ')} are the complete stated costs.`,
        ),
      });
    }
    case 'OP-53': {
      const periods = Array.from({ length: options.periodCount ?? 3 }, (_, index) => {
        const label = ['First', 'Second', 'Third', 'Fourth', 'Fifth'][index],
          date = ['June', 'July', 'August', 'September', 'October'][index];
        const account = index === 0 ? 'committed' : index === 1 ? 'contributed' : 'deployed';
        return {
          identity: speech.identity(
            label,
            `${fund} records ${label} as a source period dated ${date}.`,
          ),
          date,
          account,
          value: speech.amount(`${label} ${M[account]}`, [10000, 5000, 3000, 1000, 500][index], {
            period: date,
          }),
        };
      });
      return speech.finish(id, 'fund-lifecycle', 'source-periods', { periods });
    }
    case 'OP-54':
      return speech.finish(id, 'fund-lifecycle', 'retained-follow-on-capital', {
        retained: speech.amount(M.retained, options.retainedMinor ?? 5000),
        allocated: speech.amount(M.allocated, 2000),
        remaining: speech.amount(M.remaining, 3000),
      });
    case 'OP-55': {
      const requests = (
        options.requests ?? [
          { name: 'Ena', state: 'pending', minorUnits: 1000 },
          { name: 'Bo', state: 'fulfilled', minorUnits: 500 },
        ]
      ).map((request) => ({
        identity: speech.identity(
          request.name,
          `${request.name} has a repurchase request at ${fund}.`,
        ),
        state: request.state,
        source: speech.say(
          3,
          `${fund} states ${request.name}'s repurchase request is ${request.state} during ${period}.`,
        ),
        amount: speech.amount(`${request.name}'s repurchase request`, request.minorUnits, {
          state: request.amountState,
        }),
      }));
      return speech.finish(id, 'fund-liquidity', 'periodic-repurchase', {
        window: {
          label: period,
          source: speech.say(1, `${fund} states repurchase window is ${period}.`),
        },
        cap: speech.amount(M.cap, options.capMinor ?? 2000),
        cash: speech.amount(M.cash, options.cashMinor ?? 4000),
        requests,
      });
    }
    case 'OP-56':
      return speech.finish(id, 'fund-liquidity', 'valuation-cash-distinction', {
        valuation: speech.amount(M.valuation, 50000, { population: 'assets' }),
        cash: speech.amount(M.cash, options.cashMinor ?? 1000, { population: 'cash accounts' }),
      });
  }
}
export function fundsFixtureContext(fixture: FundsSourceFixture) {
  return makeParseContext(fixture.words, fixture.window);
}
export function parseFundsFixture(fixture: FundsSourceFixture) {
  const ctx = fundsFixtureContext(fixture);
  const scene =
    fixture.raw.kind === 'fund-lifecycle'
      ? parseFundLifecycleScene(fixture.raw, ctx)
      : fixture.raw.kind === 'distribution-waterfall'
        ? parseDistributionWaterfallScene(fixture.raw, ctx)
        : fixture.raw.kind === 'fund-liquidity'
          ? parseFundLiquidityScene(fixture.raw, ctx)
          : null;
  return { scene, issues: ctx.issues };
}
export const FUNDS_SOURCE_FIXTURES: readonly FundsSourceFixture[] = [
  'OP-49',
  'OP-50',
  'OP-51',
  'OP-52',
  'OP-53',
  'OP-54',
  'OP-55',
  'OP-56',
].map((id) => {
  if (
    id !== 'OP-49' &&
    id !== 'OP-50' &&
    id !== 'OP-51' &&
    id !== 'OP-52' &&
    id !== 'OP-53' &&
    id !== 'OP-54' &&
    id !== 'OP-55' &&
    id !== 'OP-56'
  )
    throw new Error('Unknown funds recipe');
  return createFundsFixture(id);
});
export const FUNDS_ACCEPTED_VARIANTS: readonly FundsSourceFixture[] = [
  createFundsFixture('OP-51', {
    name: 'zero ceiling followed by paid tier',
    tierAmounts: [0, 1000],
    tierCeilings: [0, 1000],
    proceedsMinor: 1000,
    retainedMinor: 0,
  }),
  createFundsFixture('OP-51', {
    name: 'partial tier with retained cent remainder',
    tierAmounts: [3000, 1999],
    tierCeilings: [3000, 4000],
    proceedsMinor: 7000,
    retainedMinor: 2001,
  }),
  createFundsFixture('OP-51', { name: 'unknown retained is not zero', unknownRetained: true }),
  createFundsFixture('OP-51', { name: 'unknown allocation remains labelled', unknownTier: 1 }),
  createFundsFixture('OP-54', {
    name: 'conditional follow-on is not cash paid',
    qualification: { metric: M.allocated, state: 'conditional', condition: 'If council approves' },
  }),
  createFundsFixture('OP-49', {
    name: 'conditional call is not a contribution',
    qualification: { metric: M.called, state: 'conditional' },
  }),
  createFundsFixture('OP-49', {
    name: 'negative contribution is not zero cash',
    qualification: { metric: M.contributed, state: 'negative' },
  }),
  createFundsFixture('OP-49', {
    name: 'unknown cash retains known source labels',
    qualification: { metric: M.retained, state: 'unknown' },
  }),
  createFundsFixture('OP-50', {
    name: 'pending close retains unavailable cash',
    closingState: 'pending',
  }),
  createFundsFixture('OP-50', { name: 'negative close stays negative', closingState: 'negative' }),
  createFundsFixture('OP-56', {
    name: 'NAV with unknown cash',
    qualification: { metric: M.cash, state: 'unknown' },
  }),
  createFundsFixture('OP-55', {
    name: 'zero cap permits pending request but no exit',
    capMinor: 0,
    requests: [{ name: 'Ena', state: 'pending', minorUnits: 1000 }],
  }),
  createFundsFixture('OP-55', {
    name: 'unknown and denied request remain separate',
    requests: [
      { name: 'Ena', state: 'unknown', minorUnits: 1000 },
      { name: 'Bo', state: 'negative', minorUnits: 500 },
    ],
  }),
  createFundsFixture('OP-49', {
    name: 'exact money cap',
    committedMinor: 100000000000,
    calledMinor: 100000000000,
    contributedMinor: 100000000000,
    deployedMinor: 99999999999,
    retainedMinor: 1,
  }),
  createFundsFixture('OP-52', {
    name: 'EUR cent remainder',
    currency: 'EUR',
    remainderMinor: 501,
    netMinor: 7999,
  }),
  createFundsFixture('OP-54', {
    name: 'conditional reporting May',
    qualification: { metric: M.allocated, state: 'conditional', period: 'May' },
  }),
  createFundsFixture('OP-56', {
    name: 'unknown denominator stays incomparable',
    denominator: null,
  }),
];
export const FUNDS_RESOURCE_FIXTURES: readonly FundsSourceFixture[] = [
  createFundsFixture('OP-51', {
    name: 'four source priorities',
    tierAmounts: [1000, 1000, 1000, 1000],
    tierCeilings: [1000, 1000, 1000, 1000],
    proceedsMinor: 5000,
    retainedMinor: 1000,
  }),
  createFundsFixture('OP-52', {
    name: 'three stated costs',
    costsMinor: [1000, 500, 500],
    netMinor: 7500,
  }),
  createFundsFixture('OP-53', { name: 'four dated snapshots', periodCount: 4 }),
  createFundsFixture('OP-55', {
    name: 'four pending source requests',
    requests: ['Ena', 'Bo', 'Cy', 'Di'].map((name) => ({
      name,
      state: 'pending',
      minorUnits: 1000,
    })),
  }),
];
