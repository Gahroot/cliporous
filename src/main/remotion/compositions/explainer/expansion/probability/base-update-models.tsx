import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { useWideStage } from '../../stage';
import type { CameraSpec } from '../../three-helpers';

import { EvidenceDocumentClay } from '../kits/evidence';
import { populationGridPosition, SamplingApertureClay } from '../kits/population';
import type { ExpansionKitColors, ExpansionKitPose } from '../scene-types';
import type { ProbabilityBaseUpdateScene } from './base-update-types';

export const BASE_UPDATE_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function baseUpdateModelPlacement(width: number, height: number) {
  const aspect = width / height;
  return { x: -0.37 * aspect * 8.904573706, y: 1.5, scale: 0.25 * aspect };
}

/** Authored aggregate tray: every disc is deliberately neutral, never a source individual. */
export function BaseUpdateModel({
  scene,
  pose,
  colors,
}: {
  scene: ProbabilityBaseUpdateScene;
  pose: ExpansionKitPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  const placement = baseUpdateModelPlacement(wide?.model.width ?? 1080, wide?.model.height ?? 960);
  return (
    <group
      position={[placement.x, placement.y, 0]}
      scale={placement.scale}
      userData={{ aggregation: scene.display.aggregation, populationId: scene.populationId }}
    >
      <ClayBlock size={[5.4, 5.4, 0.16]} color={colors.surface} opacity={pose.reveal} />
      {Array.from({ length: 100 }, (_, i) => (
        <mesh
          key={`schematic-${populationGridPosition(i).join(':')}`}
          position={[...populationGridPosition(i)]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.12, 0.12, 0.08, 12]} />
          <Clay color={colors.muted} opacity={pose.reveal} />
        </mesh>
      ))}
      {scene.storyId === '09' ? (
        <SamplingApertureClay
          pose={pose}
          colors={colors}
          state="active"
          placement={{ position: [0, 0, 0.18] }}
          window="all"
          membership={scene.selectionId}
        />
      ) : (
        <EvidenceDocumentClay
          id={scene.evidenceId}
          label="Evidence"
          source="Source-qualified"
          pose={{ ...pose, reveal: pose.action }}
          colors={colors}
          state="retained"
          placement={{ position: [1.4, -1.6, 0.5], scale: 1.4 }}
        />
      )}
    </group>
  );
}
