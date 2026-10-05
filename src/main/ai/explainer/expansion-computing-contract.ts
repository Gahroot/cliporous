import type { ExpansionComputingScene } from '../../remotion/compositions/explainer/expansion/computing/types';
import {
  parseExpansionBatchStream,
  parseExpansionCacheFreshness,
} from './expansion-computing-cache-stream-contract';
import {
  parseExpansionHeldOutGeneralization,
  parseExpansionPopulationDrift,
} from './expansion-computing-generalization-drift-contract';
import {
  parseExpansionIdempotentRetry,
  parseExpansionProductWalkthrough,
} from './expansion-computing-retry-product-contract';
import {
  parseExpansionReplicaMerge,
  parseExpansionSoftwareScope,
} from './expansion-computing-versions-permissions-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** Explicit local computing routes; no legacy technology/cognition/spatial fallback. */
export function parseExpansionComputing(
  raw: Rec,
  ctx: ParseContext,
): ExpansionComputingScene | null {
  if (raw.kind === 'request-routing' && raw.preset === 'cache-freshness')
    return parseExpansionCacheFreshness(raw, ctx);
  if (raw.kind === 'computing-flow' && raw.preset === 'batch-stream')
    return parseExpansionBatchStream(raw, ctx);
  if (raw.kind === 'agent-workflow' && raw.preset === 'idempotent-retry')
    return parseExpansionIdempotentRetry(raw, ctx);
  if (raw.kind === 'product-walkthrough' && raw.preset === 'form-result')
    return parseExpansionProductWalkthrough(raw, ctx);
  if (raw.kind === 'version-state' && raw.preset === 'replica-merge')
    return parseExpansionReplicaMerge(raw, ctx);
  if (raw.kind === 'property-access' && raw.preset === 'software-scope')
    return parseExpansionSoftwareScope(raw, ctx);
  if (raw.kind === 'model-training' && raw.preset === 'held-out-generalization')
    return parseExpansionHeldOutGeneralization(raw, ctx);
  if (raw.kind === 'model-evaluation' && raw.preset === 'population-drift')
    return parseExpansionPopulationDrift(raw, ctx);
  return mechanismIssue(ctx, 'computing requires an explicit supported kind/preset route');
}
