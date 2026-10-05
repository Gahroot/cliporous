/** Source facts only. Teaching fields are authored visuals, never numerical telemetry. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export interface EnergyFieldRecord {
  readonly id: string;
  readonly actorId: string;
  readonly quantity: ExpansionQuantity;
}
export interface EnergyFieldRelation {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly recordId: string;
  readonly evidence: ExpansionEvidenceSpan;
}
interface EnergyFieldBase extends ExpansionStoryBase {
  readonly sourceSpans: Readonly<
    Record<'setup' | 'action' | 'response' | 'check' | 'resolve', string>
  >;
  readonly actorId: string;
  readonly scope: string;
  readonly period: string;
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly EnergyFieldRecord[];
  readonly relations: readonly EnergyFieldRelation[];
}
export interface ExpansionEnergyBudgetScene extends EnergyFieldBase {
  storyId: '79';
  kind: 'conservation-flow';
  preset: 'energy-budget';
  readonly template: 'energy-carriers';
  /** No residual, balance, loss or efficiency is calculated. Absence stays absent. */
}
export interface ExpansionDirectionalFieldScene extends EnergyFieldBase {
  storyId: '80';
  kind: 'field-map';
  preset: 'directional-field';
  readonly template: 'uniform-field' | 'radial-field';
  readonly domain: 'teaching-plane';
  readonly qualification: 'illustrative teaching model' | 'simulated teaching model';
  /** Strength and direction remain exact source parameters, not animation timestamps. */
}
export type ExpansionEnergyFieldScene = ExpansionEnergyBudgetScene | ExpansionDirectionalFieldScene;
