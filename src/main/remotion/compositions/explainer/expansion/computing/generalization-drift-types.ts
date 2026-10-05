/** Source-only STEP16 pairs. No training, prediction, scoring or derived comparison. */
import type { ExpansionEntity, ExpansionRelation, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export interface ExpansionGeneralizationDriftRecord {
  readonly id: string;
  readonly datasetId: string;
  readonly sample: string;
  readonly role: 'training' | 'held-out' | 'baseline' | 'changed';
  readonly condition: string;
  readonly population: string;
  readonly evidence: ExpansionEvidenceSpan;
  readonly result: ExpansionQuantity;
}
interface Pair extends ExpansionStoryBase {
  readonly entities: readonly ExpansionEntity[];
  readonly actorId: string;
  readonly scope: string;
  readonly period: string;
  readonly metric: string;
  readonly records: readonly [
    ExpansionGeneralizationDriftRecord,
    ExpansionGeneralizationDriftRecord,
  ];
  readonly relations: readonly ExpansionRelation[];
}
export type ExpansionGeneralizationDriftScene = Pair &
  (
    | {
        readonly storyId: '71';
        readonly kind: 'model-training';
        readonly preset: 'held-out-generalization';
        readonly template: 'training-held-out';
      }
    | {
        readonly storyId: '72';
        readonly kind: 'model-evaluation';
        readonly preset: 'population-drift';
        readonly template: 'condition-pair';
      }
  );
