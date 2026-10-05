import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { ResourceDiffusionDiagram } from './resource-diffusion-Diagram';
import { RESOURCE_DIFFUSION_CAMERA, ResourceDiffusionModels } from './resource-diffusion-models';
import { resourceDiffusionChrome, resourceDiffusionPose } from './resource-diffusion-poses';
import type { ExpansionResourceDiffusionScene } from './resource-diffusion-types';

export function ResourceDiffusionView({
  scene,
}: {
  scene: ExpansionResourceDiffusionScene;
}): ReactElement {
  const { t } = useSceneTime(),
    S = useStage(),
    pose = resourceDiffusionPose(scene, t);
  const chrome = resourceDiffusionChrome(scene, pose);
  const diagram = <ResourceDiffusionDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={chrome}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={chrome}
        camera={RESOURCE_DIFFUSION_CAMERA}
        diagram={null}
        model={
          <ResourceDiffusionModels
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
