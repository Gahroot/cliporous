import { MARKETS_SOURCE_FIXTURES } from '../../remotion/compositions/explainer/business/markets/fixtures';
import type {
  MarketDependencyScene,
  ProcurementCommitmentScene,
} from '../../remotion/compositions/explainer/business/markets/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  parseMarketDependencyScene,
  parseProcurementCommitmentScene,
} from './business-markets-contract';
import type { KindSpec } from './kind-spec';

export {
  parseMarketDependencyScene,
  parseProcurementCommitmentScene,
} from './business-markets-contract';

type MarketsMetadata = Pick<
  KindSpec,
  'describe' | 'schema' | 'limits' | 'layouts' | 'durationSec' | 'family' | 'triggers' | 'avoid'
>;
export type MarketDependencySpec = MarketsMetadata & {
  kind: 'market-dependency';
  parse: typeof parseMarketDependencyScene;
  cues: typeof marketDependencyCues;
};
export type ProcurementCommitmentSpec = MarketsMetadata & {
  kind: 'procurement-commitment';
  parse: typeof parseProcurementCommitmentScene;
  cues: typeof procurementCommitmentCues;
};
function sourceExamples(
  kind: MarketDependencyScene['kind'] | ProcurementCommitmentScene['kind'],
): string {
  return MARKETS_SOURCE_FIXTURES.filter((fixture) => fixture.raw.kind === kind)
    .map((fixture) => {
      const raw = Object.fromEntries(
        Object.entries(fixture.raw).filter(
          ([key]) => !['startWord', 'endWord', 'layout'].includes(key),
        ),
      );
      return `${fixture.id}: ${JSON.stringify(raw)}`;
    })
    .join('\n');
}
const COMMON_LIMITS =
  'Strict bounded source JSON only: <=8 distinct semantic identities, <=12 supported relationships, <=4 unresolved/pending/conditional holds. No new variety family or raised shortlist caps. Five indexed beats setupWord/actionWord/responseWord/checkWord/resolveWord; every source has fromWord/toWord. Protect the entire 5–12s source window and >=0.8s settled final hold. label/subject <=28 chars, outcome/condition <=40; complete resolve clause, never crop negation or qualifications. Complete fixed-24px pages must each be fully visible >=1.5s after the real diagram handoff; <=4 pages, never shrink, truncate or drop a source fact. Every nested object has a concrete allowlist. Source states independent; unknown amounts/bases/counts are explicit null, never zero. No geometry, assets, treatments, URLs, code, arbitrary nodes, graph layouts, inferred revenue, profit, winners, sales or success. diagram and hybrid share the exact validated facts, except OP-44 is diagram ONLY.';

