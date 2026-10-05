import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export interface ExpansionRankRecord {
  readonly id: string;
  readonly actorId: string;
  readonly quantity: ExpansionQuantity;
  /** Supplied rank, not a sorted score or an inferred winner; duplicate ranks retain ties. */
  readonly rank?: number;
  readonly unrankedEvidence?: ExpansionEvidenceSpan;
}
export interface ExpansionRankState {
  readonly id: string;
  readonly label: string;
  readonly period: string;
  readonly records: readonly ExpansionRankRecord[];
}
export interface ExpansionRankChangeScene extends ExpansionStoryBase {
  readonly storyId: '21';
  readonly kind: 'ranking';
  readonly preset: 'rank-change';
  readonly treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly criterion: string;
  readonly states: readonly [ExpansionRankState, ExpansionRankState];
  readonly comparison: {
    readonly fromStateId: string;
    readonly toStateId: string;
    readonly evidence: ExpansionEvidenceSpan;
    readonly condition?: string;
  };
  readonly result: {
    readonly status: 'scoped';
    readonly evidence: ExpansionEvidenceSpan;
    readonly condition?: string;
  };
}

export interface ExpansionCalendarRecord {
  readonly id: string;
  readonly actorId: string;
  readonly label: string;
  /** Represented calendar data, never animation beat fields named at/…At. */
  readonly calendar: { readonly year: number; readonly month: number };
  readonly quantity: ExpansionQuantity;
}
export interface ExpansionCalendarRelation {
  readonly fromId: string;
  readonly toId: string;
  readonly role: 'before' | 'same-period';
  readonly evidence: ExpansionEvidenceSpan;
  readonly condition?: string;
}
export interface ExpansionCalendarSeasonalityScene extends ExpansionStoryBase {
  readonly storyId: '22';
  readonly kind: 'temporal-pattern';
  readonly preset: 'calendar-seasonality';
  readonly treatment?: never;
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly ExpansionCalendarRecord[];
  readonly relations: readonly ExpansionCalendarRelation[];
  readonly result: {
    readonly status: 'scoped';
    readonly evidence: ExpansionEvidenceSpan;
    readonly condition?: string;
  };
}

export type ExpansionRankingCalendarScene =
  | ExpansionRankChangeScene
  | ExpansionCalendarSeasonalityScene;
