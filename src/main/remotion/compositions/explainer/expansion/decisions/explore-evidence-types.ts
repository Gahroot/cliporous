/** Ordered step 11, stories 31–32 only. No renderer or global registration. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export type ExpansionDecisionStatus =
  | { readonly state: 'known'; readonly qualification?: never; readonly condition?: never }
  | { readonly state: 'conditional'; readonly condition: string; readonly qualification?: never }
  | {
      readonly state: 'unknown' | 'missing' | 'disputed';
      readonly qualification: string;
      readonly condition?: never;
    }
  | {
      readonly state: 'illustrative' | 'simulated';
      readonly qualification: string;
      readonly condition?: never;
    };

export type ExpansionExploreEvent = ExpansionDecisionStatus & {
  readonly id: string;
  readonly optionId: string;
  readonly behavior: 'explore' | 'exploit';
  readonly evidence: ExpansionEvidenceSpan;
};

export interface ExpansionExploreExploitScene extends ExpansionStoryBase {
  storyId: '31';
  kind: 'adaptive-choice';
  preset: 'explore-exploit';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly scope: string;
  readonly period: string;
  readonly events: readonly ExpansionExploreEvent[];
  readonly rewards: readonly {
    readonly id: string;
    readonly optionId: string;
    readonly quantity: ExpansionQuantity;
  }[];
  readonly decision: {
    readonly state: 'unresolved' | 'conditional' | 'known';
    readonly retainedIds: readonly string[];
    readonly selectedId?: string;
    readonly condition?: string;
    readonly qualification: string;
    readonly evidence: ExpansionEvidenceSpan;
  };
}

export type ExpansionEvidenceTest = ExpansionDecisionStatus & {
  readonly id: string;
  readonly optionId: string;
  readonly label: string;
  readonly outcome?: 'passed' | 'failed' | 'positive' | 'negative' | 'inconclusive';
  readonly evidence: ExpansionEvidenceSpan;
};

export interface ExpansionSequentialEvidenceScene extends ExpansionStoryBase {
  storyId: '32';
  kind: 'conditional-choice';
  preset: 'sequential-evidence';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly scope: string;
  readonly period: string;
  readonly tests: readonly ExpansionEvidenceTest[];
  readonly gatheringEvidence: ExpansionEvidenceSpan;
  readonly conclusion: {
    readonly state: 'unresolved';
    readonly retainedIds: readonly string[];
    readonly qualification:
      | 'unknown information is not false'
      | 'missing information is not false'
      | 'evidence gathering continues';
    readonly evidence: ExpansionEvidenceSpan;
  };
}

export type ExpansionExploreEvidenceScene =
  | ExpansionExploreExploitScene
  | ExpansionSequentialEvidenceScene;
