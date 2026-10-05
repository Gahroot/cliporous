import type { ExpansionEnergyFieldScene } from './energy-field-types';
import type { ExpansionInterferenceCycleScene } from './interference-cycle-types';
import type { ExpansionResourceDiffusionScene } from './resource-diffusion-types';
import type { ExpansionSupplyIncentivesScene } from './supply-incentives-types';

export type ExpansionPhysicalScene =
  | ExpansionSupplyIncentivesScene
  | ExpansionResourceDiffusionScene
  | ExpansionInterferenceCycleScene
  | ExpansionEnergyFieldScene;
