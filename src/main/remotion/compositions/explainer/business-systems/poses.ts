import { reveal } from '../diagrams/motion';
import type { TechnologyBeats } from '../technology/types';
export function cashTimingPose(
  t: number,
  beats: TechnologyBeats,
): { costPaid: number; laterInvoice: number; comparison: number } {
  return {
    costPaid: reveal(t, beats.actionAt),
    laterInvoice: reveal(t, beats.responseAt),
    comparison: reveal(t, beats.checkAt),
  };
}
