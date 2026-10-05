import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { EvidenceDocumentClay } from '../kits/evidence';
import type { ExpansionKitColors } from '../scene-types';
import type { DistributionPose } from './distribution-poses';
import type { ExpansionDistributionScene } from './distribution-types';

export const DISTRIBUTION_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function distributionModelPlacement(
  index: number,
  wide?: { width: number; height: number },
) {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (70 + index * 150) * meet : 64 + 70 + index * 150;
  const y = wide ? (height - 478 * meet) / 2 + 464 * meet : 262 + 464;
  const unit = worldUnitsPerPixel(DISTRIBUTION_CAMERA, height);
  return {
    position: [(x - width / 2) * unit, (height / 2 - y) * unit, 0] as [number, number, number],
    scale: 8 * unit * meet,
  };
}
/** Authored collection trays: no sampled people or numeric clay height encodings. */
export function DistributionModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionDistributionScene;
  pose: DistributionPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  return (
    <group userData={{ sourceRecord: pose.pages[pose.page].id, individualMarks: 0 }}>
      {[0, 1].map((i) => {
        const p = distributionModelPlacement(i, wide?.model);
        return (
          <group
            key={i}
            position={p.position}
            scale={p.scale}
            userData={{
              role:
                scene.storyId === '17'
                  ? 'ordered-bin-tray'
                  : i === 0
                    ? 'subgroup-tray'
                    : 'aggregate-tray',
            }}
          >
            <ClayBlock size={[5, 1.2, 0.12]} color={colors.surface} />
            {[-1, 1].map((side) => (
              <group key={side}>
                <ClayBlock
                  size={[0.12, 1.2, 0.25]}
                  position={[side * 2.5, 0, 0]}
                  color={colors.muted}
                />
                <ClayBlock
                  size={[5, 0.12, 0.25]}
                  position={[0, side * 0.6, 0]}
                  color={colors.muted}
                />
              </group>
            ))}
            {(scene.storyId === '17' ? [-1.25, 0, 1.25] : [0]).map((x) => (
              <ClayBlock
                key={x}
                size={[0.08, 1.2, 0.25]}
                position={[x, 0, 0]}
                color={colors.accent}
              />
            ))}
          </group>
        );
      })}
      <group {...distributionModelPlacement(2, wide?.model)}>
        <EvidenceDocumentClay
          id={pose.pages[pose.page].id}
          label={scene.label}
          source={scene.subject}
          pose={pose}
          state="retained"
          colors={colors}
          placement={{ position: [0, 0, 0] }}
        />
      </group>
    </group>
  );
}
