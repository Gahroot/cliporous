/** Frozen shared pack/kit interfaces. Local packs own their literal kind/preset unions. */
import type { DiagramStory } from '../diagrams/types';
import type { ExpansionStoryId, ExpansionTreatmentId } from './catalog';
import type { ExpansionEvidenceSpan } from './value-types';

export interface ExpansionStoryBase extends DiagramStory {
  /** Assigned by the parser from the recognized route, never supplied as an arbitrary ID. */
  storyId: ExpansionStoryId;
  /** Only authored eligible variants, with separately validated additional source facts. */
  treatment?: ExpansionTreatmentId;
}

export interface ExpansionEntity {
  readonly id: string;
  readonly label: string;
  readonly evidence: ExpansionEvidenceSpan;
}

export const EXPANSION_RELATION_ROLES = [
  'provenance',
  'support',
  'rebuttal',
  'association',
  'membership',
  'dependency',
  'transfer',
  'approval',
  'control',
  'flow',
  'condition',
  'transition',
  'correspondence',
  'access',
  'failure',
  'selection',
] as const;
export type ExpansionRelationRole = (typeof EXPANSION_RELATION_ROLES)[number];
export interface ExpansionRelation {
  readonly fromId: string;
  readonly toId: string;
  readonly role: ExpansionRelationRole;
  readonly evidence: ExpansionEvidenceSpan;
  readonly condition?: string;
}

/** Pose is computed from frame/beat seconds by authored pure pack code, never a timer. */
export interface ExpansionKitPose {
  readonly reveal: number;
  readonly action: number;
  readonly response: number;
  readonly check: number;
  readonly resolve: number;
}
export type ExpansionKitState = 'retained' | 'active' | 'excluded' | 'unknown' | 'disputed';
export interface ExpansionKitColors {
  readonly surface: string;
  readonly text: string;
  readonly accent: string;
  readonly muted: string;
}

/** Authored placement only; contracts never accept coordinates or rendering directives. */
export interface ExpansionKitPlacement {
  readonly position: readonly [number, number, number];
  readonly scale?: number;
}

/** Stable across modes, seeks and label edits, independent of user strings and UUIDs. */
export function expansionEntityId(storyId: ExpansionStoryId, index: number): string {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 100)
    throw new Error('Authored expansion entity index is out of bounds');
  return `expansion-${storyId}-entity-${index}`;
}
