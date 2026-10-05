import { STORYBOARD_LIMITS, type StoryboardModel } from '../../../../shared/storyboards';
import { businessPanelResources } from './business-panel-state';
import type { BoardBusinessPanel } from './business-types';
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

export function assertModelBudget(
  props: readonly BoardProp[],
  businessPanels: readonly BoardBusinessPanel[] = [],
): void {
  const native = businessPanels.map((panel) => businessPanelResources(panel).ceiling);
  if (
    props.length + native.reduce((sum, resource) => sum + resource.modelInstances, 0) >
      STORYBOARD_LIMITS.maxProps ||
    props.reduce((sum, prop) => sum + BOARD_MODEL_MESH_LIMITS[supportedModel(prop)], 0) +
      native.reduce((sum, resource) => sum + resource.meshes, 0) >
      STORYBOARD_LIMITS.maxModelMeshes
  ) {
    throw new Error('Storyboard exceeds cumulative model mesh budget');
  }
}
