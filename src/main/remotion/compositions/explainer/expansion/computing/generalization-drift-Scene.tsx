import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { GeneralizationDriftDiagram } from './generalization-drift-Diagram';
import {
  GENERALIZATION_DRIFT_CAMERA,
  GeneralizationDriftModels,
} from './generalization-drift-models';
import { generalizationDriftPose } from './generalization-drift-poses';
import type { ExpansionGeneralizationDriftScene } from './generalization-drift-types';

export function GeneralizationDriftView({
  scene,
}: {
  scene: ExpansionGeneralizationDriftScene;
}): ReactElement {
  const { t } = useSceneTime(),
    S = useStage(),
    pose = generalizationDriftPose(scene, t);
  const persistentDiagramSurface = (
    <DiagramSurface>
      <GeneralizationDriftDiagram scene={scene} pose={pose} />
    </DiagramSurface>
  );
  if (scene.visualMode === 'diagram')
    return (
      <DiagramStage scene={scene}>
        <GeneralizationDriftDiagram scene={scene} pose={pose} />
      </DiagramStage>
    );
  return (
    <>
      <HybridStage
        scene={scene}
        camera={GENERALIZATION_DRIFT_CAMERA}
        diagram={null}
        model={
          <GeneralizationDriftModels
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
