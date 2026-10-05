import type { DiagramStory } from '../../diagrams/types';
import type { Money } from '../../finance/types';
import type {
  BusinessEvidence,
  BusinessIdentity,
  BusinessWordSpan,
  QuantityBasis,
  VersionedIdentity,
} from '../types';

export type CapitalRecipeId = 'OP-57' | 'OP-59' | 'OP-60' | 'OP-61' | 'OP-62' | 'OP-64';
export type CapitalFactState = 'source-stated' | 'unknown' | 'negative' | 'conditional' | 'pending';
export interface CapitalStatement {
  state: 'source-stated' | 'unknown' | 'negative' | 'conditional';
  label: string;
  source: BusinessWordSpan;
}
export interface CapitalMoneyFact {
  state: CapitalFactState;
  money: Money | null;
  basis: QuantityBasis;
  source: BusinessWordSpan;
}
export interface CapitalCountFact {
  state: 'source-stated' | 'unknown';
  count: number | null;
  basis: QuantityBasis;
  source: BusinessWordSpan;
}
export interface CapitalOwnership {
  shares: number;
  total: number;
  percent: number;
  basis: QuantityBasis;
  source: BusinessWordSpan;
}
interface CapitalStory extends DiagramStory {
  company: BusinessIdentity;
  period: string;
  modelSource: BusinessWordSpan | null;
  finalHoldSeconds: number;
}
interface RightsStory extends CapitalStory {
  kind: 'economic-rights';
  holder: BusinessIdentity;
  claim: BusinessIdentity;
  claimEvidence: BusinessEvidence;
}
export interface OwnershipClaimsScene extends RightsStory {
  preset: 'ownership-versus-claims';
  ownership: CapitalOwnership;
  control: CapitalStatement;
  priority: CapitalStatement;
  payout: CapitalMoneyFact;
}
export interface ClaimAssetScene extends RightsStory {
  preset: 'claim-asset-distinction';
  transfer: CapitalStatement;
  liquidity: CapitalStatement;
}
export type EconomicRightsScene = OwnershipClaimsScene | ClaimAssetScene;

export interface CapitalOutcome {
  identity: BusinessIdentity;
  measure: 'proceeds' | 'loss' | 'return';
  amount: CapitalMoneyFact;
  probability: {
    numerator: number;
    denominator: number;
    source: BusinessWordSpan;
  } | null;
}
export interface InvestmentOutcomesScene extends CapitalStory {
  kind: 'investment-outcomes';
  preset: 'source-outcome-set';
  visualMode: 'diagram';
  setMode: 'alternatives' | 'samples' | 'distribution';
  setEvidence: BusinessEvidence;
  outcomes: CapitalOutcome[];
}
export interface CapitalRound {
  identity: VersionedIdentity;
  commitment: CapitalMoneyFact;
  status: 'issued' | 'pending' | 'conditional';
  issued: number;
  beforeTotal: number;
  afterTotal: number;
  beforePercent: number;
  afterPercent: number;
  shareBasis: QuantityBasis;
  source: BusinessWordSpan;
}
export interface ConditionalRoundsScene extends CapitalStory {
  kind: 'capital-structure';
  preset: 'conditional-rounds';
  holder: BusinessIdentity;
  ownership: CapitalOwnership;
  rounds: CapitalRound[];
}
export interface CapitalObligation {
  identity: BusinessIdentity;
  principal: CapitalMoneyFact;
  maturity: string;
  source: BusinessWordSpan;
}
interface ObligationsStory extends CapitalStory {
  kind: 'capital-structure';
  lender: BusinessIdentity;
  obligations: CapitalObligation[];
  asset: BusinessIdentity;
  assetEvidence: BusinessEvidence;
}
export interface FinancingCapacityScene extends ObligationsStory {
  preset: 'financing-versus-capacity';
  installed: CapitalCountFact;
  commissioned: CapitalCountFact;
}
export interface ObligationsMaturityScene extends ObligationsStory {
  preset: 'obligations-and-maturity';
  duration: CapitalStatement;
  liquidity: CapitalStatement;
}
export type CapitalStructureScene =
  | ConditionalRoundsScene
  | FinancingCapacityScene
  | ObligationsMaturityScene;
export type CapitalScene = EconomicRightsScene | InvestmentOutcomesScene | CapitalStructureScene;

export const CAPITAL_LIMITS = {
  identities: 8,
  relations: 12,
  holds: 4,
  meshes: 180,
  outcomes: 3,
  rounds: 2,
  obligations: 2,
  pages: 4,
  pageHold: 1.5,
} as const;

/** Facts, not a user-programmable graph: edges are prescribed by each grammar. */
export function capitalIdentities(scene: CapitalScene): BusinessIdentity[] {
  if (scene.kind === 'economic-rights') return [scene.company, scene.holder, scene.claim];
  if (scene.kind === 'investment-outcomes')
    return [scene.company, ...scene.outcomes.map((o) => o.identity)];
  if (scene.preset === 'conditional-rounds')
    return [scene.company, scene.holder, ...scene.rounds.map((r) => r.identity.identity)];
  return [scene.company, scene.lender, scene.asset, ...scene.obligations.map((o) => o.identity)];
}
export function capitalRelationCount(scene: CapitalScene): number {
  if (scene.kind === 'economic-rights') return scene.preset === 'ownership-versus-claims' ? 5 : 4;
  if (scene.kind === 'investment-outcomes') return scene.outcomes.length * 2;
  if (scene.preset === 'conditional-rounds') return 1 + scene.rounds.length * 3;
  return scene.obligations.length * 2 + 3;
}
export function capitalHoldCount(scene: CapitalScene): number {
  const unresolved = (state: string) => (state === 'source-stated' ? 0 : 1);
  if (scene.kind === 'economic-rights')
    return scene.preset === 'ownership-versus-claims'
      ? unresolved(scene.control.state) +
          unresolved(scene.priority.state) +
          unresolved(scene.payout.state)
      : unresolved(scene.transfer.state) + unresolved(scene.liquidity.state);
  if (scene.kind === 'investment-outcomes')
    return scene.outcomes.reduce((n, o) => n + unresolved(o.amount.state), 0);
  if (scene.preset === 'conditional-rounds')
    return scene.rounds.filter((r) => r.status !== 'issued').length;
  const obligations = scene.obligations.reduce((n, o) => n + unresolved(o.principal.state), 0);
  return (
    obligations +
    (scene.preset === 'financing-versus-capacity'
      ? unresolved(scene.installed.state) + unresolved(scene.commissioned.state)
      : unresolved(scene.duration.state) + unresolved(scene.liquidity.state))
  );
}
