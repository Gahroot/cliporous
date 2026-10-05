/** Local decision stories 25–26; judgments are source-stated, frontier is never a winner. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionBasis,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
  ExpansionRational,
} from '../value-types';

export interface DecisionBeatEvidence {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}
export interface SieveRequirement {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly evidence: ExpansionEvidenceSpan;
}
export type SieveJudgment =
  | { readonly state: 'known'; readonly status: 'pass' | 'fail' }
  | { readonly state: 'unknown' | 'missing'; readonly qualifier: string }
  | {
      readonly state: 'disputed';
      readonly alternatives: readonly ['pass', 'fail'];
      readonly qualifier: string;
    }
  | { readonly state: 'conditional'; readonly status: 'pass' | 'fail'; readonly condition: string }
  | {
      readonly state: 'illustrative' | 'simulated';
      readonly status: 'pass' | 'fail';
      readonly qualifier: string;
    };
export type SieveCheck = SieveJudgment & {
  readonly id: string;
  readonly optionId: string;
  readonly requirementId: string;
  readonly evidence: ExpansionEvidenceSpan;
};
export interface ExpansionSieveScene extends ExpansionStoryBase {
  storyId: '25';
  kind: 'constraint-choice';
  preset: 'sieve';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly period: string;
  readonly population: string;
  readonly requirements: readonly SieveRequirement[];
  readonly records: readonly SieveCheck[];
  readonly sourceSpans: DecisionBeatEvidence;
  readonly meaning: 'source-stated-checks-not-winner';
}
export interface ParetoCriterion {
  readonly id: string;
  readonly label: string;
  readonly direction: 'minimize' | 'maximize';
  readonly evidence: ExpansionEvidenceSpan;
}
export interface ParetoMetricRecord {
  readonly id: string;
  readonly optionId: string;
  readonly criterionId: string;
  readonly quantity: ExpansionQuantity;
}
export interface ParetoOperand {
  readonly recordId: string;
  readonly optionId: string;
  readonly criterionId: string;
  readonly value: ExpansionRational;
  readonly basis: ExpansionBasis;
  readonly evidence: ExpansionEvidenceSpan;
}
export type ParetoFrontierResult =
  | { readonly state: 'source-qualified' }
  | {
      readonly state: 'derived';
      readonly operation: 'pareto';
      readonly operands: readonly ParetoOperand[];
      readonly nondominatedOptionIds: readonly string[];
      readonly dominations: readonly { readonly fromId: string; readonly toId: string }[];
    };
export interface ExpansionParetoScene extends ExpansionStoryBase {
  storyId: '26';
  kind: 'tradeoff-frontier';
  preset: 'pareto';
  treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly period: string;
  readonly population: string;
  readonly criteria: readonly ParetoCriterion[];
  readonly records: readonly ParetoMetricRecord[];
  readonly comparisonEvidence: ExpansionEvidenceSpan;
  readonly result: ParetoFrontierResult;
  readonly sourceSpans: DecisionBeatEvidence;
  readonly meaning: 'nondominated-not-universal-superiority';
}
export type ExpansionSieveFrontierScene = ExpansionSieveScene | ExpansionParetoScene;
