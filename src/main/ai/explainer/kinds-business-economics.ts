import { ECONOMICS_SOURCE_FIXTURES } from '../../remotion/compositions/explainer/business/economics/fixtures';
import type {
  EconomicsScene,
  OperatingCostScene,
  ScaleEconomicsScene,
  ValueCaptureScene,
} from '../../remotion/compositions/explainer/business/economics/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  parseOperatingCostScene,
  parseScaleEconomicsScene,
  parseValueCaptureScene,
} from './business-economics-contract';
import type { KindSpec } from './kind-spec';

export {
  parseOperatingCostScene,
  parseScaleEconomicsScene,
  parseValueCaptureScene,
} from './business-economics-contract';

type EconomicsMetadata = Pick<
  KindSpec,
  'describe' | 'schema' | 'limits' | 'layouts' | 'durationSec' | 'family' | 'triggers' | 'avoid'
>;
export type OperatingCostSpec = EconomicsMetadata & {
  kind: 'operating-cost';
  parse: typeof parseOperatingCostScene;
  cues: typeof operatingCostCues;
};
export type ScaleEconomicsSpec = EconomicsMetadata & {
  kind: 'scale-economics';
  parse: typeof parseScaleEconomicsScene;
  cues: typeof scaleEconomicsCues;
};
export type ValueCaptureSpec = EconomicsMetadata & {
  kind: 'value-capture';
  parse: typeof parseValueCaptureScene;
  cues: typeof valueCaptureCues;
};
function examples(kind: EconomicsScene['kind']): string {
  return ECONOMICS_SOURCE_FIXTURES.filter((fixture) => fixture.raw.kind === kind)
    .map(
      (fixture) =>
        `${fixture.id}: ${JSON.stringify(
          Object.fromEntries(
            Object.entries(fixture.raw).filter(
              ([key]) => key !== 'startWord' && key !== 'endWord' && key !== 'layout',
            ),
          ),
        )}`,
    )
    .join('\n');
}
const LIMITS =
  'Strict bounded JSON; <=8 distinct identities, <=12 supported relationships, <=4 unresolved/negative/conditional holds. Five ordered indexed beats setupWord/actionWord/responseWord/checkWord/resolveWord in a real 5–12s full speech window; source.fromWord/toWord index complete local clauses, not global label presence. Each quantity requires state, explicit money/count, basis{subjectId,population,unit,period,denominator,source}, source. Money exact nonnegative capped minorUnits in a single USD/EUR/GBP currency; basis.unit MUST equal currency. Count keeps its own output jobs/tasks or staffing workers/people unit. No unit, seat/token/job, period, gross/net, stock/flow or currency conversion. Unknown/negative amount is null, not zero; genuinely source-bound contingent numbers stay conditional and never observed/paid. Complete source actor/action/component/amount/unit/period/denominator signatures are required; no evidence swaps or cropped qualifiers. Numeric sums need full compatible bases and exact conservation; distinct review/retry IDs are never duplicated/inferred. No simulations, forecasts, advice, default fees/take rates, winner, guaranteed payback, inferred profit/cash/FX/taxes. diagram/hybrid retain identical full facts; fixed 24/22px type and complete >=1.5s visible pages after actual diagram handoff, final >=0.8s settled source outcome. Reject density/time, never shrink/truncate/drop facts. Carrier is null (diagram only) or exact code-owned preset asset plus its independent source gate; no asset renderer selection, geometry/styles/code/assets/URLs or arbitrary graph.';
