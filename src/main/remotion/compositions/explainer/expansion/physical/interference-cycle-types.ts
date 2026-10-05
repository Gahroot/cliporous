import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export type InterferenceCycleState =
  | 'known'
  | 'unknown'
  | 'missing'
  | 'disputed'
  | 'conditional'
  | 'simulated'
  | 'illustrative';
export interface InterferenceCycleFact {
  readonly id: string;
  readonly actorId: string;
  readonly targetIds: readonly string[];
  readonly role: string;
  readonly state: InterferenceCycleState;
  readonly value?: string;
  readonly condition?: string;
  readonly qualifier?: string;
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
}
/** Source parameters are domain data, never animation timestamps or measured outcomes. */
export interface InterferenceWave {
  readonly id: string;
  readonly entityId: string;
  readonly model: 'sine';
  readonly amplitude: ExpansionQuantity;
  readonly frequency: ExpansionQuantity;
  readonly phaseData: ExpansionQuantity;
  readonly domainDuration: ExpansionQuantity;
}
interface InterferenceCycleBase extends ExpansionStoryBase {
  entities: readonly ExpansionEntity[];
  scope: string;
  period: string;
  records: readonly InterferenceCycleFact[];
  relations: readonly InterferenceCycleFact[];
}
export type ExpansionInterferenceCycleScene =
  | (InterferenceCycleBase & {
      storyId: '77';
      kind: 'signal-composition';
      preset: 'interference';
      template: 'analytic-superposition';
      waves: readonly InterferenceWave[];
    })
  | (InterferenceCycleBase & {
      storyId: '78';
      kind: 'material-process';
      preset: 'state-cycle';
      template: 'source-state-cycle';
    });
