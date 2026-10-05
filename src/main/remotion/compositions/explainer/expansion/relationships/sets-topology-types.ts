/** Step12 source-only stories 39–40. React-free; no inferred set or network results. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan } from '../value-types';

export type ExpansionRelationshipStatus =
  | { readonly state: 'known' }
  | { readonly state: 'conditional'; readonly condition: string }
  | { readonly state: 'illustrative' | 'simulated'; readonly qualification: string }
  | { readonly state: 'unknown' | 'missing' | 'disputed'; readonly qualification: string };

export type ExpansionSetOperation = 'intersection' | 'union' | 'exclusion';
export type ExpansionSetMembership = ExpansionRelationshipStatus & {
  readonly id: string;
  readonly memberId: string;
  readonly setId: string;
  /** Omitted for unknown/missing/disputed, never silently converted to excluded. */
  readonly membership?: 'included' | 'excluded';
  readonly evidence: ExpansionEvidenceSpan;
};
export type ExpansionSetSelection =
  | {
      readonly state: 'complete';
      /** Supplied source selection, checked for consistency; never populated by the parser. */
      readonly memberIds: readonly string[];
      readonly evidence: ExpansionEvidenceSpan;
    }
  | {
      readonly state: 'unresolved';
      readonly qualification: string;
      readonly evidence: ExpansionEvidenceSpan;
    };
export interface ExpansionSetOperationsScene extends ExpansionStoryBase {
  readonly storyId: '39';
  readonly kind: 'venn';
  readonly preset: 'set-operations';
  readonly template: 'named-sets';
  readonly entities: readonly ExpansionEntity[];
  readonly memberIds: readonly string[];
  readonly setIds: readonly string[];
  readonly scope: string;
  readonly period: string;
  readonly memberships: readonly ExpansionSetMembership[];
  readonly operation: {
    readonly kind: ExpansionSetOperation;
    readonly leftId: string;
    readonly rightId: string;
    readonly evidence: ExpansionEvidenceSpan;
  };
  readonly selection: ExpansionSetSelection;
}

/** Slots/links describe authored presentation eligibility, not asserted source connectivity. */
export const EXPANSION_TOPOLOGY_TEMPLATES = Object.freeze({
  chain: Object.freeze({
    nodes: 4,
    links: Object.freeze([
      Object.freeze([0, 1] as const),
      Object.freeze([1, 2] as const),
      Object.freeze([2, 3] as const),
    ]),
  }),
  ring: Object.freeze({
    nodes: 4,
    links: Object.freeze([
      Object.freeze([0, 1] as const),
      Object.freeze([1, 2] as const),
      Object.freeze([2, 3] as const),
      Object.freeze([3, 0] as const),
    ]),
  }),
  diamond: Object.freeze({
    nodes: 4,
    links: Object.freeze([
      Object.freeze([0, 1] as const),
      Object.freeze([0, 2] as const),
      Object.freeze([1, 3] as const),
      Object.freeze([2, 3] as const),
    ]),
  }),
});
export type ExpansionTopologyTemplate = keyof typeof EXPANSION_TOPOLOGY_TEMPLATES;
export const EXPANSION_TOPOLOGY_ROLES = ['dependency', 'transfer', 'membership'] as const;
export type ExpansionTopologyRole = (typeof EXPANSION_TOPOLOGY_ROLES)[number];
export type ExpansionTopologyEdge = ExpansionRelationshipStatus & {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly role: ExpansionTopologyRole;
  /** Failed is not absent. Unknown/missing/disputed omit status, not the edge record. */
  readonly status?: 'present' | 'absent' | 'failed';
  readonly evidence: ExpansionEvidenceSpan;
};
export type ExpansionTopologyOutcome = ExpansionRelationshipStatus & {
  readonly actorId: string;
  readonly claim: string;
  /** Only an explicitly supplied result; no connectivity/resilience/winner calculation. */
  readonly result?: 'continues' | 'stops' | 'unchanged';
  readonly evidence: ExpansionEvidenceSpan;
};
export interface ExpansionTopologyScene extends ExpansionStoryBase {
  readonly storyId: '40';
  readonly kind: 'collective-pattern';
  readonly preset: 'topology';
  readonly template: ExpansionTopologyTemplate;
  readonly entities: readonly ExpansionEntity[];
  readonly scope: string;
  readonly period: string;
  readonly edges: readonly ExpansionTopologyEdge[];
  readonly failure: {
    readonly id: 'expansion-40-failure-0';
    readonly edgeId: string;
    readonly state: 'conditional';
    readonly condition: string;
    readonly effect: 'failed' | 'absent' | 'unknown' | 'missing' | 'disputed';
    readonly evidence: ExpansionEvidenceSpan;
  };
  readonly result: ExpansionTopologyOutcome;
}

/** Frozen local union; parent owns aggregate/spec registration and rendering. */
export type ExpansionSetsTopologyScene = ExpansionSetOperationsScene | ExpansionTopologyScene;
