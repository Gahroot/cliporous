import type { ReactElement } from 'react';
import { FitScaleView } from './fit-scale-Scene';
import { RegionsDimensionsView } from './regions-dimensions-Scene';
import { SectionUnfoldView } from './section-unfold-Scene';
import type { ExpansionGeometryScene } from './types';
import { VisibilityAccessView } from './visibility-access-Scene';

/** Local validated dispatch; production registration remains ordered step 28 work. */
export function GeometryScene({
  scene,
}: {
  scene: ExpansionGeometryScene;
}): ReactElement<{ scene: ExpansionGeometryScene }> {
  switch (scene.storyId) {
    case '57':
    case '58':
      return <SectionUnfoldView scene={scene} />;
    case '59':
    case '60':
      return <FitScaleView scene={scene} />;
    case '61':
    case '62':
      return <VisibilityAccessView scene={scene} />;
    case '63':
    case '64':
      return <RegionsDimensionsView scene={scene} />;
  }
}
