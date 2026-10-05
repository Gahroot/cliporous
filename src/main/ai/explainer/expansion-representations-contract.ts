import type { ExpansionRepresentationsScene } from '../../remotion/compositions/explainer/expansion/representations/types';
import {
  parseExpansionAggregationLoss,
  parseExpansionCompressionLoss,
} from './expansion-representations-information-loss-contract';
import {
  parseExpansionCoordinateProjection,
  parseExpansionMatrixProduct,
} from './expansion-representations-projection-matrix-contract';
import {
  parseExpansionEquivalence,
  parseExpansionUnitConversion,
} from './expansion-representations-units-equivalence-contract';
import {
  parseExpansionFactorization,
  parseExpansionVectorBasis,
} from './expansion-representations-vector-factorization-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** Explicit local routes; no registration or legacy equation/projection fallback. */
export function parseExpansionRepresentations(
  raw: Rec,
  ctx: ParseContext,
): ExpansionRepresentationsScene | null {
  if (raw.kind === 'representation-transform') {
    if (raw.preset === 'unit-conversion') return parseExpansionUnitConversion(raw, ctx);
    if (raw.preset === 'equivalence') return parseExpansionEquivalence(raw, ctx);
  } else if (raw.kind === 'information-transform') {
    if (raw.preset === 'aggregation-loss') return parseExpansionAggregationLoss(raw, ctx);
    if (raw.preset === 'compression-loss') return parseExpansionCompressionLoss(raw, ctx);
  } else if (raw.kind === 'geometry-projection' && raw.preset === 'coordinates') {
    return parseExpansionCoordinateProjection(raw, ctx);
  } else if (raw.kind === 'linear-algebra') {
    if (raw.preset === 'matrix-product') return parseExpansionMatrixProduct(raw, ctx);
    if (raw.preset === 'vector-basis') return parseExpansionVectorBasis(raw, ctx);
  } else if (raw.kind === 'equation' && raw.preset === 'factorization') {
    return parseExpansionFactorization(raw, ctx);
  }
  return mechanismIssue(ctx, 'representations requires an explicit supported kind/preset route');
}
