import type { DiagramStory, ExplanationVisualMode } from '../diagrams/types';
import type { FinanceActor } from '../finance/types';

export const BUSINESS_PRESETS = {
  'task-map': ['task-split', 'capability-boundary', 'responsibility'],
  'coordination-map': [
    'cross-function',
    'supervised-fanout',
    'handoff-load',
    'approval-load',
    'bottleneck-shift',
  ],
  'work-redesign': ['expertise-transfer', 'redeployment', 'owner-playbook'],
  'delegation-scope': ['permissions', 'action-limits'],
  'authority-handoff': [
    'exception-review',
    'declared-audit-chain',
    'action-consequences',
    'accountable-transfer',
  ],
  'constraint-check': ['conflicting-limits', 'dated-conditions'],
  'business-blueprint': [
    'back-office',
    'service-slots',
    'service-lifecycle',
    'owner-dependency',
    'service-modules',
  ],
  'business-replication': ['shared-standard-local-context'],
  'organization-map': [
    'federated-units',
    'decision-rights',
    'rollout-rings',
    'legacy-boundaries',
    'stated-chargeback',
    'declared-tool-boundaries',
  ],
  'system-reconciliation': ['merge-identities'],
  'operating-cost': [
    'per-outcome',
    'implementation-periods',
    'comparable-pricing-bases',
    'accounting-bases',
  ],
  'scale-economics': ['fixed-variable', 'output-staffing'],
  'value-capture': ['source-stated-allocation'],
  'market-dependency': [
    'channel-concentration',
    'demand-access',
    'migration-constraints',
    'participation-matching',
    'stated-participation-benefit',
    'differentiated-offering',
    'supplier-distribution-boundaries',
    'complementary-specialists',
  ],
  'procurement-commitment': ['request-quote-authorize-pay'],
  'fund-lifecycle': [
    'capital-states',
    'subscriptions-and-close',
    'source-periods',
    'retained-follow-on-capital',
  ],
  'distribution-waterfall': ['stated-priority-tiers', 'gross-to-net'],
  'fund-liquidity': ['periodic-repurchase', 'valuation-cash-distinction'],
  'economic-rights': ['ownership-versus-claims', 'claim-asset-distinction'],
  'capital-structure': [
    'conditional-rounds',
    'financing-versus-capacity',
    'obligations-and-maturity',
  ],
  'investment-outcomes': ['source-outcome-set'],
  'capacity-map': [
    'installed-used-reserved',
    'physical-readiness',
    'bounded-request-capacity',
    'resource-states',
    'declared-processing-scope',
    'end-to-end-periods',
  ],
  'operating-lineage': [
    'evidence-and-missing-information',
    'provider-transition',
    'versioned-provenance',
    'evaluation-periods',
  ],
  'staged-decision': ['contingent-commitment'],
  'measurement-frame': [
    'planned-observed',
    'firms-functions-workers',
    'original-and-surviving-cohorts',
  ],
  'uncertainty-album': ['alternatives-or-source-distribution'],
} as const;

export type BusinessKind = keyof typeof BUSINESS_PRESETS;
export type BusinessPack =
  | 'work'
  | 'authority'
  | 'commercial'
  | 'organization'
  | 'economics'
  | 'markets'
  | 'funds'
  | 'capital'
  | 'infrastructure'
  | 'decisions';
export type BusinessRecipeId = `OP-${string}`;
export type BusinessAssetId = `A-${string}`;
export type BusinessTreatmentId = `M-${string}`;

/** Source word indices are not seconds and must never be beat-rebased. */
export interface BusinessWordSpan {
  fromWord: number;
  toWord: number;
}
export interface BusinessIdentity extends FinanceActor {
  source: BusinessWordSpan;
}
export type EvidenceState = 'source-stated' | 'illustrative' | 'unknown' | 'scenario';
export interface BusinessEvidence {
  state: EvidenceState;
  label: string;
  source: BusinessWordSpan;
}
export interface TaskOwnership {
  taskId: string;
  performerId: string;
  approverId: string | null;
  accountableOwnerId: string;
  source: BusinessWordSpan;
}
export interface QuantityBasis {
  subjectId: string;
  population: string;
  unit: string;
  period: string;
  /** Unknown is not zero; numeric comparisons requiring this base must reject null. */
  denominator: number | null;
  source: BusinessWordSpan;
}
export interface VersionedIdentity {
  identity: BusinessIdentity;
  version: string;
  source: BusinessWordSpan;
}
export interface BusinessStory extends DiagramStory {
  factEvidence: BusinessEvidence;
}
export interface BusinessRecipe {
  id: BusinessRecipeId;
  kind: BusinessKind | 'agent-workflow' | 'portfolio-exposure' | 'possible-futures';
  preset: string;
  owner: BusinessPack;
  objective: string;
  sourceRequirements: readonly string[];
  modes: readonly ExplanationVisualMode[];
  assets: readonly BusinessAssetId[];
  treatments: readonly BusinessTreatmentId[];
  fixtureIds: readonly string[];
}

/** Payload limits supplement (never enlarge) the existing scene/diagram bounds. */
export const BUSINESS_INPUT_LIMITS = {
  bytes: 16_384,
  nodes: 512,
  depth: 6,
  array: 12,
  string: 512,
  spanWords: 64,
} as const;
