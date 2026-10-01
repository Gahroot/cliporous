import { type CameraSpec, projectToStage } from '../three-helpers';
import { phaseProgress, type TechnologyPoint } from './motion';
import type { RequestRoutingScene } from './types';

type Point = [number, number, number];

const ESTABLISH: CameraSpec = { position: [2.4, 5.9, 11.8], fov: 36 };
const INSPECT: CameraSpec = { position: [1.4, 6.15, 11.95], fov: 36 };

/** The frozen ticket path becomes a physical rail without changing any contact or beat. */
export function routingPointToWorld(point: TechnologyPoint, height = -0.47): Point {
  return [(point.x + 122 - 540) / 120, height, (point.y - 490) / 155];
}

/** Label envelopes are also covered by the camera's authored-bounds test. */
export const ROUTING_LABEL_ANCHORS = {
  switchboard: { point: [-0.1, 0.72, -1.6] as Point, width: 200 },
  cache: { point: [-2.2833, 1.05, -1.2] as Point, width: 260 },
  primary: { point: [2.3833, 1.2, -1.2] as Point, width: 294 },
  alternate: { point: [2.3833, -0.7, 1.58] as Point, width: 294 },
} as const;

/** Lift the identity tag before entering the front-right socket, clear of its service label. */
export function routingRequestLabelPosition(
  camera: CameraSpec,
  point: TechnologyPoint,
  fallback: boolean,
): { x: number; y: number } {
  const projected = projectToStage(camera, routingPointToWorld(point));
  const lift = fallback ? phaseProgress(point.y, 450, 610) * phaseProgress(point.x, 200, 412) : 0;
  return { x: projected.x - 132, y: projected.y + 34 - 200 * lift };
}

/** One small reframe during a stationary inspection; never follow or outrun the request. */
export function requestRoutingCamera(scene: RequestRoutingScene, time: number): CameraSpec {
  const t = Number.isFinite(time) ? Math.min(time, scene.resolveAt) : scene.setupAt - 1;
  let progress = 0;
  if (scene.preset === 'cache-hit') {
    progress = phaseProgress(t, scene.responseAt + 0.3, scene.checkAt - 0.2);
  } else if (scene.preset === 'timeout-fallback' && scene.responseAt - scene.actionAt >= 1.3) {
    // Contact recoil has settled; finish before the timeout and alternate-route turn.
    progress = phaseProgress(t, scene.actionAt + 0.55, scene.responseAt - 0.2);
  }
  return {
    position: ESTABLISH.position.map(
      (value, axis) => value + (INSPECT.position[axis] - value) * progress,
    ) as Point,
    fov: ESTABLISH.fov,
  };
}
