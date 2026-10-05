/** Local stories 09–10; no renderer, registration, medical verdict or confidence badge. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionDerivedValue,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
  ExpansionRational,
} from '../value-types';

export type BaseRateRecordRole =
  | 'population-total'
  | 'subset-total'
  | 'selected-total'
  | 'selected-subset'
  | 'prevalence'
  | 'selection-rate'
  | 'selected-prevalence';
export type BayesUpdateRecordRole =
  | 'prior'
  | 'likelihood-hypothesis'
  | 'likelihood-complement'
  | 'posterior';

export interface ProbabilityQuantityRecord<R extends string> {
  /** Generated from story and record position, never supplied by the model. */
  readonly id: string;
  readonly role: R;
  readonly actorId: string;
  readonly populationId: string;
  readonly quantity: ExpansionQuantity;
}
export interface ProbabilityBeatEvidence {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}
export interface ProbabilityAggregation {
  readonly markCount: 100;
  /** Marks are a schematic aggregate, not a claim of 100 people or individual identities. */
  readonly aggregation: 'schematic-not-individual-counts';
}
export interface BaseRateDerivation {
  readonly role: 'prevalence' | 'selected-prevalence';
  readonly numeratorRecordId: string;
  readonly denominatorRecordId: string;
  readonly value: ExpansionDerivedValue;
}
export interface ExpansionBaseRateScene extends ExpansionStoryBase {
  storyId: '09';
  kind: 'probability-workbench';
  preset: 'base-rate';
  treatment?: never;
  readonly representation: 'counts' | 'rates';
  readonly entities: readonly ExpansionEntity[];
  readonly populationId: string;
  readonly subsetId: string;
  readonly selectionId: string;
  readonly records: readonly ProbabilityQuantityRecord<BaseRateRecordRole>[];
  readonly relationEvidence: ExpansionEvidenceSpan;
  readonly sourceSpans: ProbabilityBeatEvidence;
  readonly derivations: readonly BaseRateDerivation[];
  readonly status: 'source-qualified' | 'derived';
  readonly display: ProbabilityAggregation;
}
export interface BayesRatioDerivation {
  /** Complete supplied operands remain separate from the computed ratio operands. */
  readonly supplied: {
    readonly priorRecordId: string;
    readonly likelihoodHypothesisRecordId: string;
    readonly likelihoodComplementRecordId: string;
    readonly prior: ExpansionRational;
    readonly likelihoodHypothesis: ExpansionRational;
    readonly likelihoodComplement: ExpansionRational;
  };
  readonly complementPrior: ExpansionRational;
  readonly value: ExpansionDerivedValue;
}
export type BayesUpdateResult =
  | { readonly state: 'unresolved' }
  | { readonly state: 'source-stated'; readonly posteriorRecordId: string }
  | { readonly state: 'derived'; readonly derivation: BayesRatioDerivation };
export interface ExpansionBayesUpdateScene extends ExpansionStoryBase {
  storyId: '10';
  kind: 'probability-workbench';
  preset: 'bayes-update';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly populationId: string;
  readonly hypothesisId: string;
  readonly evidenceId: string;
  readonly complementId?: string;
  readonly records: readonly ProbabilityQuantityRecord<BayesUpdateRecordRole>[];
  readonly relationEvidence: ExpansionEvidenceSpan;
  readonly sourceSpans: ProbabilityBeatEvidence;
  readonly update: BayesUpdateResult;
  readonly meaning: 'source-qualified-not-certainty';
  readonly display: ProbabilityAggregation;
}
export type ProbabilityBaseUpdateScene = ExpansionBaseRateScene | ExpansionBayesUpdateScene;
