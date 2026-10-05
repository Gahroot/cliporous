/** React-free local stories 53–54. Represented coordinates are facts, not render positions. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionBasis,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
  ExpansionRational,
} from '../value-types';

export interface ProjectionMatrixBeatEvidence {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}
export interface CoordinateFrame {
  readonly id: string;
  readonly label: string;
  readonly axes: readonly [
    { readonly axis: 'x'; readonly positive: 'right' },
    { readonly axis: 'y'; readonly positive: 'up' },
  ];
  readonly evidence: ExpansionEvidenceSpan;
}
export interface SourceCoordinate {
  readonly id: string;
  readonly actorId: string;
  readonly frameId: string;
  readonly axis: 'x' | 'y';
  readonly quantity: ExpansionQuantity;
}
export type CoordinateCorrespondence = {
  readonly id: string;
  readonly fromActorId: string;
  readonly toActorId: string;
  readonly fromFrameId: string;
  readonly toFrameId: string;
  readonly qualifier: 'schematic';
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | { readonly state: 'illustrative'; readonly condition?: never }
  | { readonly state: 'conditional'; readonly condition: string }
);
export interface ExpansionCoordinateProjectionScene extends ExpansionStoryBase {
  storyId: '53';
  kind: 'geometry-projection';
  preset: 'coordinates';
  treatment?: never;
  readonly template: 'orthographic-xy' | 'reference-xy';
  readonly entities: readonly ExpansionEntity[];
  readonly frames: readonly CoordinateFrame[];
  readonly records: readonly SourceCoordinate[];
  readonly relations: readonly CoordinateCorrespondence[];
  readonly period: string;
  readonly population: string;
  readonly sourceSpans: ProjectionMatrixBeatEvidence;
  readonly meaning: 'supplied-coordinates-only';
}

export type MatrixQualification =
  | { readonly state: 'known' }
  | { readonly state: 'conditional'; readonly condition: string }
  | { readonly state: 'illustrative' | 'simulated'; readonly qualifier: string }
  | { readonly state: 'unknown' | 'missing' | 'disputed'; readonly qualifier: string };
export interface MatrixAxisIdentity {
  readonly id: string;
  readonly label: string;
  readonly evidence: ExpansionEvidenceSpan;
}
export interface SuppliedMatrixCell {
  readonly id: string;
  readonly rowId: string;
  readonly columnId: string;
  readonly quantity: ExpansionQuantity;
}
/** Cells are separately capped at 4×4 per matrix; they are not additional pack records. */
export type SuppliedMatrix = MatrixQualification & {
  readonly id: string;
  readonly actorId: string;
  readonly label: string;
  readonly claim: string;
  readonly basis: ExpansionBasis;
  readonly rows: readonly MatrixAxisIdentity[];
  readonly columns: readonly MatrixAxisIdentity[];
  readonly cells: readonly SuppliedMatrixCell[];
  readonly evidence: ExpansionEvidenceSpan;
};
export type MatrixProductRequest = MatrixQualification & {
  readonly id: string;
  readonly actorId: string;
  readonly leftId: string;
  readonly rightId: string;
  readonly operation: 'matrix-product';
  readonly evidence: ExpansionEvidenceSpan;
};
export interface ExactMatrixTerm {
  readonly leftCellId: string;
  readonly rightCellId: string;
  readonly operands: readonly [ExpansionRational, ExpansionRational];
  readonly product: ExpansionRational;
}
export interface DerivedMatrixCell {
  readonly id: string;
  readonly rowId: string;
  readonly columnId: string;
  readonly state: 'derived';
  readonly operation: 'matrix-product';
  readonly terms: readonly ExactMatrixTerm[];
  readonly result: ExpansionRational;
  readonly basis: ExpansionBasis;
  readonly evidence: readonly ExpansionEvidenceSpan[];
}
export type MatrixProduct = {
  readonly id: string;
  readonly requestId: string;
  readonly operandIds: readonly [string, string];
  readonly rows: readonly MatrixAxisIdentity[];
  readonly columns: readonly MatrixAxisIdentity[];
  readonly qualification: MatrixQualification;
} & (
  | {
      readonly state: 'derived';
      readonly operation: 'matrix-product';
      readonly cells: readonly DerivedMatrixCell[];
    }
  | {
      readonly state: 'unavailable';
      readonly reason: 'unresolved-operands';
      readonly cells: readonly [];
    }
);
export interface ExpansionMatrixProductScene extends ExpansionStoryBase {
  storyId: '54';
  kind: 'linear-algebra';
  preset: 'matrix-product';
  treatment?: never;
  readonly template: 'row-column-product';
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly SuppliedMatrix[];
  readonly relations: readonly MatrixProductRequest[];
  readonly products: readonly MatrixProduct[];
  readonly period: string;
  readonly population: string;
  readonly sourceSpans: ProjectionMatrixBeatEvidence;
}

export type ExpansionProjectionMatrixScene =
  | ExpansionCoordinateProjectionScene
  | ExpansionMatrixProductScene;
