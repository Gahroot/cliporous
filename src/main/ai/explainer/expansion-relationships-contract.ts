import type { ExpansionRelationshipsScene } from '../../remotion/compositions/explainer/expansion/relationships/types';
import {
  parseExpansionApprovalHandoff,
  parseExpansionDependency,
} from './expansion-relationships-approval-dependency-contract';
import {
  parseExpansionCapacityMatch,
  parseExpansionMatrixLinks,
} from './expansion-relationships-matrix-matching-contract';
import {
  parseExpansionSetOperations,
  parseExpansionTopology,
} from './expansion-relationships-sets-topology-contract';
import {
  parseExpansionDualRights,
  parseExpansionTaxonomy,
} from './expansion-relationships-taxonomy-rights-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** Local literal routes only, not runtime registration or a legacy fallback. */
export function parseExpansionRelationships(
  raw: Rec,
  ctx: ParseContext,
): ExpansionRelationshipsScene | null {
  const route = `${typeof raw.kind === 'string' ? raw.kind : ''}/${typeof raw.preset === 'string' ? raw.preset : ''}`;
  switch (route) {
    case 'relation-structure/taxonomy':
      return parseExpansionTaxonomy(raw, ctx);
    case 'ownership-change/dual-rights':
      return parseExpansionDualRights(raw, ctx);
    case 'agent-team/approval-handoff':
      return parseExpansionApprovalHandoff(raw, ctx);
    case 'relation-structure/dependency':
      return parseExpansionDependency(raw, ctx);
    case 'relation-structure/matrix-links':
      return parseExpansionMatrixLinks(raw, ctx);
    case 'semantic-sort/capacity-match':
      return parseExpansionCapacityMatch(raw, ctx);
    case 'venn/set-operations':
      return parseExpansionSetOperations(raw, ctx);
    case 'collective-pattern/topology':
      return parseExpansionTopology(raw, ctx);
    default:
      return mechanismIssue(ctx, 'unsupported relationships kind/preset; no generic fallback');
  }
}
