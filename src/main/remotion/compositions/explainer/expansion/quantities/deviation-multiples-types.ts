/** Ordered step 10 stories 23–24 only. Source semantics, not renderer/global registration. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionDerivedValue,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
} from '../value-types';

export type ExpansionDeviationResult =
  | (ExpansionDerivedValue & { readonly source?: ExpansionQuantity })
  | { readonly state: 'source-qualified'; readonly quantity: ExpansionQuantity };

export interface ExpansionDeviationScene extends ExpansionStoryBase {
  storyId: '23';
  kind: 'quantity-comparison';
  preset: 'deviation';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly actorId: string;
  readonly domain: string;
  readonly target: ExpansionQuantity;
  readonly observation: ExpansionQuantity;
  readonly comparisonEvidence: ExpansionEvidenceSpan;
  /** Only known observation minus known target is derived; all other states retain source status. */
  readonly result: ExpansionDeviationResult;
  /** Supplied independently, never an implicitly calculated rate or percent change. */
  readonly relative?: ExpansionQuantity;
}

export interface ExpansionMultipleRecord {
  readonly id: string;
  readonly entityId: string;
  readonly quantity: ExpansionQuantity;
}

export interface ExpansionSmallMultiplesScene extends ExpansionStoryBase {
  storyId: '24';
  kind: 'quantity-comparison';
  preset: 'small-multiples';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly domain: string;
  /** Portrait layout deliberately caps this authored comparison at four options/records. */
  readonly records: readonly ExpansionMultipleRecord[];
  readonly comparisonEvidence: ExpansionEvidenceSpan;
  readonly conclusion: {
    readonly qualification: string;
    readonly evidence: ExpansionEvidenceSpan;
  };
}

export type ExpansionDeviationMultiplesScene =
  | ExpansionDeviationScene
  | ExpansionSmallMultiplesScene;
