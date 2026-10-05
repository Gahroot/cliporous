import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { ProjectionMatrixDiagram } from './projection-matrix-Diagram';
import { ProjectionMatrixModels } from './projection-matrix-models';
import { projectionMatrixPose } from './projection-matrix-poses';
import type { ExpansionProjectionMatrixScene } from './projection-matrix-types';

export function ProjectionMatrixView({
  scene,
}: {
  scene: ExpansionProjectionMatrixScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = projectionMatrixPose(scene, t);
  const diagram = <ProjectionMatrixDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        diagram={null}
        model={
          <ProjectionMatrixModels
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
