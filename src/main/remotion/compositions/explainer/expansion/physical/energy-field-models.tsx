import { type ReactElement, useEffect, useMemo } from 'react';
import { type BufferGeometry, ExtrudeGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ClayBlock, type ClayPoint } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { createIconShapes } from '../../hero-props/icon-shapes';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import type { ExpansionKitColors } from '../scene-types';
import type { EnergyFieldPose } from './energy-field-poses';
import type { ExpansionEnergyFieldScene } from './energy-field-types';
export const ENERGY_FIELD_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function energyFieldModelPlacement(wide?: { width: number; height: number }): {
  position: ClayPoint;
  scale: number;
} {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960,
    meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + 830 * meet : 64 + 830,
    y = wide ? (height - 478 * meet) / 2 + 180 * meet : 262 + 180;
  const units = worldUnitsPerPixel(ENERGY_FIELD_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0],
    scale: units * meet * 44,
  };
}
export interface EnergyFieldSolid {
  readonly id: string;
  readonly kind: 'block' | 'lightning';
  readonly size: ClayPoint;
  readonly position: ClayPoint;
  readonly rotation: ClayPoint;
  readonly parentPosition: ClayPoint;
  readonly parentRotation: ClayPoint;
  readonly color: keyof ExpansionKitColors;
}
/** Shared authored lightning silhouette, never an amount or physical particle. */
export function energyFieldSolidGeometry(solid: EnergyFieldSolid): BufferGeometry {
  if (solid.kind === 'block')
    return new RoundedBoxGeometry(
      ...solid.size,
      3,
      Math.min(0.07, ...solid.size.map((d) => d / 2)),
    );
  return energyFieldLightningGeometry(solid.size);
}
export function energyFieldLightningGeometry(size: ClayPoint): BufferGeometry {
  return new ExtrudeGeometry(createIconShapes('lightning').body, {
    depth: 0.24,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    curveSegments: 16,
  })
    .translate(0, 0, -0.12)
    .scale(...size);
}
/** Exact solid list consumed by the renderer and local CPU inventory/projection proof. */
export function energyFieldSolids(
  scene: ExpansionEnergyFieldScene,
  pose: EnergyFieldPose,
): EnergyFieldSolid[] {
  const solid = (
    id: string,
    size: ClayPoint,
    position: ClayPoint,
    color: keyof ExpansionKitColors,
    rotation: ClayPoint = [0, 0, 0],
    parentPosition: ClayPoint = [0, 0, 0],
    parentRotation: ClayPoint = [0, 0, 0],
    kind: EnergyFieldSolid['kind'] = 'block',
  ): EnergyFieldSolid => ({
    id,
    kind,
    size,
    position,
    color,
    rotation,
    parentPosition,
    parentRotation,
  });
  if (scene.storyId === '79') {
    const cartX = -0.7 + 1.4 * pose.action;
    return [
      solid('battery-body', [0.8, 1.2, 0.6], [-0.8, 0, 0], 'surface'),
      solid('battery-terminal', [0.4, 0.12, 0.3], [-0.8, 0.65, 0], 'accent'),
      solid('electrical-load-housing', [0.8, 0.8, 0.6], [0.8, 0, 0], 'surface'),
      solid(
        'electrical-load-symbol',
        [0.28, 0.28, 0.28],
        [0.8, 0, 0.32],
        'accent',
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        'lightning',
      ),
      solid('carrier-track', [1.8, 0.08, 0.12], [0, -0.95, 0], 'muted'),
      solid('energy-cart-bed', [0.4, 0.06, 0.2], [cartX, -0.8, 0], 'muted'),
      solid('energy-cart-wheel-left', [0.14, 0.14, 0.1], [cartX - 0.12, -0.86, 0.1], 'muted'),
      solid('energy-cart-wheel-right', [0.14, 0.14, 0.1], [cartX + 0.12, -0.86, 0.1], 'muted'),
      solid(
        'energy-cart-bolt',
        [0.2, 0.2, 0.2],
        [cartX, -0.55, 0],
        'accent',
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        'lightning',
      ),
    ];
  }
  return pose.arrows
    .filter((a) => a.available)
    .flatMap((a) => {
      const p: ClayPoint = [a.x / 70, -a.y / 70, 0],
        r: ClayPoint = [0, 0, -Math.atan2(a.dy, a.dx)],
        id = `teaching-vector:${a.x}:${a.y}`;
      return [
        solid(`${id}:shaft`, [0.4, 0.07, 0.08], [0, 0, 0], 'accent', [0, 0, 0], p, r),
        solid(
          `${id}:head-upper`,
          [0.16, 0.06, 0.08],
          [0.15, 0.055, 0],
          'accent',
          [0, 0, -0.7],
          p,
          r,
        ),
        solid(
          `${id}:head-lower`,
          [0.16, 0.06, 0.08],
          [0.15, -0.055, 0],
          'accent',
          [0, 0, 0.7],
          p,
          r,
        ),
      ];
    });
}
function EnergyBolt({
  solid,
  color,
  opacity,
}: {
  solid: EnergyFieldSolid;
  color: string;
  opacity: number;
}): ReactElement {
  const [width, height, depth] = solid.size;
  const geometry = useMemo(
    () => energyFieldLightningGeometry([width, height, depth]),
    [width, height, depth],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={solid.position} rotation={solid.rotation}>
      <Clay color={color} opacity={opacity} />
    </mesh>
  );
}
/** Equal-size semantic carriers: no amount, count, fill, loss, residual or efficiency encoded. */
export function EnergyFieldModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionEnergyFieldScene;
  pose: EnergyFieldPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage(),
    placement = energyFieldModelPlacement(wide?.model),
    opacity = scene.storyId === '80' && !pose.fieldVisible ? 0 : 1;
  return (
    <group position={placement.position} scale={placement.scale}>
      {energyFieldSolids(scene, pose).map((solid) => (
        <group key={solid.id} position={solid.parentPosition} rotation={solid.parentRotation}>
          {solid.kind === 'lightning' ? (
            <EnergyBolt solid={solid} color={colors[solid.color]} opacity={opacity} />
          ) : (
            <ClayBlock
              size={solid.size}
              position={solid.position}
              rotation={solid.rotation}
              color={colors[solid.color]}
              opacity={opacity}
            />
          )}
        </group>
      ))}
    </group>
  );
}
