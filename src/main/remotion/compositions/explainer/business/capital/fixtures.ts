import {
  isRec,
  makeParseContext,
  type ParseContext,
  type PlannerWord,
  type Rec,
} from '../../../../../ai/explainer/kind-spec';
import type { BusinessWordSpan } from '../types';
import type { CapitalFactState, CapitalRecipeId } from './types';

export interface CapitalSourceFixture {
  id: CapitalRecipeId;
  raw: Rec;
  words: PlannerWord[];
}
/** Authored financial speech only. No imported task/order grammar or real investment advice. */
class Speech {
  private phases: string[][] = [[], [], [], [], []];
  private sources: { phase: number; span: BusinessWordSpan }[] = [];
  readonly company = 'Atlas';
  readonly period = 'July';
  private companySource: BusinessWordSpan;
  constructor(role = 'company') {
    this.companySource = this.say(0, `Atlas is ${role}.`);
    this.say(0, 'Atlas opens source facts for July.');
  }
  say(phase: number, text: string): BusinessWordSpan {
    const tokens = text.split(/\s+/u);
    const span = {
      fromWord: this.phases[phase].length,
      toWord: this.phases[phase].length + tokens.length - 1,
    };
    this.phases[phase].push(...tokens);
    this.sources.push({ phase, span });
    return span;
  }
  identity(label: string, role: string) {
    return {
      id: label.toLowerCase().replace(/\s+/gu, '-'),
      label,
      source: this.say(0, `${label} is ${role}.`),
    };
  }
  statement(phase: number, state: string, text: string) {
    return { state, label: text.replace(/[.]$/u, ''), source: this.say(phase, text) };
  }
  evidence(phase: number, label: string, text: string) {
    return { state: 'source-stated', label, source: this.say(phase, text) };
  }
  body(full: BusinessWordSpan, condition?: string) {
    if (!condition) return full;
    const span = { fromWord: full.fromWord + condition.split(/\s+/u).length, toWord: full.toWord };
    this.sources.push({ phase: 2, span });
    return span;
  }
  basis(source: BusinessWordSpan, population: string, unit: string, denominator: number | null) {
    return { subjectId: 'atlas', population, unit, period: 'July', denominator, source };
  }
  money(
    metric: string,
    minor: number | null,
    state: CapitalFactState = minor === null ? 'unknown' : 'source-stated',
    population = 'investors',
    denominator: number | null = 4,
  ) {
    const amount =
      minor === null ? `${state === 'negative' ? 'absent' : 'unknown'} USD` : `${minor / 100} USD`;
    const ending =
      denominator === null
        ? `with unknown ${population} denominator`
        : `per ${denominator} ${population}`;
    const source = this.say(2, `Atlas records ${metric} ${amount} during July ${ending}.`);
    return {
      state,
      money: minor === null ? null : { currency: 'USD', minorUnits: minor },
      basis: this.basis(source, population, 'USD', denominator),
      source,
    };
  }
  ownership(shares = 40, total = 100, percent = 40) {
    const source = this.say(
      2,
      `Ada owns ${shares} of ${total} shares in Atlas at ${percent} percent during July per ${total} shares.`,
    );
    return { shares, total, percent, basis: this.basis(source, 'shares', 'shares', total), source };
  }
  finish(
    id: CapitalRecipeId,
    kind: string,
    preset: string,
    details: Rec,
    model: string | null,
    condition?: string,
  ): CapitalSourceFixture {
    const modelSource = model ? this.say(1, model) : null;
    this.say(1, 'Atlas inspects source facts.');
    this.say(3, 'Atlas checks source facts.');
    this.say(4, 'Source facts remain distinct.');
    this.say(4, 'Atlas retains the stated source labels.');
    let offset = 0;
    const offsets = this.phases.map((tokens) => {
      const from = offset;
      offset += tokens.length;
      return from;
    });
    for (const { phase, span } of this.sources) {
      span.fromWord += offsets[phase];
      span.toWord += offsets[phase];
    }
    const timing = [
      [0.3, 0.9],
      [1.2, 2.1],
      [2.4, 5.8],
      [6.2, 8.4],
      [9.6, 11.3],
    ];
    const words = this.phases.flatMap((tokens, phase) =>
      tokens.map((text, index) => {
        const [start, end] = timing[phase],
          step = (end - start) / tokens.length;
        return { text, start: start + index * step, end: start + (index + 1) * step };
      }),
    );
    const raw: Rec = {
      kind,
      preset,
      visualMode: 'diagram',
      evidence: 'source-stated',
      label: 'source facts',
      subject: 'Atlas',
      outcome: 'Source facts remain distinct',
      company: { id: 'atlas', label: 'Atlas', source: this.companySource },
      period: 'July',
      modelSource,
      startWord: 0,
      endWord: words.length - 1,
      setupWord: offsets[0],
      actionWord: offsets[1],
      responseWord: offsets[2],
      checkWord: offsets[3],
      resolveWord: offsets[4],
      layout: 'stack',
      ...(condition ? { condition } : {}),
      ...details,
    };
    // Real JSON tree: no shared span object identity (the bounded input rejects graphs).
    const tree: unknown = JSON.parse(JSON.stringify(raw));
    if (!isRec(tree)) throw new Error('Invalid authored fixture');
    return { id, raw: tree, words };
  }
}
export function capitalRightsFixture(
  options: {
    payout?: number | null;
    payoutState?: 'source-stated' | 'unknown' | 'negative';
    control?: 'source-stated' | 'unknown' | 'negative';
    priority?: 'source-stated' | 'unknown';
  } = {},
): CapitalSourceFixture {
  const s = new Speech('financial asset');
  const holder = s.identity('Ada', 'share and claim holder'),
    claim = s.identity('Pref', 'economic claim');
  const claimEvidence = s.evidence(
    1,
    'Ada holds Pref on Atlas',
    'Ada holds Pref on Atlas during July.',
  );
  const ownership = s.ownership();
  const controlState = options.control ?? 'negative';
  const control = s.statement(
    2,
    controlState,
    controlState === 'negative'
      ? 'Ada does not control Atlas during July.'
      : controlState === 'unknown'
        ? 'Ada control of Atlas is unknown during July.'
        : 'Ada controls Atlas during July.',
  );
  const priorityState = options.priority ?? 'unknown';
  const priority = s.statement(
    3,
    priorityState,
    priorityState === 'unknown'
      ? 'Pref payout priority in Atlas is unknown during July.'
      : 'Pref has stated payout priority before shares in Atlas during July.',
  );
  const payout = s.money(
    'Pref payout',
    options.payout === undefined ? null : options.payout,
    options.payoutState,
  );
  return s.finish(
    'OP-57',
    'economic-rights',
    'ownership-versus-claims',
    { holder, claim, claimEvidence, ownership, control, priority, payout },
    'Atlas maintains asset ownership and economic claim records.',
  );
}
export function capitalClaimAssetFixture(
  options: {
    transfer?: 'conditional' | 'source-stated' | 'unknown' | 'negative';
    liquidity?: 'source-stated' | 'unknown' | 'negative';
  } = {},
): CapitalSourceFixture {
  const s = new Speech('financial asset');
  const holder = s.identity('Ada', 'claim holder'),
    claim = s.identity('Pref', 'economic claim');
  const claimEvidence = s.evidence(
    1,
    'Ada holds Pref on Atlas',
    'Ada holds Pref on Atlas during July.',
  );
  const transferState = options.transfer ?? 'conditional',
    condition = transferState === 'conditional' ? 'If Atlas consents' : undefined;
  const transfer = s.statement(
    2,
    transferState,
    transferState === 'conditional'
      ? 'If Atlas consents, Ada may transfer Pref on Atlas during July.'
      : transferState === 'source-stated'
        ? 'Ada can transfer Pref on Atlas during July.'
        : transferState === 'negative'
          ? 'Ada cannot transfer Pref on Atlas during July.'
          : 'Pref transferability on Atlas is unknown during July.',
  );
  const liquidityState = options.liquidity ?? 'unknown';
  const liquidity = s.statement(
    3,
    liquidityState,
    liquidityState === 'unknown'
      ? 'Atlas underlying asset liquidity is unknown during July.'
      : liquidityState === 'negative'
        ? 'Atlas underlying asset is illiquid during July.'
        : 'Atlas underlying asset is liquid during July.',
  );
  return s.finish(
    'OP-64',
    'economic-rights',
    'claim-asset-distinction',
    { holder, claim, claimEvidence, transfer, liquidity },
    'Atlas maintains asset ownership and economic claim records.',
    condition,
  );
}
export interface OutcomeInput {
  label: string;
  measure: 'proceeds' | 'loss' | 'return';
  minor: number | null;
  numerator?: number;
}
export function capitalOutcomeFixture(
  options: {
    mode?: 'alternatives' | 'samples' | 'distribution';
    outcomes?: OutcomeInput[];
    denominator?: number | null;
  } = {},
): CapitalSourceFixture {
  const s = new Speech('financial report');
  const setMode = options.mode ?? 'alternatives',
    denominator = options.denominator === undefined ? 4 : options.denominator;
  const inputs = options.outcomes ?? [
    { label: 'Loss', measure: 'loss', minor: 2000 },
    { label: 'Flat', measure: 'proceeds', minor: 0 },
    { label: 'Unresolved', measure: 'return', minor: null },
  ];
  const outcomes = inputs.map((input) => {
    const name = s.identity(input.label, 'financial outcome');
    const amount = s.money(
      `${input.label} ${input.measure}`,
      input.minor,
      undefined,
      'investments',
      denominator,
    );
    const probability =
      input.numerator === undefined
        ? null
        : {
            numerator: input.numerator,
            denominator,
            source: s.say(
              3,
              `Atlas reports ${input.label} probability ${input.numerator} of ${denominator} investments during July.`,
            ),
          };
    return { identity: name, measure: input.measure, amount, probability };
  });
  const mode =
    setMode === 'distribution' ? 'a supplied financial distribution' : `financial ${setMode}`;
  const setEvidence = s.evidence(
    1,
    setMode === 'distribution' ? 'supplied financial distribution' : `financial ${setMode}`,
    `Atlas lists ${inputs.map((i) => i.label).join(', ')} as ${mode} during July.`,
  );
  return s.finish(
    'OP-59',
    'investment-outcomes',
    'source-outcome-set',
    { setMode, setEvidence, outcomes },
    null,
  );
}
export function capitalRoundsFixture(
  options: {
    statuses?: ('issued' | 'pending' | 'conditional')[];
    shares?: number;
    total?: number;
    issuance?: number;
  } = {},
): CapitalSourceFixture {
  const s = new Speech();
  const holder = s.identity('Ada', 'share holder');
  const shares = options.shares ?? 40,
    total = options.total ?? 100;
  const beforePercent = Math.round((shares * 10000) / total) / 100;
  const ownership = s.ownership(shares, total, beforePercent);
  const statuses = options.statuses ?? ['pending', 'conditional'];
  const condition = statuses.includes('conditional') ? 'If board approves' : undefined;
  let observedTotal = total;
  const rounds = statuses.map((status, index) => {
    const label = index === 0 ? 'Seed' : 'Series';
    const identity = {
      identity: s.identity(label, 'a capital round'),
      version: 'v1',
      source: s.say(0, `${label} has source version v1.`),
    };
    const issued = options.issuance ?? 20,
      beforeTotal = observedTotal,
      afterTotal = beforeTotal + issued;
    const beforePercent = Math.round((shares * 10000) / beforeTotal) / 100;
    const afterPercent = Math.round((shares * 10000) / afterTotal) / 100;
    const verb =
      status === 'issued' ? 'records' : status === 'pending' ? 'records pending' : 'may record';
    const source = s.say(
      2,
      `${status === 'conditional' ? `${condition}, ` : ''}Atlas ${verb} ${label} commitment 100 USD with ${status === 'issued' ? 'issued' : 'proposed'} issuance of ${issued} new shares from ${beforeTotal} to ${afterTotal} total shares with Ada retaining ${shares} shares from ${beforePercent} to ${afterPercent} percent during July per 1 rounds over ${beforeTotal} shares.`,
    );
    const body = s.body(source, status === 'conditional' ? condition : undefined);
    const commitment = {
      state: status === 'issued' ? 'source-stated' : status,
      money: { currency: 'USD', minorUnits: 10000 },
      basis: s.basis(body, 'rounds', 'USD', 1),
      source,
    };
    if (status === 'issued') observedTotal = afterTotal;
    return {
      identity,
      commitment,
      status,
      issued,
      beforeTotal,
      afterTotal,
      beforePercent,
      afterPercent,
      shareBasis: s.basis(body, 'shares', 'shares', beforeTotal),
      source,
    };
  });
  return s.finish(
    'OP-60',
    'capital-structure',
    'conditional-rounds',
    { holder, ownership, rounds },
    'Atlas uses commitment records beside ownership and economic claim records.',
    condition,
  );
}
export function capitalDebtFixture(
  capacity = true,
  options: {
    principal?: number | null;
    installed?: number | null;
    commissioned?: number | null;
    durationUnknown?: boolean;
    liquid?: boolean;
  } = {},
): CapitalSourceFixture {
  const s = new Speech();
  const lender = s.identity('Lumen', 'lender');
  const asset = s.identity(
    capacity ? 'Hall' : 'Warehouse',
    capacity ? 'data-center rack installation' : 'underlying asset',
  );
  const assetEvidence = s.evidence(
    1,
    `Atlas ${capacity ? 'operates Hall' : 'owns Warehouse'}`,
    `Atlas ${capacity ? 'operates Hall' : 'owns Warehouse'} during July.`,
  );
  const obligations = (capacity ? ['Loan'] : ['Loan', 'Note']).map((label, index) => ({
    identity: s.identity(label, 'debt obligation'),
    principal: s.money(
      `${label} principal`,
      options.principal === undefined ? 10000 : options.principal,
      undefined,
      'obligations',
      2,
    ),
    maturity: index === 0 ? '2030-06-30' : '2031-06-30',
    source: s.say(
      3,
      `Lumen holds ${label} against Atlas due on ${index === 0 ? '2030-06-30' : '2031-06-30'} during July.`,
    ),
  }));
  if (capacity) {
    const count = (metric: string, value: number | null) => {
      const source = s.say(
        2,
        `Atlas records Hall ${metric} ${value === null ? 'unknown' : value} racks during July per 8 racks.`,
      );
      return {
        state: value === null ? 'unknown' : 'source-stated',
        count: value,
        basis: s.basis(source, 'racks', 'racks', 8),
        source,
      };
    };
    return s.finish(
      'OP-61',
      'capital-structure',
      'financing-versus-capacity',
      {
        lender,
        asset,
        assetEvidence,
        obligations,
        installed: count('installed', options.installed === undefined ? 8 : options.installed),
        commissioned: count(
          'commissioned',
          options.commissioned === undefined ? 0 : options.commissioned,
        ),
      },
      'Atlas uses dated debt records beside data-center rack records for Hall.',
    );
  }
  const duration = s.statement(
    3,
    options.durationUnknown ? 'unknown' : 'source-stated',
    `Warehouse asset duration is ${options.durationUnknown ? 'unknown' : 'long term'} during July.`,
  );
  const liquidity = s.statement(
    3,
    options.liquid ? 'source-stated' : 'unknown',
    options.liquid
      ? 'Warehouse underlying asset is liquid during July.'
      : 'Warehouse underlying asset liquidity is unknown during July.',
  );
  return s.finish(
    'OP-62',
    'capital-structure',
    'obligations-and-maturity',
    { lender, asset, assetEvidence, obligations, duration, liquidity },
    'Atlas uses dated debt records beside asset records for Warehouse.',
  );
}
export const CAPITAL_SOURCE_FIXTURES: readonly CapitalSourceFixture[] = [
  capitalRightsFixture(),
  capitalOutcomeFixture(),
  capitalRoundsFixture(),
  capitalDebtFixture(),
  capitalDebtFixture(false),
  capitalClaimAssetFixture(),
];
export function capitalFixtureContext(fixture: CapitalSourceFixture): ParseContext {
  return makeParseContext(fixture.words, {
    startWord: 0,
    endWord: fixture.words.length - 1,
    startTime: fixture.words[0].start - 0.25,
    endTime: fixture.words[fixture.words.length - 1].end + 0.35,
  });
}
