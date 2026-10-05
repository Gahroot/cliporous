import type { ExpansionComputingScene } from './computing/types';
import type { ExpansionDecisionsScene } from './decisions/types';
import type { ExpansionGeometryScene } from './geometry/types';
import type { ExpansionPhysicalScene } from './physical/types';
import type { ExpansionProbabilityScene } from './probability/types';
import type { ExpansionQuantitiesScene } from './quantities/types';
import type { ExpansionReasoningScene } from './reasoning/types';
import type { ExpansionRelationshipsScene } from './relationships/types';
import type { ExpansionRepresentationsScene } from './representations/types';
import type { ExpansionTemporalScene } from './temporal/types';

/** All complete, source-validated animation-library stories. */
export type ExpansionScene =
  | ExpansionReasoningScene
  | ExpansionProbabilityScene
  | ExpansionQuantitiesScene
  | ExpansionDecisionsScene
  | ExpansionRelationshipsScene
  | ExpansionTemporalScene
  | ExpansionRepresentationsScene
  | ExpansionGeometryScene
  | ExpansionComputingScene
  | ExpansionPhysicalScene;
