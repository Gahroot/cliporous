import type { ExpansionQuantitiesScene } from '../../remotion/compositions/explainer/expansion/quantities/types';
import {
  parseExpansionDenominator,
  parseExpansionPartition,
} from './expansion-quantities-denominator-partition-contract';
import {
  parseExpansionDeviation,
  parseExpansionSmallMultiples,
} from './expansion-quantities-deviation-multiples-contract';
import {
  parseExpansionHistogram,
  parseExpansionSubgroupReversal,
} from './expansion-quantities-distribution-contract';
import {
  parseExpansionCalendarSeasonality,
  parseExpansionRankChange,
} from './expansion-quantities-ranking-calendar-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** No generic chart, ranking or statement fallback for an expansion route. */
export function parseExpansionQuantities(
  raw: Rec,
  ctx: ParseContext,
): ExpansionQuantitiesScene | null {
  const route = `${typeof raw.kind === 'string' ? raw.kind : ''}/${typeof raw.preset === 'string' ? raw.preset : ''}`;
  switch (route) {
    case 'distribution-view/histogram':
      return parseExpansionHistogram(raw, ctx);
    case 'distribution-view/subgroup-reversal':
      return parseExpansionSubgroupReversal(raw, ctx);
    case 'quantity-comparison/denominator':
      return parseExpansionDenominator(raw, ctx);
    case 'composition-view/partition':
      return parseExpansionPartition(raw, ctx);
    case 'ranking/rank-change':
      return parseExpansionRankChange(raw, ctx);
    case 'temporal-pattern/calendar-seasonality':
      return parseExpansionCalendarSeasonality(raw, ctx);
    case 'quantity-comparison/deviation':
      return parseExpansionDeviation(raw, ctx);
    case 'quantity-comparison/small-multiples':
      return parseExpansionSmallMultiples(raw, ctx);
    default:
      return mechanismIssue(ctx, 'unsupported quantities kind/preset; no generic fallback');
  }
}
