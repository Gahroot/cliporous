import type { ReactElement } from 'react';
import { Clay } from '../../hero-kit';
import type { ExpansionKitColors } from '../scene-types';
import type { FitScalePose } from './fit-scale-poses';
import type { ExpansionFitScaleScene } from './fit-scale-types';

/** Open authored shells retain the nested identity, rather than magnifying lenses. */
export function FitScaleModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionFitScaleScene;
  pose: FitScalePose;
  colors: ExpansionKitColors;
}): ReactElement {
  const box = (
    id: string,
    p: [number, number, number],
    size: [number, number, number],
    color: string,
  ) => (
    <mesh key={id} position={p} userData={{ sourceId: id }}>
      <boxGeometry args={size} />
      <Clay color={color} />
    </mesh>
  );
  return (
    <group userData={{ template: scene.template, identityId: scene.identityId }}>
      {scene.storyId === '59' ? (
        <>
          {box('tray-base', [0, -0.6, 0], [3, 0.12, 2], colors.surface)}
          {box('tray-left', [-1.5, -0.3, 0], [0.12, 0.6, 2], colors.muted)}
          {box('tray-right', [1.5, -0.3, 0], [0.12, 0.6, 2], colors.muted)}
          {box('tray-back', [0, -0.3, -1], [3, 0.6, 0.12], colors.muted)}
          {box(
            scene.result.partId,
            [0, 1.3 - 1.4 * pose.response, 0],
            [1, 0.6, 0.7],
            colors.accent,
          )}
        </>
      ) : (
        <>
          {box(scene.records[2].id, [0, -0.65, 0], [3.8, 0.12, 2.8], colors.surface)}
          {box('building-back', [0, 0.1, -1.4], [3.8, 1.5, 0.12], colors.muted)}
          {box('building-left', [-1.9, 0.1, 0], [0.12, 1.5, 2.8], colors.muted)}
          {box(scene.records[1].id, [0, -0.5, 0], [2.4, 0.12, 1.6], colors.surface)}
          {box('room-back', [0, -0.15, -0.8], [2.4, 0.7, 0.12], colors.accent)}
          {box('room-left', [-1.2, -0.15, 0], [0.12, 0.7, 1.6], colors.accent)}
          {box(scene.records[0].id, [0, -0.2, 0], [0.6, 0.5, 0.5], colors.accent)}
        </>
      )}
    </group>
  );
}
