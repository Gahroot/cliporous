/**
 * Small, deterministic three.js helpers for the 3D explainer scenes.
 */

import { PerspectiveCamera, Vector3 } from 'three';
import { EXPLAINER_STAGE_HEIGHT, EXPLAINER_STAGE_WIDTH } from './types';

export interface CameraSpec {
  position: [number, number, number];
  fov: number;
}

/**
 * Project a world-space point to canvas pixels using the same camera the
 * `ThreeCanvas` uses, so HTML labels can sit exactly on 3D objects without a
 * DOM-in-WebGL helper. R3F points a positioned camera at the origin, which is
 * mirrored here.
 */
export function projectToStage(
  camera: CameraSpec,
  point: [number, number, number],
  width: number = EXPLAINER_STAGE_WIDTH,
  height: number = EXPLAINER_STAGE_HEIGHT,
): { x: number; y: number } {
  const cam = new PerspectiveCamera(camera.fov, width / height, 0.1, 100);
  cam.position.set(...camera.position);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const v = new Vector3(...point).project(cam);
  return {
    x: ((v.x + 1) / 2) * width,
    y: ((1 - v.y) / 2) * height,
  };
}

/** World units visible per canvas pixel on the z=0 plane for a camera on the z axis. */
export function worldUnitsPerPixel(
  camera: CameraSpec,
  height: number = EXPLAINER_STAGE_HEIGHT,
): number {
  const distance = Math.hypot(...camera.position);
  const visibleHeight = 2 * distance * Math.tan(((camera.fov / 2) * Math.PI) / 180);
  return visibleHeight / height;
}

/**
 * Camera rig: a slow orbital drift around the subject plus a small push-in
 * centred on `focusAt` (seconds). Pure — returns the camera position for time
 * `t`, so HTML label projection and the WebGL camera always agree.
 *
 *  - drift: ±`driftDeg` of azimuth over ~10 s, tiny vertical bob;
 *  - push-in: distance shrinks by `pushAmount` (fraction) with an eased
 *    rise/settle over ~0.9 s around the focus beat.
 */
export function cameraRig(
  base: CameraSpec,
  t: number,
  opts: {
    focusAt?: number;
    driftDeg?: number;
    pushAmount?: number;
    bobAmount?: number;
    /** Extra azimuth in degrees (scene-canvas settled turntable); 0 when absent. */
    orbitDeg?: number;
  } = {},
): CameraSpec {
  const driftDeg = opts.driftDeg ?? 6;
  const pushAmount = opts.pushAmount ?? 0.08;
  const [x, y, z] = base.position;
  const radius = Math.hypot(x, z);
  const baseAz = Math.atan2(x, z);
  const az = baseAz + ((Math.sin(t * 0.6) * driftDeg + (opts.orbitDeg ?? 0)) / 180) * Math.PI;
  let push = 0;
  if (opts.focusAt !== undefined) {
    const d = t - opts.focusAt;
    // Smooth in over 0.35 s, hold, ease back over ~1.6 s.
    if (d > -0.35 && d < 0) push = 1 - (d / -0.35) ** 2;
    else if (d >= 0) push = Math.max(0, 1 - (d / 1.6) ** 2);
  }
  const k = 1 - pushAmount * push;
  return {
    fov: base.fov,
    position: [
      Math.sin(az) * radius * k,
      (y + Math.sin(t * 0.45) * (opts.bobAmount ?? 0.08)) * k,
      Math.cos(az) * radius * k,
    ],
  };
}
