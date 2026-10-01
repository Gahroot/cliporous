import type { TechnologyStory } from '../../technology/types';

/** React-free, bounded Pack C contracts. All ...At fields are seconds. */
export const BUSINESS_OPERATIONS_PRESETS = {
  'resource-allocation': ['reallocate', 'constrained-projects'],
  'market-exchange': ['direct-sale', 'platform-fee', 'unmatched-market'],
  'unit-economics': ['positive-margin', 'break-even', 'negative-margin'],
} as const;

/** Includes the real long-form overlay route; pip is deliberately unsupported. */
export const BUSINESS_OPERATIONS_LAYOUTS = ['stack', 'stack-flipped', 'takeover', 'over'] as const;
export const BUSINESS_OPERATIONS_LIMITS = {
  actorLabel: 22,
  unit: 16,
  resources: 12,
  projects: 2,
  costs: 3,
  money: 1_000_000,
} as const;

export interface AllocationProject {
  /** Assigned by validated source order, never inferred from label equality. */
  id: 'project-0' | 'project-1';
  label: string;
  before: number;
  after: number;
  requested: number;
}

export interface ResourceAllocationScene extends TechnologyStory {
  kind: 'resource-allocation';
  preset: (typeof BUSINESS_OPERATIONS_PRESETS)['resource-allocation'][number];
  total: number;
  unit: string;
  projects: [AllocationProject, AllocationProject];
}

export interface MarketActor {
  id: 'seller' | 'buyer' | 'platform';
  label: string;
}

export interface MarketPayment {
  amount: number;
  unit: string;
}

export interface MarketExchangeScene extends TechnologyStory {
  kind: 'market-exchange';
  preset: (typeof BUSINESS_OPERATIONS_PRESETS)['market-exchange'][number];
  seller: MarketActor;
  buyer: MarketActor;
  product: string;
  /** Absent for unmatched-market: no implied price or completed payment. */
  payment?: MarketPayment;
  /** Only platform-fee can carry a source-stated fee; deducted from payment. */
  platform?: MarketActor & { fee: number };
}

export interface UnitEconomicsScene extends TechnologyStory {
  kind: 'unit-economics';
  preset: (typeof BUSINESS_OPERATIONS_PRESETS)['unit-economics'][number];
  /** Exact source denominator, e.g. "one mug"; never supplied by the renderer. */
  saleUnit: string;
  unit: string;
  revenue: number;
  costs: { id: string; label: string; amount: number }[];
  /** Revenue less only the stated costs. This is NOT a net-profit claim. */
  remainder: number;
}

export type BusinessOperationsScene =
  | ResourceAllocationScene
  | MarketExchangeScene
  | UnitEconomicsScene;
