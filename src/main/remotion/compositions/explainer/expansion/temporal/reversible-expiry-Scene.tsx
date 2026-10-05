import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { ReversibleExpiryDiagram } from './reversible-expiry-Diagram';
import { REVERSIBLE_EXPIRY_CAMERA, ReversibleExpiryModels } from './reversible-expiry-models';
import { reversibleExpiryPose } from './reversible-expiry-poses';
import type { ExpansionReversibleExpiryScene } from './reversible-expiry-types';

export function ReversibleExpiryView({
  scene,
}: {
  scene: ExpansionReversibleExpiryScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = reversibleExpiryPose(scene, t);
  const diagram = <ReversibleExpiryDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        camera={REVERSIBLE_EXPIRY_CAMERA}
        model={
          <ReversibleExpiryModels
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
