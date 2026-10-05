import type { BusinessIdentity, BusinessStory, BusinessWordSpan, QuantityBasis } from '../types';

/** Enforced by the concrete commercial parsers, not enlarged by an asset or motion pose. */
export const COMMERCIAL_LIMITS = Object.freeze({
  entities: 8,
  sourceLinks: 12,
  holds: 4,
  label: 28,
  phase: 40,
});

export type BusinessBlueprintPreset =
  | 'back-office'
  | 'service-slots'
  | 'service-lifecycle'
  | 'owner-dependency'
  | 'service-modules';
export type BusinessReplicationPreset = 'shared-standard-local-context';

export type CommercialFactState = 'source-stated' | 'conditional' | 'negative' | 'unknown';
export interface CommercialSourceFact {
  state: CommercialFactState;
  /** Local actor/verb/target evidence, not merely a span mentioning the participants. */
  source: BusinessWordSpan;
}

/** Numeric slots require a stated count, unit, period, population and denominator. */
export interface CommercialQuantityBasis extends QuantityBasis {
  denominator: number;
}
export type ServiceSlotQuantity =
  | {
      state: 'source-stated' | 'conditional';
      count: number;
      basis: CommercialQuantityBasis;
      source: BusinessWordSpan;
    }
  | {
      state: 'negative' | 'unknown';
      /** A negated count or missing measurement is not zero or a decorative slot count. */
      count: null;
      basis: QuantityBasis | null;
      source: BusinessWordSpan;
    };

interface BlueprintStory extends BusinessStory {
  kind: 'business-blueprint';
  /** The same source-named business throughout this scene; no ownership change is implied. */
  business: BusinessIdentity;
}

export interface BackOfficeTask extends CommercialSourceFact {
  task: BusinessIdentity;
}
/** OP-17: each task's source must bind this business, the task and the named service. */
export interface BackOfficeBlueprintScene extends BlueprintStory {
  preset: 'back-office';
  service: BusinessIdentity;
  tasks: readonly BackOfficeTask[];
}

/** OP-19: null means no sourced quantity is depicted, never zero or available capacity. */
export interface ServiceSlotsBlueprintScene extends BlueprintStory {
  preset: 'service-slots';
  service: BusinessIdentity;
  reserved: ServiceSlotQuantity | null;
  used: ServiceSlotQuantity | null;
  available: ServiceSlotQuantity | null;
}

export type CommercialStageState = 'pending' | 'observed' | 'conditional' | 'negative' | 'unknown';
export interface CommercialServiceStage {
  identity: BusinessIdentity;
  state: CommercialStageState;
  source: BusinessWordSpan;
}
/** OP-20: lead, booking and delivery are separate facts; booking never completes delivery. */
export interface ServiceLifecycleBlueprintScene extends BlueprintStory {
  preset: 'service-lifecycle';
  service: BusinessIdentity;
  lead: CommercialServiceStage;
  booking: CommercialServiceStage;
  delivery: CommercialServiceStage;
}

export interface FounderDependency {
  state: 'dependent' | 'removed' | 'conditional' | 'negative' | 'unknown';
  /** Removal requires an explicit local claim, not a handoff or animation finishing. */
  source: BusinessWordSpan;
}
/** OP-21: this task's dependency on this founder, not a generalized business bottleneck. */
export interface OwnerDependencyBlueprintScene extends BlueprintStory {
  preset: 'owner-dependency';
  founder: BusinessIdentity;
  task: BusinessIdentity;
  dependency: FounderDependency;
}

export interface ModuleCompatibility {
  leftModuleId: string;
  rightModuleId: string;
  state: 'compatible' | 'incompatible' | 'conditional' | 'unknown';
  source: BusinessWordSpan;
}
/** OP-22: named service modules do not imply compatibility or a repeated offering. */
export interface ServiceModulesBlueprintScene extends BlueprintStory {
  preset: 'service-modules';
  service: BusinessIdentity;
  modules: readonly BusinessIdentity[];
  compatibility: readonly ModuleCompatibility[];
  repeatedOffering: CommercialSourceFact | null;
}

export type BusinessBlueprintScene =
  | BackOfficeBlueprintScene
  | ServiceSlotsBlueprintScene
  | ServiceLifecycleBlueprintScene
  | OwnerDependencyBlueprintScene
  | ServiceModulesBlueprintScene;

export interface LocalBusinessDifference extends CommercialSourceFact {
  /** Source-stated local context, bounded to COMMERCIAL_LIMITS.label by the parser. */
  label: string;
}
export interface ReplicationUnit {
  identity: BusinessIdentity;
  /** A unit's use of the scene's named standard is distinct from an operating franchise. */
  standardUse: {
    state: CommercialStageState;
    source: BusinessWordSpan;
  };
  localDifference: LocalBusinessDifference;
}
/** OP-23: distinct local units, one named common standard and locally bound differences. */
export interface BusinessReplicationScene extends BusinessStory {
  kind: 'business-replication';
  preset: BusinessReplicationPreset;
  business: BusinessIdentity;
  standard: BusinessIdentity;
  units: readonly ReplicationUnit[];
}

export type CommercialScene = BusinessBlueprintScene | BusinessReplicationScene;
