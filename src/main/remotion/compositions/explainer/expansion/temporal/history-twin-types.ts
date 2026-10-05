/** Step13 stories 47–48. React-free source facts, not a simulation or conveyor gate. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

/** Conditions and teaching qualifications belong to each fact, not a blanket scene claim. */
export type ExpansionHistoryTwinStatus =
  | { readonly state: 'known' }
  | { readonly state: 'conditional'; readonly condition: string }
  | {
      readonly state: 'simulated' | 'illustrative';
      readonly qualification: string;
      readonly condition?: string;
    }
  | {
      readonly state: 'unknown' | 'missing' | 'disputed';
      readonly qualification: string;
      readonly condition?: string;
    };

export type ExpansionHysteresisRule = {
  readonly id: string;
  readonly role: 'enter' | 'leave';
  readonly actorId: string;
  readonly fromId: string;
  readonly toId: string;
  readonly condition: string;
  readonly thresholdId?: string;
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | { readonly state: 'conditional' }
  | { readonly state: 'simulated' | 'illustrative'; readonly qualification: string }
);

export type ExpansionRetainedHistory = {
  readonly id: string;
  readonly actorId: string;
  /** Represented source timestamp/event label, never animation seconds. */
  readonly dataTime: string;
  readonly retained: true;
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | {
      readonly state: 'unknown' | 'missing' | 'disputed';
      readonly qualification: string;
      readonly condition?: string;
    }
  | ({
      readonly valueId: string;
    } & (
      | { readonly state: 'known' }
      | { readonly state: 'conditional'; readonly condition: string }
      | {
          readonly state: 'simulated' | 'illustrative';
          readonly qualification: string;
          readonly condition?: string;
        }
    ))
);

export type ExpansionHysteresisResult = {
  readonly actorId: string;
  readonly claim: string;
  readonly retainedHistoryIds: readonly string[];
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | {
      readonly state: 'unknown' | 'missing' | 'disputed';
      readonly qualification: string;
      readonly condition?: string;
    }
  | ({ readonly valueId: string } & Exclude<
      ExpansionHistoryTwinStatus,
      { state: 'unknown' | 'missing' | 'disputed' }
    >)
);

export interface ExpansionHysteresisScene extends ExpansionStoryBase {
  storyId: '47';
  kind: 'state-transition';
  preset: 'hysteresis';
  template: 'two-state-history';
  entities: readonly ExpansionEntity[];
  actorId: string;
  stateIds: readonly [string, string];
  scope: string;
  period: string;
  rules: readonly [ExpansionHysteresisRule, ExpansionHysteresisRule];
  thresholds: readonly {
    readonly id: string;
    readonly role: 'enter' | 'leave';
    readonly quantity: ExpansionQuantity;
  }[];
  history: readonly ExpansionRetainedHistory[];
  result: ExpansionHysteresisResult;
}

export type ExpansionAlignedSnapshot = {
  readonly id: string;
  readonly actorId: string;
  readonly viewId: string;
  readonly claim: string;
  /** These data/condition/control fields never take part in animation rebasing. */
  readonly dataTime: string;
  readonly controls: readonly string[];
  readonly condition: string;
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | {
      readonly state: 'unknown' | 'missing' | 'disputed';
      readonly qualification: string;
    }
  | ({
      readonly value: string;
    } & (
      | { readonly state: 'conditional' }
      | { readonly state: 'simulated' | 'illustrative'; readonly qualification: string }
    ))
);

export type ExpansionAlignedComparisonResult = {
  readonly actorId: string;
  readonly claim: string;
  readonly snapshotIds: readonly [string, string];
  readonly evidence: ExpansionEvidenceSpan;
} & (
  | {
      readonly state: 'unknown' | 'missing' | 'disputed';
      readonly qualification: string;
      readonly condition?: string;
    }
  | ({ readonly result: 'same' | 'different' } & Exclude<
      ExpansionHistoryTwinStatus,
      { state: 'unknown' | 'missing' | 'disputed' }
    >)
);

export interface ExpansionAlignedStateComparisonScene extends ExpansionStoryBase {
  storyId: '48';
  kind: 'digital-twin';
  preset: 'aligned-state-comparison';
  template: 'same-subject-pair';
  entities: readonly ExpansionEntity[];
  actorId: string;
  viewIds: readonly [string, string];
  scope: string;
  period: string;
  snapshots: readonly [ExpansionAlignedSnapshot, ExpansionAlignedSnapshot];
  /** Optional exact supplied controls; no state difference, forecast or other derived output. */
  quantities: readonly {
    readonly id: string;
    readonly viewId: string;
    readonly quantity: ExpansionQuantity;
  }[];
  alignment: {
    readonly actorId: string;
    readonly viewIds: readonly [string, string];
    readonly retainsSourceControls: true;
    readonly evidence: ExpansionEvidenceSpan;
  };
  result: ExpansionAlignedComparisonResult;
}

/** Frozen local union. Registration/aggregate types and renderers are parent-owned. */
export type ExpansionHistoryTwinScene =
  | ExpansionHysteresisScene
  | ExpansionAlignedStateComparisonScene;
