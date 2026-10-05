import type { ReactElement } from 'react';
import { Clay } from '../../hero-kit';
import type { ExpansionKitColors } from '../scene-types';
import { type RegionsDimensionsPose, regionPlacement } from './regions-dimensions-poses';
import type { ExpansionRegionsDimensionsScene } from './regions-dimensions-types';

/** Fixed line/square/cube and authored region boundaries, not quantity-driven geometry. */
export function RegionsDimensionsModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionRegionsDimensionsScene;
  pose: RegionsDimensionsPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const p = regionPlacement(pose);
  return (
    <group userData={{ template: scene.template, schematic: true }}>
      {scene.storyId === '63' ? (
        <>
          {p.centers.map((x, i) => (
            <group
              key={scene.regionIds[i]}
              position={[(x - 226) / 100, 0, 0]}
              userData={{ regionId: scene.regionIds[i] }}
            >
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                {pose.relation === 'unresolved' ? (
                  <boxGeometry args={[1.6, 1.5, 0.06]} />
                ) : (
                  <torusGeometry args={[0.9, 0.035, 8, 40]} />
                )}
                <Clay color={colors.accent} opacity={pose.reveal} />
              </mesh>
              {'value' in scene.restriction && pose.restrictionRegion === i && (
                <mesh position={[0, 0.04, 0.35]}>
                  <boxGeometry args={[0.8, 0.06, 0.08]} />
                  <Clay color={colors.muted} opacity={pose.response} />
                </mesh>
              )}
            </group>
          ))}
          {/* Membership is exclusively the persistent planar relation, never a point in either region. */}
        </>
      ) : (
        <mesh position={[0, 0.3, 0]} userData={{ dimension: pose.exponent }}>
          <boxGeometry
            args={
              pose.exponent === 1
                ? [2.8, 0.055, 0.055]
                : pose.exponent === 2
                  ? [1.8, 0.055, 1.8]
                  : [1.4, 1.4, 1.4]
            }
          />
          <Clay color={colors.accent} opacity={pose.reveal} />
        </mesh>
      )}
    </group>
  );
}
