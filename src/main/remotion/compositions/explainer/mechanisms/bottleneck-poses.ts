import type { BottleneckScene } from '../types';
import { smoothPhase } from './kinematics';

export type QueueToken = Readonly<{ id: number; x: number }>;
export type BottleneckPose = Readonly<{
  gate: number;
  distance: number;
  tokens: readonly QueueToken[];
  complete: boolean;
}>;

/** Persistent FIFO identities. The gate must finish rising before any token is released. */
export function sampleBottleneck(t: number, scene: BottleneckScene): BottleneckPose {
  const count = scene.tokenCount;
  const release = smoothPhase(t, scene.openAt + 0.05, scene.clearAt);
  const crossing = 0.68 + (count - 1) * 0.33;
  const tokens = Array.from({ length: count }, (_, id): QueueToken => {
    const arrive = smoothPhase(
      t,
      scene.feedAt + id * 0.025,
      scene.queueAt - (count - 1 - id) * 0.025,
    );
    return { id, x: -0.3 - id * 0.33 - 0.8 * (1 - arrive) + crossing * release };
  });
  return {
    gate: smoothPhase(t, scene.openAt - 0.3, scene.openAt),
    distance: 0.8 * smoothPhase(t, scene.feedAt, scene.queueAt) + crossing * release,
    tokens,
    complete: t >= scene.clearAt,
  };
}
