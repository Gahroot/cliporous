import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { PrecisionPlotClay } from '../kits/plots';
import type { ExpansionKitColors } from '../scene-types';
import {
  type DeviationMultiplesPose,
  deviationDomain,
  deviationRecords,
} from './deviation-multiples-poses';
import type { ExpansionDeviationMultiplesScene } from './deviation-multiples-types';

export const DEVIATION_MULTIPLES_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function deviationModelPlacement(index: number, wide?: { width: number; height: number }) {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (110 + index * 110) * meet : 64 + 110 + index * 110;
  const y = wide ? (height - 478 * meet) / 2 + 440 * meet : 262 + 440;
  const units = worldUnitsPerPixel(DEVIATION_MULTIPLES_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: 10 * units * meet,
  };
}
/** Neutral chart instruments only: source facts live in the overlaid planar diagram. */
export function DeviationMultiplesModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionDeviationMultiplesScene;
  pose: DeviationMultiplesPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  return (
    <group>
      {deviationRecords(scene).map((r, i) => {
        const placement = deviationModelPlacement(i, wide?.model);
        return (
          <group
            key={r.id}
            position={placement.position}
            scale={placement.scale}
            userData={{ sourceId: r.id }}
          >
            <PrecisionPlotClay
              records={[r]}
              domain={deviationDomain(scene)}
              basis={r.quantity.basis}
              pose={pose}
              state="retained"
              colors={colors}
              position={[0, 0, 0]}
            />
          </group>
        );
      })}
    </group>
  );
}
