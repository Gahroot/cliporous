import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { RelationshipEntityClay } from '../kits/relationships';
import type { MatrixMatchingPose } from './matrix-matching-poses';
import type { ExpansionMatrixMatchingScene } from './matrix-matching-types';

export const MATRIX_MATCHING_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function matrixMatchingModelPlacement(
  index: number,
  count: number,
  wide?: { width: number; height: number },
): { position: [number, number, number]; scale: number } {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const angle = (index / count) * Math.PI * 2;
  const x = wide
    ? (width - 952 * meet) / 2 + (225 + Math.cos(angle) * 185) * meet
    : 289 + Math.cos(angle) * 185;
  const y = wide
    ? (height - 478 * meet) / 2 + (376 + Math.sin(angle) * 36) * meet
    : 638 + Math.sin(angle) * 36;
  const units = worldUnitsPerPixel(MATRIX_MATCHING_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0],
    scale: 48 * units * meet,
  };
}
/** Clay identity supports only; exact relationships, quantities and qualifications stay planar. */
export function MatrixMatchingModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionMatrixMatchingScene;
  pose: MatrixMatchingPose;
  colors: { surface: string; text: string; accent: string; muted: string };
}): ReactElement {
  const wide = useWideStage();
  return (
    <group>
      {scene.entities.map((e, i) => (
        <group key={e.id} name={e.id}>
          <RelationshipEntityClay
            entity={{
              id: e.id,
              label: e.label,
              role:
                scene.storyId === '37'
                  ? 'member'
                  : scene.candidateIds.includes(e.id)
                    ? 'candidate'
                    : 'resource',
            }}
            colors={colors}
            pose={pose}
            state="retained"
            {...matrixMatchingModelPlacement(i, scene.entities.length, wide?.model)}
          />
        </group>
      ))}
    </group>
  );
}
