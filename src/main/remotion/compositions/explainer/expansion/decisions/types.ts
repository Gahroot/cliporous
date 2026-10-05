import type { ExpansionExploreEvidenceScene } from './explore-evidence-types';
import type { ExpansionPriorityTreeScene } from './priority-tree-types';
import type { ExpansionSearchLandscapeScene } from './search-landscape-types';
import type { ExpansionSieveFrontierScene } from './sieve-frontier-types';

/** Local source semantics; production registration waits for actual views and render fixtures. */
export type ExpansionDecisionsScene =
  | ExpansionSieveFrontierScene
  | ExpansionPriorityTreeScene
  | ExpansionSearchLandscapeScene
  | ExpansionExploreEvidenceScene;
