import {
  fundsPageDuration,
  fundsResourceCounts,
} from '../../remotion/compositions/explainer/business/funds/presentation';
import {
  type DistributionWaterfallScene,
  type FundLifecycleScene,
  type FundLiquidityScene,
  type FundsAmount,
  type FundsScene,
  type FundsStory,
  fundsObserved,
  FUNDS_METRICS as M,
  type RepurchaseScene,
  type SourcePeriodsScene,
} from '../../remotion/compositions/explainer/business/funds/types';
import type { BusinessIdentity } from '../../remotion/compositions/explainer/business/types';
import {
  boundedBusinessInput,
  businessEvidence,
  businessEvidenceText,
  businessIdentity,
  businessSpan,
  compatibleQuantityBases,
  quantityBasis,
} from './business-contract';
import { escaped } from './concept-business-operations-contract';
import {
  conservesMoney,
  currency,
  distinctActors,
  moneyPattern,
  parseMoney,
} from './finance-contract';
import { hybridPhrase, hybridStory, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const COMMON = ['fund', 'operator', 'carrierSource', 'factEvidence'];
export const FUNDS_CARRIER_LABELS = {
  'capital-states': 'a commitment folio as an illustrative capital record',
  'subscriptions-and-close': 'a commitment folio as an illustrative subscription record',
  'source-periods': 'a commitment folio as an illustrative dated capital record',
  'retained-follow-on-capital':
    'a commitment folio and distribution tier trays as illustrative retained cash records',
  'stated-priority-tiers': 'distribution tier trays as illustrative priority records',
  'periodic-repurchase':
    'a commitment folio and an exception trolley as illustrative repurchase records',
  'valuation-cash-distinction': 'economic rights layers as illustrative separate account records',
} as const;
function text(raw: unknown, ctx: ParseContext): string | null {
  const source = businessSpan(raw, ctx);
  if (
    !source ||
    (source.fromWord > 0 && !/[.!?;]$/u.test(ctx.words[source.fromWord - 1].text)) ||
    !/[.!?;]$/u.test(ctx.words[source.toWord].text)
  )
    return mechanismIssue(ctx, 'fund facts need complete local clauses, never cropped qualifiers');
  return businessEvidenceText(source, ctx);
}
function claim(raw: unknown, pattern: string, ctx: ParseContext): boolean {
  const evidence = text(raw, ctx);
  // These positive signatures are whole-clause anchored, including authored asset/cost
  // enumerations. financeClaim splits at "and", which cannot validate those lists.
  if (evidence === null) return false;
  if (new RegExp(`^${pattern}[.\\s]*$`, 'iu').test(evidence)) return true;
  mechanismIssue(
    ctx,
    'fund fact must exactly bind its complete source actor, action and local qualifier',
  );
  return false;
}
function list(raw: unknown, max: number, ctx: ParseContext): unknown[] | null {
  return Array.isArray(raw) && raw.length > 0 && raw.length <= max
    ? raw
    : mechanismIssue(ctx, 'fund record list exceeds its concrete authored bound');
}
function base(
  raw: Rec,
  kind: string,
  fields: readonly string[],
  ctx: ParseContext,
): FundsStory | null {
  if (raw.kind !== kind) return mechanismIssue(ctx, 'wrong concrete funds kind');
  const result = hybridStory(raw, ctx, [...COMMON, ...fields]);
  const fund = businessIdentity(raw.fund, ctx),
    operator = businessIdentity(raw.operator, ctx),
    factEvidence = businessEvidence(raw.factEvidence, ctx);
  if (
    !result ||
    !fund ||
    !operator ||
    !factEvidence ||
    !distinctActors([fund, operator]) ||
    !claim(fund.source, `${escaped(fund.label)} is (?:a fund|an interval fund)`, ctx) ||
    !claim(
      operator.source,
      `${escaped(operator.label)} is the operator of ${escaped(fund.label)}`,
      ctx,
    )
  )
    return mechanismIssue(ctx, 'source must explicitly name the fund and its distinct operator');
  let carrierSource = null;
  switch (raw.preset) {
    case 'gross-to-net':
      if (raw.visualMode !== 'diagram' || raw.carrierSource !== null)
        return mechanismIssue(ctx, 'gross-to-net is diagram only, without an asset');
      break;
    case 'capital-states':
    case 'subscriptions-and-close':
    case 'source-periods':
    case 'retained-follow-on-capital':
    case 'stated-priority-tiers':
    case 'periodic-repurchase':
    case 'valuation-cash-distinction':
      carrierSource = businessSpan(raw.carrierSource, ctx);
      if (
        !carrierSource ||
        !claim(
          carrierSource,
          `${escaped(fund.label)} uses ${escaped(FUNDS_CARRIER_LABELS[raw.preset])}`,
          ctx,
        )
      )
        return mechanismIssue(
          ctx,
          'every code-owned asset needs its exact independent fund-bound source gate',
        );
      break;
    default:
      return mechanismIssue(ctx, 'unsupported concrete funds preset');
  }
  return { ...result.story, fund, operator, factEvidence, carrierSource };
}
/** Every monetary action is bound to this fund, exact value, currency, period and population. */
function amount(
  raw: unknown,
  metric: string,
  fund: BusinessIdentity,
  ctx: ParseContext,
): FundsAmount | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'amount', 'basis', 'source', 'condition'], ctx))
    return null;
  const state = raw.state;
  if (
    state !== 'source-stated' &&
    state !== 'unknown' &&
    state !== 'negative' &&
    state !== 'pending' &&
    state !== 'conditional'
  )
    return mechanismIssue(ctx, 'explicit fund amount state required');
  const source = businessSpan(raw.source, ctx),
    evidence = text(raw.source, ctx);
  const condition = raw.condition === null ? null : hybridPhrase(raw.condition, ctx, 64);
  if (!source || !evidence || (state === 'conditional' ? !condition : raw.condition !== null))
    return mechanismIssue(
      ctx,
      'conditional amounts require the complete condition; unqualified states cannot inherit one',
    );
  const money = raw.amount === null ? null : parseMoney(raw.amount, ctx);
  if (state === 'source-stated' || state === 'conditional' ? !money : raw.amount !== null)
    return mechanismIssue(
      ctx,
      'unknown/negative/pending is null, never zero; money is exact bounded minor units',
    );
  const basis = quantityBasis(
    raw.basis,
    [fund],
    ctx,
    state === 'conditional' && condition ? { state, condition, source } : undefined,
  );
  if (!basis || currency(basis.unit) === null || (money && money.currency !== basis.unit))
    return mechanismIssue(ctx, 'fund money unit must equal its exact currency basis');
  const denominator =
    basis.denominator === null
      ? `with unknown ${escaped(basis.population)} denominator`
      : `per ${basis.denominator} ${escaped(basis.population)}`;
  const suffix = `during ${escaped(basis.period)} ${denominator}`;
  const actor = escaped(fund.label),
    action = escaped(metric);
  let pattern: string;
  if (state === 'source-stated' && money)
    pattern = `${actor} states ${action} is ${moneyPattern(money)} ${suffix}`;
  else if (state === 'conditional' && money && condition)
    pattern = `${escaped(condition)}[,\\s]+${actor} would state ${action} is ${moneyPattern(money)} ${suffix}`;
  else if (state === 'negative')
    pattern = `${actor} does not hold ${action} in ${basis.unit} ${suffix}`;
  else pattern = `${actor} states ${action} is ${state} in ${basis.unit} ${suffix}`;
  if (!new RegExp(`^${pattern}[.\\s]*$`, 'iu').test(evidence))
    return mechanismIssue(
      ctx,
      'exact complete monetary actor/action/value/condition/basis clause required',
    );
  if (
    state !== 'conditional' &&
    state !== 'source-stated' &&
    !claim(basis.source, `${actor} states ${action} basis is ${basis.unit} ${suffix}`, ctx)
  )
    return mechanismIssue(
      ctx,
      'unknown/negative/pending basis needs its own explicit positive basis statement',
    );
  if (
    state === 'source-stated' &&
    (basis.source.fromWord !== source.fromWord || basis.source.toWord !== source.toWord)
  )
    return mechanismIssue(ctx, 'money and its full basis must come from the same local clause');
  return { state, amount: money, basis, source, condition };
}
function compatible(values: readonly FundsAmount[]): boolean {
  return values.every(
    (value) =>
      fundsObserved(value) &&
      compatibleQuantityBases(values[0].basis, value.basis) &&
      value.amount.currency === values[0].amount?.currency,
  );
}
function conservation(
  input: FundsAmount,
  parts: readonly FundsAmount[],
  remainder: FundsAmount,
  ctx: ParseContext,
): boolean {
  const values = [input, ...parts, remainder];
  if (!fundsObserved(input) || !fundsObserved(remainder) || !parts.every(fundsObserved))
    return true; // Labels remain complete; no arithmetic or calibrated fill.
  if (
    !compatible(values) ||
    !conservesMoney(
      [input.amount],
      parts.map((part) => part.amount),
      remainder.amount,
    )
  ) {
    mechanismIssue(
      ctx,
      'observed funds amounts require complete compatible bases and exact explicit conservation',
    );
    return false;
  }
  return true;
}
function finish<T extends FundsScene>(scene: T, ctx: ParseContext): T | null {
  const counts = fundsResourceCounts(scene);
  if (counts.entities > 8 || counts.relationships > 12 || counts.holds > 4)
    return mechanismIssue(
      ctx,
      'funds complexity exceeds 8 semantic entities, 12 relationships or 4 holds; split the source',
    );
  try {
    if (fundsPageDuration(scene) < 1.5)
      return mechanismIssue(
        ctx,
        'complete fixed-font funds pages need 1.5 seconds after actual diagram handoff',
      );
  } catch {
    return mechanismIssue(
      ctx,
      'complete funds facts exceed fixed natural text rails; split, never shrink',
    );
  }
  return scene;
}
function identities(entries: readonly BusinessIdentity[], ctx: ParseContext): boolean {
  if (distinctActors(entries)) return true;
  mechanismIssue(ctx, 'fund actors/records/components must have distinct literal IDs and labels');
  return false;
}
export function parseFundLifecycleScene(
  value: unknown,
  ctx: ParseContext,
): FundLifecycleScene | null {
  if (!boundedBusinessInput(value, ctx)) return null;
  if (!isRec(value))
    return mechanismIssue(ctx, 'fund explanation must be a concrete source record');
  switch (value.preset) {
    case 'capital-states': {
      const b = base(
        value,
        'fund-lifecycle',
        ['committed', 'called', 'contributed', 'deployed', 'retained'],
        ctx,
      );
      if (!b) return null;
      const committed = amount(value.committed, M.committed, b.fund, ctx),
        called = amount(value.called, M.called, b.fund, ctx),
        contributed = amount(value.contributed, M.contributed, b.fund, ctx),
        deployed = amount(value.deployed, M.deployed, b.fund, ctx),
        retained = amount(value.retained, M.retained, b.fund, ctx);
      if (
        !committed ||
        !called ||
        !contributed ||
        !deployed ||
        !retained ||
        !conservation(contributed, [deployed], retained, ctx)
      )
        return null;
      if (
        fundsObserved(committed) &&
        fundsObserved(called) &&
        fundsObserved(contributed) &&
        (!compatible([committed, called, contributed]) ||
          called.amount.minorUnits > committed.amount.minorUnits ||
          contributed.amount.minorUnits > called.amount.minorUnits)
      )
        return mechanismIssue(
          ctx,
          'observed called/contributed accounts cannot exceed compatible stated commitments/calls',
        );
      return finish(
        {
          ...b,
          kind: 'fund-lifecycle',
          preset: value.preset,
          committed,
          called,
          contributed,
          deployed,
          retained,
        },
        ctx,
      );
    }
    case 'subscriptions-and-close': {
      const b = base(
        value,
        'fund-lifecycle',
        ['subscriptions', 'uncalled', 'cash', 'closing'],
        ctx,
      );
      if (!b) return null;
      const subscriptions = amount(value.subscriptions, M.subscriptions, b.fund, ctx),
        uncalled = amount(value.uncalled, M.uncalled, b.fund, ctx),
        cash = amount(value.cash, M.cash, b.fund, ctx);
      const raw = value.closing;
      if (
        !subscriptions ||
        !uncalled ||
        !cash ||
        !isRec(raw) ||
        !onlyFields(raw, ['state', 'date', 'source'], ctx)
      )
        return null;
      const date = hybridPhrase(raw.date, ctx, 28),
        source = businessSpan(raw.source, ctx),
        state = raw.state;
      if (
        !date ||
        !source ||
        (state !== 'closed' && state !== 'pending' && state !== 'unknown' && state !== 'negative')
      )
        return null;
      const pattern =
        state === 'closed'
          ? `${escaped(b.fund.label)} closed subscriptions on ${escaped(date)}`
          : state === 'negative'
            ? `${escaped(b.fund.label)} did not close subscriptions on ${escaped(date)}`
            : `${escaped(b.fund.label)} states subscription close is ${state} on ${escaped(date)}`;
      const evidence = text(source, ctx);
      if (!evidence || !new RegExp(`^${pattern}[.\\s]*$`, 'iu').test(evidence))
        return mechanismIssue(
          ctx,
          'closing state/date must be separately source-bound; closing is not cash',
        );
      return finish(
        {
          ...b,
          kind: 'fund-lifecycle',
          preset: value.preset,
          subscriptions,
          uncalled,
          cash,
          closing: { state, date, source },
        },
        ctx,
      );
    }
    case 'source-periods': {
      const b = base(value, 'fund-lifecycle', ['periods'], ctx),
        raws = list(value.periods, 4, ctx);
      if (!b || !raws) return null;
      const periods: SourcePeriodsScene['periods'] = [];
      for (const raw of raws) {
        if (!isRec(raw) || !onlyFields(raw, ['identity', 'date', 'account', 'value'], ctx))
          return null;
        const identity = businessIdentity(raw.identity, ctx),
          date = hybridPhrase(raw.date, ctx, 28),
          account = raw.account;
        if (
          !identity ||
          !date ||
          (account !== 'committed' &&
            account !== 'called' &&
            account !== 'contributed' &&
            account !== 'deployed' &&
            account !== 'retained') ||
          !claim(
            identity.source,
            `${escaped(b.fund.label)} records ${escaped(identity.label)} as a source period dated ${escaped(date)}`,
            ctx,
          )
        )
          return null;
        const fact = amount(raw.value, `${identity.label} ${M[account]}`, b.fund, ctx);
        if (!fact || fact.basis.period !== date)
          return mechanismIssue(
            ctx,
            'source period dates and reporting bases stay literal, never rebased beats',
          );
        periods.push({ identity, date, account, value: fact });
      }
      if (!identities([b.fund, b.operator, ...periods.map((period) => period.identity)], ctx))
        return null;
      return finish({ ...b, kind: 'fund-lifecycle', preset: value.preset, periods }, ctx);
    }
    case 'retained-follow-on-capital': {
      const b = base(value, 'fund-lifecycle', ['retained', 'allocated', 'remaining'], ctx);
      if (!b) return null;
      const retained = amount(value.retained, M.retained, b.fund, ctx),
        allocated = amount(value.allocated, M.allocated, b.fund, ctx),
        remaining = amount(value.remaining, M.remaining, b.fund, ctx);
      if (
        !retained ||
        !allocated ||
        !remaining ||
        !conservation(retained, [allocated], remaining, ctx)
      )
        return null;
      return finish(
        { ...b, kind: 'fund-lifecycle', preset: value.preset, retained, allocated, remaining },
        ctx,
      );
    }
    default:
      return mechanismIssue(ctx, 'unsupported fund-lifecycle preset');
  }
}
export function parseDistributionWaterfallScene(
  value: unknown,
  ctx: ParseContext,
): DistributionWaterfallScene | null {
  if (!boundedBusinessInput(value, ctx)) return null;
  if (!isRec(value))
    return mechanismIssue(ctx, 'fund explanation must be a concrete source record');
  if (value.preset === 'stated-priority-tiers') {
    const b = base(value, 'distribution-waterfall', ['proceeds', 'retained', 'tiers'], ctx),
      raws = list(value.tiers, 4, ctx);
    if (!b || !raws) return null;
    const proceeds = amount(value.proceeds, M.proceeds, b.fund, ctx),
      retained = amount(value.retained, M.distributionRetained, b.fund, ctx);
    if (!proceeds || !retained) return null;
    const tiers = [];
    for (const raw of raws) {
      if (
        !isRec(raw) ||
        !onlyFields(raw, ['identity', 'priority', 'prioritySource', 'ceiling', 'allocation'], ctx)
      )
        return null;
      const identity = businessIdentity(raw.identity, ctx),
        prioritySource = businessSpan(raw.prioritySource, ctx);
      if (
        !identity ||
        !prioritySource ||
        raw.priority !== tiers.length + 1 ||
        !claim(
          identity.source,
          `${escaped(identity.label)} is a distribution tier at ${escaped(b.fund.label)}`,
          ctx,
        ) ||
        !claim(
          prioritySource,
          `${escaped(b.fund.label)} states priority ${tiers.length + 1} belongs to ${escaped(identity.label)}`,
          ctx,
        )
      )
        return mechanismIssue(ctx, 'tier identity and actual priority order must be source-stated');
      const ceiling = amount(raw.ceiling, `${identity.label} ceiling`, b.fund, ctx),
        allocation = amount(raw.allocation, `${identity.label} distribution`, b.fund, ctx);
      if (!ceiling || !allocation) return null;
      if (
        fundsObserved(ceiling) &&
        fundsObserved(allocation) &&
        (!compatible([ceiling, allocation]) ||
          allocation.amount.minorUnits > ceiling.amount.minorUnits)
      )
        return mechanismIssue(ctx, 'tier allocation cannot exceed its compatible stated ceiling');
      tiers.push({ identity, priority: tiers.length + 1, prioritySource, ceiling, allocation });
    }
    if (
      !identities([b.fund, b.operator, ...tiers.map((tier) => tier.identity)], ctx) ||
      !conservation(
        proceeds,
        tiers.map((tier) => tier.allocation),
        retained,
        ctx,
      )
    )
      return null;
    let partial = false;
    for (const tier of tiers) {
      if (partial && fundsObserved(tier.allocation) && tier.allocation.amount.minorUnits > 0)
        return mechanismIssue(
          ctx,
          'later-paid allocations behind a partial priority need a different explicit source structure',
        );
      if (
        fundsObserved(tier.ceiling) &&
        fundsObserved(tier.allocation) &&
        tier.allocation.amount.minorUnits < tier.ceiling.amount.minorUnits
      )
        partial = true;
    }
    return finish(
      { ...b, kind: 'distribution-waterfall', preset: value.preset, proceeds, retained, tiers },
      ctx,
    );
  }
  if (value.preset === 'gross-to-net') {
    const b = base(
        value,
        'distribution-waterfall',
        ['gross', 'net', 'remainder', 'costs', 'costsSource'],
        ctx,
      ),
      raws = list(value.costs, 3, ctx);
    if (!b || !raws || b.visualMode !== 'diagram') return null;
    const gross = amount(value.gross, M.gross, b.fund, ctx),
      net = amount(value.net, M.net, b.fund, ctx),
      remainder = amount(value.remainder, M.remainder, b.fund, ctx),
      costsSource = businessSpan(value.costsSource, ctx);
    if (!gross || !net || !remainder || !costsSource) return null;
    const costs = [];
    for (const raw of raws) {
      if (!isRec(raw) || !onlyFields(raw, ['identity', 'amount'], ctx)) return null;
      const identity = businessIdentity(raw.identity, ctx);
      if (
        !identity ||
        !claim(
          identity.source,
          `${escaped(identity.label)} is a stated cost at ${escaped(b.fund.label)}`,
          ctx,
        )
      )
        return null;
      const fact = amount(raw.amount, `${identity.label} cost`, b.fund, ctx);
      if (!fact) return null;
      costs.push({ identity, amount: fact });
    }
    if (
      !identities([b.fund, b.operator, ...costs.map((cost) => cost.identity)], ctx) ||
      !claim(
        costsSource,
        `${escaped(b.fund.label)} states ${costs.map((cost) => escaped(cost.identity.label)).join(' and ')} are the complete stated costs`,
        ctx,
      ) ||
      !conservation(gross, [net, ...costs.map((cost) => cost.amount)], remainder, ctx)
    )
      return null;
    return finish(
      {
        ...b,
        kind: 'distribution-waterfall',
        preset: value.preset,
        visualMode: 'diagram',
        gross,
        net,
        remainder,
        costs,
        costsSource,
      },
      ctx,
    );
  }
  return mechanismIssue(ctx, 'unsupported distribution-waterfall preset');
}
export function parseFundLiquidityScene(
  value: unknown,
  ctx: ParseContext,
): FundLiquidityScene | null {
  if (!boundedBusinessInput(value, ctx)) return null;
  if (!isRec(value))
    return mechanismIssue(ctx, 'fund explanation must be a concrete source record');
  if (value.preset === 'periodic-repurchase') {
    const b = base(value, 'fund-liquidity', ['window', 'cap', 'cash', 'requests'], ctx),
      raws = list(value.requests, 4, ctx);
    if (!b || !raws || !claim(b.fund.source, `${escaped(b.fund.label)} is an interval fund`, ctx))
      return mechanismIssue(
        ctx,
        'repurchase requires an explicit source interval fund, never generic NAV liquidity',
      );
    if (!isRec(value.window) || !onlyFields(value.window, ['label', 'source'], ctx)) return null;
    const label = hybridPhrase(value.window.label, ctx, 28),
      source = businessSpan(value.window.source, ctx);
    const cap = amount(value.cap, M.cap, b.fund, ctx),
      cash = amount(value.cash, M.cash, b.fund, ctx);
    if (
      !label ||
      !source ||
      !cap ||
      !cash ||
      !claim(
        source,
        `${escaped(b.fund.label)} states repurchase window is ${escaped(label)}`,
        ctx,
      ) ||
      cap.basis.period !== label
    )
      return mechanismIssue(ctx, 'explicit repurchase window and cap basis required');
    const requests: RepurchaseScene['requests'] = [];
    for (const raw of raws) {
      if (!isRec(raw) || !onlyFields(raw, ['identity', 'state', 'source', 'amount'], ctx))
        return null;
      const identity = businessIdentity(raw.identity, ctx),
        requestSource = businessSpan(raw.source, ctx),
        state = raw.state;
      if (
        !identity ||
        !requestSource ||
        (state !== 'pending' &&
          state !== 'fulfilled' &&
          state !== 'negative' &&
          state !== 'unknown') ||
        !claim(
          identity.source,
          `${escaped(identity.label)} has a repurchase request at ${escaped(b.fund.label)}`,
          ctx,
        )
      )
        return null;
      const evidence = text(requestSource, ctx);
      if (
        !evidence ||
        !new RegExp(
          `^${escaped(b.fund.label)} states ${escaped(identity.label)}'s repurchase request is ${state} during ${escaped(label)}[.\\s]*$`,
          'iu',
        ).test(evidence)
      )
        return mechanismIssue(
          ctx,
          'repurchase state must bind the actual request owner and source window',
        );
      const fact = amount(raw.amount, `${identity.label}'s repurchase request`, b.fund, ctx);
      if (!fact || fact.basis.period !== label) return null;
      if (state === 'fulfilled' && !fundsObserved(fact))
        return mechanismIssue(ctx, 'fulfilled request cannot be contingent or unknown cash');
      requests.push({ identity, state, source: requestSource, amount: fact });
    }
    if (!identities([b.fund, b.operator, ...requests.map((request) => request.identity)], ctx))
      return null;
    const paid = requests
      .filter((request) => request.state === 'fulfilled')
      .map((request) => request.amount);
    if (
      paid.length &&
      (!fundsObserved(cap) ||
        !fundsObserved(cash) ||
        !compatible([cap, cash, ...paid]) ||
        paid.reduce((sum, request) => sum + (request.amount?.minorUnits ?? 0), 0) >
          Math.min(cap.amount.minorUnits, cash.amount.minorUnits))
    )
      return mechanismIssue(
        ctx,
        'fulfilled amounts need compatible stated cap and cash, never liquidation of NAV',
      );
    return finish(
      {
        ...b,
        kind: 'fund-liquidity',
        preset: value.preset,
        window: { label, source },
        cap,
        cash,
        requests,
      },
      ctx,
    );
  }
  if (value.preset === 'valuation-cash-distinction') {
    const b = base(value, 'fund-liquidity', ['valuation', 'cash'], ctx);
    if (!b) return null;
    const valuation = amount(value.valuation, M.valuation, b.fund, ctx),
      cash = amount(value.cash, M.cash, b.fund, ctx);
    if (
      !valuation ||
      !cash ||
      valuation.basis.population.toLowerCase() === cash.basis.population.toLowerCase()
    )
      return mechanismIssue(
        ctx,
        'valuation and cash require separately named incomparable account populations',
      );
    return finish({ ...b, kind: 'fund-liquidity', preset: value.preset, valuation, cash }, ctx);
  }
  return mechanismIssue(ctx, 'unsupported fund-liquidity preset');
}
