import type { ExpansionDecisionsScene } from '../../remotion/compositions/explainer/expansion/decisions/types';
import {
  parseExpansionExploreExploit,
  parseExpansionSequentialEvidence,
} from './expansion-decisions-explore-evidence-contract';
import {
  parseExpansionDecisionTree,
  parseExpansionWeightedCriteria,
} from './expansion-decisions-priority-tree-contract';
import {
  parseExpansionFrontierRoute,
  parseExpansionLocalGlobal,
} from './expansion-decisions-search-landscape-contract';
import {
  parseExpansionPareto,
  parseExpansionSieve,
} from './expansion-decisions-sieve-frontier-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** Explicit local routes only. No legacy or generic statement fallback. */
export function parseExpansionDecisions(
  raw: Rec,
  ctx: ParseContext,
): ExpansionDecisionsScene | null {
  const route = `${typeof raw.kind === 'string' ? raw.kind : ''}/${typeof raw.preset === 'string' ? raw.preset : ''}`;
  switch (route) {
    case 'constraint-choice/sieve':
      return parseExpansionSieve(raw, ctx);
    case 'tradeoff-frontier/pareto':
      return parseExpansionPareto(raw, ctx);
    case 'constraint-choice/weighted-criteria':
      return parseExpansionWeightedCriteria(raw, ctx);
    case 'conditional-choice/decision-tree':
      return parseExpansionDecisionTree(raw, ctx);
    case 'spatial-search/frontier-route':
      return parseExpansionFrontierRoute(raw, ctx);
    case 'optimization-landscape/local-global':
      return parseExpansionLocalGlobal(raw, ctx);
    case 'adaptive-choice/explore-exploit':
      return parseExpansionExploreExploit(raw, ctx);
    case 'conditional-choice/sequential-evidence':
      return parseExpansionSequentialEvidence(raw, ctx);
    default:
      return mechanismIssue(ctx, 'unsupported decisions kind/preset; no generic fallback');
  }
}
