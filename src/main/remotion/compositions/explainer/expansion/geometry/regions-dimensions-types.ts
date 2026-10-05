/** STEP15 domain facts. Fixed teaching regions/solids, never caller geometry or real geography. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionBasis,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
  ExpansionRational,
} from '../value-types';

export type ExpansionRegionAssertion<T> =
  | { readonly state: 'known'; readonly value: T }
  | { readonly state: 'conditional'; readonly value: T; readonly condition: string }
  | { readonly state: 'simulated' | 'illustrative'; readonly value: T; readonly qualifier: string }
  | { readonly state: 'unknown' | 'missing' | 'disputed'; readonly qualifier: string };
export interface ExpansionRegionOverlapScene extends ExpansionStoryBase {
  storyId: '63';
  kind: 'region-relation';
  preset: 'overlap';
  template: 'two-authored-regions';
  entities: readonly ExpansionEntity[];
  actorId: string;
  memberId: string;
  regionIds: readonly [string, string];
  scope: string;
  period: string;
  membership: {
    readonly id: string;
    readonly actorId: string;
    readonly memberId: string;
    readonly regionId: string;
    readonly evidence: ExpansionEvidenceSpan;
  } & ExpansionRegionAssertion<'inside' | 'outside'>;
  restriction: {
    readonly id: string;
    readonly actorId: string;
    readonly regionId: string;
    readonly evidence: ExpansionEvidenceSpan;
  } & ExpansionRegionAssertion<string>;
  overlap: {
    readonly id: string;
    readonly actorId: string;
    readonly leftId: string;
    readonly rightId: string;
    readonly evidence: ExpansionEvidenceSpan;
  } & ExpansionRegionAssertion<'overlap' | 'disjoint'>;
  result: {
    readonly state: 'supplied';
    readonly actorId: string;
    readonly claim: 'region summary';
    readonly evidence: ExpansionEvidenceSpan;
  };
}
export const EXPANSION_DIMENSIONAL_OPERATIONS = ['dimensional-scaling'] as const;
export type ExpansionDimensionalTemplate = 'line-length' | 'square-area' | 'cube-volume';
export type ExpansionDimensionalResult =
  | {
      readonly state: 'derived';
      readonly operation: 'dimensional-scaling';
      readonly sourceState: 'known' | 'conditional' | 'simulated' | 'illustrative';
      readonly condition?: string;
      readonly qualifier?: string;
      readonly exponent: 1 | 2 | 3;
      readonly operandIds: readonly [string, string];
      readonly operands: readonly [ExpansionRational, ExpansionRational];
      readonly result: ExpansionRational;
      readonly basis: ExpansionBasis;
      readonly evidence: readonly ExpansionEvidenceSpan[];
    }
  | {
      readonly state: 'unknown' | 'missing' | 'disputed';
      readonly qualifier: string;
      readonly operandIds: readonly [string, string];
      readonly evidence: readonly ExpansionEvidenceSpan[];
    };
export interface ExpansionDimensionalScalingScene extends ExpansionStoryBase {
  storyId: '64';
  kind: 'geometry-projection';
  preset: 'dimensional-scaling';
  template: ExpansionDimensionalTemplate;
  entities: readonly ExpansionEntity[];
  actorId: string;
  scope: string;
  period: string;
  scale: { readonly id: string; readonly quantity: ExpansionQuantity };
  original: { readonly id: string; readonly quantity: ExpansionQuantity };
  request: {
    readonly actorId: string;
    readonly operation: 'dimensional-scaling';
    readonly evidence: ExpansionEvidenceSpan;
  };
  result: ExpansionDimensionalResult;
}
/** Frozen local union; aggregate/spec/registry and rendering are parent-owned. */
export type ExpansionRegionsDimensionsScene =
  | ExpansionRegionOverlapScene
  | ExpansionDimensionalScalingScene;
