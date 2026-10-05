import type { ReactElement } from 'react';
import { EnergyFieldView } from './energy-field-Scene';
import { InterferenceCycleView } from './interference-cycle-Scene';
import { ResourceDiffusionView } from './resource-diffusion-Scene';
import { SupplyIncentivesView } from './supply-incentives-Scene';
import type { ExpansionPhysicalScene } from './types';

/** Local validated dispatch; production registration remains ordered step 28 work. */
export function PhysicalScene({
  scene,
}: {
  scene: ExpansionPhysicalScene;
}): ReactElement<{ scene: ExpansionPhysicalScene }> {
  switch (scene.storyId) {
    case '73':
    case '74':
      return <SupplyIncentivesView scene={scene} />;
    case '75':
    case '76':
      return <ResourceDiffusionView scene={scene} />;
    case '77':
    case '78':
      return <InterferenceCycleView scene={scene} />;
    case '79':
    case '80':
      return <EnergyFieldView scene={scene} />;
  }
}
