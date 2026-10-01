import type { CameraSpec } from '../three-helpers';
import { CONTEXT_WINDOW_GEOMETRY as G } from './context-window';
import { phaseProgress, type TechnologyPoint } from './motion';
import type { ContextWindowScene } from './types';

const ESTABLISH: CameraSpec = { position: [3.3, 8.2, 11.8], fov: 35 };
const SETTLED: CameraSpec = { position: [2.7, 8.7, 11.8], fov: 35 };

/** Render-only projection of the frozen two-bay pose, not a new movement timeline. */
export function contextWindowPoint(point: TechnologyPoint, copyLift = 0): [number, number, number] {
  const archive = Math.max(0, Math.min(1, (point.x - G.working.x) / (G.stored.x - G.working.x)));
  return [
    -0.38 + (point.x - G.working.x) / 140,
    -0.46 + (0.7 + copyLift) * archive + 0.3 * 4 * archive * (1 - archive),
    -0.12 + (point.y - G.working.y) / 95 - 0.96 * archive,
  ];
}

export const CONTEXT_CLAY_LABELS = {
  tray: [-2.55, 1.8, -0.12],
  archive: [contextWindowPoint(G.stored)[0], 2.22, contextWindowPoint(G.stored)[2]],
  outside: [-2.75, -0.9, 2],
} satisfies Record<string, [number, number, number]>;

/** Only tilt after seating AND the existing half-second receiver recoil have finished.
 * Short beats keep the establishing view; the outcome and final hold are entirely still.
 */
export function contextWindowCamera(scene: ContextWindowScene, timeSeconds: number): CameraSpec {
  const time = Number.isFinite(timeSeconds) ? Math.min(timeSeconds, scene.resolveAt) : 0;
  const progress =
    scene.resolveAt - scene.checkAt >= 1.45
      ? phaseProgress(time, scene.checkAt + 0.55, scene.checkAt + 1.15)
      : 0;
  return {
    position: [
      ESTABLISH.position[0] + (SETTLED.position[0] - ESTABLISH.position[0]) * progress,
      ESTABLISH.position[1] + (SETTLED.position[1] - ESTABLISH.position[1]) * progress,
      ESTABLISH.position[2],
    ],
    fov: ESTABLISH.fov,
  };
}
