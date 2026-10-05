import type React from 'react';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime } from '../../stage';
import { InfrastructureDiagramParts, InfrastructureModelParts } from './parts';
import type { InfrastructureScene } from './types';

export { InfrastructureDiagramParts, InfrastructureModelParts } from './parts';
export function InfrastructureSceneView({
  scene,
}: {
  scene: InfrastructureScene;
}): React.ReactElement {
  const { t } = useSceneTime();
  return (
    <HybridStage
      scene={scene}
      settledOutcome
      diagram={<InfrastructureDiagramParts scene={scene} seconds={t} />}
      model={
        scene.visualMode === 'hybrid' &&
        scene.modelSource !== null &&
        scene.preset !== 'evaluation-periods' ? (
          <InfrastructureModelParts scene={scene} seconds={t} />
        ) : null
      }
    />
  );
}
