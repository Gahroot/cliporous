/** Step 9 stories 13–14 only; semantic payloads, not global registration or render geometry. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export interface ExpansionSampleRecord {
  readonly id: string;
  readonly entityId: string;
  /** Exact source quantity, including actor/period/population/denominator and teaching status. */
  readonly quantity: ExpansionQuantity;
}

export interface ExpansionRepeatedSamplesScene extends ExpansionStoryBase {
  storyId: '13';
  kind: 'probability-workbench';
  preset: 'repeated-samples';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly populationId: string;
  readonly period: string;
  readonly samples: readonly ExpansionSampleRecord[];
  readonly meaning: {
    readonly qualification: 'supplied samples' | 'illustrative samples' | 'teaching samples';
    readonly evidence: ExpansionEvidenceSpan;
  };
  /** Source-stated qualitative difference only; never an inferred distribution/confidence. */
  readonly resolutionEvidence: ExpansionEvidenceSpan;
}

export interface ExpansionQualifiedIntervalScene extends ExpansionStoryBase {
  storyId: '14';
  kind: 'uncertainty-range';
  preset: 'qualified-interval';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly actorId: string;
  readonly populationId: string;
  readonly period: string;
  readonly lower: ExpansionQuantity;
  readonly upper: ExpansionQuantity;
  readonly meaning: {
    readonly kind: 'range' | 'bounds' | 'estimate' | 'uncertain';
    readonly qualification: string;
    readonly evidence: ExpansionEvidenceSpan;
  };
  readonly resolutionEvidence: ExpansionEvidenceSpan;
}

export type ExpansionProbabilityVariationRangeScene =
  | ExpansionRepeatedSamplesScene
  | ExpansionQualifiedIntervalScene;
