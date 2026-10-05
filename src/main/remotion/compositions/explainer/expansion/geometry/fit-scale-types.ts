/** Local authored data contracts, not geometry or a fit/scale evaluator. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';
export type FitScaleQualification =
  | { readonly state: 'known' }
  | { readonly state: 'conditional'; readonly condition: string }
  | {
      readonly state: 'unknown' | 'missing' | 'disputed' | 'simulated' | 'illustrative';
      readonly qualifier: string;
    };
export type FitScaleFact = FitScaleQualification & {
  readonly id: string;
  readonly actorId: string;
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
};
export type PackingRecord = FitScaleFact & {
  readonly label: string;
  readonly role: 'container' | 'part';
  readonly template: 'tray' | 'block';
};
export type LinkedScaleRecord = FitScaleFact & {
  readonly label: string;
  readonly level: 'object' | 'room' | 'building';
  readonly identityId: string;
};
export interface FitScaleDimension {
  readonly id: string;
  readonly recordId: string;
  readonly axis: 'width' | 'height' | 'depth' | 'clearance';
  readonly referenceId?: string;
  readonly quantity: ExpansionQuantity;
}
export type FitScaleRelation = FitScaleFact & {
  readonly type: 'candidate' | 'encloses';
  readonly fromId: string;
  readonly toId: string;
  readonly identityId: string;
};
export type PackingResult = FitScaleFact & {
  readonly partId: string;
  readonly containerId: string;
  readonly verdict: 'fits' | 'blocked' | 'unknown';
};
export type LinkedScaleResult = FitScaleFact & {
  readonly identityId: string;
  readonly levelIds: readonly string[];
};
interface FitScaleBase extends ExpansionStoryBase {
  readonly actorId: string;
  readonly identityId: string;
  readonly scope: string;
  readonly period: string;
  readonly entities: readonly ExpansionEntity[];
  readonly dimensions: readonly FitScaleDimension[];
  readonly relations: readonly FitScaleRelation[];
  readonly sourceSpans: Readonly<
    Record<'setup' | 'action' | 'response' | 'check' | 'resolve', ExpansionEvidenceSpan>
  >;
}
export interface ExpansionPackingClearanceScene extends FitScaleBase {
  readonly storyId: '59';
  readonly kind: 'floorplan-fit';
  readonly preset: 'packing-clearance';
  /** Fixed authored shapes stay schematic even when dimension labels are measured facts. */
  readonly template: 'tray-block';
  readonly representation: 'schematic';
  readonly records: readonly PackingRecord[];
  readonly result: PackingResult;
}
export interface ExpansionLinkedScaleScene extends FitScaleBase {
  readonly storyId: '60';
  readonly kind: 'scale-hierarchy';
  readonly preset: 'linked-scale';
  readonly template: 'object-room-building';
  readonly representation: 'schematic' | 'measured';
  readonly records: readonly LinkedScaleRecord[];
  readonly result: LinkedScaleResult;
}
export type ExpansionFitScaleScene = ExpansionPackingClearanceScene | ExpansionLinkedScaleScene;
