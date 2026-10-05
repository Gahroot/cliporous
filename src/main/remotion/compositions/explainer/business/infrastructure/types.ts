import type {
  BusinessEvidence,
  BusinessIdentity,
  BusinessStory,
  BusinessWordSpan,
  QuantityBasis,
  VersionedIdentity,
} from '../types';

export const INFRASTRUCTURE_LIMITS = {
  entities: 8,
  edges: 12,
  holds: 4,
  meshes: 180,
  pages: 4,
} as const;
export type InfrastructureState =
  | 'source-stated'
  | 'pending'
  | 'negative'
  | 'conditional'
  | 'unknown';
export interface InfrastructureFact {
  state: InfrastructureState;
  source: BusinessWordSpan;
  text: string;
}
export interface InfrastructureQuantity extends InfrastructureFact {
  value: number | null;
  unit: string | null;
  period: string;
  basis: QuantityBasis | null;
}
export interface InfrastructureStory extends BusinessStory {
  period: string;
  /** Complete source clause for this preset's code-owned assets; never a model selector. */
  modelSource: BusinessWordSpan | null;
}
export interface InstalledCapacityScene extends InfrastructureStory {
  kind: 'capacity-map';
  preset: 'installed-used-reserved';
  resource: BusinessIdentity;
  installed: InfrastructureQuantity;
  used: InfrastructureQuantity;
  reserved: InfrastructureQuantity;
  partition: { source: BusinessWordSpan; text: string };
}
export interface PhysicalReadinessScene extends InfrastructureStory {
  kind: 'capacity-map';
  preset: 'physical-readiness';
  resource: BusinessIdentity;
  funding: BusinessIdentity;
  power: BusinessIdentity;
  cooling: BusinessIdentity;
  moneyReady: InfrastructureFact;
  powerReady: InfrastructureFact;
  coolingReady: InfrastructureFact;
}
export interface RequestCapacityScene extends InfrastructureStory {
  kind: 'capacity-map';
  preset: 'bounded-request-capacity';
  resource: BusinessIdentity;
  task: BusinessIdentity;
  queued: InfrastructureQuantity;
  capacity: InfrastructureQuantity;
}
export interface ResourceStatesScene extends InfrastructureStory {
  kind: 'capacity-map';
  preset: 'resource-states';
  resource: BusinessIdentity;
  cooling: BusinessIdentity;
  installed: InfrastructureQuantity;
  idle: InfrastructureQuantity;
  reserved: InfrastructureQuantity;
  burst: InfrastructureQuantity;
  coolingReady: InfrastructureFact;
  partition: { source: BusinessWordSpan; text: string };
}
export interface ProcessingScopeScene extends InfrastructureStory {
  kind: 'capacity-map';
  preset: 'declared-processing-scope';
  resource: BusinessIdentity;
  item: BusinessIdentity;
  boundary: BusinessIdentity;
  processing: InfrastructureFact;
}
export interface LatencyStage {
  identity: BusinessIdentity;
  quantity: InfrastructureQuantity;
}
export interface LatencyPeriodsScene extends InfrastructureStory {
  kind: 'capacity-map';
  preset: 'end-to-end-periods';
  resource: BusinessIdentity;
  task: BusinessIdentity;
  stages: LatencyStage[];
  total: InfrastructureQuantity;
  aggregation: { state: 'sequential' | 'unknown'; source: BusinessWordSpan; text: string };
}
export interface EvidenceItem {
  entry: VersionedIdentity;
  date: string;
  fact: InfrastructureFact;
}
export interface EvidenceRoomScene extends InfrastructureStory {
  kind: 'operating-lineage';
  preset: 'evidence-and-missing-information';
  owner: BusinessIdentity;
  items: EvidenceItem[];
}
export interface ProviderTransitionScene extends InfrastructureStory {
  kind: 'operating-lineage';
  preset: 'provider-transition';
  resource: BusinessIdentity;
  fromProvider: BusinessIdentity;
  toProvider: BusinessIdentity;
  dependency: BusinessIdentity;
  transition: {
    state: 'completed' | 'pending' | 'blocked' | 'conditional' | 'unknown';
    source: BusinessWordSpan;
    text: string;
  };
}
export interface ProvenanceEdge extends InfrastructureFact {
  fromId: string;
  toId: string;
}
export interface ProvenanceScene extends InfrastructureStory {
  kind: 'operating-lineage';
  preset: 'versioned-provenance';
  owner: BusinessIdentity;
  entries: VersionedIdentity[];
  edges: ProvenanceEdge[];
}
export interface EvaluationSnapshot {
  version: string;
  date: string;
  entry: VersionedIdentity;
  quantity: InfrastructureQuantity;
}
export interface EvaluationPeriodsScene extends InfrastructureStory {
  kind: 'operating-lineage';
  preset: 'evaluation-periods';
  owner: BusinessIdentity;
  task: BusinessIdentity;
  snapshots: EvaluationSnapshot[];
}
export type CapacityMapScene =
  | InstalledCapacityScene
  | PhysicalReadinessScene
  | RequestCapacityScene
  | ResourceStatesScene
  | ProcessingScopeScene
  | LatencyPeriodsScene;
export type OperatingLineageScene =
  | EvidenceRoomScene
  | ProviderTransitionScene
  | ProvenanceScene
  | EvaluationPeriodsScene;
export type InfrastructureScene = CapacityMapScene | OperatingLineageScene;
export interface InfrastructureRow {
  id: string;
  label: string;
  state: string;
  text: string;
}
export type { BusinessEvidence };
