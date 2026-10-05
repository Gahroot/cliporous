import type { ExpansionTemporalScene } from '../../remotion/compositions/explainer/expansion/temporal/types';
import {
  parseExpansionDelayThroughput,
  parseExpansionPeriodicPhase,
} from './expansion-temporal-delay-phase-contract';
import {
  parseExpansionAlignedStateComparison,
  parseExpansionHysteresis,
} from './expansion-temporal-history-twin-contract';
import {
  parseExpansionCriticalPath,
  parseExpansionParallelLanes,
} from './expansion-temporal-lanes-critical-contract';
import {
  parseExpansionExpiry,
  parseExpansionReversible,
} from './expansion-temporal-reversible-expiry-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** Explicit local routes only, with no legacy digital-twin/synchronization fallback. */
export function parseExpansionTemporal(raw: Rec, ctx: ParseContext): ExpansionTemporalScene | null {
  const route = `${typeof raw.kind === 'string' ? raw.kind : ''}/${typeof raw.preset === 'string' ? raw.preset : ''}`;
  switch (route) {
    case 'temporal-structure/parallel-lanes':
      return parseExpansionParallelLanes(raw, ctx);
    case 'temporal-structure/critical-path':
      return parseExpansionCriticalPath(raw, ctx);
    case 'state-transition/reversible':
      return parseExpansionReversible(raw, ctx);
    case 'temporal-structure/expiry':
      return parseExpansionExpiry(raw, ctx);
    case 'temporal-structure/delay-throughput':
      return parseExpansionDelayThroughput(raw, ctx);
    case 'synchronization/periodic-phase':
      return parseExpansionPeriodicPhase(raw, ctx);
    case 'state-transition/hysteresis':
      return parseExpansionHysteresis(raw, ctx);
    case 'digital-twin/aligned-state-comparison':
      return parseExpansionAlignedStateComparison(raw, ctx);
    default:
      return mechanismIssue(ctx, 'unsupported temporal kind/preset; no generic fallback');
  }
}
