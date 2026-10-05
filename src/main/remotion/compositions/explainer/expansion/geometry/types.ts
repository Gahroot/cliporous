import type { ExpansionFitScaleScene } from './fit-scale-types';
import type { ExpansionRegionsDimensionsScene } from './regions-dimensions-types';
import type { ExpansionSectionUnfoldScene } from './section-unfold-types';
import type { ExpansionVisibilityAccessScene } from './visibility-access-types';

export type ExpansionGeometryScene =
  | ExpansionSectionUnfoldScene
  | ExpansionFitScaleScene
  | ExpansionVisibilityAccessScene
  | ExpansionRegionsDimensionsScene;
