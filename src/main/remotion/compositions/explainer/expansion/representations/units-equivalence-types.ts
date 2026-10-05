/** Frozen local contracts. Domain measures are exact rationals, never animation seconds. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionBasis,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
  ExpansionRational,
  ExpansionUnit,
} from '../value-types';

export interface ExpansionRepresentationRecord {
  readonly id: string;
  readonly actorId: string;
  readonly identity: string;
  readonly quantity: ExpansionQuantity;
}
export interface ExpansionRepresentationFact {
  readonly actorId: string;
  readonly identity: string;
  readonly population: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
}
interface RepresentationBase extends ExpansionStoryBase {
  kind: 'representation-transform';
  readonly actors: readonly ExpansionEntity[];
  readonly identity: string;
  readonly population: string;
  readonly period: string;
}
export interface ExpansionConversionRequest extends ExpansionRepresentationFact {
  readonly fromUnit: ExpansionUnit;
  readonly toUnit: ExpansionUnit;
}
export type ExpansionConversionResult = {
  readonly id: string;
  readonly operation: 'unit-conversion';
  readonly sourceState: ExpansionQuantity['state'];
  readonly operand: ExpansionQuantity;
  readonly originalBasis: ExpansionBasis;
  readonly basis: ExpansionBasis;
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | {
      readonly state: 'derived';
      readonly values: readonly { readonly state: 'derived'; readonly value: ExpansionRational }[];
    }
  | { readonly state: 'unknown' | 'missing'; readonly values?: never }
);
export interface ExpansionUnitConversionScene extends RepresentationBase {
  storyId: '49';
  preset: 'unit-conversion';
  template: 'compatible-units';
  readonly record: ExpansionRepresentationRecord;
  readonly conversion: ExpansionConversionRequest;
  readonly result: ExpansionConversionResult;
}
export type ExpansionEquivalentViewKind = 'set' | 'area' | 'length';
export interface ExpansionEquivalentView {
  readonly id: string;
  readonly kind: ExpansionEquivalentViewKind;
  readonly quantityIds: readonly [string, string];
  /** Aggregate marks are not named/invented population members. */
  readonly marks?: number;
  readonly unitsPerMark?: ExpansionRational;
  readonly selectedMarks?: number;
  readonly ratio?: ExpansionRational;
}
export type ExpansionEquivalenceResult = {
  readonly id: string;
  readonly operation: 'ratio';
  readonly sourceStates: readonly [ExpansionQuantity['state'], ExpansionQuantity['state']];
  readonly operands: readonly [ExpansionQuantity, ExpansionQuantity];
  readonly basis: ExpansionBasis;
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | { readonly state: 'derived'; readonly ratio: ExpansionRational }
  | { readonly state: 'unknown' | 'missing' | 'disputed'; readonly ratio?: never }
);
export interface ExpansionEquivalenceScene extends RepresentationBase {
  storyId: '50';
  preset: 'equivalence';
  template: 'equivalent-views';
  readonly records: readonly [ExpansionRepresentationRecord, ExpansionRepresentationRecord];
  readonly views: readonly ExpansionEquivalentView[];
  readonly aggregation: ExpansionRepresentationFact & {
    readonly marks?: number;
    readonly unitsPerMark?: ExpansionRational;
  };
  readonly result: ExpansionEquivalenceResult;
}
export type ExpansionUnitsEquivalenceScene =
  | ExpansionUnitConversionScene
  | ExpansionEquivalenceScene;
