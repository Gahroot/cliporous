import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { MatrixMatchingDiagram } from './matrix-matching-Diagram';
import { MATRIX_MATCHING_CAMERA, MatrixMatchingModels } from './matrix-matching-models';
import { matrixMatchingPose } from './matrix-matching-poses';
import type { ExpansionMatrixMatchingScene } from './matrix-matching-types';

export function MatrixMatchingView({
  scene,
}: {
  scene: ExpansionMatrixMatchingScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = matrixMatchingPose(scene, t);
  const diagram = <MatrixMatchingDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        diagram={null}
        camera={MATRIX_MATCHING_CAMERA}
        model={
          <MatrixMatchingModels
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
