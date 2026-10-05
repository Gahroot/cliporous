import {
  DECISIONS_ACCEPTED_VARIANTS,
  DECISIONS_SOURCE_FIXTURES,
} from '../../remotion/compositions/explainer/business/decisions/fixtures';
import type {
  DecisionsScene,
  MeasurementFrameScene,
  StagedDecisionScene,
  UncertaintyAlbumScene,
} from '../../remotion/compositions/explainer/business/decisions/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  parseMeasurementFrameScene,
  parseStagedDecisionScene,
  parseUncertaintyAlbumScene,
} from './business-decisions-contract';
import type { KindSpec } from './kind-spec';

type Metadata = Pick<
  KindSpec,
  'family' | 'layouts' | 'durationSec' | 'describe' | 'schema' | 'limits' | 'triggers' | 'avoid'
>;
const LIMITS =
  'Closed bounded finite JSON; <=8 identities/12 edges/4 unresolved holds/4 pages. Five ordered source-word-indexed beats, 5–12 seconds, >=0.8s final hold. Every full fixed >=24px factual page needs >=1.5s fully visible after actual handoff. Reject density, never shrink/truncate/drop facts. Null modelSource is diagram-only; hybrid requires every actual native assembly independently bound by a complete positive setup/action clause naming actual identity/version/period. OP-77 uses zero WebGL stages in diagram mode and one shared HybridStage in hybrid mode. No invented numbers, winners, probabilities, telemetry, approval, cash, universal adoption, legal or financial advice.';
