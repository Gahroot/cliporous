/** Source-only supply and incentive facts; no balances, winners or derived effects. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export type SupplyIncentivesState =
  | 'stated'
  | 'unknown'
  | 'missing'
  | 'disputed'
  | 'conditional'
  | 'simulated'
  | 'illustrative';
export type SupplyIncentivesRole =
  | 'stage'
  | 'inventory'
  | 'transfer'
  | 'replacement'
  | 'exchange'
  | 'payment'
  | 'benefit'
  | 'external-effect'
  | 'result';
export interface SupplyIncentivesRecord {
  readonly id: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly stage: string;
  readonly role: SupplyIncentivesRole;
  readonly claim: string;
  readonly value: string;
  readonly state: SupplyIncentivesState;
  readonly scope: string;
  readonly period: string;
  readonly condition?: string;
  readonly qualifier?: string;
  readonly evidence: ExpansionEvidenceSpan;
}
export interface SupplyIncentivesRelation {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly role: SupplyIncentivesRole;
  readonly state: SupplyIncentivesState;
  readonly condition?: string;
  readonly qualifier?: string;
  readonly evidence: ExpansionEvidenceSpan;
}
interface SupplyIncentivesBase extends ExpansionStoryBase {
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly SupplyIncentivesRecord[];
  readonly relations: readonly SupplyIncentivesRelation[];
  readonly quantities: readonly ExpansionQuantity[];
  readonly sourceSpans: Readonly<
    Record<'setup' | 'action' | 'response' | 'check' | 'resolve', ExpansionEvidenceSpan>
  >;
}
export type ExpansionSupplyIncentivesScene = SupplyIncentivesBase &
  (
    | {
        readonly storyId: '73';
        readonly kind: 'inventory-demand';
        readonly preset: 'supply-chain';
        readonly template: 'supply-modules';
      }
    | {
        readonly storyId: '74';
        readonly kind: 'market-exchange';
        readonly preset: 'incentive-externality';
        readonly template: 'incentive-board';
      }
  );
