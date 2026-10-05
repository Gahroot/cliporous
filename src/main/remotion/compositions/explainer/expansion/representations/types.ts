import type { ExpansionInformationLossScene } from './information-loss-types';
import type { ExpansionProjectionMatrixScene } from './projection-matrix-types';
import type { ExpansionUnitsEquivalenceScene } from './units-equivalence-types';
import type { ExpansionVectorFactorizationScene } from './vector-factorization-types';

export type ExpansionRepresentationsScene =
  | ExpansionUnitsEquivalenceScene
  | ExpansionInformationLossScene
  | ExpansionProjectionMatrixScene
  | ExpansionVectorFactorizationScene;
