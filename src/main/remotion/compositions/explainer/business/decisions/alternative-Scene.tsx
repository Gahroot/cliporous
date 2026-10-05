import type React from 'react';
import type { PossibleFuturesScene } from '../../concepts/perspective/types';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime } from '../../stage';
import {
  BusinessAlternativeDiagramParts,
  BusinessAlternativeModelParts,
  BusinessAlternativeNativeLabelParts,
} from './alternative-parts';
import { sampleBusinessAlternative } from './alternative-poses';
import { businessAlternativeStory } from './alternative-presentation';
import type { BusinessAlternativesLens } from './alternative-types';

/** Additive opt-in view. HybridStage owns the only canvas; legacy meaning/clocks remain intact. */
export function BusinessAlternativeSceneView({
  scene,
  lens,
}: {
  scene: PossibleFuturesScene;
  lens: BusinessAlternativesLens;
}): React.ReactElement {
  const { t } = useSceneTime();
  const pose = sampleBusinessAlternative(scene, lens, t);
  const story = businessAlternativeStory(scene, lens);
  const props = { scene, lens, pose };
  return (
    <>
      <HybridStage
        scene={story}
        settledOutcome
        model={<BusinessAlternativeModelParts {...props} />}
        diagram={<BusinessAlternativeDiagramParts {...props} />}
      />
      {lens.visualMode === 'hybrid' && (
        <DiagramSurface opacity={pose.modelOpacity}>
          <BusinessAlternativeNativeLabelParts {...props} />
        </DiagramSurface>
      )}
    </>
  );
}
