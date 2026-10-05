import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionDerivedValue,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
} from '../value-types';

export interface ExpansionRiskScope {
  readonly period: string;
  readonly population: string;
}

/** Qualitative dimensions are never converted to plotting scores or fabricated rates. */
export type ExpansionRiskDimension =
  | {
      readonly state: 'qualitative';
      readonly label: string;
      readonly basis: ExpansionRiskScope;
      readonly evidence: ExpansionEvidenceSpan;
      readonly condition?: string;
    }
  | {
      readonly state: 'unknown';
      readonly qualifier: string;
      readonly basis: ExpansionRiskScope;
      readonly evidence: ExpansionEvidenceSpan;
      readonly condition?: string;
    }
  | { readonly state: 'quantity'; readonly quantity: ExpansionQuantity };

export interface ExpansionRiskRecord {
  readonly id: string;
  readonly actorId: string;
  readonly eventId: string;
  readonly likelihood: ExpansionRiskDimension;
  readonly impact: ExpansionRiskDimension;
}

export interface ExpansionRiskMatrixScene extends ExpansionStoryBase {
  readonly storyId: '15';
  readonly kind: 'quadrant';
  readonly preset: 'risk-matrix';
  readonly treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly ExpansionRiskRecord[];
  readonly check: { readonly evidence: ExpansionEvidenceSpan; readonly condition?: string };
  readonly result: {
    readonly status: 'scoped';
    readonly evidence: ExpansionEvidenceSpan;
    readonly condition?: string;
  };
}

export type ExpansionCalibrationComparison = {
  readonly evidence: ExpansionEvidenceSpan;
  readonly condition?: string;
} & (
  | { readonly state: 'compared'; readonly relation: 'below' | 'equal' | 'above' }
  | { readonly state: 'uncompared' }
);

export interface ExpansionCalibrationRecord {
  readonly id: string;
  readonly label: string;
  readonly actorId: string;
  readonly prediction: ExpansionQuantity;
  readonly observation: ExpansionQuantity;
  readonly comparison: ExpansionCalibrationComparison;
  /** Only the catalog-authorized exact count/denominator ratio, never a fitted accuracy score. */
  readonly predictionRatio?: ExpansionDerivedValue;
  readonly observationRatio?: ExpansionDerivedValue;
}

export interface ExpansionCalibrationScene extends ExpansionStoryBase {
  readonly storyId: '16';
  readonly kind: 'probability-workbench';
  readonly preset: 'calibration';
  readonly treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly ExpansionCalibrationRecord[];
  readonly result: {
    readonly status: 'scoped';
    readonly evidence: ExpansionEvidenceSpan;
    readonly condition?: string;
  };
}

export type ExpansionRiskCalibrationScene = ExpansionRiskMatrixScene | ExpansionCalibrationScene;
