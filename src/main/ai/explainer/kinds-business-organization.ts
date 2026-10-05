import { ORGANIZATION_SOURCE_FIXTURES } from '../../remotion/compositions/explainer/business/organization/fixtures';
import type {
  OrganizationMapScene,
  SystemReconciliationScene,
} from '../../remotion/compositions/explainer/business/organization/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  parseOrganizationMapScene,
  parseSystemReconciliationScene,
} from './business-organization-contract';
import type { KindSpec } from './kind-spec';

export {
  parseOrganizationMapScene,
  parseSystemReconciliationScene,
} from './business-organization-contract';

type OrganizationMetadata = Pick<
  KindSpec,
  'describe' | 'schema' | 'limits' | 'layouts' | 'durationSec' | 'family' | 'triggers' | 'avoid'
>;
export type OrganizationMapSpec = OrganizationMetadata & {
  kind: 'organization-map';
  parse: typeof parseOrganizationMapScene;
  cues: typeof organizationMapCues;
};
export type SystemReconciliationSpec = OrganizationMetadata & {
  kind: 'system-reconciliation';
  parse: typeof parseSystemReconciliationScene;
  cues: typeof systemReconciliationCues;
};
function examples(kind: 'organization-map' | 'system-reconciliation'): string {
  return ORGANIZATION_SOURCE_FIXTURES.filter((fixture) => fixture.raw.kind === kind)
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
const LIMITS =
  'Five ordered source-word beats setupWord/actionWord/responseWord/checkWord/resolveWord, complete local clause spans source.fromWord/toWord, 5–12s full window, >=0.8s final hold. <=8 distinct semantic entities/12 relationships/4 unresolved holds. Fixed 24px natural fact pages: every page >=1.5s settled at full opacity before resolve; reject insufficient windows, never drop, clip or shrink facts. Strict fields, stable IDs, bounded arrays/JSON bytes/depth. Each role/action/state/relationship/condition/value needs its own local source. Preserve negative/pending/conditional/unknown states and contradictions; time grants nothing. No generic graph, geometry/assets/styles, URLs, monitoring/telemetry, inferred adoption/payment/merge, invented workers or quantities. Diagram/hybrid share complete meaning; OP31 diagram only.';
/** Neutral authored beat cues, never grant, payment, success or merge confirmation. */
export function organizationMapCues(scene: OrganizationMapScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'slide', at: scene.actionAt, gain: 0.22 },
    { kind: 'tick', at: scene.responseAt, gain: 0.18 },
    { kind: 'tick', at: scene.checkAt, gain: 0.16 },
    { kind: 'tick', at: scene.resolveAt, gain: 0.14 },
  ];
}
export function systemReconciliationCues(scene: SystemReconciliationScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'slide', at: scene.actionAt, gain: 0.22 },
    { kind: 'tick', at: scene.responseAt, gain: 0.18 },
    { kind: 'tick', at: scene.checkAt, gain: 0.16 },
    { kind: 'tick', at: scene.resolveAt, gain: 0.14 },
  ];
}
export const ORGANIZATION_MAP_SPEC: OrganizationMapSpec = {
  kind: 'organization-map',
  family: 'framework',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Concrete federated local/shared responsibilities, explicit decision permissions, dated configured/pending/paused/rolled-back rollout, declared legacy interfaces, exact stated cost allocation, or independent tool declarations and named unit/worker use. Capability is not permission; rollout is not adoption; use is not approval.',
  schema: examples('organization-map'),
  limits: `${LIMITS} OP25 organization/units/tasks/responsibilities bind local/shared scope and peer IDs. OP26 units carry local/central roles, rights bind decision identity/unit/scope/sharedWithId/permission/source and optional sourced escalation; only explicitly permitted, never mere can/able/observed decisions. OP27 rollout identity+version and <=4 unit snapshots each with its own date/state/source; paused and rolled-back stay distinct. OP28 legacy/replacement/interface identities and declared/unsupported/unresolved/negative/conditional/unknown boundary; no inferred connection. OP30 payer/service/units plus exact minor-unit total/allocations/remainder; all numeric bases require subjectId/population/unit/period/denominator and allocation components, same currency/basis, conserved safe-integer sums and explicit remainder or unknown, no inferred costs/payment; reject competing source numbers. OP31 units/workers/tools/uses: declaration allowed/unapproved/denied/conditional/unknown and independent configured/observed/negative/conditional/unknown named actor use with declared/informal context; no monitoring or inference between them.`,
  triggers: [
    /\b(?:federated (?:units|pods)|local responsibilit(?:y|ies)|shared responsibilit(?:y|ies))\b/i,
    /\b(?:decision rights|permission to decide|permitted to decide|escalation route)\b/i,
    /\b(?:rollout rings|configured rollout|paused rollout|rolled back rollout)\b/i,
    /\brollout\b.{0,100}\bpending\b/i,
    /\b(?:legacy system|replacement system|legacy boundaries)\b/i,
    /\b(?:stated chargeback|chargeback total|chargeback remainder)\b/i,
    /\bdeclares\b.{0,60}\b(?:allowed|unapproved|denied)\b/i,
    /\b(?:informal use of|configured declared use)\b/i,
  ],
  avoid:
    'Not generic networking/graphs, capability or observed decisions promoted to authority, worker adoption inferred from configured rollout, paused/rolled-back collapsed into negative, cloud/provider monitoring, approval inferred from use, unapproved inferred to mean use, unstated costs or payment.',
  parse: parseOrganizationMapScene,
  cues: organizationMapCues,
};
export const SYSTEM_RECONCILIATION_SPEC: SystemReconciliationSpec = {
  kind: 'system-reconciliation',
  family: 'process',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Compare distinct literal source IDs in named versioned systems with a separately named responsible reconciliation owner. Explicit matched/unresolved/negative/conditional/unknown collision evidence never completes a merge or replaces the original IDs.',
  schema: examples('system-reconciliation'),
  limits: `${LIMITS} OP29 organization/owner/systems/records/collisions. Owner identity requires its own exact responsible-for-reconciliation clause; a system/organization is not an inferred human operator. Each record binds its literal sourceId and sourceSystemId/version locally. Collisions bind both complete source identities and state; preserve both IDs even for a stated match. No mergedIdentity, automatic merging, cleared conflict, fake operator or completed filing.`,
  triggers: [
    /\b(?:responsible for reconciliation|identity conflict|source identity collision|merger reconciliation)\b/i,
    /\bsource ID\b.{0,100}\bversion\b/i,
    /\bsource records?\b.{0,80}\b(?:match|conflict|reconcil)\w*\b/i,
  ],
  avoid:
    'Not a completed database merge, generic software migration, inferred operator, source IDs fabricated from labels, or conflicting identities cleared by animation.',
  parse: parseSystemReconciliationScene,
  cues: systemReconciliationCues,
};
