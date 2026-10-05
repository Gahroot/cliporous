/** STEP17: source facts only; stock/request values are not allocation or simulation output. */
import type { ExpansionEntity, ExpansionRelation, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export interface ExpansionResourceDiffusionRecord {
  readonly id: string;
  readonly actorId: string;
  readonly role: 'limit' | 'request' | 'inventory';
  readonly quantity: ExpansionQuantity;
}
interface Common extends ExpansionStoryBase {
  readonly entities: readonly ExpansionEntity[];
  readonly period: string;
  readonly population: string;
  readonly records: readonly ExpansionResourceDiffusionRecord[];
  readonly relations: readonly ExpansionRelation[];
}
export type ExpansionResourceDiffusionScene =
  | (Common & {
      storyId: '75';
      kind: 'resource-allocation';
      preset: 'shared-resource';
      template: 'single-request';
      resourceId: string;
      requesterId: string;
      access: { readonly condition: string; readonly evidence: ExpansionEvidenceSpan };
      decision: {
        readonly state:
          | 'granted'
          | 'denied'
          | 'unknown'
          | 'missing'
          | 'disputed'
          | 'conditional'
          | 'simulated'
          | 'illustrative';
        readonly result: 'granted' | 'denied' | 'unresolved';
        readonly condition: string;
        readonly evidence: ExpansionEvidenceSpan;
      };
    })
  | (Common & {
      storyId: '76';
      kind: 'material-process';
      preset: 'diffusion-filter';
      template: 'qualitative-filter';
      materialId: string;
      reservoirId: string;
      filterId: string;
      model: 'supplied' | 'illustrative' | 'simulated';
      movement: 'spreads toward';
      filter: {
        readonly relation: 'passes' | 'retains';
        readonly condition: string;
        readonly evidence: ExpansionEvidenceSpan;
      };
      result: {
        readonly state: 'stated' | 'unresolved';
        readonly relation: 'passes' | 'retains' | 'unresolved';
        readonly evidence: ExpansionEvidenceSpan;
      };
    });
