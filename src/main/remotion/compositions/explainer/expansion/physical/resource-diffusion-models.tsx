import type {} from '@react-three/fiber';
import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { type InfrastructureStage, InfrastructureStageClay } from '../kits/infrastructure';
import { RelationshipEntityClay } from '../kits/relationships';
import type { ExpansionKitColors } from '../scene-types';
import type { ResourceDiffusionPose } from './resource-diffusion-poses';
import type { ExpansionResourceDiffusionScene } from './resource-diffusion-types';

export const RESOURCE_DIFFUSION_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function resourceDiffusionPlacement(
  column: number,
  wide?: { width: number; height: number },
): { position: [number, number, number]; scale: number } {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (130 + column * 170) * meet : 64 + 130 + column * 170;
  const y = wide ? (height - 478 * meet) / 2 + 388 * meet : 262 + 388;
  const units = worldUnitsPerPixel(RESOURCE_DIFFUSION_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0],
    scale: 68 * meet * units,
  };
}
export function resourceDiffusionStages(
  scene: ExpansionResourceDiffusionScene,
): InfrastructureStage[] {
  const ids = scene.storyId === '75' ? [scene.resourceId] : [scene.reservoirId, scene.filterId];
  return ids.map((id, i) => ({
    id,
    label: scene.entities.find((e) => e.id === id)?.label ?? id,
    kind: scene.storyId === '75' ? 'supply-module' : i === 0 ? 'reservoir' : 'filter',
    position: [0, 0, 0],
    state: 'retained',
    content: { kind: 'unknown', qualifier: 'Geometry is not an amount' },
    provenance: { kind: 'illustrative', qualifier: 'Teaching rig; not physical simulation' },
  }));
}
/** Static semantic apparatus. Source quantities and rules are exclusively planar. */
export function ResourceDiffusionModels({
  scene,
  colors,
  pose,
}: {
  scene: ExpansionResourceDiffusionScene;
  colors: ExpansionKitColors;
  pose: ResourceDiffusionPose;
}): ReactElement {
  const wide = useWideStage();
  return (
    <group>
      {resourceDiffusionStages(scene).map((stage, i) => {
        const placement = resourceDiffusionPlacement(i, wide?.model);
        return (
          <InfrastructureStageClay
            key={stage.id}
            stage={stage}
            colors={colors}
            pose={pose}
            state="retained"
            position={placement.position}
            scale={placement.scale}
          />
        );
      })}
      {scene.storyId === '75' && (
        <RelationshipEntityClay
          entity={{
            id: scene.requesterId,
            label:
              scene.entities.find((e) => e.id === scene.requesterId)?.label ?? scene.requesterId,
            role: 'source',
          }}
          {...resourceDiffusionPlacement(1, wide?.model)}
          pose={pose}
          colors={colors}
          state="retained"
        />
      )}
    </group>
  );
}
