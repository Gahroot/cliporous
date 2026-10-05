import { AUTHORITY_RAW_FIXTURES } from '../../remotion/compositions/explainer/business/authority/fixtures';
import type {
  AuthorityBusinessScene,
  AuthorityHandoff,
  ConstraintCheck,
  DelegationScope,
} from '../../remotion/compositions/explainer/business/authority/types';
import { DIAGRAM_LAYOUTS } from '../../remotion/compositions/explainer/diagrams/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  parseAuthorityHandoff,
  parseConstraintCheck,
  parseDelegationScope,
} from './business-authority-contract';
import type { KindSpec, ParseContext, Rec } from './kind-spec';

/** Concrete local specs until Step 13 expands the root SceneBody/KindSpec kind union. */
export type AuthorityLocalSpec<S extends AuthorityBusinessScene> = Pick<
  KindSpec,
  'describe' | 'schema' | 'limits' | 'durationSec' | 'layouts' | 'family' | 'triggers'
> & {
  kind: S['kind'];
  parse: (raw: Rec, ctx: ParseContext) => S | null;
  cues: (scene: S) => SceneCue[];
};
function schema(kind: AuthorityBusinessScene['kind']): string {
  return JSON.stringify({
    examples: AUTHORITY_RAW_FIXTURES.filter((fixture) => fixture.raw.kind === kind).map(
      (fixture) => fixture.raw,
    ),
  });
}

export const delegationScopeSpec: AuthorityLocalSpec<DelegationScope> = {
  kind: 'delegation-scope',
  family: 'process',
  layouts: DIAGRAM_LAYOUTS,
  limits:
    '≤8 identities / 12 semantic edges / 4 holds; labels ≤28 chars; ≥1.5s per detail page after full visibility',
  durationSec: [5, 12],
  triggers: [/\b(?:permission|delegat\w*|scope|authority|action limit)\b/iu],
  describe:
    'Declared permissions or action-limits: independently source capability and permitted/denied/pending/unknown permission for each named actor/action. Quote scope, explicit conditions, dates and exact stated quantity bases. Unknown is not zero. No approval or execution inferred from ability, conditions or elapsed time. Five source-word beats and >=1.5s for each fixed-font detail page; split complex source rather than inventing, shrinking or flashing claims.',
  schema: schema('delegation-scope'),
  parse: parseDelegationScope,
  cues: (scene) => [{ kind: 'tick', at: scene.actionAt, gain: 0.18 }],
};
export const authorityHandoffSpec: AuthorityLocalSpec<AuthorityHandoff> = {
  kind: 'authority-handoff',
  family: 'process',
  layouts: DIAGRAM_LAYOUTS,
  limits:
    '≤8 identities / 12 semantic edges / 4 holds; labels ≤28 chars; ≥1.5s per detail page after full visibility',
  durationSec: [5, 12],
  triggers: [
    /\b(?:exception|audit|accountable|handoff|transfer|(?:ir)?reversib\w*)\b/iu,
    /\b(?:declares?|records?)\b.{0,100}\b(?:revision|record|audit)\b/iu,
  ],
  describe:
    'Use exception-review, declared-audit-chain, action-consequences or accountable-transfer with local actor/action/target evidence. Performer, explicit approver and accountable owner are independently stated roles; reviews alone do not confer approval. Review/audit are declared illustrations, never actual monitoring. Retain pending/denied/unknown, quote reversibility without legal interpretation, never duplicate a source cost. Source acceptance is not observed execution. Five source-word beats; every detail page needs >=1.5s before resolveAt.',
  schema: schema('authority-handoff'),
  parse: parseAuthorityHandoff,
  cues: (scene) => [
    { kind: 'flip', at: scene.actionAt, gain: 0.16 },
    { kind: 'tick', at: scene.checkAt, gain: 0.12 },
  ],
};
export const constraintCheckSpec: AuthorityLocalSpec<ConstraintCheck> = {
  kind: 'constraint-check',
  family: 'process',
  layouts: DIAGRAM_LAYOUTS,
  limits:
    '≤8 identities / 12 semantic edges / 4 holds; labels ≤28 chars; ≥1.5s per detail page after full visibility',
  durationSec: [5, 12],
  triggers: [
    /\b(?:conflict|incompatib\w*|constraint|dated condition|expiry|deadline)\b/iu,
    /\b(?:approval|delivery|receipt|archive|commitment)\b.{0,24}\bdate\b/iu,
  ],
  describe:
    'Use conflicting-limits (diagram only) or dated-conditions. Two source requirements remain incompatibly unresolved: no inferred winner, conversion, threshold or automatic reconciliation. Compare known amounts only on compatible stated bases. Quote dated policy identity/revision and each literal date or unknown; source dates are not animation beat clocks. Conditions remain source-stated satisfied/blocked/pending/unknown, never fulfil themselves with time. Five source-word beats and >=1.5s per readable detail page.',
  schema: schema('constraint-check'),
  parse: parseConstraintCheck,
  cues: (scene) => [{ kind: 'tick', at: scene.checkAt, gain: 0.16 }],
};
