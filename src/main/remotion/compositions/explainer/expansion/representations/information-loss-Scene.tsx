import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { InformationLossDiagram } from './information-loss-Diagram';
import { INFORMATION_LOSS_CAMERA, InformationLossModels } from './information-loss-models';
import { informationLossPose } from './information-loss-poses';
import type { ExpansionInformationLossScene } from './information-loss-types';

export function InformationLossView({
  scene,
}: {
  scene: ExpansionInformationLossScene;
}): ReactElement {
  const { t } = useSceneTime(),
    S = useStage(),
    pose = informationLossPose(scene, t);
  const persistentDiagramSurface = (
    <DiagramSurface>
      <InformationLossDiagram scene={scene} pose={pose} />
    </DiagramSurface>
  );
  if (scene.visualMode === 'diagram')
    return (
      <DiagramStage scene={scene}>
        <InformationLossDiagram scene={scene} pose={pose} />
      </DiagramStage>
    );
  return (
    <>
      <HybridStage
        scene={scene}
        camera={INFORMATION_LOSS_CAMERA}
        diagram={null}
        model={
          <InformationLossModels
            scene={scene}
            pose={pose}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
      />
      {persistentDiagramSurface}
    </>
  );
}