function neutralCues(scene: EconomicsScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'slide', at: scene.actionAt, gain: 0.2 },
    { kind: 'tick', at: scene.responseAt, gain: 0.16 },
    { kind: 'tick', at: scene.checkAt, gain: 0.14 },
    { kind: 'tick', at: scene.resolveAt, gain: 0.12 },
  ];
}
export function operatingCostCues(scene: OperatingCostScene): SceneCue[] {
  return neutralCues(scene);
}
export function scaleEconomicsCues(scene: ScaleEconomicsScene): SceneCue[] {
  return neutralCues(scene);
}
export function valueCaptureCues(scene: ValueCaptureScene): SceneCue[] {
  return neutralCues(scene);
}
export const OPERATING_COST_SPEC: OperatingCostSpec = {
  kind: 'operating-cost',
  family: 'data',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Source-stated cost per resolved task, implementation playbook periods, alternative pricing bases, or distinct accounting bases. Costs are not payment and revenue minus some costs is not profit.',
  schema: examples('operating-cost'),
  limits: `${LIMITS} OP-33 per-outcome: business/activity/components[{identity,cost}]/total/resolved/perOutcome. <=3 components; perOutcome observed only with fully observed compatible costs and positive resolved workload; exact minor-unit quotient, never divide zero/unresolved tasks or imply outcomes paid. A-04 named operating record. OP-37 implementation-periods: periods[{identity,version,date,source,cost,output}] <=2; date and reporting period are text, never beat clocks; named A-07 implementation playbook and explicit locally bound revisions. No positive payback. OP-38 comparable-pricing-bases: offers[{identity,price}] exactly2 plus alternativesSource; DIAGRAM ONLY, carrier:null. Equal area/time, no winner; incompatible populations/periods/denominators remain separate. OP-40 accounting-bases: revenue{accounting:accrual/gross/net,fact}/costs/statedCostRemainder/profit:null|{accounting:gross/net,fact}/cash:null|{accounting:received/held,fact}/receivable:null|fact. Source-stated profit independent; received cash not receivable/accrual. M-02 only revenue + compatible stated costs + explicit stated-cost remainder, never profit/cash/receivables as parts. No omitted expense or tax inference. A-04 operating record.`,
  triggers: [
    /\b(?:cost per (?:resolved|completed) (?:task|job|outcome)|per[ -]outcome cost|review.{0,40}retry.{0,40}cost)\b/i,
    /\bimplementation\b.{0,80}\b(?:costs?|periods?|playbook|revisions?)\b/i,
    /\b(?:pricing bases|comparable pricing|per[ -]seat pricing|per[ -]token pricing)\b/i,
    /\b(?:quoted offers?|quotes?)\b.{0,100}\b(?:price|seats?|tokens?|USD|EUR|GBP)\b/i,
    /\b(?:accounting bases|stated[ -]cost remainder|accrual revenue|receivable.{0,50}received cash)\b/i,
  ],
  avoid:
    'Not operating systems, computational big-O cost, cost functions/loss training, implementation details without source periods, token attention without prices, generic AI/business text or financial advice.',
  parse: parseOperatingCostScene,
  cues: operatingCostCues,
};
export const SCALE_ECONOMICS_SPEC: ScaleEconomicsSpec = {
  kind: 'scale-economics',
  family: 'data',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Finite stated output/cost samples or source-supported output/staffing alternatives. Separate axes keep their own units; no trend, extrapolation, optimum or automatic layoffs.',
  schema: examples('scale-economics'),
  limits: `${LIMITS} OP-34 fixed-variable: fixed/variable identities + samples[{identity,output,fixedCost,variableCost,total}] <=2. Monetary fixed+variable=total under full compatible currency bases. Output versus cost is a source-stated relationship with identical subject/population/period/denominator but unlike units, never a unit conversion. Discrete supplied samples only; no interpolation, calibrated curve or extrapolation. OP-36 output-staffing: exactly2 samples[{identity,output,staffing}] + alternativesSource naming this business/activity and both alternatives. Equal area/time, no winner or hiring optimum. Both use A-02 explicitly source-gated service-station illustration; occupancy independent and not inferred from staffing. M-02 or M-08 respectively.`,
  triggers: [
    /\bfixed(?: costs?)?\b.{0,80}\bvariable costs?\b/i,
    /\b(?:output|jobs|tasks)\b.{0,70}\b(?:staffing|worker count|headcount)\b/i,
  ],
  avoid:
    'Not model scaling laws, scale diagrams, JavaScript variables, fixed-point math, workforce changes without stated alternative quantities or generic business/AI text.',
  parse: parseScaleEconomicsScene,
  cues: scaleEconomicsCues,
};
export const VALUE_CAPTURE_SPEC: ValueCaptureSpec = {
  kind: 'value-capture',
  family: 'data',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Explicit locally stated allocation components plus a retained/unknown remainder. Source ordering is display order, never implied payout priority or contract terms.',
  schema: examples('value-capture'),
  limits: `${LIMITS} OP-39 source-stated-allocation: business/activity/total + exactly3 allocations[{identity,amount}] + remainder{identity,amount} + orderSource explicitly naming all four distinct source identities in order. Numeric A-10 fill requires four observed compatible quantities conserving the observed total >0. Otherwise explicit nonnumeric four-tray illustration with no fills; unknown retained remainder stays null. No take rate, profit, investment return or priority waterfall inference. M-02 exact conservation, not M-10 payout priority.`,
  triggers: [
    /\b(?:source[ -]stated allocation|allocation components|retained remainder)\b/i,
    /\ballocations?\b.{0,70}\b(?:retained|remainder|four trays)\b/i,
  ],
  avoid:
    'Not capture groups, image capture, market value, generic value creation, investment advice or inferred fees/profit/payout priority.',
  parse: parseValueCaptureScene,
  cues: valueCaptureCues,
};
