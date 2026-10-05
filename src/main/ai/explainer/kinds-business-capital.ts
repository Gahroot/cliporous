import { CAPITAL_SOURCE_FIXTURES } from '../../remotion/compositions/explainer/business/capital/fixtures';
import type {
  CapitalScene,
  CapitalStructureScene,
  EconomicRightsScene,
  InvestmentOutcomesScene,
} from '../../remotion/compositions/explainer/business/capital/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  parseCapitalStructureScene,
  parseEconomicRightsScene,
  parseInvestmentOutcomesScene,
} from './business-capital-contract';
import type { KindSpec } from './kind-spec';

type CapitalMetadata = Pick<
  KindSpec,
  'family' | 'layouts' | 'durationSec' | 'describe' | 'schema' | 'limits' | 'triggers' | 'avoid'
>;
const BASE = `Raw common fields: kind,preset,visualMode:"diagram"|"hybrid",label,subject,outcome,evidence,layout,
startWord,endWord and five strictly ordered indexed beats setupWord/actionWord/responseWord/checkWord/resolveWord.
company:{id,label,source:{fromWord,toWord}},period (literal source reporting text),modelSource:{fromWord,toWord}|null.
Setup explicitly names the company/financial asset/report and says "<company> opens source facts for <period>";
resolve source says "Source facts remain distinct"; outcome keeps that exact neutral statement.
Identity clauses belong in setup, independent authored-model clauses in action, ownership/amount clauses in response,
and priority/maturity/probability clauses in check. Full local clauses only, no cropped qualifiers or swapped actors.
QuantityBasis={subjectId:company.id,population,unit,period,denominator:number|null,source:{fromWord,toWord}}.
CapitalMoneyFact={state:"source-stated"|"unknown"|"negative"|"conditional"|"pending",money:{currency:"USD"|"EUR"|"GBP",minorUnits:integer}|null,basis:QuantityBasis,source}.
Unknown/negative money is null, never zero. A supported proposed/pending/conditional amount remains a commitment, not cash.
CapitalStatement={state:"source-stated"|"unknown"|"negative"|"conditional",label,source}; preserve the complete local statement.
No asset/claim/control/liquidity/return/permission inference. modelSource gates only code-owned illustrative records, never executable render choices.`;
const LIMITS = `Strict bounded JSON; 5–12 seconds, five source-indexed beats, >=0.8s final hold;
<=8 semantic entities/12 relationships/4 holds, <=4 complete fixed-font pages visible >=1.5s after actual diagram handoff.
Money uses exact nonnegative capped minorUnits <=100000000000 and source-bound currency/population/unit/period/denominator.
Shares use existing safe-integer counts and exact supported ownership arithmetic. Unknown basis is not a calibrated comparison.
No fabricated correlations/probabilities/returns, projections, positive exit, default agreement terms, legal interpretation, advice,
FX, taxes, price/valuation-derived liquidity, elapsed-time approval or money movement. diagram/hybrid retain identical facts.
Reject density/unsupported keys/geometry/styles/code/URLs/assets; never shrink/truncate/drop facts or relax source gates.`;
function examples(kind: CapitalScene['kind']): string {
  return CAPITAL_SOURCE_FIXTURES.filter((fixture) => fixture.raw.kind === kind)
    .map((fixture) => JSON.stringify(fixture.raw))
    .join('\n');
}
function neutralCues(scene: CapitalScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'tick', at: scene.actionAt, gain: 0.16 },
    { kind: 'tick', at: scene.responseAt, gain: 0.16 },
    { kind: 'flip', at: scene.checkAt, gain: 0.16 },
  ];
}
export function economicRightsCues(scene: EconomicRightsScene): SceneCue[] {
  return neutralCues(scene);
}
export function capitalStructureCues(scene: CapitalStructureScene): SceneCue[] {
  return neutralCues(scene);
}
export function investmentOutcomesCues(scene: InvestmentOutcomesScene): SceneCue[] {
  return neutralCues(scene);
}
const rightsMetadata = {
  family: 'compare',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe: `Source-grounded economic-rights X-ray: ownership-versus-claims separates named shares, control, claim priority and supported/unknown payout.
claim-asset-distinction separates a holder's conditional/negative/unknown transferability from underlying asset liquidity.
Neither a transferable claim nor ownership means cash, control or permission. Same subject in clay and diagram, without inferred legal rights.`,
  schema: `${examples('economic-rights')}\n${BASE}
Both presets require holder,claim:{id,label,source} and claimEvidence:{state,label,source}; source names "<holder> holds <claim> on <company> during <period>".
ownership-versus-claims: ownership:{shares,total,percent,basis,source},control,priority:CapitalStatement,payout:CapitalMoneyFact.
The ownership source binds holder/company/shares/total/percent and its share denominator; control and payout priority are independently stated.
claim-asset-distinction: transfer,liquidity:CapitalStatement; condition is required only for explicitly conditional transfer and stays in its full statement.
Action modelSource says "<company> maintains asset ownership and economic claim records"; authored layers are records, not an inferred payout order.`,
  limits: LIMITS,
  triggers: [
    /\b(?:economic (?:rights?|claims?)|payout priority|claim holder|share and claim holder)\b/i,
    /\b(?:shares|ownership)\b.{0,90}\b(?:control|claims?|payout)\b/i,
    /\b(?:claim|underlying asset)\b.{0,100}\b(?:transferability|transfer|illiquid|liquidity)\b/i,
  ],
  avoid:
    'Not copyright claims, code ownership, generic asset value or legal advice; source must separately bind the holder, economic claim and underlying asset facts.',
} satisfies CapitalMetadata;
export const ECONOMIC_RIGHTS_SPEC = {
  ...rightsMetadata,
  kind: 'economic-rights',
  parse: parseEconomicRightsScene,
  cues: economicRightsCues,
} as const;

