/** Stories 41–42. Only the five inherited beat fields are animation seconds. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionBasis,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
  ExpansionRational,
  ExpansionUnit,
} from '../value-types';

export type ExpansionDurationUnit = Extract<ExpansionUnit, 'second' | 'minute' | 'hour' | 'day'>;
export type ExpansionTaskDuration = ExpansionQuantity & {
  readonly basis: ExpansionBasis & { readonly unit: ExpansionDurationUnit };
};
export type ExpansionKnownTaskDuration = Extract<ExpansionTaskDuration, { state: 'known' }> & {
  readonly amount: {
    readonly kind: 'rational';
    readonly value: ExpansionRational;
    readonly notation?: string;
  };
};

export interface ExpansionTemporalFact {
  readonly actorId: string;
  readonly claim: string;
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
}
export type ExpansionLaneStatus =
  | { readonly state: 'known' | 'unknown' | 'missing' | 'disputed' }
  | { readonly state: 'conditional'; readonly condition: string };

export interface ExpansionLaneTask {
  readonly id: string;
  readonly entityId: string;
  /** Omission is absence, never a measured zero or a fabricated interval. */
  readonly duration?: ExpansionTaskDuration;
}
export type ExpansionLaneRelation = ExpansionTemporalFact &
  ExpansionLaneStatus & {
    readonly id: string;
    readonly type: 'concurrent' | 'before';
    readonly fromId: string;
    readonly toId: string;
  };
export type ExpansionLaneResult = ExpansionTemporalFact &
  (
    | { readonly state: 'complete' | 'unresolved' | 'unknown' | 'missing' | 'disputed' }
    | { readonly state: 'conditional'; readonly condition: string }
  ) & { readonly id: string };

interface ExpansionTemporalBase extends ExpansionStoryBase {
  kind: 'temporal-structure';
  readonly actorId: string;
  readonly scope: string;
  readonly period: string;
  readonly entities: readonly ExpansionEntity[];
}
export interface ExpansionParallelLanesScene extends ExpansionTemporalBase {
  storyId: '41';
  preset: 'parallel-lanes';
  template: 'task-lanes';
  readonly tasks: readonly ExpansionLaneTask[];
  /** Only explicitly sourced relations; durations alone supply neither order nor overlap. */
  readonly relations: readonly ExpansionLaneRelation[];
  readonly result: ExpansionLaneResult;
}

export interface ExpansionPrerequisitesFact extends ExpansionTemporalFact {
  readonly claim: 'prerequisites';
  readonly state: 'known';
  readonly taskId: string;
  /** Empty requires an explicit source assertion of "none", not an omitted edge. */
  readonly prerequisiteIds: readonly string[];
}
export interface ExpansionCriticalTask extends ExpansionLaneTask {
  readonly duration: ExpansionKnownTaskDuration;
  readonly prerequisites: ExpansionPrerequisitesFact;
}
export interface ExpansionCriticalDependency extends ExpansionTemporalFact {
  readonly id: string;
  readonly type: 'dependency';
  readonly state: 'known';
  readonly fromId: string;
  readonly toId: string;
}
export interface ExpansionScheduleBasis extends ExpansionTemporalFact {
  readonly claim: 'schedule basis';
  readonly state: 'known';
  readonly origin: 'project start';
  readonly policy: 'earliest-start';
  readonly resourceModel: 'independent';
}
export interface ExpansionDerivedTaskSchedule {
  readonly taskId: string;
  readonly state: 'derived';
  /** Exact domain offsets in result.basis.unit, NOT source/animation seconds. */
  readonly earliestStart: ExpansionRational;
  readonly earliestFinish: ExpansionRational;
  readonly latestStart: ExpansionRational;
  readonly latestFinish: ExpansionRational;
  readonly slack: ExpansionRational;
}
export interface ExpansionCriticalPathResult extends ExpansionTemporalFact {
  readonly id: string;
  readonly state: 'derived';
  readonly operation: 'critical-path';
  readonly basis: ExpansionBasis & { readonly unit: ExpansionDurationUnit };
  readonly scheduleBasis: ExpansionScheduleBasis;
  /** Retains source quantities (including notation/basis) and every explicit dependency list. */
  readonly operands: readonly {
    readonly taskId: string;
    readonly duration: ExpansionKnownTaskDuration;
    readonly prerequisites: ExpansionPrerequisitesFact;
  }[];
  readonly duration: ExpansionRational;
  readonly schedule: readonly ExpansionDerivedTaskSchedule[];
  readonly criticalTaskIds: readonly string[];
  readonly criticalRelationIds: readonly string[];
  readonly criticalPathCount: number;
  readonly pathMultiplicity: 'unique' | 'tied';
}
export interface ExpansionCriticalPathScene extends ExpansionTemporalBase {
  storyId: '42';
  preset: 'critical-path';
  template: 'dependency-schedule';
  readonly tasks: readonly ExpansionCriticalTask[];
  readonly relations: readonly ExpansionCriticalDependency[];
  readonly basis: ExpansionScheduleBasis;
  readonly result: ExpansionCriticalPathResult;
}

export type ExpansionLanesCriticalScene = ExpansionParallelLanesScene | ExpansionCriticalPathScene;
