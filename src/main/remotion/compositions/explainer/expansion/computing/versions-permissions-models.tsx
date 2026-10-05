import type {} from '@react-three/fiber';
import type { ReactElement } from 'react';
import { Clay } from '../../hero-kit';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import type { ExpansionKitColors } from '../scene-types';
import type { VersionsPermissionsPose } from './versions-permissions-poses';
import type { ExpansionVersionsPermissionsScene } from './versions-permissions-types';

export const VERSIONS_PERMISSIONS_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function versionsPermissionsModelPlacement(
  column: number,
  wide?: { width: number; height: number },
) {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (114 + column * 236) * meet : 64 + 114 + column * 236;
  const y = wide ? (height - 478 * meet) / 2 + 450 * meet : 262 + 450;
  const units = worldUnitsPerPixel(VERSIONS_PERMISSIONS_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: units * meet,
  };
}
/** Local replica/access endpoint plinths. All evidence remains in the planar lane. */
export function VersionsPermissionsModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionVersionsPermissionsScene;
  pose: VersionsPermissionsPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage(),
    page = pose.pages[pose.page];
  return (
    <group>
      {(page.fact
        ? [
            page.fact.replicaId ?? page.fact.actorId,
            page.fact.otherReplicaId ?? page.fact.resourceId,
          ]
        : []
      ).map((id, column) => {
        const record = scene.entities.find((r) => r.id === id);
        if (!record) return null;
        const placement = versionsPermissionsModelPlacement(column, wide?.model);
        return (
          <group
            key={id}
            position={placement.position}
            scale={placement.scale}
            userData={{ sourceId: id }}
          >
            <mesh castShadow receiveShadow scale={[140, 8, 8]}>
              <boxGeometry args={[1, 1, 1]} />
              <Clay color={colors.surface} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
