import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { TemporalStateBadgeClay } from '../kits/temporal';
import type { ExpansionKitColors } from '../scene-types';
import type { ReversibleExpiryPose } from './reversible-expiry-poses';
import type { ExpansionReversibleExpiryScene } from './reversible-expiry-types';

export const REVERSIBLE_EXPIRY_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function reversibleExpiryModelPlacement(
  index: number,
  wide?: { width: number; height: number },
): { position: [number, number, number]; scale: number } {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const scale = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * scale) / 2 + (30 + index * 52) * scale : 94 + index * 52;
  const y = wide ? (height - 478 * scale) / 2 + 400 * scale : 662;
  const units = worldUnitsPerPixel(REVERSIBLE_EXPIRY_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0],
    scale: 20 * scale * units,
  };
}
/** Identity tabs on a retained rail; all factual clock quantities stay on the planar surface. */
export function ReversibleExpiryModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionReversibleExpiryScene;
  pose: ReversibleExpiryPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  const ids = scene.storyId === '43' ? scene.stateIds : scene.eventIds;
  return (
    <group>
      {ids.map((id, i) => {
        const placement = reversibleExpiryModelPlacement(i, wide?.model);
        const entity = scene.entities.find((e) => e.id === id);
        return entity ? (
          <group key={id}>
            <TemporalStateBadgeClay
              id={id}
              label={entity.label}
              history="not-stated"
              state="retained"
              pose={pose}
              colors={colors}
              position={placement.position}
              scale={placement.scale}
            />
            <group position={placement.position} scale={placement.scale}>
              <ClayBlock size={[2.6, 0.06, 0.14]} position={[0, -0.3, 0]} color={colors.muted} />
            </group>
          </group>
        ) : null;
      })}
    </group>
  );
}
