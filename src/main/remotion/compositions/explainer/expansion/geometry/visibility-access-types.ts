/** Local semantic facts only. Authored layouts never become measured geometry or permissions. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan } from '../value-types';

export type VisibilityAccessState<V extends string> =
  | { readonly state: 'known'; readonly value: V }
  | { readonly state: 'conditional'; readonly value: V; readonly condition: string }
  | { readonly state: 'illustrative' | 'simulated'; readonly value: V; readonly qualifier: string }
  | {
      readonly state: 'unknown' | 'missing' | 'disputed';
      readonly qualifier: string;
      readonly value?: never;
    };
export interface VisibilityAccessBeatEvidence {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}
interface LocalFact {
  readonly id: string;
  readonly actorId: string;
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
}
export type TargetExistence = LocalFact &
  VisibilityAccessState<'present' | 'absent'> & {
    readonly role: 'existence';
    readonly targetId: string;
  };
export type TargetVisibility = LocalFact &
  VisibilityAccessState<'hidden' | 'visible'> & {
    readonly role: 'visibility';
    readonly targetId: string;
    readonly occluderId: string;
    readonly viewpoint: 'front' | 'isometric';
  };
export type OcclusionRelation = LocalFact &
  VisibilityAccessState<'blocked' | 'clear'> & {
    readonly role: 'occlusion';
    readonly targetId: string;
    readonly occluderId: string;
    readonly viewpoint: 'front' | 'isometric';
  };
export interface ExpansionViewpointOcclusionScene extends ExpansionStoryBase {
  storyId: '61';
  kind: 'robot-perception';
  preset: 'viewpoint-occlusion';
  treatment?: never;
  readonly template: 'robot-panel' | 'robot-box';
  readonly viewpoint: 'front' | 'isometric';
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly (TargetExistence | TargetVisibility)[];
  readonly relations: readonly OcclusionRelation[];
  readonly scope: string;
  readonly period: string;
  readonly sourceSpans: VisibilityAccessBeatEvidence;
  readonly meaning: 'hidden-is-not-absent';
  readonly geometryQualification: 'schematic';
}
interface RouteIdentity extends LocalFact {
  readonly fromId: string;
  readonly toId: string;
  readonly routeId: string;
}
export type RouteConnection = RouteIdentity &
  VisibilityAccessState<'connected' | 'disconnected'> & { readonly role: 'route' };
export type RoutePermission = RouteIdentity &
  VisibilityAccessState<'allowed' | 'denied'> & { readonly role: 'permission' };
export type ReachabilityOutcome = RouteIdentity &
  VisibilityAccessState<'reachable' | 'unreachable'> & { readonly role: 'reachability' };
export interface ExpansionReachabilityScene extends ExpansionStoryBase {
  storyId: '62';
  kind: 'property-access';
  preset: 'reachability';
  treatment?: never;
  readonly template: 'gate-route' | 'courtyard-route';
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly (RouteConnection | RoutePermission)[];
  readonly relations: readonly ReachabilityOutcome[];
  readonly scope: string;
  readonly period: string;
  readonly sourceSpans: VisibilityAccessBeatEvidence;
  readonly meaning: 'connection-is-not-permission-or-reachability';
  readonly geographyQualification: 'schematic';
}
export type ExpansionVisibilityAccessScene =
  | ExpansionViewpointOcclusionScene
  | ExpansionReachabilityScene;
