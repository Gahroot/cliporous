import type { ExpansionApprovalDependencyScene } from './approval-dependency-types';
import type { ExpansionMatrixMatchingScene } from './matrix-matching-types';
import type { ExpansionSetsTopologyScene } from './sets-topology-types';
import type { ExpansionTaxonomyRightsScene } from './taxonomy-rights-types';

/** Local source semantics; real views and render fixtures precede runtime registration. */
export type ExpansionRelationshipsScene =
  | ExpansionTaxonomyRightsScene
  | ExpansionApprovalDependencyScene
  | ExpansionMatrixMatchingScene
  | ExpansionSetsTopologyScene;
