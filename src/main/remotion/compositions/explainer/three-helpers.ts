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
 * Project a world-space point to stage pixels using the same camera the
 * `ThreeCanvas` uses, so HTML labels can sit exactly on 3D objects without a
 * DOM-in-WebGL helper. R3F points a positioned camera at the origin, which is
 * mirrored here.
 */
export function projectToStage(
  camera: CameraSpec,
  point: [number, number, number],
): { x: number; y: number } {
  const cam = new PerspectiveCamera(
    camera.fov,
    EXPLAINER_STAGE_WIDTH / EXPLAINER_STAGE_HEIGHT,
    0.1,
    100,
  );
  cam.position.set(...camera.position);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const v = new Vector3(...point).project(cam);
  return {
    x: ((v.x + 1) / 2) * EXPLAINER_STAGE_WIDTH,
    y: ((1 - v.y) / 2) * EXPLAINER_STAGE_HEIGHT,
  };
}

/** World units visible per stage pixel on the z=0 plane for a camera on the z axis. */
export function worldUnitsPerPixel(camera: CameraSpec): number {
  const distance = Math.hypot(...camera.position);
  const visibleHeight = 2 * distance * Math.tan(((camera.fov / 2) * Math.PI) / 180);
  return visibleHeight / EXPLAINER_STAGE_HEIGHT;
}
