import type { DiagramStory } from '../diagrams/types';
import type { FinanceActor, Money } from '../finance/types';
export const CASH_TIMING_PRESETS = ['receivable-gap', 'inventory-before-sales'] as const;
export interface CashTimingScene extends DiagramStory {
  kind: 'cash-timing';
  preset: (typeof CASH_TIMING_PRESETS)[number];
  business: FinanceActor;
  customer: FinanceActor;
  sales: Money | null;
  totalCosts: Money;
  cashPaid: Money;
  profitMinor: number | null;
  paidWhen: string;
  receivedWhen: string;
}
