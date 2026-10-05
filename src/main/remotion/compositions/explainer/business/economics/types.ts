import type { DiagramStory } from '../../diagrams/types';
import type { Money } from '../../finance/types';
import type { BusinessEvidence, BusinessIdentity, BusinessWordSpan, QuantityBasis } from '../types';

export const ECONOMICS_LIMITS = {
  entities: 8,
  relationships: 12,
  holds: 4,
  components: 3,
  samples: 2,
  periods: 2,
  offers: 2,
  pages: 4,
  pageHold: 1.5,
  finalHold: 0.8,
  meshes: 180,
} as const;
export type EconomicsState = 'source-stated' | 'unknown' | 'negative' | 'conditional';
export interface EconomicsMoneyFact {
  state: EconomicsState;
  money: Money | null;
  basis: QuantityBasis;
  source: BusinessWordSpan;
}
export interface EconomicsCountFact {
  state: EconomicsState;
  count: number | null;
  basis: QuantityBasis;
  source: BusinessWordSpan;
}
export interface EconomicsCostComponent {
  identity: BusinessIdentity;
  cost: EconomicsMoneyFact;
}
export interface EconomicsCarrier {
  asset: 'A-02' | 'A-04' | 'A-07' | 'A-10';
  source: BusinessWordSpan;
  /** Derived from the local A-10 source gate, never selected by a raw renderer directive. */
  representation?: 'numeric' | 'nonnumeric';
}
interface EconomicsStory extends DiagramStory {
  factEvidence: BusinessEvidence;
  business: BusinessIdentity;
  activity: BusinessIdentity;
  /** Concrete source gate, never AI-selected geometry. Null is diagram-only. */
  carrier: EconomicsCarrier | null;
  /** Duration, unchanged when the five beat clocks are rebased by production. */
  finalHoldSeconds: number;
}
export interface PerOutcomeScene extends EconomicsStory {
  kind: 'operating-cost';
  preset: 'per-outcome';
  components: EconomicsCostComponent[];
  total: EconomicsMoneyFact;
  resolved: EconomicsCountFact;
  perOutcome: EconomicsMoneyFact;
}
export interface FixedVariableSample {
  identity: BusinessIdentity;
  output: EconomicsCountFact;
  fixedCost: EconomicsMoneyFact;
  variableCost: EconomicsMoneyFact;
  total: EconomicsMoneyFact;
}
export interface FixedVariableScene extends EconomicsStory {
  kind: 'scale-economics';
  preset: 'fixed-variable';
  fixed: BusinessIdentity;
  variable: BusinessIdentity;
  samples: FixedVariableSample[];
}
export interface OutputStaffingSample {
  identity: BusinessIdentity;
  output: EconomicsCountFact;
  staffing: EconomicsCountFact;
}
export interface OutputStaffingScene extends EconomicsStory {
  kind: 'scale-economics';
  preset: 'output-staffing';
  samples: OutputStaffingSample[];
  alternativesSource: BusinessWordSpan;
}
export interface ImplementationPeriod {
  identity: BusinessIdentity;
  version: string;
  date: string;
  /** Own local clause must bind playbook, period identity, version and date. */
  source: BusinessWordSpan;
  cost: EconomicsMoneyFact;
  output: EconomicsCountFact;
}
export interface ImplementationPeriodsScene extends EconomicsStory {
  kind: 'operating-cost';
  preset: 'implementation-periods';
  /** activity is the named implementation playbook, not an arbitrary book. */
  periods: ImplementationPeriod[];
}
export interface PricingOffer {
  identity: BusinessIdentity;
  price: EconomicsMoneyFact;
}
export interface PricingBasesScene extends EconomicsStory {
  kind: 'operating-cost';
  preset: 'comparable-pricing-bases';
  visualMode: 'diagram';
  carrier: null;
  offers: PricingOffer[];
  alternativesSource: BusinessWordSpan;
  comparison: 'compatible' | 'separate';
}
export interface AllocationComponent {
  identity: BusinessIdentity;
  amount: EconomicsMoneyFact;
}
export interface ValueCaptureScene extends EconomicsStory {
  kind: 'value-capture';
  preset: 'source-stated-allocation';
  total: EconomicsMoneyFact;
  /** Exactly three allocations plus the fourth, explicit retained/unknown remainder. */
  allocations: AllocationComponent[];
  remainder: AllocationComponent;
  orderSource: BusinessWordSpan;
}
export type RevenueAccounting = 'accrual' | 'gross' | 'net';
export interface RevenueFact {
  accounting: RevenueAccounting;
  fact: EconomicsMoneyFact;
}
export interface ProfitFact {
  accounting: 'gross' | 'net';
  fact: EconomicsMoneyFact;
}
export interface CashFact {
  accounting: 'received' | 'held';
  fact: EconomicsMoneyFact;
}
export interface AccountingBasesScene extends EconomicsStory {
  kind: 'operating-cost';
  preset: 'accounting-bases';
  revenue: RevenueFact;
  costs: EconomicsCostComponent[];
  statedCostRemainder: EconomicsMoneyFact;
  /** Null means not supplied, never revenue minus some costs. */
  profit: ProfitFact | null;
  cash: CashFact | null;
  receivable: EconomicsMoneyFact | null;
}
export type OperatingCostScene =
  | PerOutcomeScene
  | ImplementationPeriodsScene
  | PricingBasesScene
  | AccountingBasesScene;
export type ScaleEconomicsScene = FixedVariableScene | OutputStaffingScene;
export type EconomicsScene = OperatingCostScene | ScaleEconomicsScene | ValueCaptureScene;
export type EconomicsRecipeId = 'OP-33' | 'OP-34' | 'OP-36' | 'OP-37' | 'OP-38' | 'OP-39' | 'OP-40';
export const ECONOMICS_RECIPE_IDS: readonly EconomicsRecipeId[] = [
  'OP-33',
  'OP-34',
  'OP-36',
  'OP-37',
  'OP-38',
  'OP-39',
  'OP-40',
];
export function economicsRecipeId(scene: EconomicsScene): EconomicsRecipeId {
  switch (scene.preset) {
    case 'per-outcome':
      return 'OP-33';
    case 'fixed-variable':
      return 'OP-34';
    case 'output-staffing':
      return 'OP-36';
    case 'implementation-periods':
      return 'OP-37';
    case 'comparable-pricing-bases':
      return 'OP-38';
    case 'source-stated-allocation':
      return 'OP-39';
    case 'accounting-bases':
      return 'OP-40';
  }
}