const COMMON = `Common fields: kind,preset,visualMode,label,subject,owner:{id,label,source:{fromWord,toWord}},period,outcome,evidence,factEvidence:{state,label,source},modelSource:null|[{asset,identityId,source}],setupWord,actionWord,responseWord,checkWord,resolveWord,startWord,endWord,layout, optional complete source condition.
Fact={state:source-stated|pending|negative|conditional|unknown,source}. All facts are complete local clauses, never cropped negation/condition.
Quantity={state:planned|configured|observed|pending|negative|conditional|unknown,value:bounded integer|null,basis:{subjectId,population,unit,period,denominator:positive integer|null,source},source}.
Positive basis clause: OWNER names OPERATION basis in UNIT during PERIOD per DENOMINATOR POPULATION (or unknown POPULATION denominator). Basis and quantity have independent complete spans; the positive basis is not an observation or approval. Conditional quantity retains its complete condition even when the separately stated basis is known.
Quantity clause: OWNER planned/configured/observed OPERATION of VALUE UNIT during PERIOD per DENOMINATOR POPULATION.
Unknown/pending/negative: OWNER OPERATION in UNIT is unknown/pending/not supplied during PERIOD per DENOMINATOR POPULATION; value=null, never inferred zero.
Conditional: CONDITION, OWNER may report OPERATION of VALUE UNIT during PERIOD per DENOMINATOR POPULATION; never observed fill.
Versioned identity={identity:{id,label,source},version,source}. Dates, periods and versions remain literal source text; beat clocks are seconds. Resolve evidence preserves the complete final clause.`;
function examples(kind: DecisionsScene['kind']) {
  return [...DECISIONS_SOURCE_FIXTURES, ...DECISIONS_ACCEPTED_VARIANTS]
    .filter((f) => f.raw.kind === kind)
    .map((f) => JSON.stringify(f.raw))
    .join('\n');
}
function neutralCues(scene: DecisionsScene): SceneCue[] {
  return [
    { kind: 'tick', at: scene.setupAt, gain: 0.16 },
    { kind: 'flip', at: scene.actionAt, gain: 0.16 },
    { kind: 'tick', at: scene.responseAt, gain: 0.16 },
    { kind: 'flip', at: scene.checkAt, gain: 0.16 },
  ];
}
export function stagedDecisionCues(scene: StagedDecisionScene): SceneCue[] {
  return neutralCues(scene);
}
export function measurementFrameCues(scene: MeasurementFrameScene): SceneCue[] {
  return neutralCues(scene);
}
export function uncertaintyAlbumCues(scene: UncertaintyAlbumScene): SceneCue[] {
  return neutralCues(scene);
}
const stagedMetadata = {
  family: 'process',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'A contingent commitment record, separate required/pending gate and unresolved action approval. A commitment never becomes contributed cash or an approved action.',
  schema: `${examples('staged-decision')}\n${COMMON}\ncontingent-commitment: commitment:VersionedIdentity,action,gate,approver:BusinessIdentity,commitmentFact,gateFact,actionFact:Fact. Action state is pending/negative/conditional/unknown, never source-stated approval. Native folio clause: OWNER illustrates/is a commitment folio for NOTE version VERSION concerning ACTION during PERIOD. Separate approval rail clause: GATE illustrates/is an approval rail for ACTION reviewed by APPROVER during PERIOD. A-09 binds commitment.identity.id; A-06 binds gate.id.`,
  limits: LIMITS,
  triggers: [
    /\b(?:contingent commitment|commitment folio|stage gate|real option|contingent decision)\b/i,
    /\bcommitment\b.{0,90}\b(?:gate|approval|pending)\b/i,
  ],
  avoid: 'Not cash contribution, automatic approval, financial advice or a completed action.',
} satisfies Metadata;
export const STAGED_DECISION_SPEC = {
  ...stagedMetadata,
  kind: 'staged-decision',
  parse: parseStagedDecisionScene,
  cues: stagedDecisionCues,
} as const;
const measurementMetadata = {
  family: 'data',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Separate source planned/configured and observed quantities on identical bases; separate firms/functions/workers adoption frames; explicit original/surviving cohorts with exact attrition accounting.',
  schema: `${examples('measurement-frame')}\n${COMMON}\nplanned-observed: task:BusinessIdentity,planned,observed:Quantity. Planned is not observed; quantities share subject/unit/period/population/denominator. Native: OWNER illustrates/is an operating desk for inspecting TASK planned and observed throughput during PERIOD; A-04 binds owner.id.
firms-functions-workers: diagram default; frames exactly ordered [{frame:firms|functions|workers,identity,quantity}], distinct identities and each frame's own unit/population/denominator. Only observed/pending/negative/conditional/unknown adoption; configured is not observed. No cross-frame summation or universal adoption. Hybrid requires modelSource:[{asset:A-03,identityId:owner.id,source}] binding a complete setup/action clause: OWNER illustrates a branch pod for inspecting FIRM_LABEL population in firms per FIRM_DEN firms and FUNCTION_LABEL population in functions per FUNCTION_DEN functions and WORKER_LABEL population in workers per WORKER_DEN workers during PERIOD. Null denominators use per unknown FRAME denominator. The branch is illustrative, not evidence of adoption.
original-and-surviving-cohorts: original,surviving,attrition:{identity,quantity},accounting:Fact. Observed source-stated accounting retains original=surviving+attrition with no entrants and original denominator. Unknown/conditional accounting is not an observed partition. Native: OWNER illustrates/is an operating desk for inspecting ORIGINAL and SURVIVING cohorts with ATTRITION attrition during PERIOD; A-04 binds owner.id.`,
  limits: LIMITS,
  triggers: [
    /\b(?:planned and observed|configured throughput|plan variance|adoption denominators|survivorship|original cohort|surviving cohort)\b/i,
    /\bfirms\b.{0,120}\bfunctions\b.{0,120}\bworkers\b/i,
    /\badopter count for\b.{0,50}\bframe\b/i,
  ],
  avoid:
    'Not a live digital twin, universal adoption, cross-population comparison, inferred selection effects or fabricated performance.',
} satisfies Metadata;
export const MEASUREMENT_FRAME_SPEC = {
  ...measurementMetadata,
  kind: 'measurement-frame',
  parse: parseMeasurementFrameScene,
  cues: measurementFrameCues,
} as const;
const albumMetadata = {
  family: 'compare',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'An album of 2–4 supplied unresolved versioned alternatives. Qualitative alternatives have equal area/time/frequency; distribution only exact source-supported exhaustive bounded probabilities, never a winner.',
  schema: `${examples('uncertainty-album')}\n${COMMON}\nalternatives-or-source-distribution: setMode:qualitative|distribution,alternatives:[{entry:VersionedIdentity,fact:Fact,probability:null|{numerator,denominator,source}}],distribution:null|Fact.
Alternative clause: OWNER keeps ENTRY version VERSION unresolved/pending during PERIOD, or has not chosen ENTRY version VERSION, or OWNER status of ENTRY version VERSION is unknown during PERIOD; conditional CONDITION, OWNER may consider ENTRY version VERSION during PERIOD never means chosen.
Probability clause: OWNER assigns ENTRY version VERSION probability NUMERATOR of DENOMINATOR during PERIOD. All share exact bounded denominator and sum to one; explicit exhaustive mutually exclusive declaration required.
Native: OWNER illustrates/is a branch pod for inspecting alternatives ENTRY version VERSION and ENTRY version VERSION during PERIOD; A-03 binds owner.id.`,
  limits: LIMITS,
  triggers: [
    /\b(?:unresolved alternatives|outcome album|source distribution|mutually exclusive alternatives|alternative scenarios)\b/i,
    /\balternatives\b.{0,80}\b(?:unresolved|probability)\b/i,
  ],
  avoid:
    'Not invented futures, a winner, forecast advice, interpolation, random sampling or an unsupported distribution.',
} satisfies Metadata;
export const UNCERTAINTY_ALBUM_SPEC = {
  ...albumMetadata,
  kind: 'uncertainty-album',
  parse: parseUncertaintyAlbumScene,
  cues: uncertaintyAlbumCues,
} as const;
