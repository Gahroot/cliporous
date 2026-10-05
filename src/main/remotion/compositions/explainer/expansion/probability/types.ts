import type { ProbabilityBaseUpdateScene } from './base-update-types';
import type { ExpansionConditioningSamplingScene } from './conditioning-sampling-types';
import type { ExpansionRiskCalibrationScene } from './risk-calibration-types';
import type { ExpansionProbabilityVariationRangeScene } from './variation-range-types';

/** Local semantic contracts only; global dispatch waits for both real views and fixtures. */
export type ExpansionProbabilityScene =
  | ProbabilityBaseUpdateScene
  | ExpansionConditioningSamplingScene
  | ExpansionProbabilityVariationRangeScene
  | ExpansionRiskCalibrationScene;
