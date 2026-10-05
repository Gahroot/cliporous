import type { ReactElement } from 'react';
import { InformationLossView } from './information-loss-Scene';
import { ProjectionMatrixView } from './projection-matrix-Scene';
import type { ExpansionRepresentationsScene } from './types';
import { UnitsEquivalenceView } from './units-equivalence-Scene';
import { VectorFactorizationView } from './vector-factorization-Scene';

/** Local validated dispatch; production registration remains ordered step 28 work. */
export function RepresentationsScene({
  scene,
}: {
  scene: ExpansionRepresentationsScene;
}): ReactElement<{ scene: ExpansionRepresentationsScene }> {
  switch (scene.storyId) {
    case '49':
    case '50':
      return <UnitsEquivalenceView scene={scene} />;
    case '51':
    case '52':
      return <InformationLossView scene={scene} />;
    case '53':
    case '54':
      return <ProjectionMatrixView scene={scene} />;
    case '55':
    case '56':
      return <VectorFactorizationView scene={scene} />;
  }
}
