import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import type { ExpansionKitColors } from '../scene-types';
import type { VectorFactorizationPose } from './vector-factorization-poses';
import type { ExpansionVectorFactorizationScene } from './vector-factorization-types';

/** Qualitative source-card assembly. No supplied number changes camera or model geometry. */
export function VectorFactorizationModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionVectorFactorizationScene;
  pose: VectorFactorizationPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const ids =
    scene.storyId === '55'
      ? [scene.vector.id, ...scene.basis.map((v) => v.id)]
      : scene.operands.map((o) => o.id);
  return (
    <group userData={{ storyId: scene.storyId, template: scene.template }}>
      <ClayBlock
        size={[5.6, 0.12, 2.2]}
        position={[0, -1, 0]}
        color={colors.surface}
        opacity={pose.reveal}
      />
      {ids.map((id, i) => (
        <group key={id} userData={{ sourceId: id }}>
          <ClayBlock
            size={[0.64, 0.8, 0.12]}
            position={[-2.1 + i * 0.84, -0.4, 0]}
            color={colors.accent}
            opacity={pose.action}
          />
        </group>
      ))}
    </group>
  );
}
