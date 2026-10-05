import type { CapitalDependencyLens } from '../business/capital/dependency-types';
import type { DiagramStory } from '../diagrams/types';

export const FINANCE_PRESETS = {
  'fund-flow': ['capital-deployment', 'proceeds-distribution'],
  'ownership-change': ['share-issue', 'stake-value-separation'],
  'portfolio-exposure': ['shared-holdings', 'shared-driver'],
} as const;
export const CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export interface Money {
  minorUnits: number;
  currency: Currency;
}
export interface FinanceActor {
  id: string;
  label: string;
}
export interface FlowTransfer {
  from: string;
  to: string;
  amount: { state: 'qualitative' } | { state: 'measured'; money: Money };
}
export interface FundFlowScene extends DiagramStory {
  kind: 'fund-flow';
  preset: (typeof FINANCE_PRESETS)['fund-flow'][number];
  account: FinanceActor;
  sources: FinanceActor[];
  targets: FinanceActor[];
  period: string;
  contributions: FlowTransfer[];
  deployments: FlowTransfer[];
  retained: Money | null;
}
export interface OwnershipChangeScene extends DiagramStory {
  kind: 'ownership-change';
  preset: (typeof FINANCE_PRESETS)['ownership-change'][number];
  holder: FinanceActor;
  company: FinanceActor;
  shares: number;
  beforeTotal: number;
  issued: number;
  afterTotal: number;
  beforePercent: number;
  afterPercent: number;
  valuation: { state: 'unknown' } | { state: 'measured'; before: Money; after: Money };
}
export interface PortfolioExposureScene extends DiagramStory {
  kind: 'portfolio-exposure';
  preset: (typeof FINANCE_PRESETS)['portfolio-exposure'][number];
  funds: FinanceActor[];
  exposure: FinanceActor;
  holdings: { fundId: string; holding: FinanceActor }[];
  /** Opt-in source-bound holding → firm → driver lens. Absent keeps the historical scene. */
  dependencyLens?: CapitalDependencyLens;
}
export type FinanceScene = FundFlowScene | OwnershipChangeScene | PortfolioExposureScene;
