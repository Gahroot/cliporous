import type {} from '@react-three/fiber';
import type { ReactElement } from 'react';
import { Clay } from '../../hero-kit';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import type { ExpansionKitColors } from '../scene-types';
import type { InformationLossPose } from './information-loss-poses';
import type { ExpansionInformationLossScene } from './information-loss-types';

export const INFORMATION_LOSS_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function informationLossModelPlacement(
  column: number,
  wide?: { width: number; height: number },
) {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (114 + column * 236) * meet : 64 + 114 + column * 236;
  const y = wide ? (height - 478 * meet) / 2 + 446 * meet : 262 + 446;
  const units = worldUnitsPerPixel(INFORMATION_LOSS_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: units * meet,
  };
}
/** Authored paper-record props only; no perspective quantities or extra information. */
export function InformationLossModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionInformationLossScene;
  pose: InformationLossPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage(),
    page = pose.pages[pose.page];
  return (
    <group>
      {page.recordIds.map((id, column) => {
        const record = scene.records.find((r) => r.id === id);
        if (!record) return null;
        const placement = informationLossModelPlacement(column, wide?.model);
        return (
          <group
            key={id}
            position={placement.position}
            scale={placement.scale}
            userData={{ sourceId: id }}
          >
            <mesh castShadow receiveShadow scale={[140, 24, 8]}>
              <boxGeometry args={[1, 1, 1]} />
              <Clay color={colors.surface} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
