import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

/** Attribution is not adjudication: a reported statement never becomes guaranteed truth. */
export type ScopedStatementStatus = 'reported' | 'disputed' | 'unresolved';
export type ScopedComparisonStatus = 'disputed' | 'unresolved';
export type ScopedStatementDimension = 'actor' | 'version' | 'period' | 'scope';

export interface ExpansionScopedStatement {
  readonly id: string;
  readonly label: string;
  readonly actorId: string;
  readonly sourceId: string;
  readonly version: string;
  readonly period: string;
  readonly scope: string;
  /** Complete quoted content, including negation, numeric precision and qualifications. */
  readonly claim: string;
  readonly status: ScopedStatementStatus;
  readonly condition?: string;
  readonly evidence: ExpansionEvidenceSpan;
}

export type ExpansionScopedRelation = {
  readonly fromId: string;
  readonly toId: string;
  readonly status: ScopedComparisonStatus;
  readonly condition?: string;
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | { readonly role: 'scope-distinction'; readonly dimension: ScopedStatementDimension }
  | { readonly role: 'conflict' }
);

export interface ExpansionScopedStatementsScene extends ExpansionStoryBase {
  readonly storyId: '07';
  readonly kind: 'evidence-conflict';
  readonly preset: 'scoped-statements';
  readonly treatment?: never;
  readonly actors: readonly ExpansionEntity[];
  readonly statements: readonly ExpansionScopedStatement[];
  readonly relations: readonly ExpansionScopedRelation[];
  readonly result: {
    readonly status: ScopedComparisonStatus;
    readonly evidence: ExpansionEvidenceSpan;
    readonly condition?: string;
  };
}

export interface ExpansionFramingFact {
  readonly id: string;
  readonly actorId: string;
  readonly label: string;
  readonly quantity: ExpansionQuantity;
}

export interface ExpansionFactFrame {
  readonly id: string;
  readonly label: string;
  /** Both frames point to the very same complete fact pool, never copies with edited amounts. */
  readonly factIds: readonly string[];
  readonly referenceFactId: string;
  readonly evidence: ExpansionEvidenceSpan;
}

export interface ExpansionFramingRelation {
  readonly fromId: string;
  readonly toId: string;
  readonly role: 'reference-change' | 'denominator-change';
  readonly fromReferenceId: string;
  readonly toReferenceId: string;
  readonly evidence: ExpansionEvidenceSpan;
  readonly condition?: string;
}

export interface ExpansionSameFactsScene extends ExpansionStoryBase {
  readonly storyId: '08';
  readonly kind: 'framing-comparison';
  readonly preset: 'same-facts';
  readonly treatment?: never;
  readonly actors: readonly ExpansionEntity[];
  readonly facts: readonly ExpansionFramingFact[];
  readonly frames: readonly [ExpansionFactFrame, ExpansionFactFrame];
  readonly relations: readonly [ExpansionFramingRelation];
  readonly result: {
    readonly status: 'unchanged';
    readonly evidence: ExpansionEvidenceSpan;
    readonly condition?: string;
  };
  // Catalog story 08 currently authorizes no derivations. There is intentionally no ratio field.
}

export type ExpansionReasoningScopeScene = ExpansionScopedStatementsScene | ExpansionSameFactsScene;
