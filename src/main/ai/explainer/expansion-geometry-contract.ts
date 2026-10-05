import type { ExpansionGeometryScene } from '../../remotion/compositions/explainer/expansion/geometry/types';
import {
  parseExpansionLinkedScale,
  parseExpansionPackingClearance,
} from './expansion-geometry-fit-scale-contract';
import {
  parseExpansionDimensionalScaling,
  parseExpansionRegionOverlap,
} from './expansion-geometry-regions-dimensions-contract';
import {
  parseExpansionSectionScan,
  parseExpansionSolidUnfold,
} from './expansion-geometry-section-unfold-contract';
import {
  parseExpansionReachability,
  parseExpansionViewpointOcclusion,
} from './expansion-geometry-visibility-access-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** Local, explicit routes; no legacy spatial/projection fallback or runtime registration. */
export function parseExpansionGeometry(raw: Rec, ctx: ParseContext): ExpansionGeometryScene | null {
  if (raw.kind === 'section-view' && raw.preset === 'scan') {
    return parseExpansionSectionScan(raw, ctx);
  } else if (raw.kind === 'geometry-projection') {
    if (raw.preset === 'unfold') return parseExpansionSolidUnfold(raw, ctx);
    if (raw.preset === 'dimensional-scaling') return parseExpansionDimensionalScaling(raw, ctx);
  } else if (raw.kind === 'floorplan-fit' && raw.preset === 'packing-clearance') {
    return parseExpansionPackingClearance(raw, ctx);
  } else if (raw.kind === 'scale-hierarchy' && raw.preset === 'linked-scale') {
    return parseExpansionLinkedScale(raw, ctx);
  } else if (raw.kind === 'robot-perception' && raw.preset === 'viewpoint-occlusion') {
    return parseExpansionViewpointOcclusion(raw, ctx);
  } else if (raw.kind === 'property-access' && raw.preset === 'reachability') {
    return parseExpansionReachability(raw, ctx);
  } else if (raw.kind === 'region-relation' && raw.preset === 'overlap') {
    return parseExpansionRegionOverlap(raw, ctx);
  }
  return mechanismIssue(ctx, 'geometry requires an explicit supported kind/preset route');
}
