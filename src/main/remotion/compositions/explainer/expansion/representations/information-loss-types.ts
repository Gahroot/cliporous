/** Source-bound record examples only; no aggregation or compression arithmetic. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export type InformationLossQualification =
  | { readonly state: 'known' }
  | { readonly state: 'conditional'; readonly condition: string }
  | { readonly state: 'unknown' | 'missing'; readonly qualifier: string }
  | { readonly state: 'disputed'; readonly qualifier: string }
  | { readonly state: 'simulated' | 'illustrative'; readonly qualifier: string };

export interface InformationLossFact {
  readonly id: string;
  readonly actorId: string;
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
}
export type InformationLossRecord = InformationLossFact &
  InformationLossQualification & {
    readonly label: string;
    readonly stage: 'input' | 'output';
    readonly details: readonly string[];
  };
export type InformationLossRelation = InformationLossFact &
  InformationLossQualification & {
    readonly type: 'grouping' | 'correspondence' | 'retained' | 'omitted';
    readonly fromId: string;
    readonly toId: string;
    readonly detail?: string;
  };
export interface InformationLossValue {
  readonly id: string;
  readonly recordId: string;
  readonly detail: string;
  readonly quantity: ExpansionQuantity;
}
export type InformationLossResult = InformationLossFact &
  InformationLossQualification & {
    readonly fromId: string;
    readonly toId: string;
    /** Unknown behavior is not lossless. Conditional behavior never becomes unconditional. */
    readonly behavior: 'lossless' | 'lossy' | 'unknown';
  };
interface InformationLossBase extends ExpansionStoryBase {
  readonly kind: 'information-transform';
  readonly actorId: string;
  readonly scope: string;
  readonly period: string;
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly InformationLossRecord[];
  readonly quantities: readonly InformationLossValue[];
  readonly relations: readonly InformationLossRelation[];
  readonly result: InformationLossResult;
  readonly sourceSpans: Readonly<
    Record<'setup' | 'action' | 'response' | 'check' | 'resolve', ExpansionEvidenceSpan>
  >;
}
export interface ExpansionAggregationLossScene extends InformationLossBase {
  readonly storyId: '51';
  readonly preset: 'aggregation-loss';
  readonly template: 'grouped-records';
}
export interface ExpansionCompressionLossScene extends InformationLossBase {
  readonly storyId: '52';
  readonly preset: 'compression-loss';
  readonly template: 'paired-records';
}
export type ExpansionInformationLossScene =
  | ExpansionAggregationLossScene
  | ExpansionCompressionLossScene;
