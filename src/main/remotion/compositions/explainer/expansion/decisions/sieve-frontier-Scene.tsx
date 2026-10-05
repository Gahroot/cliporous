import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { SieveFrontierDiagram } from './sieve-frontier-Diagram';
import { SIEVE_FRONTIER_CAMERA, SieveFrontierModels } from './sieve-frontier-models';
import { sieveFrontierPose } from './sieve-frontier-poses';
import type { ExpansionSieveFrontierScene } from './sieve-frontier-types';

export function SieveFrontierView({ scene }: { scene: ExpansionSieveFrontierScene }): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = sieveFrontierPose(scene, t);
  const diagram = <SieveFrontierDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        diagram={null}
        camera={SIEVE_FRONTIER_CAMERA}
        model={
          <SieveFrontierModels
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
