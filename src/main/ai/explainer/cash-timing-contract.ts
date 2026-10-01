import type { CashTimingScene } from '../../remotion/compositions/explainer/business-systems/types';
import { escaped } from './concept-business-operations-contract';
import {
  actorPattern,
  distinctActors,
  financeActor,
  financeClaim,
  MAX_MINOR_UNITS,
  moneyPattern,
  parseMoney,
  sameCurrency,
} from './finance-contract';
import { hybridPhrase, hybridStory, includesPhrase } from './hybrid-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

export function parseCashTiming(raw: Rec, ctx: ParseContext): CashTimingScene | null {
  const parsed = hybridStory(raw, ctx, [
    'business',
    'customer',
    'sales',
    'totalCosts',
    'cashPaid',
    'profitMinor',
    'paidWhen',
    'receivedWhen',
  ]);
  if (!parsed) return null;
  const preset = raw.preset;
  if (preset !== 'receivable-gap' && preset !== 'inventory-before-sales')
    return mechanismIssue(ctx, 'unsupported cash timing preset');
  const business = financeActor(raw.business, ctx),
    customer = financeActor(raw.customer, ctx);
  const sales = raw.sales === null ? null : parseMoney(raw.sales, ctx),
    totalCosts = parseMoney(raw.totalCosts, ctx),
    cashPaid = parseMoney(raw.cashPaid, ctx);
  const paidWhen = hybridPhrase(raw.paidWhen, ctx, 28),
    receivedWhen = hybridPhrase(raw.receivedWhen, ctx, 28);
  const profitMinor = raw.profitMinor;
  if (
    !business ||
    !customer ||
    business.label !== parsed.story.subject ||
    !distinctActors([business, customer]) ||
    !totalCosts ||
    !cashPaid ||
    (raw.sales !== null && !sales) ||
    !paidWhen ||
    !receivedWhen ||
    paidWhen === receivedWhen ||
    !sameCurrency([totalCosts, cashPaid, ...(sales ? [sales] : [])]) ||
    cashPaid.minorUnits > totalCosts.minorUnits
  )
    return mechanismIssue(
      ctx,
      'cash timing needs distinct actors, compatible source amounts and distinct payment lanes; no invented opening balance',
    );
  if (
    profitMinor !== null &&
    (typeof profitMinor !== 'number' ||
      !Number.isSafeInteger(profitMinor) ||
      Math.abs(profitMinor) > MAX_MINOR_UNITS ||
      !sales ||
      profitMinor !== sales.minorUnits - totalCosts.minorUnits)
  )
    return mechanismIssue(
      ctx,
      'profit requires explicitly stated sales and total costs with exact minor-unit reconciliation',
    );
  if (preset === 'receivable-gap' && (!sales || typeof profitMinor !== 'number'))
    return mechanismIssue(
      ctx,
      'profit/cash comparison needs stated sales, complete costs and explicit profit',
    );
  const b = actorPattern(business),
    c = actorPattern(customer),
    condition = parsed.story.condition;
  if (
    !financeClaim(
      parsed.spans.setup,
      `${b} (?:has|records) total costs of ${moneyPattern(totalCosts)}`,
      condition,
    ) ||
    (sales &&
      !financeClaim(
        parsed.spans.setup,
        `${b} (?:has|records) sales of ${moneyPattern(sales)}`,
        condition,
      )) ||
    !financeClaim(
      parsed.spans.action,
      `${b} pays ${moneyPattern(cashPaid)} (?:in costs|for inventory) ${escaped(paidWhen)}`,
      condition,
    )
  )
    return mechanismIssue(
      ctx,
      'sales, complete costs and actual cash payment need actor-bound setup/action evidence',
    );
  if (preset === 'inventory-before-sales' && !/\bfor inventory\b/i.test(parsed.spans.action))
    return mechanismIssue(
      ctx,
      'inventory preset needs an explicit inventory purchase before customer payment',
    );
  if (
    !financeClaim(
      parsed.spans.response,
      `${c} pays ${sales ? moneyPattern(sales) : 'an unstated amount'} to ${b} ${escaped(receivedWhen)}`,
      condition,
    )
  )
    return mechanismIssue(
      ctx,
      'later customer payment must retain actor, amount and timing; do not move receivables into cash today',
    );
  if (
    typeof profitMinor === 'number' &&
    !financeClaim(
      parsed.spans.check,
      `${b} (?:records|has) profit of ${moneyPattern({ minorUnits: profitMinor, currency: totalCosts.currency })}`,
      condition,
    )
  )
    return mechanismIssue(
      ctx,
      'profit must be explicitly stated at the check beat; partial costs do not prove net profit',
    );
  if (profitMinor === null && !includesPhrase(parsed.spans.check, 'profit is not stated'))
    return mechanismIssue(ctx, 'preserve unstated profit rather than showing zero');
  if (
    !/^(?:Payment arrives later|Cash and profit have different timing)$/i.test(parsed.story.outcome)
  )
    return mechanismIssue(
      ctx,
      'cash timing does not establish bankruptcy, safety or an unstated balance',
    );
  return {
    kind: 'cash-timing',
    preset,
    ...parsed.story,
    business,
    customer,
    sales,
    totalCosts,
    cashPaid,
    profitMinor: typeof profitMinor === 'number' ? profitMinor : null,
    paidWhen,
    receivedWhen,
  };
}
