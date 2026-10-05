/** Local stories 33–34. Types and rights stay separate; no transitive or numeric inference. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export interface TaxonomyRightsBeatEvidence {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}

export type SourceRelationshipState<T extends string> =
  | { readonly state: 'known'; readonly status: T }
  | { readonly state: 'unknown' | 'missing'; readonly qualifier: 'unknown' | 'missing' }
  | {
      readonly state: 'disputed';
      readonly alternatives: readonly [T, T];
      readonly qualifier: 'disputed';
    }
  | { readonly state: 'conditional'; readonly status: T; readonly condition: string }
  | {
      readonly state: 'illustrative' | 'simulated';
      readonly status: T;
      readonly qualifier: string;
    };

export interface TaxonomyEntity extends ExpansionEntity {
  readonly type: 'category' | 'member';
}
export interface RightsEntity extends ExpansionEntity {
  readonly type: 'actor' | 'resource';
}
export interface TaxonomyRecord {
  readonly id: string;
  readonly entityId: string;
  readonly type: TaxonomyEntity['type'];
  readonly evidence: ExpansionEvidenceSpan;
}
export interface RightsRecord {
  readonly id: string;
  readonly entityId: string;
  readonly type: RightsEntity['type'];
  readonly evidence: ExpansionEvidenceSpan;
}
export type TaxonomyRelation = SourceRelationshipState<'included' | 'excluded'> & {
  readonly id: string;
  /** Child category or member → explicitly named parent/category; never dependency or transfer. */
  readonly fromId: string;
  readonly toId: string;
  readonly role: 'parent' | 'membership';
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
};
export interface ExpansionTaxonomyScene extends ExpansionStoryBase {
  storyId: '33';
  kind: 'relation-structure';
  preset: 'taxonomy';
  treatment?: never;
  readonly template: 'nested-categories';
  readonly entities: readonly TaxonomyEntity[];
  /** Source type declarations, not generated classifications. */
  readonly records: readonly TaxonomyRecord[];
  readonly relations: readonly TaxonomyRelation[];
  readonly scope: string;
  readonly period: string;
  readonly sourceSpans: TaxonomyRightsBeatEvidence;
  readonly meaning: 'explicit-hierarchy-not-dependency-or-transfer';
}

export interface RightsShare {
  /** A supplied share, not a computed remainder, total, conversion or grant. */
  readonly quantity: ExpansionQuantity;
  readonly denominatorUnit: 'count' | 'percent' | 'ratio';
  readonly basisEvidence: ExpansionEvidenceSpan;
}
export type RightsRelation = SourceRelationshipState<'granted' | 'denied'> & {
  readonly id: string;
  readonly actorId: string;
  readonly resourceId: string;
  readonly right: 'economic' | 'voting' | 'control';
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
  /** Never present on control: voting/economic amounts do not establish control. */
  readonly share?: RightsShare;
};
export interface ExpansionDualRightsScene extends ExpansionStoryBase {
  storyId: '34';
  kind: 'ownership-change';
  preset: 'dual-rights';
  treatment?: never;
  readonly template: 'dual-rights-board';
  readonly entities: readonly RightsEntity[];
  readonly records: readonly RightsRecord[];
  readonly relations: readonly RightsRelation[];
  readonly scope: string;
  readonly period: string;
  readonly sourceSpans: TaxonomyRightsBeatEvidence;
  readonly meaning: 'separate-source-stated-rights-not-inferred-control';
}

export type ExpansionTaxonomyRightsScene = ExpansionTaxonomyScene | ExpansionDualRightsScene;
