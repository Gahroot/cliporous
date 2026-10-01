import { diagramPose, reveal } from '../diagrams/motion';
import type { TechnologyBeats } from '../technology/types';

export function detroitPose(
  t: number,
  beats: TechnologyBeats,
  index = 0,
): {
  scale: number;
  rise: number;
  diagram: number;
  label: number;
} {
  const entry = reveal(t, beats.setupAt + Math.min(2, Math.max(0, index)) * 0.15, 0.6);
  return {
    scale: 0.94 + 0.06 * entry,
    rise: (1 - entry) * -0.28,
    diagram: diagramPose(t, beats).diagramOpacity,
    label: reveal(t, beats.checkAt, 0.3),
  };
}
