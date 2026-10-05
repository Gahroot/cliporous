import type { ExpansionReasoningScene } from '../../remotion/compositions/explainer/expansion/reasoning/types';
import {
  parseArgumentMapReasonsObjections,
  parseConditionalComparisonAssumptionToggle,
} from './expansion-reasoning-argument-contract';
import {
  parseExpansionConfounder,
  parseExpansionMissingEvidenceMap,
} from './expansion-reasoning-information-contract';
import {
  parseExpansionSameFacts,
  parseExpansionScopedStatements,
} from './expansion-reasoning-scope-contract';
import {
  parseClaimSourceBoard,
  parseEvidenceToClaimTrace,
} from './expansion-reasoning-trace-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** Explicit local routing; never falls back to a generic legacy scene on a malformed preset. */
export function parseExpansionReasoning(
  raw: Rec,
  ctx: ParseContext,
): ExpansionReasoningScene | null {
  const route = `${typeof raw.kind === 'string' ? raw.kind : ''}/${typeof raw.preset === 'string' ? raw.preset : ''}`;
  switch (route) {
    case 'retrieval-grounding/trace-chain':
      return parseEvidenceToClaimTrace(raw, ctx);
    case 'evidence-conflict/claim-source-board':
      return parseClaimSourceBoard(raw, ctx);
    case 'argument-map/reasons-objections':
      return parseArgumentMapReasonsObjections(raw, ctx);
    case 'conditional-comparison/assumption-toggle':
      return parseConditionalComparisonAssumptionToggle(raw, ctx);
    case 'relationship-analysis/confounder':
      return parseExpansionConfounder(raw, ctx);
    case 'retrieval-grounding/missing-evidence-map':
      return parseExpansionMissingEvidenceMap(raw, ctx);
    case 'evidence-conflict/scoped-statements':
      return parseExpansionScopedStatements(raw, ctx);
    case 'framing-comparison/same-facts':
      return parseExpansionSameFacts(raw, ctx);
    default:
      return mechanismIssue(ctx, 'unsupported reasoning kind/preset; no generic fallback');
  }
}
