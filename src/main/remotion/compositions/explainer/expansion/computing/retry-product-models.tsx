import type {} from '@react-three/fiber';
import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { ComputingRecordClay } from '../kits/computing';
import { ProductSurfaceClay } from '../kits/product';
import type { ExpansionKitColors } from '../scene-types';
import type { RetryProductPose } from './retry-product-poses';
import type { ExpansionRetryProductScene } from './retry-product-types';

export const RETRY_PRODUCT_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function retryProductModelPlacement(
  column: number,
  wide?: { width: number; height: number },
) {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (114 + column * 236) * meet : 64 + 114 + column * 236;
  const y = wide ? (height - 478 * meet) / 2 + 410 * meet : 262 + 410;
  const units = worldUnitsPerPixel(RETRY_PRODUCT_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: units * meet,
  };
}
/** One source-owned prop; precise facts stay on the persistent planar companion. */
export function RetryProductModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionRetryProductScene;
  pose: RetryProductPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage(),
    page = pose.pages[pose.page];
  const r =
    scene.records.find((record) => page.recordIds.includes(record.id)) ?? scene.records[pose.phase];
  const placement = retryProductModelPlacement(0, wide?.model);
  const state =
    r.state === 'unknown' || r.state === 'missing'
      ? 'unknown'
      : r.state === 'disputed'
        ? 'disputed'
        : 'retained';
  const props = {
    position: [0, 0, 0] as const,
    scale: 1,
    pose: { ...pose, reveal: 1 },
    colors,
    state,
  } as const;
  return (
    <group position={placement.position} scale={placement.scale} userData={{ sourceId: r.id }}>
      {scene.storyId === '67' ? (
        <group scale={100}>
          <ComputingRecordClay
            {...props}
            record={{
              id: r.id,
              label: r.claim,
              kind: r.role === 'effect' ? 'effect' : 'packet',
              state,
              position: [0, 0, 0],
            }}
          />
        </group>
      ) : (
        <group scale={55} rotation={[Math.PI / 2, 0, 0]}>
          <ProductSurfaceClay
            {...props}
            surface={{
              id: r.id,
              label: r.claim,
              kind: r.shape ?? 'form',
              state,
              position: [0, 0, 0],
            }}
          />
        </group>
      )}
    </group>
  );
}
