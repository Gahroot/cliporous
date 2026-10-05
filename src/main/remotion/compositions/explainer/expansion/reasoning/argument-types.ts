/** Stories 03–04 only. These local contracts are not global scene registration. */
import type { ExpansionEntity, ExpansionRelation, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan } from '../value-types';

export type ExpansionArgumentRole = 'claim' | 'premise' | 'objection';
export type ExpansionArgumentEdgeState =
  | 'stated'
  | 'qualified'
  | 'unknown'
  | 'disputed'
  | 'negated';
export type ExpansionArgumentResolution = 'unknown' | 'disputed' | 'unresolved';

export interface ExpansionArgumentNode {
  readonly entityId: string;
  readonly actorId: string;
  readonly role: ExpansionArgumentRole;
  /** Complete actor-owned quotation, including negation, uncertainty and numeric lexemes.
   * It is the speaker's proposition, never a parser certification that it is true. */
  readonly statement: string;
  readonly evidence: ExpansionEvidenceSpan;
  readonly condition?: string;
}

export interface ExpansionArgumentEdge extends ExpansionRelation {
  readonly role: 'support' | 'rebuttal';
  /** A support link is argumentation, not proof. Negated/unknown links are not affirmative. */
  readonly state: ExpansionArgumentEdgeState;
  readonly qualifier?: string;
}

export interface ArgumentMapReasonsObjectionsScene extends ExpansionStoryBase {
  storyId: '03';
  kind: 'argument-map';
  preset: 'reasons-objections';
  entities: ExpansionEntity[];
  claimId: string;
  nodes: ExpansionArgumentNode[];
  edges: ExpansionArgumentEdge[];
  resolution: ExpansionArgumentResolution;
}

export interface ExpansionConditionalEffect {
  readonly alternativeId: string;
  readonly actorId: string;
  /** Complete stated effect. In particular, unknown/disputed/modal effects stay textual;
   * there is no inferred counterfactual value, score, truth flag or winner. */
  readonly text: string;
  readonly condition: string;
  readonly evidence: ExpansionEvidenceSpan;
}

export interface ConditionalComparisonAssumptionToggleScene extends ExpansionStoryBase {
  storyId: '04';
  kind: 'conditional-comparison';
  preset: 'assumption-toggle';
  condition: string;
  entities: ExpansionEntity[];
  actorId: string;
  alternativeIds: readonly [string, string];
  effects: ExpansionConditionalEffect[];
  resolution: ExpansionArgumentResolution;
}

export type ExpansionReasoningArgumentScene =
  | ArgumentMapReasonsObjectionsScene
  | ConditionalComparisonAssumptionToggleScene;