const structureMetadata = {
  family: 'framework',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe: `Conditional financing rounds retain supported before/after share arithmetic without treating a proposed round as issued shares.
financing-versus-capacity separates dated debt from installed/commissioned physical capacity; debt is not readiness.
obligations-and-maturity retains literal maturity dates and separately stated asset duration/liquidity without promising refinancing or sale.`,
  schema: `${examples('capital-structure')}\n${BASE}
conditional-rounds: holder,ownership,rounds:[{identity:{identity:{id,label,source},version,source},commitment:CapitalMoneyFact,status:"issued"|"pending"|"conditional",issued,beforeTotal,afterTotal,beforePercent,afterPercent,shareBasis:QuantityBasis,source}] (1–2).
Round source binds commitment, actual/proposed issuance, holder retained shares, all totals/percentages and both monetary/share bases.
Only issued rounds advance observed totals; pending/conditional rounds keep proposed dilution separate. conditional requires the complete source condition.
Action modelSource says "<company> uses commitment records beside ownership and economic claim records".
financing-versus-capacity / obligations-and-maturity: lender,asset:{id,label,source},assetEvidence:{state,label,source},obligations:[{identity,principal:CapitalMoneyFact,maturity,source}] (1–2).
Each obligation has its own exact lender/company/date clause. financing-versus-capacity adds installed,commissioned:{state:"source-stated"|"unknown",count:number|null,basis,source}; compatible rack units and commissioning <= installation.
Action modelSource says "<company> uses dated debt records beside data-center rack records for <asset>".
obligations-and-maturity adds duration,liquidity:CapitalStatement; action modelSource says "<company> uses dated debt records beside asset records for <asset>".
All maturity dates and periods are literal text, never beat clocks. Authored records inspect evidence; physical ladder slots are not added obligations.`,
  limits: LIMITS,
  triggers: [
    /\b(?:capital rounds?|staged financing|pending issuance|proposed issuance|new shares)\b/i,
    /\b(?:debt obligation|debt records|infrastructure debt|lender)\b/i,
    /\b(?:maturity|asset duration|underlying asset liquidity)\b/i,
  ],
  avoid:
    'Not programming rounds, software deployment, generic headcount scaling, guaranteed refinancing or debt implying commissioned capacity.',
} satisfies CapitalMetadata;
export const CAPITAL_STRUCTURE_SPEC = {
  ...structureMetadata,
  kind: 'capital-structure',
  parse: parseCapitalStructureScene,
  cues: capitalStructureCues,
} as const;

const outcomesMetadata = {
  family: 'data',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe: `Source financial outcome sets, diagram-only: equal-area/time qualitative alternatives, supplied discrete samples, or a fully stated bounded distribution.
Unknown amounts stay unknown. Labels preserve proceeds/loss/return distinctions; no interpolated trend, invented success rate or forecast.`,
  schema: `${examples('investment-outcomes')}\n${BASE}
source-outcome-set: visualMode:"diagram",modelSource:null,setMode:"alternatives"|"samples"|"distribution",setEvidence:{state,label,source},
outcomes:[{identity:{id,label,source},measure:"proceeds"|"loss"|"return",amount:CapitalMoneyFact,probability:null|{numerator,denominator,source}}] (2–3).
The action source names the complete supplied outcome set; each response amount binds company/outcome/measure/reporting basis.
Samples retain supplied comparable amounts or explicitly unknown entries, never interpolated values; alternatives imply no probability through area/frequency/duration.
Only distribution accepts check-phase source probabilities, with compatible positive stated denominators and numerators summing exactly to that denominator.
No returns calculator, arbitrary plot, task/order analogy, nonfinancial count distribution, winner or fabricated positive return.`,
  limits: LIMITS,
  triggers: [
    /\b(?:financial outcomes?|financial alternatives|financial samples|financial distribution|outcome dispersion)\b/i,
    /\b(?:investment outcomes?|investment returns?|investment losses)\b/i,
  ],
  avoid:
    'Not order/task distributions, loss functions, simulations, stock predictions or generic future possibilities without a supplied financial outcome set.',
} satisfies CapitalMetadata;
export const INVESTMENT_OUTCOMES_SPEC = {
  ...outcomesMetadata,
  kind: 'investment-outcomes',
  parse: parseInvestmentOutcomesScene,
  cues: investmentOutcomesCues,
} as const;
