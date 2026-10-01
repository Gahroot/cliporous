import type { CameraSpec } from '../three-helpers';
import { phaseProgress } from './motion';
import type { AgentWorkflowScene } from './types';

const ESTABLISH: CameraSpec = { position: [3.3, 4.8, 11.3], fov: 36 };
const INSPECT: CameraSpec = { position: [-0.3, 4.2, 10.8], fov: 36 };
const RESOLVE: CameraSpec = { position: [2.8, 4.9, 11.5], fov: 36 };

function between(from: CameraSpec, to: CameraSpec, progress: number): CameraSpec {
  const [x, y, z] = from.position;
  return {
    position: [
      x + (to.position[0] - x) * progress,
      y + (to.position[1] - y) * progress,
      z + (to.position[2] - z) * progress,
    ],
    fov: 36,
  };
}

/** Retry close-up uses the stopped hold; the pullback starts after the request has returned. */
export function agentWorkflowCamera(scene: AgentWorkflowScene, time: number): CameraSpec {
  const hasCameraRoom =
    scene.preset === 'tool-retry' &&
    scene.checkAt - scene.responseAt >= 2 &&
    scene.resolveAt - scene.checkAt >= 1.8;
  if (!hasCameraRoom) return { position: [...ESTABLISH.position], fov: ESTABLISH.fov };
  if (time < scene.resolveAt - 0.45) {
    return between(
      ESTABLISH,
      INSPECT,
      phaseProgress(time, scene.responseAt, scene.responseAt + 0.6),
    );
  }
  return between(INSPECT, RESOLVE, phaseProgress(time, scene.resolveAt - 0.45, scene.resolveAt));
}
