import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime } from '../../stage';
import { ExploreEvidenceDiagram } from './explore-evidence-Diagram';
import { ExploreEvidenceModels } from './explore-evidence-models';
import { exploreEvidencePose } from './explore-evidence-poses';
import type { ExpansionExploreEvidenceScene } from './explore-evidence-types';

export function ExploreEvidenceView({
  scene,
}: {
  scene: ExpansionExploreEvidenceScene;
}): ReactElement {
  const { t } = useSceneTime(),
    pose = exploreEvidencePose(scene, t);
  const diagram = <ExploreEvidenceDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        model={<ExploreEvidenceModels scene={scene} pose={pose} />}
        diagram={null}
      />
      <DiagramSurface>{diagram}</DiagramSurface>
    </>
  );
}
