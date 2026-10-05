import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { VectorFactorizationDiagram } from './vector-factorization-Diagram';
import { VectorFactorizationModels } from './vector-factorization-models';
import { vectorFactorizationPose } from './vector-factorization-poses';
import type { ExpansionVectorFactorizationScene } from './vector-factorization-types';

export function VectorFactorizationView({
  scene,
}: {
  scene: ExpansionVectorFactorizationScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = vectorFactorizationPose(scene, t);
  const diagram = <VectorFactorizationDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        handoffBeat="action"
        diagram={null}
        model={
          <VectorFactorizationModels
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
