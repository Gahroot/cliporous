import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { ComputingRecordClay } from '../kits/computing';
import type { ExpansionKitColors } from '../scene-types';
import type { GeneralizationDriftPose } from './generalization-drift-poses';
import type { ExpansionGeneralizationDriftScene } from './generalization-drift-types';

export const GENERALIZATION_DRIFT_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function generalizationDriftModelPlacement(
  column: number,
  wide?: { width: number; height: number },
) {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (238 + column * 476) * meet : 64 + 238 + column * 476;
  const y = wide ? (height - 478 * meet) / 2 + 426 * meet : 262 + 426;
  const units = worldUnitsPerPixel(GENERALIZATION_DRIFT_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: units * meet * 40,
  };
}
/** Two independent example carriers, not a training simulation or manufactured prediction. */
export function GeneralizationDriftModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionGeneralizationDriftScene;
  pose: GeneralizationDriftPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  return (
    <group>
      {scene.records.map((r, column) => {
        const placement = generalizationDriftModelPlacement(column, wide?.model);
        return (
          <group
            key={r.id}
            position={placement.position}
            scale={placement.scale}
            userData={{ datasetId: r.datasetId, sample: r.sample, role: r.role }}
          >
            <ComputingRecordClay
              position={[0, 0, 0]}
              pose={pose}
              state={
                r.result.state === 'unknown' || r.result.state === 'missing'
                  ? 'unknown'
                  : 'retained'
              }
              colors={colors}
              record={{
                id: r.id,
                label: r.sample,
                kind: 'packet',
                state: 'retained',
                position: [0, 0, 0],
              }}
            />
          </group>
        );
      })}
    </group>
  );
}
