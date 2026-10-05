import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { ApprovalDependencyDiagram } from './approval-dependency-Diagram';
import { ApprovalDependencyModels } from './approval-dependency-models';
import type { ExpansionApprovalDependencyScene } from './approval-dependency-types';

/** Parent owns dispatch. All source facts remain on the same persistent planar surface. */
export function ApprovalDependencyView({
  scene,
}: {
  scene: ExpansionApprovalDependencyScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const diagram = <ApprovalDependencyDiagram scene={scene} t={t} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        handoffBeat="response"
        model={
          <ApprovalDependencyModels
            scene={scene}
            t={t}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
        diagram={null}
      />
      <DiagramSurface>{diagram}</DiagramSurface>
    </>
  );
}
