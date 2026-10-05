import type { ExpansionProbabilityScene } from '../../remotion/compositions/explainer/expansion/probability/types';
import {
  parseExpansionBaseRate,
  parseExpansionBayesUpdate,
} from './expansion-probability-base-update-contract';
import {
  parseExpansionConditioning,
  parseExpansionSelectionBias,
} from './expansion-probability-conditioning-sampling-contract';
import {
  parseExpansionCalibration,
  parseExpansionRiskMatrix,
} from './expansion-probability-risk-calibration-contract';
import {
  parseExpansionQualifiedInterval,
  parseExpansionRepeatedSamples,
} from './expansion-probability-variation-range-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** Explicit local routes, never a fallback to generic quadrant/population stories. */
export function parseExpansionProbability(
  raw: Rec,
  ctx: ParseContext,
): ExpansionProbabilityScene | null {
  const route = `${typeof raw.kind === 'string' ? raw.kind : ''}/${typeof raw.preset === 'string' ? raw.preset : ''}`;
  switch (route) {
    case 'probability-workbench/base-rate':
      return parseExpansionBaseRate(raw, ctx);
    case 'probability-workbench/bayes-update':
      return parseExpansionBayesUpdate(raw, ctx);
    case 'probability-workbench/conditioning':
      return parseExpansionConditioning(raw, ctx);
    case 'sampling-frame/selection-bias':
      return parseExpansionSelectionBias(raw, ctx);
    case 'probability-workbench/repeated-samples':
      return parseExpansionRepeatedSamples(raw, ctx);
    case 'uncertainty-range/qualified-interval':
      return parseExpansionQualifiedInterval(raw, ctx);
    case 'quadrant/risk-matrix':
      return parseExpansionRiskMatrix(raw, ctx);
    case 'probability-workbench/calibration':
      return parseExpansionCalibration(raw, ctx);
    default:
      return mechanismIssue(ctx, 'unsupported probability kind/preset; no generic fallback');
  }
}
