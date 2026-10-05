/** Source-only facts. No merge policy, permission execution or version ordering is derived. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan } from '../value-types';

export type VersionsPermissionsStatus =
  | { readonly state: 'known' }
  | { readonly state: 'conditional'; readonly condition: string }
  | {
      readonly state: 'unknown' | 'missing' | 'disputed' | 'simulated' | 'illustrative';
      readonly qualification: string;
      readonly condition?: string;
    };
export interface VersionsPermissionsFact {
  readonly id: string;
  readonly actorId: string;
  readonly resourceId: string;
  readonly replicaId?: string;
  readonly otherReplicaId?: string;
  readonly version?: string;
  readonly operation?: 'read' | 'write' | 'delete' | 'execute';
  readonly result: string;
  readonly role: 'version' | 'conflict' | 'merge' | 'permission';
  readonly status: VersionsPermissionsStatus;
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
}
interface VersionsPermissionsBase extends ExpansionStoryBase {
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly VersionsPermissionsFact[];
  readonly relations: readonly VersionsPermissionsFact[];
  readonly scope: string;
  readonly period: string;
  readonly sourceSpans: Readonly<
    Record<'setup' | 'action' | 'response' | 'check' | 'resolve', ExpansionEvidenceSpan>
  >;
}
export interface ExpansionReplicaMergeScene extends VersionsPermissionsBase {
  kind: 'version-state';
  preset: 'replica-merge';
  storyId: '69';
  template: 'replica-board';
}
export interface ExpansionSoftwareScopeScene extends VersionsPermissionsBase {
  kind: 'property-access';
  preset: 'software-scope';
  storyId: '70';
  template: 'permission-board';
}
export type ExpansionVersionsPermissionsScene =
  | ExpansionReplicaMergeScene
  | ExpansionSoftwareScopeScene;
