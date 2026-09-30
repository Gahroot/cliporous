import { Euler, Vector3 } from 'three';
import { type CameraSpec, projectToStage } from '../three-helpers';
import type { Vec3 } from './paths';

export type AnchorTransform = Readonly<{
  position: Vec3;
  rotation?: Vec3;
  scale?: number;
}>;
export type ScreenPoint = Readonly<{ x: number; y: number }>;
export type SafeBox = Readonly<{ x: number; y: number; width: number; height: number }>;

/** Same XYZ Euler/scale/translation order as an authored Three group. */
export function transformAnchor(point: Vec3, pose: AnchorTransform): Vec3 {
  const result = new Vector3(...point)
    .multiplyScalar(pose.scale ?? 1)
    .applyEuler(new Euler(...(pose.rotation ?? [0, 0, 0])))
    .add(new Vector3(...pose.position));
  return [result.x, result.y, result.z];
}

/** Uses the exact sampled Stage3D rig camera; points behind/at the camera are not labels. */
export function projectAnchor(camera: CameraSpec, point: Vec3): ScreenPoint | null {
  if (![...point, ...camera.position, camera.fov].every(Number.isFinite)) return null;
  const direction = new Vector3(...camera.position).negate().normalize();
  const depth = new Vector3(...point).sub(new Vector3(...camera.position)).dot(direction);
  if (depth <= 0.1 || camera.fov <= 0 || camera.fov >= 180) return null;
  const projected = projectToStage(camera, [...point]);
  return Number.isFinite(projected.x) && Number.isFinite(projected.y) ? projected : null;
}

/** Clamp the entire label, not just its centre, to the virtual content rail. */
export function placeLabel(
  point: ScreenPoint,
  width: number,
  height: number,
  safe: SafeBox,
): ScreenPoint {
  return {
    x: Math.max(safe.x, Math.min(safe.x + Math.max(0, safe.width - width), point.x - width / 2)),
    y: Math.max(safe.y, Math.min(safe.y + Math.max(0, safe.height - height), point.y - height / 2)),
  };
}

export const MECHANISM_CAMERA: CameraSpec = { position: [0, 1.5, 11.8], fov: 32 };
export const MECHANISM_LABEL_SAFE: SafeBox = { x: 72, y: 70, width: 936, height: 806 };
