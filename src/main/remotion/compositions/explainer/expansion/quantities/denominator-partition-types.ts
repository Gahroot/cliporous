/** Approved quantity stories 19–20 only; no global scene registration. */
import type { ExpansionEntity, ExpansionRelation, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionBasis,
  ExpansionDerivedValue,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
} from '../value-types';

export interface ExpansionDenominatorRecord {
  readonly entityId: string;
  readonly actorId: string;
  readonly amount: ExpansionQuantity;
  readonly reference: ExpansionQuantity;
}
export interface ExpansionDenominatorDerived extends ExpansionDerivedValue {
  readonly sourceQuantities: readonly [ExpansionQuantity, ExpansionQuantity];
  readonly operandBases: readonly [ExpansionBasis, ExpansionBasis];
}
export interface ExpansionDenominatorScene extends ExpansionStoryBase {
  storyId: '19';
  kind: 'quantity-comparison';
  preset: 'denominator';
  entities: ExpansionEntity[];
  ownerId: string;
  metricId: string;
  comparisons: ExpansionDenominatorRecord[];
  ordering?: {
    readonly fromId: string;
    readonly toId: string;
    readonly evidence: ExpansionEvidenceSpan;
  };
  derived: ExpansionDenominatorDerived[];
  resolutionText: string;
}

export interface ExpansionPartitionRecord {
  readonly entityId: string;
  readonly role: 'part' | 'remainder';
  readonly quantity: ExpansionQuantity;
}
export interface ExpansionPartitionScene extends ExpansionStoryBase {
  storyId: '20';
  kind: 'composition-view';
  preset: 'partition';
  entities: ExpansionEntity[];
  ownerId: string;
  wholeId: string;
  total: ExpansionQuantity;
  parts: ExpansionPartitionRecord[];
  relations: ExpansionRelation[];
  /** Complete source resolve clause, not an inferred remainder. */
  resolutionText: string;
}
export type ExpansionDenominatorPartitionScene =
  | ExpansionDenominatorScene
  | ExpansionPartitionScene;
