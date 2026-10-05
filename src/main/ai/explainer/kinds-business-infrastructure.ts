import { INFRASTRUCTURE_SOURCE_FIXTURES } from '../../remotion/compositions/explainer/business/infrastructure/fixtures';
import type {
  CapacityMapScene,
  InfrastructureScene,
  OperatingLineageScene,
} from '../../remotion/compositions/explainer/business/infrastructure/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  parseCapacityMapScene,
  parseOperatingLineageScene,
} from './business-infrastructure-contract';
import type { KindSpec } from './kind-spec';

type InfrastructureMetadata = Pick<
  KindSpec,
  'family' | 'layouts' | 'durationSec' | 'describe' | 'schema' | 'limits' | 'triggers' | 'avoid'
>;
const BASE = `Common raw fields: kind,preset,visualMode:"diagram"|"hybrid",label,subject,outcome,evidence,period,layout,startWord,endWord,
five strictly ordered source-indexed setupWord/actionWord/responseWord/checkWord/resolveWord,
modelSource:{fromWord,toWord}|null (explicit positive native illustration/identity clause in setup/action, bound to period; required for hybrid),
factEvidence:{state:"source-stated"|"illustrative"|"unknown"|"negative"|"conditional",label,source:{fromWord,toWord}} and optional exact source condition.
Resolve evidence starts at resolveWord and is the complete neutral literal outcome clause; no success/compliance/training conclusion.
BusinessIdentity={id,label,source:{fromWord,toWord}}, VersionedIdentity={identity:BusinessIdentity,version,source}.
InfrastructureFact raw={state:"source-stated"|"pending"|"negative"|"conditional"|"unknown",source:{fromWord,toWord}}; complete clause includes all qualifiers.
InfrastructureQuantity raw={state,value:number|null,unit:string|null,period,basis:null|{subjectId,population,unit,period,denominator:integer,source},source}.
Known quantity clause: SUBJECT reports OPERATION of VALUE UNIT during PERIOD per DENOMINATOR POPULATION.
Conditional: CONDITION, SUBJECT may report OPERATION of VALUE UNIT during PERIOD per DENOMINATOR POPULATION.
The quantity source includes condition; basis.source includes the exact quantitative body. Unknown/pending/negative: SUBJECT OPERATION in UNIT is STATE during PERIOD, with value=null and basis=null, never inferred zero.
Identity/evidence/status/quantity/version clauses are local and complete, never adjacent actor/value swaps or cropped negation/conditions.
Clocks remain beat seconds only; period/date/version remain source text. All native geometry stays code-owned and source-meaning gated.`;
const LIMITS = `Strict bounded JSON. 5–12 seconds, five beats, >=0.8s final source hold; <=8 entities/12 edges/4 holds/4 pages.
Complete fixed-font pages must fit bundled-font rails and >=1.5s reading holds after actual handoff; reject density, never shrink/truncate/drop facts.
Exact bounded nonnegative integer quantities; compatible subject/population/unit/period/denominator required before comparison, partition or summation.
No conversions, estimated utilization/throughput/latency, invented telemetry/compliance/permission, money-derived readiness, automatic completion/approval,
provider migration, inferred provenance, model retraining, measured improvement, drift diagnosis, forecasts or winners.
Native rack trays/panels/loops and motion are independently authored illustrations, never quantity counts or observed processes.
Reject arbitrary keys/geometry/styles/code/URLs/assets; no remote fetches. diagram/hybrid have the same source facts and identities; OP-71 stays diagram-only.`;
function examples(kind: InfrastructureScene['kind']): string {
  return INFRASTRUCTURE_SOURCE_FIXTURES.filter((fixture) => fixture.raw.kind === kind)
    .map((fixture) => JSON.stringify(fixture.raw))
    .join('\n');
}
function neutralCues(scene: InfrastructureScene): SceneCue[] {
  return [
    { kind: 'tick', at: scene.setupAt, gain: 0.16 },
    { kind: 'flip', at: scene.actionAt, gain: 0.16 },
    { kind: 'tick', at: scene.responseAt, gain: 0.16 },
    { kind: 'flip', at: scene.checkAt, gain: 0.16 },
  ];
}
export function capacityMapCues(scene: CapacityMapScene): SceneCue[] {
  return neutralCues(scene);
}
export function operatingLineageCues(scene: OperatingLineageScene): SceneCue[] {
  return neutralCues(scene);
}

