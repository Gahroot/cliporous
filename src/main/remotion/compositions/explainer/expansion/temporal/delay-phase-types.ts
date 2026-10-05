/** Stories 45–46: supplied dimensions and authored periodic templates, never numeric derivations. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionBasis,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
  ExpansionRational,
} from '../value-types';

/** Domain bounds, not animation seconds or a claim about renderer performance. */
export const DELAY_PHASE_LIMITS = {
  latency: { second: 86_400, minute: 1_440, hour: 24, day: 1 },
  throughput: 1_000_000,
  cyclePeriodMinimum: { numerator: 1, denominator: 10 },
  cyclePeriodMaximum: { numerator: 60, denominator: 1 },
  phase: { degree: 360, radian: 8 },
} as const satisfies {
  latency: Record<'second' | 'minute' | 'hour' | 'day', number>;
  throughput: number;
  cyclePeriodMinimum: ExpansionRational;
  cyclePeriodMaximum: ExpansionRational;
  phase: Record<'degree' | 'radian', number>;
};

export interface DelayPhaseBeatEvidence {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}
export type DelayPhaseQualification =
  | { readonly state: 'known' }
  | { readonly state: 'conditional'; readonly condition: string }
  | { readonly state: 'missing' | 'unknown' | 'disputed'; readonly qualifier: string }
  | { readonly state: 'illustrative' | 'simulated'; readonly qualifier: string };

export interface DelayDimensionRecord {
  readonly id: string;
  readonly actorId: string;
  readonly dimension: 'latency' | 'throughput';
  readonly quantity: ExpansionQuantity;
}
/** A quoted qualitative comparison is not a reciprocal, score, winner or computed rate. */
export type DelayComparison = DelayPhaseQualification & {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly dimension: 'latency' | 'throughput';
  readonly basis: ExpansionBasis;
  readonly comparisonLabel: 'qualitative comparison';
  readonly evidence: ExpansionEvidenceSpan;
} & (
    | {
        readonly state: 'known' | 'conditional' | 'illustrative' | 'simulated';
        readonly order: 'lower' | 'higher' | 'equal';
      }
    | { readonly state: 'missing' | 'unknown' | 'disputed'; readonly order?: never }
  );
export interface ExpansionDelayThroughputScene extends ExpansionStoryBase {
  storyId: '45';
  kind: 'temporal-structure';
  preset: 'delay-throughput';
  treatment?: never;
  readonly template: 'separate-dimensions';
  readonly entities: readonly ExpansionEntity[];
  readonly period: string;
  readonly population: string;
  readonly records: readonly DelayDimensionRecord[];
  readonly relations: readonly DelayComparison[];
  readonly sourceSpans: DelayPhaseBeatEvidence;
  readonly meaning: 'latency-and-throughput-independent';
}

/** Dial is schematic. Sine/pulse are explicitly authored teaching signals, not measured curves. */
export type PeriodicSignalTemplate = 'cycle-dial' | 'sine' | 'pulse';
export type PeriodicSignal = DelayPhaseQualification & {
  readonly id: string;
  readonly actorId: string;
  readonly template: PeriodicSignalTemplate;
  readonly evidence: ExpansionEvidenceSpan;
} & (
    | {
        readonly state: 'known' | 'conditional' | 'illustrative' | 'simulated';
        readonly direction: 'clockwise' | 'counterclockwise';
      }
    | { readonly state: 'missing' | 'unknown' | 'disputed'; readonly direction?: never }
  );
export type PeriodicQuantityRecord = {
  readonly id: string;
  readonly actorId: string;
  readonly quantity: ExpansionQuantity;
} & (
  | { readonly dimension: 'period'; readonly referenceId?: never }
  | { readonly dimension: 'phase'; readonly referenceId: string }
);
/** Endpoint order is source meaning. An absent phase stays absent, never an aligned zero. */
export type PeriodicPhaseRelation = DelayPhaseQualification & {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly evidence: ExpansionEvidenceSpan;
} & (
    | {
        readonly state: 'known' | 'conditional' | 'illustrative' | 'simulated';
        readonly relationship: 'leads' | 'lags' | 'aligned';
      }
    | { readonly state: 'missing' | 'unknown' | 'disputed'; readonly relationship?: never }
  );
export interface ExpansionPeriodicPhaseScene extends ExpansionStoryBase {
  storyId: '46';
  kind: 'synchronization';
  preset: 'periodic-phase';
  treatment?: never;
  readonly template: 'bounded-cycles';
  readonly entities: readonly ExpansionEntity[];
  readonly period: string;
  readonly population: string;
  readonly signals: readonly PeriodicSignal[];
  readonly records: readonly PeriodicQuantityRecord[];
  readonly relations: readonly PeriodicPhaseRelation[];
  readonly sourceSpans: DelayPhaseBeatEvidence;
  readonly meaning: 'supplied-period-phase-direction-only';
}

/** Frozen local union. Parent owns aggregate/registry/render integration. */
export type ExpansionDelayPhaseScene = ExpansionDelayThroughputScene | ExpansionPeriodicPhaseScene;
