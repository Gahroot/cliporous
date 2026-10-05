/** Local stories 01–02 only; no runtime registration or renderer contract is implied. */
import type { ExpansionEntity, ExpansionRelation, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan } from '../value-types';

/** Content retains the complete attributed statement, including qualifiers and negation. */
export type ReasoningTraceRecord = {
  readonly entityId: string;
  readonly content: string;
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | { readonly role: 'claim' }
  | { readonly role: 'excerpt' | 'statement'; readonly sourceId: string }
);

export interface ReasoningTraceRelation extends ExpansionRelation {
  readonly role: 'provenance' | 'support' | 'rebuttal';
}

export interface ReasoningTraceBeatEvidence {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}

export interface EvidenceToClaimTraceScene extends ExpansionStoryBase {
  storyId: '01';
  kind: 'retrieval-grounding';
  preset: 'trace-chain';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly ReasoningTraceRecord[];
  readonly relations: readonly ReasoningTraceRelation[];
  readonly sourceSpans: ReasoningTraceBeatEvidence;
  /** Authored meaning, never a correctness badge or model-provided truth verdict. */
  readonly citationMeaning: 'provenance-not-proof';
}

export interface ClaimSourceBoardScene extends ExpansionStoryBase {
  storyId: '02';
  kind: 'evidence-conflict';
  preset: 'claim-source-board';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly ReasoningTraceRecord[];
  readonly relations: readonly ReasoningTraceRelation[];
  readonly sourceSpans: ReasoningTraceBeatEvidence;
  readonly state: 'disputed' | 'unresolved';
}

export type ReasoningTraceScene = EvidenceToClaimTraceScene | ClaimSourceBoardScene;
