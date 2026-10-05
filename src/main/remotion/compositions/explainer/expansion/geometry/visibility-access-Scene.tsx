import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { VisibilityAccessDiagram } from './visibility-access-Diagram';
import { VisibilityAccessModels } from './visibility-access-models';
import { visibilityAccessPose } from './visibility-access-poses';
import type { ExpansionVisibilityAccessScene } from './visibility-access-types';

export function VisibilityAccessView({
  scene,
}: {
  scene: ExpansionVisibilityAccessScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = visibilityAccessPose(scene, t);
  const diagram = <VisibilityAccessDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        diagram={null}
        model={
          <VisibilityAccessModels
            scene={scene}
            pose={pose}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
      />
      <DiagramSurface>{diagram}</DiagramSurface>
    </>
  );
}
