import type React from 'react';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime } from '../../stage';
import { OrganizationDiagramParts, OrganizationModelParts } from './parts';
import { sampleOrganizationScene } from './poses';
import type { OrganizationScene } from './types';

export { OrganizationDiagramParts, OrganizationModelParts } from './parts';

/** The existing hybrid wrapper owns the sole studio; diagram-only OP31 mounts no model. */
export function OrganizationSceneView({ scene }: { scene: OrganizationScene }): React.ReactElement {
  const { t } = useSceneTime();
  const pose = sampleOrganizationScene(scene, t);
  return (
    <HybridStage
      scene={scene}
      settledOutcome
      model={
        scene.visualMode === 'hybrid' ? <OrganizationModelParts scene={scene} pose={pose} /> : null
      }
      diagram={<OrganizationDiagramParts scene={scene} pose={pose} />}
    />
  );
}
