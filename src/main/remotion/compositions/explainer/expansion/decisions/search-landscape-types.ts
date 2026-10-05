import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

/** Frozen authored templates, never model-provided geometry or a function evaluator. */
export const FRONTIER_ROUTE_TEMPLATES = ['grid-route'] as const;
export const LOCAL_GLOBAL_TEMPLATES = ['two-well'] as const;
export type ExpansionMapQualification = 'source' | 'illustrative' | 'simulated';
export type ExpansionGridSlot = 'start' | 'upper' | 'lower' | 'goal';
export interface ExpansionSearchLandscapeBeatEvidence {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}
export interface ExpansionSearchNode {
  readonly id: string;
  readonly entityId: string;
  readonly slot: ExpansionGridSlot;
  readonly status: 'open' | 'blocked' | 'unknown' | 'missing' | 'disputed';
  readonly evidence: ExpansionEvidenceSpan;
  readonly condition?: string;
}
export interface ExpansionSearchLink {
  readonly fromId: string;
  readonly toId: string;
  readonly status: 'open' | 'blocked' | 'unknown' | 'missing' | 'disputed';
  readonly evidence: ExpansionEvidenceSpan;
  readonly cost?: ExpansionQuantity;
  readonly condition?: string;
}
export interface ExpansionFrontierRouteScene extends ExpansionStoryBase {
  readonly storyId: '29';
  readonly kind: 'spatial-search';
  readonly preset: 'frontier-route';
  readonly treatment?: never;
  readonly sourceSpans: ExpansionSearchLandscapeBeatEvidence;
  readonly template: 'grid-route';
  readonly qualification: ExpansionMapQualification;
  readonly entities: readonly ExpansionEntity[];
  readonly nodes: readonly ExpansionSearchNode[];
  readonly links: readonly ExpansionSearchLink[];
  readonly goalId: string;
  readonly rule: {
    readonly kind: 'equal-cost' | 'supplied-cost';
    readonly evidence: ExpansionEvidenceSpan;
  };
  readonly frontier: {
    readonly nodeIds: readonly string[];
    readonly evidence: ExpansionEvidenceSpan;
  };
  readonly route: {
    readonly nodeIds: readonly string[];
    readonly evidence: ExpansionEvidenceSpan;
    readonly cost?: ExpansionQuantity;
  };
  readonly result: {
    readonly status: 'supplied' | 'unresolved';
    readonly evidence: ExpansionEvidenceSpan;
  };
}
export interface ExpansionLandscapeWell {
  readonly id: string;
  readonly entityId: string;
  readonly role: 'local' | 'global' | 'unresolved';
  readonly evidence: ExpansionEvidenceSpan;
  readonly value?: ExpansionQuantity;
  readonly condition?: string;
}
export interface ExpansionLocalGlobalScene extends ExpansionStoryBase {
  readonly storyId: '30';
  readonly kind: 'optimization-landscape';
  readonly preset: 'local-global';
  readonly treatment?: never;
  readonly sourceSpans: ExpansionSearchLandscapeBeatEvidence;
  readonly template: 'two-well';
  readonly qualification: 'illustrative' | 'simulated';
  readonly entities: readonly ExpansionEntity[];
  readonly objective: {
    readonly label: string;
    readonly direction: 'minimize';
    readonly evidence: ExpansionEvidenceSpan;
  };
  readonly wells: readonly [ExpansionLandscapeWell, ExpansionLandscapeWell];
  readonly branch: {
    readonly fromId: string;
    readonly toId: string;
    readonly status: 'supplied' | 'unresolved';
    readonly evidence: ExpansionEvidenceSpan;
    readonly condition?: string;
  };
  readonly result: {
    readonly status: 'scoped' | 'unresolved';
    readonly evidence: ExpansionEvidenceSpan;
  };
}
export type ExpansionSearchLandscapeScene = ExpansionFrontierRouteScene | ExpansionLocalGlobalScene;
