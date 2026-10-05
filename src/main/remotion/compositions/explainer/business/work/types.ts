import type {
  BusinessIdentity,
  BusinessStory,
  BusinessWordSpan,
  QuantityBasis,
  TaskOwnership,
  VersionedIdentity,
} from '../types';

export const WORK_RECIPE_IDS = [
  'OP-01',
  'OP-02',
  'OP-03',
  'OP-04',
  'OP-05',
  'OP-06',
  'OP-07',
  'OP-08',
  'OP-18',
  'OP-32',
  'OP-80',
] as const;
export const WORK_LIMITS = {
  entities: 8,
  tasks: 4,
  links: 12,
  holds: 4,
  label: 28,
  phase: 40,
} as const;

export type WorkActionState =
  | 'configured'
  | 'observed'
  | 'pending'
  | 'denied'
  | 'unknown'
  | 'conditional';
export type WorkHoldState = 'pending' | 'denied' | 'unknown' | 'conditional';
export interface WorkPhase {
  label: string;
  source: BusinessWordSpan;
}
export interface WorkHold {
  actorId: string;
  taskId: string;
  state: WorkHoldState;
  source: BusinessWordSpan;
  condition?: WorkPhase;
}
export interface WorkSplit {
  jobId: string;
  taskId: string;
  source: BusinessWordSpan;
}
export interface WorkCapability {
  actorId: string;
  taskId: string;
  state: 'tested' | 'unavailable' | 'unknown' | 'conditional';
  source: BusinessWordSpan;
  condition?: WorkPhase;
}
export interface WorkHandoff {
  fromActorId: string;
  toActorId: string;
  taskId: string;
  state: WorkActionState;
  source: BusinessWordSpan;
  condition?: WorkPhase;
}
export interface WorkReview {
  reviewerId: string;
  performerId: string;
  taskId: string;
  state: WorkActionState;
  source: BusinessWordSpan;
  condition?: WorkPhase;
}
/** A numeric load never exists without its subject/population/unit/period/denominator. */
export type WorkMeasure =
  | {
      state: 'observed' | 'configured';
      value: number;
      basis: QuantityBasis;
      source: BusinessWordSpan;
    }
  | { state: 'unknown'; value: null; basis: QuantityBasis | null; source: BusinessWordSpan };
export interface WorkComparison {
  before: WorkMeasure;
  after: WorkMeasure;
  source: BusinessWordSpan;
}
export interface WorkQueue {
  identity: BusinessIdentity;
  reviewerId: string;
  state: WorkHoldState;
  source: BusinessWordSpan;
  condition?: WorkPhase;
}
export interface WorkConstraint {
  actorId: string;
  taskId: string;
  state: 'constrained' | 'released' | WorkHoldState;
  phase: WorkPhase;
  source: BusinessWordSpan;
  condition?: WorkPhase;
}
export interface WorkCapture {
  recorderId: string;
  expertId: string;
  taskId: string;
  recordId: string;
  state: WorkActionState;
  source: BusinessWordSpan;
  condition?: WorkPhase;
}
export interface WorkPlaybookApproval {
  approverId: string;
  taskId: string;
  playbookId: string;
  version: string;
  state: 'approved' | WorkHoldState;
  source: BusinessWordSpan;
  condition?: WorkPhase;
}
export interface WorkPlaybookUse {
  actorId: string;
  taskId: string;
  playbookId: string;
  version: string;
  state: WorkActionState;
  source: BusinessWordSpan;
  condition?: WorkPhase;
}
export interface WorkAllocation {
  actorId: string;
  taskId: string;
  phase: 'before' | 'after';
  state: WorkActionState;
  source: BusinessWordSpan;
  condition?: WorkPhase;
}

