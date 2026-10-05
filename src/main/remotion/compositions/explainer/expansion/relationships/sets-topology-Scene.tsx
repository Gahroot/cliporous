import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { SetsTopologyDiagram } from './sets-topology-Diagram';
import { SETS_TOPOLOGY_CAMERA, SetsTopologyModels } from './sets-topology-models';
import { setsTopologyPose } from './sets-topology-poses';
import type { ExpansionSetsTopologyScene } from './sets-topology-types';

export function SetsTopologyView({ scene }: { scene: ExpansionSetsTopologyScene }): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = setsTopologyPose(scene, t);
  const diagram = <SetsTopologyDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        diagram={null}
        camera={SETS_TOPOLOGY_CAMERA}
        model={
          <SetsTopologyModels
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
