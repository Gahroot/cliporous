import type { Money } from '../../finance/types';
import type {
  BusinessIdentity,
  BusinessStory,
  BusinessWordSpan,
  QuantityBasis,
  TaskOwnership,
  VersionedIdentity,
} from '../types';

export type AuthorityPermission = 'permitted' | 'denied' | 'pending' | 'unknown';
export type AuthorityCapability = 'capable' | 'incapable' | 'unknown';
export type AuthorityConditionState = 'satisfied' | 'blocked' | 'pending' | 'unknown';

export interface AuthorityScope {
  label: string;
  source: BusinessWordSpan;
}
/** Calendar/source text, never seconds, beat offsets or a computed current status. */
export type AuthorityDate =
  | { state: 'stated'; value: string; source: BusinessWordSpan }
  | { state: 'unknown'; value: null; source: BusinessWordSpan };
export interface AuthorityCondition extends BusinessIdentity {
  state: AuthorityConditionState;
}
export interface AuthorityPermissionEntry {
  action: BusinessIdentity;
  capability: AuthorityCapability;
  permission: AuthorityPermission;
  source: BusinessWordSpan;
}

export type AuthorityMeasurement =
  | { kind: 'count'; value: number; basis: QuantityBasis }
  | { kind: 'money'; amount: Money; basis: QuantityBasis }
  | { kind: 'unknown'; value: null };
export interface AuthorityLimit extends BusinessIdentity {
  operator: 'at-most' | 'at-least' | 'unknown';
  measurement: AuthorityMeasurement;
}
export type AuthorityCost =
  | { state: 'known'; amount: Money; basis: QuantityBasis; source: BusinessWordSpan }
  | { state: 'unknown'; amount: null; source: BusinessWordSpan };

/** OP-09: permission and capability are independent, explicitly sourced facts. */
export interface PermissionScope extends BusinessStory {
  kind: 'delegation-scope';
  preset: 'permissions';
  actor: BusinessIdentity;
  scope: AuthorityScope;
  expiry: AuthorityDate;
  permissions: AuthorityPermissionEntry[];
}
/** OP-11: an explicit condition and source limits, not permission inferred from skill. */
export interface ActionLimits extends BusinessStory {
  kind: 'delegation-scope';
  preset: 'action-limits';
  actor: BusinessIdentity;
  action: BusinessIdentity;
  capability: AuthorityCapability;
  permission: AuthorityPermission;
  decisionSource: BusinessWordSpan;
  scope: AuthorityScope;
  actionCondition: AuthorityCondition;
  expiry: AuthorityDate;
  limits: AuthorityLimit[];
}
export type DelegationScope = PermissionScope | ActionLimits;

/** OP-12: a declared review route, not monitoring or an automatically completed review. */
export interface ExceptionReview extends BusinessStory {
  kind: 'authority-handoff';
  preset: 'exception-review';
  representation: 'declared-illustration';
  actors: BusinessIdentity[];
  action: BusinessIdentity;
  roles: TaskOwnership;
  exception: BusinessIdentity;
  review: { state: 'pending' | 'denied' | 'unknown'; source: BusinessWordSpan };
  reviewCost: AuthorityCost;
  retryCost: AuthorityCost;
}
export interface AuthorityAuditEvent extends BusinessIdentity {
  actorId: string;
  verb: 'records' | 'reviews' | 'declares';
}
/** OP-13: declaration order and a named source revision, never actual telemetry. */
export interface DeclaredAuditChain extends BusinessStory {
  kind: 'authority-handoff';
  preset: 'declared-audit-chain';
  representation: 'declared-illustration';
  actors: BusinessIdentity[];
  action: BusinessIdentity;
  record: VersionedIdentity;
  events: AuthorityAuditEvent[];
}
/** OP-14: reversibility is quoted classification, not a legal or causal determination. */
export interface ActionConsequences extends BusinessStory {
  kind: 'authority-handoff';
  preset: 'action-consequences';
  actors: BusinessIdentity[];
  action: BusinessIdentity;
  performerId: string;
  reversibility: { state: 'reversible' | 'irreversible' | 'unknown'; source: BusinessWordSpan };
  consequence: { state: 'source-stated' | 'unknown'; label: string; source: BusinessWordSpan };
}
/** OP-15: current roles and transfer status remain source facts throughout animation. */
export interface AccountableTransfer extends BusinessStory {
  kind: 'authority-handoff';
  preset: 'accountable-transfer';
  actors: BusinessIdentity[];
  action: BusinessIdentity;
  roles: TaskOwnership;
  fromId: string;
  toId: string;
  transfer: { state: 'pending' | 'accepted' | 'denied' | 'unknown'; source: BusinessWordSpan };
}
export type AuthorityHandoff =
  | ExceptionReview
  | DeclaredAuditChain
  | ActionConsequences
  | AccountableTransfer;

/** OP-16: no resolved winner or inferred conversion of incompatible quantity bases. */
export interface ConflictingLimits extends BusinessStory {
  kind: 'constraint-check';
  preset: 'conflicting-limits';
  visualMode: 'diagram';
  actor: BusinessIdentity;
  action: BusinessIdentity;
  requirements: [AuthorityLimit, AuthorityLimit];
  collision: { state: 'unresolved'; source: BusinessWordSpan };
}
export interface AuthorityDatedCondition extends AuthorityCondition {
  date: AuthorityDate;
}
/** OP-74: literal dates and declared compatibility, not clock-triggered fulfilment. */
export interface DatedConditions extends BusinessStory {
  kind: 'constraint-check';
  preset: 'dated-conditions';
  actor: BusinessIdentity;
  action: BusinessIdentity;
  policy: VersionedIdentity;
  conditions: AuthorityDatedCondition[];
  relationship: {
    state: 'compatible' | 'conflicting' | 'unresolved';
    source: BusinessWordSpan;
  };
}
export type ConstraintCheck = ConflictingLimits | DatedConditions;
export type AuthorityBusinessScene = DelegationScope | AuthorityHandoff | ConstraintCheck;
