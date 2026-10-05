/** Stories 17–18 only; no smoothing, generated samples or universal winner. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionDerivedValue,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
  ExpansionRational,
  ExpansionUnit,
} from '../value-types';

export interface DistributionSourceSpans {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}
export interface HistogramBoundary {
  readonly value: ExpansionRational;
  readonly notation: string;
}
export type HistogramRecord =
  | {
      readonly id: string;
      readonly role: 'bin';
      readonly label: string;
      readonly lower: HistogramBoundary;
      readonly upper: HistogramBoundary;
      readonly lowerInclusive: true;
      readonly upperInclusive: false;
      readonly rangeEvidence: ExpansionEvidenceSpan;
      readonly count: ExpansionQuantity;
    }
  | { readonly id: string; readonly role: 'observation'; readonly quantity: ExpansionQuantity };
export interface ExpansionHistogramScene extends ExpansionStoryBase {
  storyId: '17';
  kind: 'distribution-view';
  preset: 'histogram';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly actorId: string;
  readonly metric: string;
  readonly valueUnit: ExpansionUnit;
  readonly representation: 'bins' | 'observations';
  readonly records: readonly HistogramRecord[];
  readonly sourceSpans: DistributionSourceSpans;
  readonly dataMeaning: 'supplied-only-no-smoothing';
}
export interface SubgroupCountRecord {
  readonly id: string;
  readonly actorId: string;
  readonly groupId: string;
  readonly numerator: ExpansionQuantity;
  readonly denominator: ExpansionQuantity;
}
export interface SubgroupRate {
  readonly recordId: string;
  readonly actorId: string;
  readonly groupId: string;
  readonly value: ExpansionDerivedValue;
}
export interface SubgroupAggregate {
  readonly actorId: string;
  readonly numerator: ExpansionDerivedValue;
  readonly denominator: ExpansionDerivedValue;
  readonly rate: ExpansionDerivedValue;
}
export type SubgroupReversalResult =
  | {
      readonly state: 'derived';
      readonly subgroupRates: readonly SubgroupRate[];
      readonly aggregates: readonly SubgroupAggregate[];
    }
  | { readonly state: 'source-qualified' };
export interface ExpansionSubgroupReversalScene extends ExpansionStoryBase {
  storyId: '18';
  kind: 'distribution-view';
  preset: 'subgroup-reversal';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly actorIds: readonly [string, string];
  readonly groupIds: readonly string[];
  readonly metric: string;
  readonly aggregatePopulation: string;
  readonly records: readonly SubgroupCountRecord[];
  readonly aggregateEvidence: ExpansionEvidenceSpan;
  readonly reversalEvidence: ExpansionEvidenceSpan;
  readonly sourceSpans: DistributionSourceSpans;
  readonly subgroupHigherActorId: string;
  readonly aggregateHigherActorId: string;
  readonly result: SubgroupReversalResult;
  readonly meaning: 'scope-bound-not-universal-winner';
}
export type ExpansionDistributionScene = ExpansionHistogramScene | ExpansionSubgroupReversalScene;
