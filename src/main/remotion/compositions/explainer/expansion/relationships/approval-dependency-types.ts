/** React-free source facts for STEP12 stories 35–36; presentation never changes authority. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export type ExpansionDependencyStatus =
  | { readonly state: 'known' | 'unknown' | 'missing' | 'disputed' }
  | { readonly state: 'conditional'; readonly condition: string };
export type ExpansionRelationshipStatus = ExpansionDependencyStatus | { readonly state: 'pending' };
export type ExpansionAuthorizationStatus =
  | { readonly state: 'allowed' | 'denied' | 'pending' | 'unknown' | 'missing' | 'disputed' }
  | { readonly state: 'conditional'; readonly condition: string };

export interface ExpansionRelationshipFact {
  readonly id: string;
  readonly actorId: string;
  readonly claim: string;
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
}
export interface ExpansionApprovalRole extends ExpansionRelationshipFact {
  readonly type: 'owner' | 'approver';
  readonly itemId: string;
}
export type ExpansionApprovalRecord = ExpansionRelationshipFact & {
  readonly targetId: string;
  readonly itemId: string;
} & (
    | ({ readonly type: 'request' | 'handoff' } & ExpansionRelationshipStatus)
    | ({ readonly type: 'authorization' } & ExpansionAuthorizationStatus)
  );
export type ExpansionRelationshipResult = ExpansionRelationshipFact & {
  /** Work result, not an authorization grant or a derived schedule. */
  readonly subject: string;
} & (
    | { readonly state: 'complete' | 'unresolved' | 'pending' | 'unknown' | 'missing' | 'disputed' }
    | { readonly state: 'conditional'; readonly condition: string }
  );
export interface ExpansionRelationshipValue {
  readonly id: string;
  readonly actorId: string;
  readonly entityId: string;
  readonly claim: string;
  /** Supplied only. No derivations, permission threshold or schedule arithmetic. */
  readonly quantity: ExpansionQuantity;
}

export interface ExpansionApprovalHandoffScene extends ExpansionStoryBase {
  readonly storyId: '35';
  readonly kind: 'agent-team';
  readonly preset: 'approval-handoff';
  readonly template: 'approval-stations';
  readonly route: 'source-only';
  readonly entities: readonly ExpansionEntity[];
  readonly ownerId: string;
  readonly approverId: string;
  readonly workItemId: string;
  readonly scope: string;
  readonly period: string;
  readonly roles: readonly ExpansionApprovalRole[];
  /** Source order retained; request/handoff/role never implies allowed. */
  readonly records: readonly ExpansionApprovalRecord[];
  readonly values: readonly ExpansionRelationshipValue[];
  readonly result: ExpansionRelationshipResult;
}

export type ExpansionDependencyRelation = ExpansionRelationshipFact & {
  /** For dependency, from requires to; this is not a task start/end order. */
  readonly fromId: string;
  readonly toId: string;
  readonly type: 'dependency' | 'transfer' | 'order' | 'flow';
} & ExpansionDependencyStatus;

export interface ExpansionDependencyScene extends ExpansionStoryBase {
  readonly storyId: '36';
  readonly kind: 'relation-structure';
  readonly preset: 'dependency';
  readonly template: 'typed-links';
  readonly route: 'source-only';
  readonly entities: readonly ExpansionEntity[];
  readonly actorId: string;
  readonly scope: string;
  readonly period: string;
  /** Only dependency edges must be acyclic; other typed links are not inferred dependencies. */
  readonly relations: readonly ExpansionDependencyRelation[];
  readonly values: readonly ExpansionRelationshipValue[];
  readonly result: ExpansionRelationshipResult;
}

export type ExpansionApprovalDependencyScene =
  | ExpansionApprovalHandoffScene
  | ExpansionDependencyScene;
