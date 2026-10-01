import { reveal } from '../diagrams/motion';
import type { TechnologyBeats } from '../technology/types';
export function tokenAttentionPose(
  t: number,
  beats: TechnologyBeats,
): { selected: number; linked: number } {
  return { selected: reveal(t, beats.actionAt), linked: reveal(t, beats.responseAt) };
}
export function comparisonMetricReveal(
  t: number,
  beats: TechnologyBeats,
  metric: 'cost' | 'latency' | 'score',
): number {
  return reveal(
    t,
    metric === 'cost' ? beats.actionAt : metric === 'latency' ? beats.responseAt : beats.checkAt,
  );
}
