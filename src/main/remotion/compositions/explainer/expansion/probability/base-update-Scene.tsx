import type { ReactElement } from 'react';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { BaseUpdateDiagram, BaseUpdateFacts } from './base-update-Diagram';
import { BASE_UPDATE_CAMERA, BaseUpdateModel } from './base-update-models';
import { baseUpdatePose } from './base-update-poses';
import type { ProbabilityBaseUpdateScene } from './base-update-types';

export function ProbabilityBaseUpdateView({
  scene,
}: {
  scene: ProbabilityBaseUpdateScene;
}): ReactElement {
  const { t } = useSceneTime();
  const stage = useStage();
  const props = {
    scene,
    t,
    pose: baseUpdatePose(t, scene),
    colors: {
      surface: stage.card,
      text: stage.text,
      accent: stage.accent,
      muted: stage.muted,
    },
  };
  return (
    <>
      <HybridStage
        scene={scene}
        camera={BASE_UPDATE_CAMERA}
        model={<BaseUpdateModel {...props} />}
        diagram={<BaseUpdateDiagram {...props} />}
      />
      <DiagramSurface>
        <BaseUpdateFacts {...props} />
      </DiagramSurface>
    </>
  );
}
