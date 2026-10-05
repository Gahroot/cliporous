import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { DistributionDiagram } from './distribution-Diagram';
import { DISTRIBUTION_CAMERA, DistributionModels } from './distribution-models';
import { distributionPose } from './distribution-poses';
import type { ExpansionDistributionScene } from './distribution-types';

export function DistributionView({ scene }: { scene: ExpansionDistributionScene }): ReactElement {
  const { t } = useSceneTime(),
    S = useStage();
  const pose = distributionPose(scene, t);
  const diagram = <DistributionDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        camera={DISTRIBUTION_CAMERA}
        model={
          <DistributionModels
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
