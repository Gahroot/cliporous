import type { Money } from '../../finance/types';
import type { BusinessIdentity, BusinessStory, BusinessWordSpan, QuantityBasis } from '../types';

export const MARKETS_LIMITS = Object.freeze({ entities: 8, edges: 12, holds: 4, meshes: 180 });
export type MarketDependencyPreset =
  | 'channel-concentration'
  | 'demand-access'
  | 'migration-constraints'
  | 'participation-matching'
  | 'stated-participation-benefit'
  | 'differentiated-offering'
  | 'supplier-distribution-boundaries'
  | 'complementary-specialists';
export type MarketState = 'source-stated' | 'negative' | 'conditional' | 'unknown';
/** Text is derived from the complete source clause, never accepted as a rendering directive. */
export interface MarketFact<S extends string = MarketState> {
  state: S;
  source: BusinessWordSpan;
  text: string;
}
export interface MarketQuantity extends MarketFact<'source-stated'> {
  count: number;
  basis: QuantityBasis & { denominator: number };
}
interface MarketStory extends BusinessStory {
  kind: 'market-dependency';
  business: BusinessIdentity;
}
export type MarketVolume =
  | MarketQuantity
  | (MarketFact<'unknown' | 'negative' | 'conditional'> & {
      count: null;
      basis: null;
    });
/** OP-24 compares named distribution channels/customer groups, not supplier dominance. */
export interface ChannelConcentrationScene extends MarketStory {
  preset: 'channel-concentration';
  customerGroups: readonly BusinessIdentity[];
  channels: readonly {
    identity: BusinessIdentity;
    customerGroupId: string;
    dependency: MarketFact;
    volume: MarketVolume;
  }[];
}
export interface DemandAccessScene extends MarketStory {
  preset: 'demand-access';
  offering: BusinessIdentity;
  demand: BusinessIdentity;
  channel: BusinessIdentity;
  production: MarketFact;
  demandFact: MarketFact;
  access: MarketFact;
}
export type MigrationState = 'completed' | 'pending' | 'negative' | 'conditional' | 'unknown';
export type MigrationConstraintState =
  | 'satisfied'
  | 'unmet'
  | 'negative'
  | 'conditional'
  | 'unknown';
export interface MigrationConstraintsScene extends MarketStory {
  preset: 'migration-constraints';
  fromProvider: BusinessIdentity;
  toProvider: BusinessIdentity;
  migration: MarketFact<MigrationState> & { identity: BusinessIdentity };
  constraints: readonly (MarketFact<MigrationConstraintState> & { identity: BusinessIdentity })[];
}
export type ParticipationState = 'participating' | 'negative' | 'conditional' | 'unknown';
export type MatchingState = 'matched' | 'pending' | 'negative' | 'conditional' | 'unknown';
export type AcceptanceState = 'accepted' | 'pending' | 'negative' | 'conditional' | 'unknown';
export interface MarketParticipation extends MarketFact<ParticipationState> {
  participantId: string;
}
export interface MarketMatch extends MarketFact<MatchingState> {
  leftId: string;
  rightId: string;
  acceptance: MarketFact<AcceptanceState>;
}
export interface MarketSidedParticipant {
  identity: BusinessIdentity;
  side: 'buyer' | 'seller';
  role: MarketFact<'source-stated'>;
}
export interface ParticipationMatchingScene extends MarketStory {
  preset: 'participation-matching';
  participants: readonly MarketSidedParticipant[];
  participations: readonly MarketParticipation[];
  matches: readonly MarketMatch[];
}
export interface StatedParticipationBenefitScene extends MarketStory {
  preset: 'stated-participation-benefit';
  visualMode: 'diagram';
  condition: string;
  participants: readonly BusinessIdentity[];
  participations: readonly MarketParticipation[];
  benefit: MarketFact<'conditional'> & { label: string };
}
export interface DifferentiatedOfferingScene extends MarketStory {
  preset: 'differentiated-offering';
  comparisonSubject: BusinessIdentity;
  baseline: MarketFact<'source-stated'> & { label: string };
  offerings: readonly {
    identity: BusinessIdentity;
    differentiation: MarketFact & { label: string };
  }[];
}
export interface SupplierDistributionScene extends MarketStory {
  preset: 'supplier-distribution-boundaries';
  supplier: BusinessIdentity;
  item: BusinessIdentity;
  channel: BusinessIdentity;
  supply: MarketFact;
  distribution: MarketFact;
}
export interface ComplementarySpecialistsScene extends MarketStory {
  preset: 'complementary-specialists';
  specialists: readonly {
    identity: BusinessIdentity;
    capability: MarketFact & { identity: BusinessIdentity };
  }[];
  pairs: readonly (MarketFact & {
    leftId: string;
    rightId: string;
    leftCapabilityId: string;
    rightCapabilityId: string;
  })[];
}
export type MarketDependencyScene =
  | ChannelConcentrationScene
  | DemandAccessScene
  | MigrationConstraintsScene
  | ParticipationMatchingScene
  | StatedParticipationBenefitScene
  | DifferentiatedOfferingScene
  | SupplierDistributionScene
  | ComplementarySpecialistsScene;

export type ProcurementRole = 'requester' | 'delegate' | 'approver' | 'payee';
export interface ProcurementRoleFact {
  actorId: string | null;
  source: BusinessWordSpan;
  text: string;
}
export type RequestState = 'requested' | 'pending' | 'negative' | 'conditional' | 'unknown';
export type QuoteState = 'quoted' | 'pending' | 'negative' | 'conditional' | 'unknown';
export type AuthorityState = 'granted' | 'pending' | 'denied' | 'conditional' | 'unknown';
export type PaymentState = 'paid' | 'pending' | 'negative' | 'conditional' | 'unknown';
export interface ProcurementMoneyFact<S extends QuoteState | PaymentState> extends MarketFact<S> {
  identity: BusinessIdentity;
  amount: Money | null;
  basis: QuantityBasis | null;
}
/** All roles/actions have independent source clauses. IDs identify facts, not money movement. */
export interface ProcurementCommitmentScene extends BusinessStory {
  kind: 'procurement-commitment';
  preset: 'request-quote-authorize-pay';
  actors: readonly BusinessIdentity[];
  roles: Readonly<Record<ProcurementRole, ProcurementRoleFact>>;
  task: BusinessIdentity;
  item: BusinessIdentity;
  request: MarketFact<RequestState>;
  quote: ProcurementMoneyFact<QuoteState>;
  authority: MarketFact<AuthorityState>;
  acceptance: MarketFact<AcceptanceState>;
  payment: ProcurementMoneyFact<PaymentState>;
}
export type MarketsScene = MarketDependencyScene | ProcurementCommitmentScene;
