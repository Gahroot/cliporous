/** Approved decision stories 27–28 only; not runtime registration. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export type ExpansionDecisionState =
  | 'known'
  | 'missing'
  | 'unknown'
  | 'disputed'
  | 'conditional'
  | 'simulated'
  | 'illustrative';
export interface ExpansionDecisionText {
  /** Complete source quotation, not a parser certification of truth. */
  readonly text: string;
  readonly state: ExpansionDecisionState;
  readonly qualifier?: string;
  readonly condition?: string;
  readonly evidence: ExpansionEvidenceSpan;
}
export type ExpansionDecisionResolution =
  | {
      readonly state: 'unknown' | 'unresolved' | 'disputed';
      readonly evidence: ExpansionEvidenceSpan;
    }
  | {
      readonly state: 'source-chosen';
      readonly choiceId: string;
      readonly evidence: ExpansionEvidenceSpan;
    };

export interface ExpansionWeightedCriterion {
  readonly entityId: string;
  readonly weight?: ExpansionQuantity;
}
export interface ExpansionCandidateEffect extends ExpansionDecisionText {
  readonly actorId: string;
  readonly candidateId: string;
  readonly criterionId: string;
}
export interface ExpansionWeightedCriteriaScene extends ExpansionStoryBase {
  storyId: '27';
  kind: 'constraint-choice';
  preset: 'weighted-criteria';
  entities: ExpansionEntity[];
  ownerId: string;
  candidateIds: string[];
  criteria: ExpansionWeightedCriterion[];
  priorities?: {
    readonly before: {
      readonly order: readonly string[];
      readonly evidence: ExpansionEvidenceSpan;
    };
    readonly after: { readonly order: readonly string[]; readonly evidence: ExpansionEvidenceSpan };
  };
  effects: ExpansionCandidateEffect[];
  /** Only explicit source scores. No calculated weighted scores or missing weights. */
  scores: readonly { readonly candidateId: string; readonly quantity: ExpansionQuantity }[];
  resolution: ExpansionDecisionResolution;
  resolutionText: string;
}

export interface ExpansionDecisionNode extends ExpansionDecisionText {
  readonly entityId: string;
  readonly actorId: string;
  readonly role: 'condition' | 'outcome';
}
export interface ExpansionDecisionBranch {
  readonly fromId: string;
  readonly toId: string;
  readonly role: 'conditional';
  /** Exact source branch predicate, never an executable evaluator or assumed true value. */
  readonly test: string;
  readonly evidence: ExpansionEvidenceSpan;
}
export interface ExpansionDecisionTreeScene extends ExpansionStoryBase {
  storyId: '28';
  kind: 'conditional-choice';
  preset: 'decision-tree';
  entities: ExpansionEntity[];
  ownerId: string;
  rootId: string;
  nodes: ExpansionDecisionNode[];
  branches: ExpansionDecisionBranch[];
  resolution: ExpansionDecisionResolution;
  resolutionText: string;
}
export type ExpansionPriorityTreeScene =
  | ExpansionWeightedCriteriaScene
  | ExpansionDecisionTreeScene;
