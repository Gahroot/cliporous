import type { Money } from '../../finance/types';
import type {
  BusinessIdentity,
  BusinessStory,
  BusinessWordSpan,
  QuantityBasis,
  VersionedIdentity,
} from '../types';

export const ORGANIZATION_LIMITS = Object.freeze({
  entities: 8,
  sourceLinks: 12,
  holds: 4,
  label: 28,
  phase: 40,
});
export type OrganizationFactState = 'declared' | 'negative' | 'conditional' | 'unknown';
export interface OrganizationFact {
  state: OrganizationFactState;
  source: BusinessWordSpan;
}
interface OrganizationStory extends BusinessStory {
  organization: BusinessIdentity;
}
interface MapStory extends OrganizationStory {
  kind: 'organization-map';
}

/** OP-25: local membership and responsibility are independent, explicitly sourced facts. */
export interface FederatedUnitsScene extends MapStory {
  preset: 'federated-units';
  units: readonly BusinessIdentity[];
  tasks: readonly BusinessIdentity[];
  responsibilities: readonly (OrganizationFact & {
    unitId: string;
    taskId: string;
    scope: 'local' | 'shared';
    sharedWithId: string | null;
  })[];
}
export type DecisionPermission = 'permitted' | 'denied' | 'pending' | 'conditional' | 'unknown';
export interface DecisionRight {
  decision: BusinessIdentity;
  unitId: string;
  scope: 'local' | 'central' | 'shared';
  sharedWithId: string | null;
  permission: DecisionPermission;
  source: BusinessWordSpan;
  escalation: (OrganizationFact & { toUnitId: string }) | null;
}
/** OP-26: permission to decide does not establish an observed decision or execution. */
export interface DecisionRightsScene extends MapStory {
  preset: 'decision-rights';
  units: readonly { identity: BusinessIdentity; role: 'local' | 'central' }[];
  rights: readonly DecisionRight[];
}
export type RolloutState =
  | 'configured'
  | 'pending'
  | 'paused'
  | 'rolled-back'
  | 'observed'
  | 'negative'
  | 'conditional'
  | 'unknown';
/** OP-27: dated rollout snapshots are not adoption, worker use or a software deployment. */
export interface RolloutRingsScene extends MapStory {
  preset: 'rollout-rings';
  rollout: VersionedIdentity;
  rings: readonly {
    unit: BusinessIdentity;
    state: RolloutState;
    date: string;
    source: BusinessWordSpan;
  }[];
}
/** OP-28: an interface declaration is not a monitored connection. */
export interface LegacyBoundariesScene extends MapStory {
  preset: 'legacy-boundaries';
  legacy: BusinessIdentity;
  replacement: BusinessIdentity;
  interface: BusinessIdentity;
  boundary: {
    state: 'declared' | 'unsupported' | 'unresolved' | 'negative' | 'conditional' | 'unknown';
    source: BusinessWordSpan;
  };
}
export interface ChargebackBasis extends QuantityBasis {
  denominator: number;
}
export interface ChargebackQuantity {
  state: 'source-stated' | 'conditional';
  amount: Money;
  basis: ChargebackBasis;
  source: BusinessWordSpan;
}
/** OP-30: stated allocations, never inferred cost, invoice, cash or payment. */
export interface StatedChargebackScene extends MapStory {
  preset: 'stated-chargeback';
  payer: BusinessIdentity;
  service: BusinessIdentity;
  units: readonly BusinessIdentity[];
  total: ChargebackQuantity;
  allocations: readonly (ChargebackQuantity & { unitId: string; components: number })[];
  remainder:
    | (ChargebackQuantity & { components: number })
    | { state: 'unknown'; amount: null; components: null; source: BusinessWordSpan };
}
/** OP-31 is diagram-only. These declarations are not tool discovery/monitoring. */
export interface DeclaredToolBoundariesScene extends MapStory {
  preset: 'declared-tool-boundaries';
  visualMode: 'diagram';
  units: readonly BusinessIdentity[];
  workers: readonly { identity: BusinessIdentity; unitId: string }[];
  /** Use is independently sourced; neither configuration nor approval proves use. */
  uses: readonly {
    toolId: string;
    unitId: string;
    workerId: string | null;
    context: 'declared' | 'informal';
    state: 'configured' | 'observed' | 'negative' | 'conditional' | 'unknown';
    source: BusinessWordSpan;
  }[];
  tools: readonly {
    identity: BusinessIdentity;
    unitId: string;
    state: 'allowed' | 'unapproved' | 'denied' | 'conditional' | 'unknown';
    source: BusinessWordSpan;
  }[];
}
export type OrganizationMapScene =
  | FederatedUnitsScene
  | DecisionRightsScene
  | RolloutRingsScene
  | LegacyBoundariesScene
  | StatedChargebackScene
  | DeclaredToolBoundariesScene;
export interface ReconciliationRecord {
  identity: BusinessIdentity;
  sourceSystemId: string;
  /** Literal source identifier, not a generated replacement identity. */
  sourceId: string;
  source: BusinessWordSpan;
}
/** OP-29: even matched records retain both identities. No completed merge is accepted. */
export interface SystemReconciliationScene extends OrganizationStory {
  kind: 'system-reconciliation';
  preset: 'merge-identities';
  /** The desk represents only this named, source-stated reconciliation responsibility. */
  owner: BusinessIdentity;
  systems: readonly VersionedIdentity[];
  records: readonly ReconciliationRecord[];
  collisions: readonly {
    leftRecordId: string;
    rightRecordId: string;
    state: 'matched' | 'unresolved' | 'negative' | 'conditional' | 'unknown';
    source: BusinessWordSpan;
  }[];
}
export type OrganizationScene = OrganizationMapScene | SystemReconciliationScene;
