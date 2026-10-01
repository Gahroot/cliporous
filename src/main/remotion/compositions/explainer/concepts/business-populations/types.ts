import type { TechnologyStory } from '../../technology/types';

/** React-free Pack D contract. IDs are derived from validated entry order, never AI labels. */
export const BUSINESS_POPULATIONS_PRESETS = {
  'population-distribution': ['customer-concentration', 'workload-spread', 'average-hides-tail'],
  'customer-cohort': ['retention', 'churn'],
  'inventory-demand': ['surplus', 'shortage', 'balanced'],
} as const;

export const BUSINESS_POPULATIONS_LAYOUTS = ['stack', 'stack-flipped', 'takeover', 'over'] as const;
export const BUSINESS_POPULATIONS_LIMITS = {
  actorLabel: 18,
  periodLabel: 18,
  distributionMembers: 4,
  originalCustomers: 6,
  newCustomers: 2,
  inventoryActors: 6,
  carriers: 12,
  amountPerMember: 6,
} as const;

export type PopulationMode = 'qualitative' | 'quantitative';
export type PopulationLevel = 'low' | 'middle' | 'high';
export type PopulationUnit = 'orders' | 'tasks';

export interface DistributionMember {
  id: string;
  label: string;
  level: PopulationLevel;
  /** Only present in quantitative mode: exact source-backed integer, never a ratio. */
  amount?: number;
}

export interface PopulationDistributionScene extends TechnologyStory {
  kind: 'population-distribution';
  preset: (typeof BUSINESS_POPULATIONS_PRESETS)['population-distribution'][number];
  mode: PopulationMode;
  unit: PopulationUnit;
  members: DistributionMember[];
  /** Quantitative mode requires an explicitly complete named population in the source. */
  populationSize?: number;
  /** Source-backed arithmetic mean; no inferred or fabricated average label. */
  average?: number;
}

export interface CohortMember {
  id: string;
  label: string;
  status: 'retained' | 'departed';
}

export interface CohortArrival {
  id: string;
  label: string;
}

export interface CustomerCohortScene extends TechnologyStory {
  kind: 'customer-cohort';
  preset: (typeof BUSINESS_POPULATIONS_PRESETS)['customer-cohort'][number];
  mode: PopulationMode;
  startPeriod: string;
  endPeriod: string;
  members: CohortMember[];
  arrivals: CohortArrival[];
  /** Counts refer to the named group only. No rate is computed or displayed. */
  counts?: { starting: number; retained: number; departed: number; arrivals: number };
}

export interface InventoryDemandScene extends TechnologyStory {
  kind: 'inventory-demand';
  preset: (typeof BUSINESS_POPULATIONS_PRESETS)['inventory-demand'][number];
  mode: PopulationMode;
  productLabel: string;
  stockLabel: string;
  demandLabel: string;
  /** Persistent shelf products and separate customer/order actors. */
  stock: { id: string }[];
  demand: { id: string }[];
  /** Exact source-backed counts only in quantitative mode; qualitative actors are illustrative. */
  quantities?: { stock: number; demand: number; unit: 'products' };
}

export type BusinessPopulationsScene =
  | PopulationDistributionScene
  | CustomerCohortScene
  | InventoryDemandScene;
