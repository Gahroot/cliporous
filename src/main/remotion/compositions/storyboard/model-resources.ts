import { STORYBOARD_LIMITS, type StoryboardModel } from '../../../../shared/storyboards';
import { supportedModel } from './prop-state';
import type { BoardProp } from './types';

/** Conservative authored model-only mesh ceilings, not measured GPU/RSS. Tested against real adapters
 * and the compiler's declarations so either side must deliberately update when a model changes. */
export const BOARD_MODEL_MESH_LIMITS: Record<StoryboardModel, number> = {
  lightbulb: 12,
  clapperboard: 20,
  laptop: 16,
  hourglass: 48,
  battery: 16,
  gears: 12,
  book: 48,
};

export function assertModelBudget(props: readonly BoardProp[]): void {
  if (
    props.length > STORYBOARD_LIMITS.maxProps ||
    props.reduce((sum, prop) => sum + BOARD_MODEL_MESH_LIMITS[supportedModel(prop)], 0) >
      STORYBOARD_LIMITS.maxModelMeshes
  ) {
    throw new Error('Storyboard exceeds cumulative model mesh budget');
  }
}
