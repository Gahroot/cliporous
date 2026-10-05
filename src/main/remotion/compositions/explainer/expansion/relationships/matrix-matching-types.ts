/** Local stories 37–38. One source-owned identity set; no inferred links or assignments. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export interface MatrixMatchingBeatEvidence {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}
export type MatrixMatchingQualification =
  | { readonly state: 'known' }
  | { readonly state: 'conditional'; readonly condition: string }
  | { readonly state: 'unknown' | 'missing' | 'disputed'; readonly qualifier: string }
  | { readonly state: 'illustrative' | 'simulated'; readonly qualifier: string };
export type MatrixPairRole = 'association' | 'dependency' | 'transfer';
export type MatrixPairRelation = MatrixMatchingQualification & {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly role: MatrixPairRole;
  readonly direction: 'undirected' | 'from-to';
  readonly evidence: ExpansionEvidenceSpan;
};
export interface ExpansionMatrixLinksScene extends ExpansionStoryBase {
  storyId: '37';
  kind: 'relation-structure';
  preset: 'matrix-links';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly period: string;
  readonly population: string;
  readonly matrix: {
    readonly rowIds: readonly string[];
    readonly columnIds: readonly string[];
    /** Sparse records only. An unrecorded cell is neither a negative nor numeric zero. */
    readonly unrecordedCellMeaning: 'not-supplied';
  };
  readonly graph: {
    readonly entityIds: readonly string[];
    readonly relationIds: readonly string[];
  };
  readonly relations: readonly MatrixPairRelation[];
  readonly sourceSpans: MatrixMatchingBeatEvidence;
  readonly meaning: 'same-entities-explicit-pairs-only';
}
export type CapacityEligibility = MatrixMatchingQualification & {
  readonly id: string;
  readonly candidateId: string;
  readonly destinationId: string;
  /** Absent for unknown/missing/disputed eligibility: absence is never denial. */
  readonly status?: 'eligible' | 'denied';
  readonly evidence: ExpansionEvidenceSpan;
};
export interface CapacityRecord {
  readonly id: string;
  readonly type: 'capacity';
  readonly destinationId: string;
  readonly quantity: ExpansionQuantity;
}
export type CapacityMatchRecord = {
  readonly id: string;
  readonly type: 'match';
  readonly candidateId: string;
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | {
      readonly state: 'known';
      readonly status: 'matched';
      readonly destinationId: string;
    }
  | {
      readonly state: 'conditional';
      readonly status: 'matched';
      readonly destinationId: string;
      readonly condition: string;
    }
  | {
      readonly state: 'illustrative' | 'simulated';
      readonly status: 'matched';
      readonly destinationId: string;
      readonly qualifier: string;
    }
  | {
      readonly state: 'unknown' | 'missing' | 'disputed';
      readonly status: 'unresolved';
      readonly qualifier: string;
    }
);
export interface ExpansionCapacityMatchScene extends ExpansionStoryBase {
  storyId: '38';
  kind: 'semantic-sort';
  preset: 'capacity-match';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly candidateIds: readonly string[];
  readonly destinationIds: readonly string[];
  readonly period: string;
  readonly population: string;
  readonly eligibility: readonly CapacityEligibility[];
  readonly records: readonly (CapacityRecord | CapacityMatchRecord)[];
  readonly sourceSpans: MatrixMatchingBeatEvidence;
  readonly meaning: 'supplied-matches-not-solved-assignment';
}
export type ExpansionMatrixMatchingScene = ExpansionMatrixLinksScene | ExpansionCapacityMatchScene;
