import { FUNDS_SOURCE_FIXTURES } from '../../remotion/compositions/explainer/business/funds/fixtures';
import type {
  DistributionWaterfallScene,
  FundLifecycleScene,
  FundLiquidityScene,
  FundsScene,
} from '../../remotion/compositions/explainer/business/funds/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  parseDistributionWaterfallScene,
  parseFundLifecycleScene,
  parseFundLiquidityScene,
} from './business-funds-contract';
import type { KindSpec } from './kind-spec';

type FundsMetadata = Pick<
  KindSpec,
  'family' | 'layouts' | 'durationSec' | 'describe' | 'schema' | 'limits' | 'triggers' | 'avoid'
>;
const BASE = `Common raw fields: kind,preset,visualMode:"diagram"|"hybrid",subject,outcome,
setupWord,actionWord,responseWord,checkWord,resolveWord (five strictly ordered source word indices),
fund and operator:{id,label,source:{fromWord,toWord}},factEvidence:{state,label,source},
carrierSource:{fromWord,toWord}|null. Optional condition is the complete source condition.
Fund source must say "<fund> is a fund" (or "an interval fund"); operator source separately binds
"<operator> is the operator of <fund>". Carrier evidence explicitly binds the authored illustrative asset.
FundsAmount={state:"source-stated"|"unknown"|"negative"|"pending"|"conditional",
amount:{currency:"USD"|"EUR"|"GBP",minorUnits:integer}|null,
basis:{subjectId:fund.id,population,unit,period,denominator:number|null,source:{fromWord,toWord}},
source:{fromWord,toWord},condition:string|null}. Exact complete local monetary clause:
"<fund> states <metric> is <amount> <currency> during <period> per <denominator> <population>".
Unknown/negative/pending amounts are null, not zero, with a separate explicit positive basis clause.
Conditional amount retains its full "If ... <fund> would state ..." body; never treat it as cash paid.
All identities, numbers, actions, currency, period/population/denominator and conditions are locally source-bound.
No unsupported fields, fees/taxes/FX, simulated returns, legal interpretation, generated payouts or promises of exit.`;
function example(id: string): string {
  const fixture = FUNDS_SOURCE_FIXTURES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Missing authored funds schema ${id}`);
  return JSON.stringify(fixture.raw);
}
const LIMITS = `5–12 seconds; five word-indexed beats; >=0.8s final hold; each complete fixed-font page
>=1.5s after actual diagram handoff. <=8 semantic entities/12 relationships/4 holds. Exact nonnegative
minor units <=100000000000 and compatible money/population/unit/period/denominator bases;
conserve complete source amounts plus explicit remainders, otherwise show unknowns/priority without numeric fills.
Keep commitments versus cash, dates versus beat clocks, valuation versus liquidity and fees versus net distinct.
No default agreements, universal fund terms, success from time, arbitrary geometry or new money movement.`;

function sourceCues(scene: FundsScene): SceneCue[] {
  return [
    { at: scene.setupAt, kind: 'flip', gain: 0.16 },
    { at: scene.actionAt, kind: 'tick', gain: 0.16 },
    { at: scene.responseAt, kind: 'tick', gain: 0.16 },
    { at: scene.checkAt, kind: 'flip', gain: 0.16 },
  ];
}
export function fundLifecycleCues(scene: FundLifecycleScene): SceneCue[] {
  return sourceCues(scene);
}
export function distributionWaterfallCues(scene: DistributionWaterfallScene): SceneCue[] {
  return sourceCues(scene);
}
export function fundLiquidityCues(scene: FundLiquidityScene): SceneCue[] {
  return sourceCues(scene);
}

const lifecycleMetadata = {
  family: 'framework',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe: `Distinct source fund-capital states, not a forecast: capital-states separates commitment/call/contribution/deployment/retention;
subscriptions-and-close separates subscription/uncalled rights, closing date/state and available cash;
source-periods retains discrete dated capital snapshots; retained-follow-on-capital separates retained cash, stated allocation and remaining cash.
Never turn an agreement, closing, condition or future call into contributed/available cash. Diagram and hybrid preserve identical facts.`,
  schema: `${example('OP-49')}\n${BASE}
Preset capital-states: committed,called,contributed,deployed,retained:FundsAmount; metrics committed capital/called capital/contributed cash/deployed cash/retained cash.
Preset subscriptions-and-close: subscriptions,uncalled,cash:FundsAmount; metrics subscription commitments/uncalled commitments/available cash;
closing:{state:"closed"|"pending"|"unknown"|"negative",date,source}. Closing is separately stated, never cash.
Preset source-periods: periods:[{identity,date,account:"committed"|"called"|"contributed"|"deployed"|"retained",value:FundsAmount}] (1–4); each literal date equals the supplied reporting period.
Preset retained-follow-on-capital: retained,allocated,remaining:FundsAmount; metrics retained cash/follow-on allocation/remaining retained cash.
CarrierSource binds commitment folio (plus distribution trays for follow-on) as illustrative records, not cash or rights inferred from a model.`,
  limits: LIMITS,
  triggers: [
    /\b(?:capital commitment|committed capital|uncalled commitments?|capital calls?|contributed cash|deployed cash)\b/i,
    /\b(?:fund|subscription)\b.{0,90}\b(?:close|closing|commitments?|contribution|deployment)\b/i,
    /\b(?:fund vintage|fund lifecycle|follow[ -]on reserves?|follow[ -]on allocation|retained cash)\b/i,
  ],
  avoid:
    'Generic fundraising slogans without a named source fund/capital states; commitment or NAV presented as spendable cash.',
} satisfies FundsMetadata;
export const FUND_LIFECYCLE_SPEC = {
  ...lifecycleMetadata,
  kind: 'fund-lifecycle',
  parse: parseFundLifecycleScene,
  cues: fundLifecycleCues,
} as const;

const waterfallMetadata = {
  family: 'framework',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe: `Only the source agreement's ordered distribution priorities/ceilings/amounts, including partial tiers and retained cash.
No default hurdle/carry/performance fee, generated payout or legal interpretation. gross-to-net is diagram-only and shows complete stated costs, net and explicit remainder,
not invented taxes/expenses/profit. Unknown or contingent quantities remain labelled but unfilled.`,
  schema: `${example('OP-51')}\n${BASE}
Preset stated-priority-tiers: proceeds,retained:FundsAmount (distributable proceeds cash/retained distribution cash);
tiers:[{identity,priority:1..4,prioritySource:{fromWord,toWord},ceiling:FundsAmount,allocation:FundsAmount}] (1–4).
Actual priority order and every tier's ceiling/distribution are separately source-bound. Compatible allocation<=ceiling;
no later paid tier behind an incomplete priority. An explicit zero-ceiling/zero-paid tier stays empty without manufacturing cash.
Preset gross-to-net: visualMode:"diagram",carrierSource:null,gross,net,remainder:FundsAmount;
costs:[{identity,amount:FundsAmount}] (1–3),costsSource:{fromWord,toWord} binds the complete cost list.
Metrics gross proceeds/net proceeds/stated cost remainder. No duplicated review/cost identity or inferred missing expense.`,
  limits: LIMITS,
  triggers: [
    /\b(?:distribution waterfall|distribution tier|distribution priorit(?:y|ies)|priority tiers?)\b/i,
    /\b(?:distributable proceeds|retained distribution cash|gross[ -]to[ -]net|gross proceeds|net proceeds)\b/i,
    /\b(?:fund|distribution)\b.{0,90}\b(?:ceiling|partial tier|stated costs)\b/i,
  ],
  avoid:
    'Literal waterfalls or graphics pipelines; universal investment-fee assumptions or projected positive returns.',
} satisfies FundsMetadata;
export const DISTRIBUTION_WATERFALL_SPEC = {
  ...waterfallMetadata,
  kind: 'distribution-waterfall',
  parse: parseDistributionWaterfallScene,
  cues: distributionWaterfallCues,
} as const;

const liquidityMetadata = {
  family: 'compare',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe: `Source-stated fund-specific liquidity limits, not promised exits: periodic-repurchase requires an explicitly named interval fund,
its dated window/cap/available cash and each request's pending/fulfilled/negative/unknown state.
valuation-cash-distinction keeps asset NAV/valuation and available cash as separate incomparable accounts.
No transferability, valuation, request or calendar passage implies liquidation or payment.`,
  schema: `${example('OP-55')}\n${BASE}
Preset periodic-repurchase: fund source explicitly "<fund> is an interval fund";
window:{label,source},cap,cash:FundsAmount (repurchase cap/available cash);
requests:[{identity,state:"pending"|"fulfilled"|"negative"|"unknown",source,amount:FundsAmount}] (1–4).
Each request state/owner/window is separately source-bound; only fulfilled source requests can move paid cash,
with complete compatible stated amounts <=cash and cap. Pending requests are not paid; no default repurchase percentage.
Preset valuation-cash-distinction: valuation,cash:FundsAmount (asset valuation/available cash),
separately named incomparable account populations, no NAV-derived liquidity. CarrierSource binds separate economic-rights records.`,
  limits: LIMITS,
  triggers: [
    /\b(?:interval fund|repurchase window|repurchase cap|repurchase request|periodic repurchase)\b/i,
    /\b(?:NAV|asset valuation)\b.{0,90}\b(?:cash|liquidity|repurchase)\b/i,
    /\b(?:cash|liquidity)\b.{0,90}\b(?:NAV|asset valuation)\b/i,
  ],
  avoid:
    'Corporate buybacks or stock liquidity without a source fund contract; guaranteed withdrawals or valuation converted into cash.',
} satisfies FundsMetadata;
export const FUND_LIQUIDITY_SPEC = {
  ...liquidityMetadata,
  kind: 'fund-liquidity',
  parse: parseFundLiquidityScene,
  cues: fundLiquidityCues,
} as const;
