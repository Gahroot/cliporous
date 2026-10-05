import type { DiagramStory } from '../../diagrams/types';
import type {
  BusinessEvidence,
  BusinessIdentity,
  BusinessWordSpan,
  QuantityBasis,
  VersionedIdentity,
} from '../types';

export const DECISIONS_LIMITS = {
  entities: 8,
  edges: 12,
  holds: 4,
  pages: 4,
  alternatives: 4,
  quantity: 1_000_000_000,
  probability: 1_000_000,
} as const;
export const DECISIONS_PRESETS = [
  'contingent-commitment',
  'planned-observed',
  'firms-functions-workers',
  'original-and-surviving-cohorts',
  'alternatives-or-source-distribution',
] as const;
export type DecisionState = 'source-stated' | 'pending' | 'negative' | 'conditional' | 'unknown';
export interface DecisionFact {
  readonly state: DecisionState;
  readonly text: string;
  readonly source: BusinessWordSpan;
}
export type DecisionQuantityState =
  | 'planned'
  | 'configured'
  | 'observed'
  | 'pending'
  | 'negative'
  | 'conditional'
  | 'unknown';
export interface DecisionQuantity {
  readonly state: DecisionQuantityState;
  readonly value: number | null;
  readonly basis: QuantityBasis;
  readonly text: string;
  readonly source: BusinessWordSpan;
}
export interface DecisionNativeSource {
  readonly asset: 'A-09' | 'A-06' | 'A-04' | 'A-03';
  readonly identityId: string;
  readonly source: BusinessWordSpan;
  readonly text: string;
}
export interface DecisionsBase extends DiagramStory {
  readonly owner: BusinessIdentity;
  readonly period: string;
  readonly factEvidence:
    | BusinessEvidence
    | {
        readonly state: 'negative' | 'pending' | 'conditional';
        readonly label: string;
        readonly source: BusinessWordSpan;
      };
  readonly modelSource: readonly DecisionNativeSource[] | null;
}
export interface StagedDecisionScene extends DecisionsBase {
  readonly kind: 'staged-decision';
  readonly preset: 'contingent-commitment';
  readonly commitment: VersionedIdentity;
  readonly action: BusinessIdentity;
  readonly gate: BusinessIdentity;
  readonly approver: BusinessIdentity;
  readonly commitmentFact: DecisionFact;
  readonly gateFact: DecisionFact;
  readonly actionFact: DecisionFact;
}
export interface PlannedObservedScene extends DecisionsBase {
  readonly kind: 'measurement-frame';
  readonly preset: 'planned-observed';
  readonly task: BusinessIdentity;
  readonly planned: DecisionQuantity;
  readonly observed: DecisionQuantity;
}
export interface AdoptionFrame {
  readonly frame: 'firms' | 'functions' | 'workers';
  readonly identity: BusinessIdentity;
  readonly quantity: DecisionQuantity;
}
export interface AdoptionFramesScene extends DecisionsBase {
  readonly kind: 'measurement-frame';
  readonly preset: 'firms-functions-workers';
  readonly frames: readonly [AdoptionFrame, AdoptionFrame, AdoptionFrame];
}
export interface DecisionCohort {
  readonly identity: BusinessIdentity;
  readonly quantity: DecisionQuantity;
}
export interface CohortFrameScene extends DecisionsBase {
  readonly kind: 'measurement-frame';
  readonly preset: 'original-and-surviving-cohorts';
  readonly original: DecisionCohort;
  readonly surviving: DecisionCohort;
  readonly attrition: DecisionCohort;
  readonly accounting: DecisionFact;
}
export type MeasurementFrameScene = PlannedObservedScene | AdoptionFramesScene | CohortFrameScene;
export interface DecisionProbability {
  readonly numerator: number;
  readonly denominator: number;
  readonly source: BusinessWordSpan;
  readonly text: string;
}
export interface DecisionAlternative {
  readonly entry: VersionedIdentity;
  readonly fact: DecisionFact;
  readonly probability: DecisionProbability | null;
}
export interface UncertaintyAlbumScene extends DecisionsBase {
  readonly kind: 'uncertainty-album';
  readonly preset: 'alternatives-or-source-distribution';
  readonly setMode: 'qualitative' | 'distribution';
  readonly alternatives: readonly DecisionAlternative[];
  readonly distribution: DecisionFact | null;
}
export type DecisionsScene = StagedDecisionScene | MeasurementFrameScene | UncertaintyAlbumScene;
export interface DecisionRow {
  readonly id: string;
  readonly label: string;
  readonly state: string;
  readonly text: string;
}
/** Freeze only fresh authored results, never the caller's raw/source tree. */
export function immutableDecision<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) immutableDecision(child);
    Object.freeze(value);
  }
  return value;
}
