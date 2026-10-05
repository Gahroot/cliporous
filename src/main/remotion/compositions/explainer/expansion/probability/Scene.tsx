import type { ReactElement } from 'react';
import { ProbabilityBaseUpdateView } from './base-update-Scene';
import { ConditioningSamplingView } from './conditioning-sampling-Scene';
import { RiskCalibrationView } from './risk-calibration-Scene';
import type { ExpansionProbabilityScene } from './types';
import { VariationRangeView } from './variation-range-Scene';

/** Local validated pack dispatch. Production registration remains parent-owned in step28. */
export function ProbabilityScene({
  scene,
}: {
  scene: ExpansionProbabilityScene;
}): ReactElement<{ scene: ExpansionProbabilityScene }> {
  switch (scene.storyId) {
    case '09':
    case '10':
      return <ProbabilityBaseUpdateView scene={scene} />;
    case '11':
    case '12':
      return <ConditioningSamplingView scene={scene} />;
    case '13':
    case '14':
      return <VariationRangeView scene={scene} />;
    case '15':
    case '16':
      return <RiskCalibrationView scene={scene} />;
  }
}
