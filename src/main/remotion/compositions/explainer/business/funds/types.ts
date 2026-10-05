import type { Money } from '../../finance/types';
import type { BusinessIdentity, BusinessStory, BusinessWordSpan, QuantityBasis } from '../types';

export type FundsState = 'source-stated' | 'unknown' | 'negative' | 'pending' | 'conditional';
export interface FundsAmount {
  state: FundsState;
  amount: Money | null;
  basis: QuantityBasis;
  source: BusinessWordSpan;
  condition: string | null;
}
export interface FundsStory extends BusinessStory {
  fund: BusinessIdentity;
  operator: BusinessIdentity;
  carrierSource: BusinessWordSpan | null;
}
export interface CapitalStatesScene extends FundsStory {
  kind: 'fund-lifecycle';
  preset: 'capital-states';
  committed: FundsAmount;
  called: FundsAmount;
  contributed: FundsAmount;
  deployed: FundsAmount;
  retained: FundsAmount;
}
export interface SubscriptionsScene extends FundsStory {
  kind: 'fund-lifecycle';
  preset: 'subscriptions-and-close';
  subscriptions: FundsAmount;
  uncalled: FundsAmount;
  cash: FundsAmount;
  closing: {
    state: 'closed' | 'pending' | 'unknown' | 'negative';
    date: string;
    source: BusinessWordSpan;
  };
}
export interface SourcePeriodsScene extends FundsStory {
  kind: 'fund-lifecycle';
  preset: 'source-periods';
  periods: {
    identity: BusinessIdentity;
    date: string;
    account: 'committed' | 'called' | 'contributed' | 'deployed' | 'retained';
    value: FundsAmount;
  }[];
}
export interface FollowOnScene extends FundsStory {
  kind: 'fund-lifecycle';
  preset: 'retained-follow-on-capital';
  retained: FundsAmount;
  allocated: FundsAmount;
  remaining: FundsAmount;
}
export type FundLifecycleScene =
  | CapitalStatesScene
  | SubscriptionsScene
  | SourcePeriodsScene
  | FollowOnScene;
export interface PriorityTiersScene extends FundsStory {
  kind: 'distribution-waterfall';
  preset: 'stated-priority-tiers';
  proceeds: FundsAmount;
  retained: FundsAmount;
  tiers: {
    identity: BusinessIdentity;
    priority: number;
    prioritySource: BusinessWordSpan;
    ceiling: FundsAmount;
    allocation: FundsAmount;
  }[];
}
export interface GrossNetScene extends FundsStory {
  kind: 'distribution-waterfall';
  preset: 'gross-to-net';
  visualMode: 'diagram';
  gross: FundsAmount;
  net: FundsAmount;
  remainder: FundsAmount;
  costs: { identity: BusinessIdentity; amount: FundsAmount }[];
  costsSource: BusinessWordSpan;
}
export type DistributionWaterfallScene = PriorityTiersScene | GrossNetScene;
export interface RepurchaseScene extends FundsStory {
  kind: 'fund-liquidity';
  preset: 'periodic-repurchase';
  window: { label: string; source: BusinessWordSpan };
  cap: FundsAmount;
  cash: FundsAmount;
  requests: {
    identity: BusinessIdentity;
    state: 'pending' | 'fulfilled' | 'negative' | 'unknown';
    source: BusinessWordSpan;
    amount: FundsAmount;
  }[];
}
export interface ValuationCashScene extends FundsStory {
  kind: 'fund-liquidity';
  preset: 'valuation-cash-distinction';
  valuation: FundsAmount;
  cash: FundsAmount;
}
export type FundLiquidityScene = RepurchaseScene | ValuationCashScene;
export type FundsScene = FundLifecycleScene | DistributionWaterfallScene | FundLiquidityScene;
export type FundsRecipeId =
  | 'OP-49'
  | 'OP-50'
  | 'OP-51'
  | 'OP-52'
  | 'OP-53'
  | 'OP-54'
  | 'OP-55'
  | 'OP-56';
export const FUNDS_METRICS = {
  committed: 'committed capital',
  called: 'called capital',
  contributed: 'contributed cash',
  deployed: 'deployed cash',
  retained: 'retained cash',
  subscriptions: 'subscription commitments',
  uncalled: 'uncalled commitments',
  cash: 'available cash',
  allocated: 'follow-on allocation',
  remaining: 'remaining retained cash',
  proceeds: 'distributable proceeds cash',
  distributionRetained: 'retained distribution cash',
  gross: 'gross proceeds',
  net: 'net proceeds',
  remainder: 'stated cost remainder',
  cap: 'repurchase cap',
  valuation: 'asset valuation',
} as const;
export function fundsRecipe(scene: FundsScene): FundsRecipeId {
  switch (scene.preset) {
    case 'capital-states':
      return 'OP-49';
    case 'subscriptions-and-close':
      return 'OP-50';
    case 'stated-priority-tiers':
      return 'OP-51';
    case 'gross-to-net':
      return 'OP-52';
    case 'source-periods':
      return 'OP-53';
    case 'retained-follow-on-capital':
      return 'OP-54';
    case 'periodic-repurchase':
      return 'OP-55';
    case 'valuation-cash-distinction':
      return 'OP-56';
  }
}
export function fundsAmounts(scene: FundsScene): FundsAmount[] {
  switch (scene.preset) {
    case 'capital-states':
      return [scene.committed, scene.called, scene.contributed, scene.deployed, scene.retained];
    case 'subscriptions-and-close':
      return [scene.subscriptions, scene.uncalled, scene.cash];
    case 'source-periods':
      return scene.periods.map((period) => period.value);
    case 'retained-follow-on-capital':
      return [scene.retained, scene.allocated, scene.remaining];
    case 'stated-priority-tiers':
      return [
        scene.proceeds,
        scene.retained,
        ...scene.tiers.flatMap((tier) => [tier.ceiling, tier.allocation]),
      ];
    case 'gross-to-net':
      return [scene.gross, scene.net, scene.remainder, ...scene.costs.map((cost) => cost.amount)];
    case 'periodic-repurchase':
      return [scene.cap, scene.cash, ...scene.requests.map((request) => request.amount)];
    case 'valuation-cash-distinction':
      return [scene.valuation, scene.cash];
  }
}
/** Arithmetic/fills are forbidden for any qualified, unknown or incompatible amount. */
export function fundsObserved(value: FundsAmount): value is FundsAmount & { amount: Money } {
  return (
    value.state === 'source-stated' && value.amount !== null && value.basis.denominator !== null
  );
}