const capacityMetadata = {
  family: 'data',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe: `Six source-grounded capacity/readiness grammars: installed-used-reserved and resource-states retain compatible nonoverlapping allocations;
physical-readiness separates funding, power and cooling; bounded-request-capacity keeps declared queued requests separate from declared capacity.
declared-processing-scope preserves stated item/boundary conditions, not actual residency/compliance monitoring.
end-to-end-periods sums only explicitly sequential compatible stage durations with supplied total; unknown overlap remains unsummed.`,
  schema: `${examples('capacity-map')}\n${BASE}
All require resource:BusinessIdentity.
installed-used-reserved: installed,used,reserved:InfrastructureQuantity and partition:{source}; exact source declares used/reserved nonoverlapping within installed capacity. Known observed sum <= installed, conditionals not subtracted as observed.
physical-readiness: funding,power,cooling:BusinessIdentity and moneyReady,powerReady,coolingReady:InfrastructureFact.
Each complete fact binds IDENTITY for RESOURCE is ready/is not ready/is pending/is unknown during PERIOD; conditional may be ready retains exact CONDITION.
Money readiness is never power/cooling readiness or permission to run.
bounded-request-capacity: task:BusinessIdentity,queued,capacity:InfrastructureQuantity; queued requests/declared task capacity share supported compatible bases, never invented serviced counts.
resource-states: cooling:BusinessIdentity,installed,idle,reserved,burst:InfrastructureQuantity,coolingReady:InfrastructureFact,partition:{source}; source declares idle/reserved/burst nonoverlapping within installed capacity; retained unknowns and conditionals remain unallocated as observed.
declared-processing-scope: item,boundary:BusinessIdentity,processing:InfrastructureFact; RESOURCE processes/does not process ITEM within BOUNDARY during PERIOD, or processing is pending/unknown; conditional may process retains full CONDITION.
end-to-end-periods: task:BusinessIdentity,stages:[{identity:BusinessIdentity,quantity:InfrastructureQuantity}] (2–6),total:InfrastructureQuantity,
aggregation:{state:"sequential"|"unknown",source}; source explicitly declares named stages sequential with no overlap or aggregation unknown. Only stated sequential compatible durations can sum to stated total; supplied unknown total remains unknown.
Native modelSource uses complete positive clauses with M=is|illustrates and P=period:
installed-used-reserved / bounded-request-capacity: RESOURCE M a data-center rack during P.
physical-readiness: RESOURCE M a data-center rack with POWER power-readiness architecture and COOLING cooling-loop architecture during P.
resource-states: RESOURCE M a data-center rack with COOLING cooling-loop architecture during P.
declared-processing-scope: RESOURCE M a provider connector panel at BOUNDARY for inspecting ITEM processing during P.
end-to-end-periods: RESOURCE M a provider connector panel at its system boundary for inspecting TASK latency during P.
All named roles bind actual selected identities, not adjacent source objects. Null modelSource is diagram-only; no inferred native assets.
Installed trays are illustration, not capacity numbers.`,
  limits: LIMITS,
  triggers: [
    /\b(?:installed capacity|reserved capacity|capacity utilization|idle allocation|burst allocation)\b/i,
    /\b(?:funding|money)\b.{0,100}\b(?:power|cooling)\b/i,
    /\b(?:inference queue|queued requests|task capacity)\b/i,
    /\b(?:data residency|processing scope|processing boundary)\b/i,
    /\b(?:process|processes|processing)\b.{0,90}\b(?:within|boundary)\b/i,
    /\b(?:latency|end.to.end)\b.{0,90}\b(?:stage|duration|period|overlap|sequential)\b/i,
  ],
  avoid:
    'Not workforce capacity, clinical queues, live data-center control, compliance certification or automatic permission. Requires explicit named infrastructure/task/scope facts and compatible measurement bases.',
} satisfies InfrastructureMetadata;
export const CAPACITY_MAP_SPEC = {
  ...capacityMetadata,
  kind: 'capacity-map',
  parse: parseCapacityMapScene,
  cues: capacityMapCues,
} as const;

