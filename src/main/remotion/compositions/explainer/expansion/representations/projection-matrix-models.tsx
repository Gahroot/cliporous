import type { ReactElement } from 'react';
import { Clay } from '../../hero-kit';
import type { ExpansionKitColors } from '../scene-types';
import type { ProjectionMatrixPose } from './projection-matrix-poses';
import type { ExpansionProjectionMatrixScene } from './projection-matrix-types';

/** Authored point stations, independent of supplied coordinates/matrix values. */
export function ProjectionMatrixModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionProjectionMatrixScene;
  pose: ProjectionMatrixPose;
  colors: ExpansionKitColors;
}): ReactElement {
  return (
    <group userData={{ template: scene.template, sourceOnly: true }}>
      {[-1.4, 1.4].map((x, i) => (
        <group key={x} userData={{ station: i + 1 }}>
          <mesh position={[x, -0.4, 0]}>
            <boxGeometry args={[1.4, 0.14, 0.8]} />
            <Clay color={colors.surface} />
          </mesh>
          <mesh position={[x, 0, 0]}>
            <sphereGeometry args={[0.15, 16, 12]} />
            <Clay color={colors.accent} opacity={pose.reveal} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.4, 0]}>
        <boxGeometry args={[1.2, 0.06, 0.06]} />
        <Clay color={colors.muted} opacity={pose.check} />
      </mesh>
    </group>
  );
}