export function marketDependencyCues(scene: MarketDependencyScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'slide', at: scene.actionAt, gain: 0.22 },
    { kind: 'tick', at: scene.responseAt, gain: 0.18 },
    { kind: 'tick', at: scene.checkAt, gain: 0.16 },
    { kind: 'tick', at: scene.resolveAt, gain: 0.14 },
  ];
}
export function procurementCommitmentCues(scene: ProcurementCommitmentScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'slide', at: scene.actionAt, gain: 0.22 },
    { kind: 'tick', at: scene.responseAt, gain: 0.18 },
    { kind: 'tick', at: scene.checkAt, gain: 0.16 },
    { kind: 'tick', at: scene.resolveAt, gain: 0.14 },
  ];
}
export const MARKET_DEPENDENCY_SPEC: MarketDependencySpec = {
  kind: 'market-dependency',
  family: 'framework',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Named channel/customer-group dependencies, production/demand/access boundaries, migration constraints, explicitly sourced buyer/seller matching, conditional participation benefits, equal-baseline offerings, independent supply/distribution facts and complementary specialist capabilities. None imply a sale, payment or winner.',
  schema: sourceExamples('market-dependency'),
  limits: `${COMMON_LIMITS} OP-24 channel-concentration: business/customerGroups/channels[{identity,customerGroupId,dependency,volume}]; distinct channels AND customer groups, each clause binds its own group and business. volume state source-stated requires exact nonnegative safe count and basis{subjectId,population,unit,period,denominator,source}; denominator exact and positive. Comparisons require identical population/unit/period/denominator and evidence state; unknown/negative/conditional volume count:null,basis:null. OP-41 demand-access: business/offering/demand/channel/production/demandFact/access, each independent {state,source}. OP-42 migration-constraints: business/fromProvider/toProvider/migration{identity,state,source}/constraints[{identity,state,source}]; completed only on actual completed migration with EVERY explicit constraint satisfied, never conditional or pending. OP-43 participation-matching: business/participants[{identity,side,role}]/participations[{participantId,state,source}]/matches[{leftId,rightId,state,source,acceptance:{state,source}}]. side buyer/seller requires its own complete stated role clause; matching binds that distinct buyer/seller pair, acceptance independently binds the same pair; participation is neither. OP-44 stated-participation-benefit: diagram ONLY, business/participants/participations/benefit{label,state:conditional,source}, explicit source condition mandatory; no observed network value or exchange. OP-45 differentiated-offering: business/comparisonSubject/baseline{label,source} (validated state is source-stated)/offerings[{identity,differentiation:{label,state,source}}]; actual shared comparison subject/baseline, independent named differences and equal-baseline alternatives, no inferred winner. OP-46 supplier-distribution-boundaries: business/supplier/item/channel/supply/distribution, independent exact actor-bound facts. OP-48 complementary-specialists: business/specialists[{identity,capability:{identity,state,source}}]/pairs[{leftId,rightId,leftCapabilityId,rightCapabilityId,state,source}]; actual source-named people AND their capabilities, exact pair/capability evidence, never invented teamwork, delegates, hires or output. Market fact states source-stated/negative/conditional/unknown; use each grammar's specific pending/participating/matched/accepted/completed/satisfied states exactly as in the accepted examples.`,
  triggers: [
    /\b(?:channel concentration|distribution channels|customer groups)\b/i,
    /\b(?:demand|buyers)\b.{0,100}\b(?:distribution access|lack|cannot reach)\b/i,
    /\bdemand and production\b/i,
    /\b(?:provider migration|migration constraints|switching providers)\b/i,
    /\b(?:buyer side|seller side|buyer[ -]seller matching)\b/i,
    /\b(?:buyer|seller)\s+on\b/i,
    /\b(?:participation benefit|conditional network benefit)\b/i,
    /\bparticipation\b.{0,80}\bmay\s+(?:provide|benefit)\b/i,
    /\b(?:differentiated offerings|shared comparison baseline|same comparison subject)\b/i,
    /\bshare\b.{0,40}\bwith\s+(?:basic support|shared baseline)\b/i,
    /\b(?:supplier|supply)\b.{0,100}\b(?:distribution channel|distribution boundary)\b/i,
    /\b(?:complementary specialists|complementary capabilities)\b/i,
    /\b(?:capabilities|design|build)\b.{0,60}\b(?:does not )?complements?\b/i,
  ],
  avoid:
    'Not a television channel, software version upgrade, stock market forecast, generic network graph, population correlation, inferred network value, sales funnel or supplier dominance. Access, participation and matching are not acceptance, revenue or settlement.',
  parse: parseMarketDependencyScene,
  cues: marketDependencyCues,
};
export const PROCUREMENT_COMMITMENT_SPEC: ProcurementCommitmentSpec = {
  kind: 'procurement-commitment',
  family: 'process',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Source-named requester/delegate/approver/payee and a task/item retain separate procurement request, quote, authorization, acceptance and payment facts. Conditional or pending known prices remain proposed, never paid.',
  schema: sourceExamples('procurement-commitment'),
  limits: `${COMMON_LIMITS} OP-47 request-quote-authorize-pay: actors/task/item/roles{requester,delegate,approver,payee}; each role {actorId,source}, explicit null for unknown and a complete task/item-bound source clause. Shared actors require explicit source role evidence, never infer delegation or an approver. request{state,source}, quote{identity,state,source,amount,basis}, authority{state,source}, acceptance{state,source}, payment{identity,state,source,amount,basis}. Exact Money{currency,minorUnits} with safe integer minor units, no rounding or currency invention; basis{subjectId,population,unit,period,denominator,source} binds the same item, exact quantity and monetary clause. Unknown/negative amounts and bases null; pending or conditional KNOWN amounts retained verbatim with full source condition and quantitative body basis, never relabel cash or zero. A conditional amount needs an exact bounded condition plus actor/modal-bound quantitative body; preserve the FULL money clause and modal wording. request requested/pending/negative/conditional/unknown; quote quoted/pending/negative/conditional/unknown; authority granted/pending/denied/conditional/unknown; acceptance accepted/pending/negative/conditional/unknown; payment paid/pending/negative/conditional/unknown. Actual settlement ONLY payment.state=paid. Actual authority ONLY authority.state=granted. Neither quotation, permission, matching nor acceptance imply purchase, exchange, payment or profit.`,
  triggers: [
    /\b(?:procurement request|procurement facts|procurement authorization|purchase authorization)\b/i,
    /\bquoted\b.{0,100}\bamount\b.{0,30}\b(?:USD|EUR|GBP)\b/i,
    /\b(?:requester|delegate|approver|payee)\b.{0,100}\b(?:procurement|acquisition|quote|payment)\b/i,
    /\b(?:quote|quoted)\b.{0,100}\b(?:authorization|payment pending|unpaid|paid)\b/i,
    /\b(?:conditional quote|conditional payment|payment remains pending)\b/i,
  ],
  avoid:
    'Not a quoted sentence, permission to access a website, accepted invitation, request for advice or inferred purchase. A price, authorization or acceptance never proves payment; pending/conditional known amounts are not observed spending.',
  parse: parseProcurementCommitmentScene,
  cues: procurementCommitmentCues,
};
