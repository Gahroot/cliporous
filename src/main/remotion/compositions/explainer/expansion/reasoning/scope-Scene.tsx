import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { ScopeDiagram } from './scope-Diagram';
import { SCOPE_CAMERA, ScopeModels } from './scope-models';
import { scopePose } from './scope-poses';
import type { ExpansionReasoningScopeScene } from './scope-types';

export function ReasoningScopeView({
  scene,
}: {
  scene: ExpansionReasoningScopeScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = scopePose(scene, t);
  const diagram = <ScopeDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        camera={SCOPE_CAMERA}
        model={
          <ScopeModels
            scene={scene}
            pose={pose}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
        diagram={null}
      />
      <DiagramSurface>{diagram}</DiagramSurface>
    </>
  );
}
