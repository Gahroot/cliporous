/** Step 8 stories 05–06 only. Semantic payloads, not renderer or global kind registration. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan } from '../value-types';

export interface ExpansionAssociation {
  readonly fromId: string;
  readonly toId: string;
  readonly role: 'association';
  readonly evidence: ExpansionEvidenceSpan;
}

/** Both endpoints are expressly named in one factor clause; possibility is not an effect measurement. */
export type ExpansionConfoundingFactor = {
  readonly entityId: string;
  readonly affectsIds: readonly [string, string];
  readonly evidence: ExpansionEvidenceSpan;
  readonly condition?: string;
} & (
  | { readonly certainty: 'stated'; readonly qualification?: never }
  | { readonly certainty: 'possible'; readonly qualification: 'may' | 'might' | 'could' }
);

export interface ExpansionUnestablishedCause {
  readonly fromId: string;
  readonly toId: string;
  readonly status: 'unestablished';
  /** Exact local causal qualification, not a parser-generated claim of no causal effect. */
  readonly qualification: string;
  readonly evidence: ExpansionEvidenceSpan;
}

export interface ExpansionConfounderScene extends ExpansionStoryBase {
  storyId: '05';
  kind: 'relationship-analysis';
  preset: 'confounder';
  evidence: 'source-stated';
  treatment?: never;
  readonly scope: string;
  readonly entities: readonly ExpansionEntity[];
  readonly association: ExpansionAssociation;
  readonly factor: ExpansionConfoundingFactor;
  readonly causalStatus: ExpansionUnestablishedCause;
  readonly resolutionEvidence: ExpansionEvidenceSpan;
}

interface ExpansionInformationRecordBase {
  readonly id: string;
  readonly ownerId: string;
  readonly topic: string;
  readonly evidence: ExpansionEvidenceSpan;
}

/** Missing/unknown have no value slot. Explicitly sourced zero/false can only be known content. */
export type ExpansionInformationRecord = ExpansionInformationRecordBase &
  (
    | { readonly state: 'known'; readonly content: string; readonly qualification?: never }
    | {
        readonly state: 'missing' | 'unknown';
        readonly qualification: string;
        readonly content?: never;
      }
  );

export interface ExpansionMissingEvidenceMapScene extends ExpansionStoryBase {
  storyId: '06';
  kind: 'retrieval-grounding';
  preset: 'missing-evidence-map';
  evidence: 'source-stated';
  treatment?: never;
  readonly scope: string;
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly ExpansionInformationRecord[];
  readonly focusRecordId: string;
  readonly nonFalse: {
    readonly recordId: string;
    readonly qualification: string;
    readonly evidence: ExpansionEvidenceSpan;
  };
  readonly resolution: {
    readonly recordId: string;
    readonly status: 'unresolved';
    readonly evidence: ExpansionEvidenceSpan;
  };
}

export type ExpansionReasoningInformationScene =
  | ExpansionConfounderScene
  | ExpansionMissingEvidenceMapScene;
