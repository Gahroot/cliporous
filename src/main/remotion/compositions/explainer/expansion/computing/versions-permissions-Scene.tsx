import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { VersionsPermissionsDiagram } from './versions-permissions-Diagram';
import {
  VERSIONS_PERMISSIONS_CAMERA,
  VersionsPermissionsModels,
} from './versions-permissions-models';
import { versionsPermissionsPose } from './versions-permissions-poses';
import type { ExpansionVersionsPermissionsScene } from './versions-permissions-types';

export function VersionsPermissionsView({
  scene,
}: {
  scene: ExpansionVersionsPermissionsScene;
}): ReactElement {
  const { t } = useSceneTime(),
    S = useStage(),
    pose = versionsPermissionsPose(scene, t);
  const persistentDiagramSurface = (
    <DiagramSurface>
      <VersionsPermissionsDiagram scene={scene} pose={pose} />
    </DiagramSurface>
  );
  if (scene.visualMode === 'diagram')
    return (
      <DiagramStage scene={scene}>
        <VersionsPermissionsDiagram scene={scene} pose={pose} />
      </DiagramStage>
    );
  return (
    <>
      <HybridStage
        scene={scene}
        camera={VERSIONS_PERMISSIONS_CAMERA}
        diagram={null}
        model={
          <VersionsPermissionsModels
            scene={scene}
            pose={pose}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
      />
      {persistentDiagramSurface}
    </>
  );
}