interface WorkStory extends BusinessStory {
  holds: readonly WorkHold[];
}
interface TaskActors {
  actors: readonly BusinessIdentity[];
  tasks: readonly BusinessIdentity[];
}
export interface TaskSplitScene extends WorkStory, TaskActors {
  kind: 'task-map';
  preset: 'task-split';
  recipeId: 'OP-01';
  job: BusinessIdentity;
  splits: readonly WorkSplit[];
  ownership: readonly TaskOwnership[];
}
export interface CapabilityBoundaryScene extends WorkStory, TaskActors {
  kind: 'task-map';
  preset: 'capability-boundary';
  recipeId: 'OP-02';
  visualMode: 'diagram';
  capabilities: readonly WorkCapability[];
}
export interface ResponsibilityScene extends WorkStory, TaskActors {
  kind: 'task-map';
  preset: 'responsibility';
  recipeId: 'OP-04';
  ownership: readonly TaskOwnership[];
}
export type TaskMapScene = TaskSplitScene | CapabilityBoundaryScene | ResponsibilityScene;

export interface CrossFunctionScene extends WorkStory, TaskActors {
  kind: 'coordination-map';
  preset: 'cross-function';
  recipeId: 'OP-03';
  handoffs: readonly WorkHandoff[];
}
export interface SupervisedFanoutScene extends WorkStory {
  kind: 'coordination-map';
  preset: 'supervised-fanout';
  recipeId: 'OP-07';
  supervisor: BusinessIdentity;
  delegates: readonly BusinessIdentity[];
  tasks: readonly BusinessIdentity[];
  reviews: readonly WorkReview[];
  reviewCapacity: WorkMeasure;
}
export interface HandoffLoadScene extends WorkStory, TaskActors {
  kind: 'coordination-map';
  preset: 'handoff-load';
  recipeId: 'OP-08';
  handoffs: readonly WorkHandoff[];
  load: WorkMeasure;
}
export interface ApprovalLoadScene extends WorkStory, TaskActors {
  kind: 'coordination-map';
  preset: 'approval-load';
  recipeId: 'OP-32';
  queue: WorkQueue;
  reviews: readonly WorkReview[];
  load: WorkMeasure;
  reviewCapacity: WorkMeasure;
}
export interface BottleneckShiftScene extends WorkStory, TaskActors {
  kind: 'coordination-map';
  preset: 'bottleneck-shift';
  recipeId: 'OP-80';
  before: WorkConstraint;
  after: WorkConstraint;
  comparison: WorkComparison | null;
}
export type CoordinationMapScene =
  | CrossFunctionScene
  | SupervisedFanoutScene
  | HandoffLoadScene
  | ApprovalLoadScene
  | BottleneckShiftScene;

interface PlaybookFacts {
  recorder: BusinessIdentity;
  receiver: BusinessIdentity;
  approver: BusinessIdentity;
  task: BusinessIdentity;
  record: BusinessIdentity;
  playbook: VersionedIdentity;
  capture: WorkCapture;
  approval: WorkPlaybookApproval;
  use: WorkPlaybookUse;
}
export interface ExpertiseTransferScene extends WorkStory, PlaybookFacts {
  kind: 'work-redesign';
  preset: 'expertise-transfer';
  recipeId: 'OP-05';
  expert: BusinessIdentity;
  expertiseSource: BusinessWordSpan;
}
export interface RedeploymentScene extends WorkStory {
  kind: 'work-redesign';
  preset: 'redeployment';
  recipeId: 'OP-06';
  worker: BusinessIdentity;
  beforeTasks: readonly BusinessIdentity[];
  afterTasks: readonly BusinessIdentity[];
  before: WorkPhase;
  after: WorkPhase;
  allocations: readonly WorkAllocation[];
}
export interface OwnerPlaybookScene extends WorkStory, PlaybookFacts {
  kind: 'work-redesign';
  preset: 'owner-playbook';
  recipeId: 'OP-18';
  owner: BusinessIdentity;
  ownerSource: BusinessWordSpan;
}
export type WorkRedesignScene = ExpertiseTransferScene | RedeploymentScene | OwnerPlaybookScene;
export type BusinessWorkScene = TaskMapScene | CoordinationMapScene | WorkRedesignScene;
