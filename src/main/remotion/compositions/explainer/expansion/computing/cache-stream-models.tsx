import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { ComputingActorClay, ComputingRecordClay } from '../kits/computing';
import type { ExpansionKitColors } from '../scene-types';
import type { CacheStreamPose } from './cache-stream-poses';
import type { ExpansionCacheStreamScene } from './cache-stream-types';
export const CACHE_STREAM_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function cacheStreamPlacement(column: number, wide?: { width: number; height: number }) {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (118 + column * 236) * meet : 64 + 118 + column * 236;
  const y = wide ? (height - 478 * meet) / 2 + 464 * meet : 262 + 464;
  const units = worldUnitsPerPixel(CACHE_STREAM_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: units * meet * 36,
  };
}
export function CacheStreamModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionCacheStreamScene;
  pose: CacheStreamPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage(),
    page = pose.pages[pose.page];
  const props = { pose: { ...pose, reveal: 1 }, state: 'retained' as const, colors };
  return (
    <group>
      <ComputingRecordClay
        {...props}
        {...cacheStreamPlacement(0, wide?.model)}
        record={{
          id: page.actorId,
          label: scene.entities.find((e) => e.id === page.actorId)?.label ?? page.actorId,
          kind: 'packet',
          state: 'retained',
          position: [0, 0, 0],
        }}
      />
      <ComputingActorClay
        {...props}
        {...cacheStreamPlacement(1, wide?.model)}
        actor={{
          id: page.targetId,
          label: scene.entities.find((e) => e.id === page.targetId)?.label ?? page.targetId,
          kind: scene.storyId === '65' ? 'cache' : 'buffer',
          state: 'retained',
          position: [0, 0, 0],
        }}
      />
    </group>
  );
}