const lineageMetadata = {
  family: 'process',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe: `Evidence-and-missing-information preserves dated record versions, unknown/missing/pending receipt and explicit review conditions, never inferred approval.
provider-transition preserves from/to provider, dependency and completed/pending/blocked/conditional states; connectors are not migration success.
versioned-provenance binds declared version-to-version edges without inferring missing identities or causal approval.
evaluation-periods shows source-supplied comparable dated version/task observations or unknowns, diagram-only: no drift diagnosis, interpolated curve or retraining claim.`,
  schema: `${examples('operating-lineage')}\n${BASE}
evidence-and-missing-information: owner:BusinessIdentity,items:[{entry:VersionedIdentity,date,fact:InfrastructureFact}] (1–7).
Each full clause binds OWNER holds/does not hold RECORD version VERSION dated DATE during PERIOD or receipt is pending/status unknown; conditional may hold includes CONDITION. Entry.source equals fact.source; all dates are source text.
provider-transition: resource,fromProvider,toProvider,dependency:BusinessIdentity,transition:{state:"completed"|"pending"|"blocked"|"conditional"|"unknown",source}; complete clause binds exact RESOURCE transition of DEPENDENCY from FROM to TO during PERIOD; conditional stays proposed. Source words must explicitly describe the provider connector panel for native rendering.
versioned-provenance: owner:BusinessIdentity,entries:[VersionedIdentity] (2–7),edges:[{fromId,toId,state,source}] (1–12).
Entries source: OWNER names ENTRY version VERSION during PERIOD; edges independently bind OWNER derives/does not derive TO version TO_VERSION from FROM version FROM_VERSION during PERIOD or derivation pending/unknown/conditional. No self/duplicate edges or substituted versions.
evaluation-periods: visualMode="diagram",owner,task:BusinessIdentity,snapshots:[{version,date,quantity:InfrastructureQuantity,source}] (2–4).
Quantity operation is score for TASK version VERSION dated DATE; state source-stated/unknown only, unique version/date, compatible stated population/unit/period/denominator.
Native modelSource uses complete positive clauses with M=is|illustrates and P=period; V joins every ordered ENTRY_LABEL version VERSION with ' and '.
evidence-and-missing-information: OWNER M a playbook binder for inspecting V during P.
provider-transition: RESOURCE M a provider connector panel for inspecting the switch from FROM to TO requiring DEPENDENCY during P.
versioned-provenance: OWNER M a playbook binder for inspecting V with a provenance connector at the FIRST_LABEL version FIRST_VERSION version-record boundary during P.
The connector binds only the first record boundary, never a fabricated provider or edge. Null modelSource is diagram-only; evaluation-periods requires null.
Never swap evidence periods or infer measured improvement/drift/approval/retraining from a version change or time passing. Native record/version primitives are illustrations, not performed system operations.`,
  limits: LIMITS,
  triggers: [
    /\b(?:diligence evidence|evidence room|missing evidence|dated records)\b/i,
    /\b(?:provider exit|provider transition|provider connector|transition of)\b/i,
    /\b(?:data lineage|versioned provenance|provenance connector|derivation of|source version)\b/i,
    /\bderives\b.{0,80}\bversion\b.{0,60}\bfrom\b/i,
    /\b(?:model drift|evaluation periods|evaluation snapshot|score for)\b/i,
  ],
  avoid:
    'Not ancestor/family lineage, geological drift, actual migration/retraining, legal diligence advice or compliance approval. Requires locally named versions/providers/record states or comparable task evaluation observations.',
} satisfies InfrastructureMetadata;
export const OPERATING_LINEAGE_SPEC = {
  ...lineageMetadata,
  kind: 'operating-lineage',
  parse: parseOperatingLineageScene,
  cues: operatingLineageCues,
} as const;
