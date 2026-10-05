import { COMMERCIAL_RAW_FIXTURES } from '../../remotion/compositions/explainer/business/commercial/fixtures';
import type {
  BusinessBlueprintScene,
  BusinessReplicationScene,
} from '../../remotion/compositions/explainer/business/commercial/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { parseBusinessBlueprint, parseBusinessReplication } from './business-commercial-contract';
import type { KindSpec } from './kind-spec';

export { parseBusinessBlueprint, parseBusinessReplication } from './business-commercial-contract';

/** Local typed specs until coordinator root registration; no assertion to the root scene union. */
type CommercialMetadata = Pick<
  KindSpec,
  'describe' | 'schema' | 'limits' | 'layouts' | 'durationSec' | 'family' | 'triggers' | 'avoid'
>;
export type BusinessBlueprintSpec = CommercialMetadata & {
  kind: 'business-blueprint';
  parse: typeof parseBusinessBlueprint;
  cues: typeof businessBlueprintCues;
};
export type BusinessReplicationSpec = CommercialMetadata & {
  kind: 'business-replication';
  parse: typeof parseBusinessReplication;
  cues: typeof businessReplicationCues;
};
function sourceExamples(
  kind: BusinessBlueprintScene['kind'] | BusinessReplicationScene['kind'],
): string {
  return COMMERCIAL_RAW_FIXTURES.filter((fixture) => fixture.raw.kind === kind)
    .map((fixture) => {
      const raw = Object.fromEntries(
        Object.entries(fixture.raw).filter(
          ([key]) => key !== 'startWord' && key !== 'endWord' && key !== 'layout',
        ),
      );
      return `${fixture.id}: ${JSON.stringify(raw)}`;
    })
    .join('\n');
}
const COMMON_LIMITS =
  'Use source-word indices for all five beats setupWord/actionWord/responseWord/checkWord/resolveWord and each source.fromWord/toWord. Keep the complete 5–12s interval and >=0.8s final reading hold. labels/subject <=28 chars; outcome/condition <=40. <=8 distinct semantic identities, <=12 supported relationships, <=4 unresolved/pending/conditional holds. Fixed-font natural table height <=478px: split source, never shrink, truncate or omit facts. Every nested object is strict. diagram/hybrid are equally complete and share facts. Preserve exact source conditions and negative/unknown states. No geometry, styles, asset selection, URLs, code, stamps, emphasis, arbitrary graph nodes, utilization, profit, growth, cash, payment or inferred operating franchises.';

/** Five neutral source-beat cues, not booking/delivery/profit success or approval stamps. */
export function businessBlueprintCues(scene: BusinessBlueprintScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'slide', at: scene.actionAt, gain: 0.22 },
    { kind: 'tick', at: scene.responseAt, gain: 0.18 },
    { kind: 'tick', at: scene.checkAt, gain: 0.16 },
    { kind: 'tick', at: scene.resolveAt, gain: 0.14 },
  ];
}
export function businessReplicationCues(scene: BusinessReplicationScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'slide', at: scene.actionAt, gain: 0.22 },
    { kind: 'tick', at: scene.responseAt, gain: 0.18 },
    { kind: 'tick', at: scene.checkAt, gain: 0.16 },
    { kind: 'tick', at: scene.resolveAt, gain: 0.14 },
  ];
}
export const BUSINESS_BLUEPRINT_SPEC: BusinessBlueprintSpec = {
  kind: 'business-blueprint',
  family: 'framework',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Source-named back-office tasks, appointment measures, separate lead/booking/delivery artifacts, founder task dependence or explicit service-module compatibility. Support and booking never imply success, profit or payment.',
  schema: sourceExamples('business-blueprint'),
  limits: `${COMMON_LIMITS} OP-17 back-office: business/service/tasks[{task,state,source}], state source-stated/conditional/negative/unknown with a complete business-action-task-service clause. OP-19 service-slots: business/service/reserved/used/available, null when absent; a quantity has state/count/basis/source. Numeric counts are nonnegative safe integers and require basis subjectId/population/unit/period/denominator/source; comparisons require the exact same basis AND evidence state. Unknown/negative count:null, never zero; availability is only stated, never subtraction. OP-20 service-lifecycle: business/service/lead/booking/delivery each identity/state/source (pending/observed/conditional/negative/unknown) in source order. Separate artifacts, unless an explicit same-artifact claim binds repeated roles; received lead is not booking, booking is not delivery, delivery is not payment. OP-21 owner-dependency: business/founder/task/dependency{state,source}; dependent/removed/conditional/negative/unknown. Removed requires explicit completed removal for this task and founder, not a handoff, negation or forecast. OP-22 service-modules: business/service/modules/compatibility[{leftModuleId,rightModuleId,state,source}]/repeatedOffering. Each module needs its own service-membership source. Compatibility compatible/incompatible/conditional/unknown needs the actual ordered pair, not proximity. repeatedOffering:null unless explicitly source-stated/conditional/negative/unknown for this business/service. No compatible state from timing or a conditional agreement.`,
  triggers: [
    /\bback[ -]office\b/i,
    /\b(?:service slots|appointment capacity|reserved slots)\b/i,
    /\b(?:reserves?|uses?|available)\b.{0,40}\bslots\b/i,
    /\b(?:lead|book(?:ing|ed))\b.{0,160}\bdeliver\w*\b/i,
    /\b(?:founder|owner)\b.{0,80}\bdepend\w*\b/i,
    /\b(?:service modules|module records|productized service|compatibility between)\b/i,
  ],
  avoid:
    'Not invented capacity/utilization, growth, business-wide dependency removal, a payment lifecycle or productization from merely naming modules.',
  parse: parseBusinessBlueprint,
  cues: businessBlueprintCues,
};
export const BUSINESS_REPLICATION_SPEC: BusinessReplicationSpec = {
  kind: 'business-replication',
  family: 'process',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Distinct source-named local units retain a named common standard and locally bound context; standard-use states remain independent of unit membership and operating replication.',
  schema: sourceExamples('business-replication'),
  limits: `${COMMON_LIMITS} OP-23 shared-standard-local-context: business/standard/units[{identity,standardUse:{state,source},localDifference:{label,state,source}}]. At least two distinct local units. The standard source must explicitly bind this business to its shared standard; each identity source must explicitly name local membership. Each use source binds that local unit, standard and business with pending/observed/conditional/negative/unknown state. Each context source binds its own unit and business with source-stated/conditional/negative/unknown state. Context labels stay separate from standard/unit/business identities. Never copy a source across units, merge local IDs, clone branches, infer franchise operation, resolve conditions or measure replication growth.`,
  triggers: [
    /\b(?:shared standard|local context|local units|micro[ -]franchise)\b/i,
    /\b(?:branches|replication)\b.{0,80}\b(?:standard|local)\b/i,
  ],
  avoid:
    'Not a generic branch growth claim, an inferred functioning franchise, identical cloned units or invented local differences.',
  parse: parseBusinessReplication,
  cues: businessReplicationCues,
};
