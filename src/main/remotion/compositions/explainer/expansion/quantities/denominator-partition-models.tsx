import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { PrecisionPlotClay } from '../kits/plots';
import type { ExpansionKitColors } from '../scene-types';
import {
  type DenominatorPartitionPose,
  denominatorDomain,
  denominatorQuantities,
} from './denominator-partition-poses';
import type { ExpansionDenominatorPartitionScene } from './denominator-partition-types';

export const DENOMINATOR_PARTITION_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function denominatorPartitionModelPlacement(
  index: number,
  wide?: { width: number; height: number },
) {
  const width = wide?.width ?? 1080;
  const height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (140 + index * 240) * meet : 64 + 140 + index * 240;
  // Reserved instrument strip: planar y=387..408, between partition and footer.
  const y = wide ? (height - 478 * meet) / 2 + 397 * meet : 262 + 397;
  const units = worldUnitsPerPixel(DENOMINATOR_PARTITION_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: 12 * units * meet,
  };
}
/** Two source instruments only; no quantitative geometry leaves the planar layer. */
export function DenominatorPartitionModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionDenominatorPartitionScene;
  pose: DenominatorPartitionPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  const quantities = denominatorQuantities(scene, pose.record);
  return (
    <group>
      {quantities.map((q, i) => {
        const placement = denominatorPartitionModelPlacement(i, wide?.model);
        return (
          <group key={q.claim} position={placement.position} scale={placement.scale}>
            <PrecisionPlotClay
              records={[{ id: pose.pages[pose.page].id, label: 'source', quantity: q }]}
              domain={denominatorDomain(scene)}
              basis={q.basis}
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
