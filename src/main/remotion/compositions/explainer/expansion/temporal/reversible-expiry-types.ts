/** Stories 43–44: source facts only. Represented time is never an animation ...At field. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export type ReversibleExpiryPermission =
  | { readonly state: 'allowed' | 'denied' | 'unknown' }
  | {
      readonly state: 'conditional';
      readonly status: 'allowed' | 'denied';
      readonly condition: string;
    };

export interface ReversibleExpiryFact {
  readonly id: string;
  readonly actorId: string;
  readonly resourceId: string;
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
}
export type ReversibleExpiryBeatEvidence = Readonly<
  Record<'setup' | 'action' | 'response' | 'check' | 'resolve', ExpansionEvidenceSpan>
>;

export type ReversibleStateRecord = ReversibleExpiryFact & { readonly type: 'state' } & (
    | { readonly state: 'known'; readonly valueId: string }
    | { readonly state: 'unknown' }
    | { readonly state: 'conditional'; readonly valueId: string; readonly condition: string }
  );
export type ReversibleTransition = ReversibleExpiryFact &
  ReversibleExpiryPermission & {
    readonly fromId: string;
    readonly toId: string;
    readonly type: 'transition';
  };
export type ReversibleResult = ReversibleExpiryFact & ReversibleExpiryPermission;

interface ReversibleExpiryBase extends ExpansionStoryBase {
  readonly route: 'source-only';
  readonly entities: readonly ExpansionEntity[];
  readonly actorId: string;
  readonly resourceId: string;
  readonly scope: string;
  readonly period: string;
  readonly sourceSpans: ReversibleExpiryBeatEvidence;
}
export interface ExpansionReversibleScene extends ReversibleExpiryBase {
  readonly storyId: '43';
  readonly kind: 'state-transition';
  readonly preset: 'reversible';
  readonly template: 'state-rail';
  readonly stateIds: readonly string[];
  readonly records: readonly ReversibleStateRecord[];
  readonly relations: readonly ReversibleTransition[];
  readonly result: ReversibleResult;
}

/** Each quantity retains its exact actor/resource claim, unit, period, clock basis and evidence.
 * Unknown endpoints have no amount. No conversion, elapsed time or permission is calculated. */
export type ExpiryTimingRecord = {
  readonly id: string;
  readonly actorId: string;
  readonly resourceId: string;
  readonly scope: string;
  readonly period: string;
} & (
  | { readonly type: 'deadline'; readonly representedDeadline: ExpansionQuantity }
  | {
      readonly type: 'validity';
      readonly representedStart: ExpansionQuantity;
      readonly representedEnd: ExpansionQuantity;
    }
  | {
      readonly type: 'attempt';
      readonly eventId: string;
      readonly representedEventTime: ExpansionQuantity;
    }
);
export type ExpiryAuthorization = ReversibleExpiryFact &
  ReversibleExpiryPermission & {
    readonly type: 'authorization';
    readonly eventId: string;
  };
export type ExpiryResult = ReversibleExpiryFact &
  ReversibleExpiryPermission & { readonly eventId: string };
export interface ExpansionExpiryScene extends ReversibleExpiryBase {
  readonly storyId: '44';
  readonly kind: 'temporal-structure';
  readonly preset: 'expiry';
  readonly template: 'expiry-window';
  /** Explicit represented clock/reference basis; not a render clock. */
  readonly timingBasis: string;
  readonly eventIds: readonly string[];
  readonly records: readonly ExpiryTimingRecord[];
  readonly relations: readonly ExpiryAuthorization[];
  readonly result: ExpiryResult;
}

export type ExpansionReversibleExpiryScene = ExpansionReversibleScene | ExpansionExpiryScene;
