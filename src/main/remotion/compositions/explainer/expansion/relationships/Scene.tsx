import type { ReactElement } from 'react';
import { ApprovalDependencyView } from './approval-dependency-Scene';
import { MatrixMatchingView } from './matrix-matching-Scene';
import { SetsTopologyView } from './sets-topology-Scene';
import { TaxonomyRightsView } from './taxonomy-rights-Scene';
import type { ExpansionRelationshipsScene } from './types';

/** Local validated dispatch; production registration remains ordered step28 work. */
export function RelationshipsScene({
  scene,
}: {
  scene: ExpansionRelationshipsScene;
}): ReactElement<{ scene: ExpansionRelationshipsScene }> {
  switch (scene.storyId) {
    case '33':
    case '34':
      return <TaxonomyRightsView scene={scene} />;
    case '35':
    case '36':
      return <ApprovalDependencyView scene={scene} />;
    case '37':
    case '38':
      return <MatrixMatchingView scene={scene} />;
    case '39':
    case '40':
      return <SetsTopologyView scene={scene} />;
  }
}
