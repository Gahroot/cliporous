import type { ExplanationVisualMode } from '../../diagrams/types';
import type { BusinessEvidence, BusinessIdentity, BusinessWordSpan } from '../types';

/** Source identity of the actual baseline, not a native model inferred from a scenario. */
export interface BusinessAlternativesBaseline {
  identity: BusinessIdentity;
  subject: BusinessIdentity;
  period: string;
  revision: string;
  source: BusinessWordSpan;
}

export interface BusinessAlternativeRecord {
  alternativeId: string;
  baselineId: string;
  subjectId: string;
  period: string;
  revision: string;
  identity: BusinessIdentity;
  source: BusinessWordSpan;
}

/** Independent literal record-assembly evidence; A-03 never means achieved branches/output. */
export interface BusinessAlternativesNative {
  assembly: 'A-03';
  baselineId: string;
  subjectId: string;
  period: string;
  revision: string;
  source: BusinessWordSpan;
}

/** Frozen v1 transport API. visualMode belongs to the raw scene, only alongside this opt-in. */
export interface BusinessAlternativesInput {
  version: 1;
  evidence: BusinessEvidence;
  baseline: BusinessAlternativesBaseline;
  records: BusinessAlternativeRecord[];
  native: BusinessAlternativesNative | null;
}

/** Validated additive lens: no numeric capacities, probabilities, winners or rendering directives. */
export interface BusinessAlternativesLens extends BusinessAlternativesInput {
  visualMode: ExplanationVisualMode;
  finalHoldSeconds: number;
}
