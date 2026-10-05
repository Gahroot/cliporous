import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { RiskCalibrationDiagram } from './risk-calibration-Diagram';
import { RISK_CALIBRATION_CAMERA, RiskCalibrationModels } from './risk-calibration-models';
import { riskCalibrationPose } from './risk-calibration-poses';
import type { ExpansionRiskCalibrationScene } from './risk-calibration-types';

export function RiskCalibrationView({
  scene,
}: {
  scene: ExpansionRiskCalibrationScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = riskCalibrationPose(scene, t);
  const diagram = <RiskCalibrationDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        camera={RISK_CALIBRATION_CAMERA}
        model={
          <RiskCalibrationModels
            scene={scene}
            pose={pose}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
        diagram={null}
      />
      <DiagramSurface>{diagram}</DiagramSurface>
    </>
  );
}
