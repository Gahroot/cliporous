import type { ReactElement } from 'react';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime } from '../../stage';
import { InformationDiagram } from './information-Diagram';
import { InformationModelOverlay, InformationModels } from './information-models';
import { informationPose } from './information-poses';
import type { ExpansionReasoningInformationScene } from './information-types';

export function ReasoningInformationView({
  scene,
}: {
  scene: ExpansionReasoningInformationScene;
}): ReactElement {
  const { t } = useSceneTime();
  const pose = informationPose(scene, t);
  return (
    <>
      <HybridStage
        scene={scene}
        handoffBeat="action"
        model={<InformationModels scene={scene} pose={pose} />}
        diagram={<InformationDiagram scene={scene} pose={pose} />}
      />
      <InformationModelOverlay scene={scene} pose={pose} />
    </>
  );
}
