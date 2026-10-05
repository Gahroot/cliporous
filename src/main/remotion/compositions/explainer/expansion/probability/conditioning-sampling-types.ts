/** Local contracts for approved expansion stories 11–12, not runtime registration. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionDerivedValue,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
  ExpansionRational,
} from '../value-types';

export interface ExpansionPopulationDisplay {
  readonly mode: 'individual' | 'aggregate';
  readonly marks: number;
  /** Exact source count represented by one mark; aggregation is never an invented sample. */
  readonly membersPerMark: ExpansionRational;
}
export interface ExpansionPopulationCount {
  readonly quantity: ExpansionQuantity;
  /** Qualified/unknown/missing/disputed values never receive anonymous zero marks. */
  readonly display?: ExpansionPopulationDisplay;
}

export interface ExpansionConditioningScene extends ExpansionStoryBase {
  storyId: '11';
  kind: 'probability-workbench';
  preset: 'conditioning';
  entities: ExpansionEntity[];
  ownerId: string;
  populationId: string;
  eventId: string;
  subsetId: string;
  denominatorId: string;
  inclusion: { readonly rule: string; readonly evidence: ExpansionEvidenceSpan };
  counts: {
    readonly population: ExpansionPopulationCount;
    readonly subset: ExpansionPopulationCount;
    readonly event: ExpansionPopulationCount;
  };
  /** Whitelisted ratio only, explicitly marked derived with its exact source operands. */
  derived?: ExpansionDerivedValue;
  resolutionText: string;
}

export interface ExpansionSamplingEligibility {
  readonly ownerId: string;
  readonly frameId: string;
  readonly groupId: string;
  readonly rule: string;
  readonly status: 'represented' | 'excluded';
  /** Exclusion applies only to the sampling frame, never existence in the world. */
  readonly scope: 'sampling-frame';
  readonly evidence: ExpansionEvidenceSpan;
}
export interface ExpansionSamplingMeasurement {
  readonly groupId: string;
  readonly quantity: ExpansionQuantity;
  readonly display?: ExpansionPopulationDisplay;
}

export interface ExpansionSelectionBiasScene extends ExpansionStoryBase {
  storyId: '12';
  kind: 'sampling-frame';
  preset: 'selection-bias';
  entities: ExpansionEntity[];
  ownerId: string;
  frameId: string;
  selection: { readonly rule: string; readonly evidence: ExpansionEvidenceSpan };
  eligibility: ExpansionSamplingEligibility[];
  representedIds: string[];
  excludedIds: string[];
  measurements: ExpansionSamplingMeasurement[];
  resolveGroupId: string;
  resolutionText: string;
}

export type ExpansionConditioningSamplingScene =
  | ExpansionConditioningScene
  | ExpansionSelectionBiasScene;
