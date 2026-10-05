import type { ReactElement } from 'react';
import { ExploreEvidenceView } from './explore-evidence-Scene';
import { PriorityTreeView } from './priority-tree-Scene';
import { SearchLandscapeView } from './search-landscape-Scene';
import { SieveFrontierView } from './sieve-frontier-Scene';
import type { ExpansionDecisionsScene } from './types';

/** Local validated dispatch only. Production registration is ordered step28 work. */
export function DecisionsScene({
  scene,
}: {
  scene: ExpansionDecisionsScene;
}): ReactElement<{ scene: ExpansionDecisionsScene }> {
  switch (scene.storyId) {
    case '25':
    case '26':
      return <SieveFrontierView scene={scene} />;
    case '27':
    case '28':
      return <PriorityTreeView scene={scene} />;
    case '29':
    case '30':
      return <SearchLandscapeView scene={scene} />;
    case '31':
    case '32':
      return <ExploreEvidenceView scene={scene} />;
  }
}
