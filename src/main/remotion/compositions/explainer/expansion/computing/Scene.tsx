import type { ReactElement } from 'react';
import { CacheStreamView } from './cache-stream-Scene';
import { GeneralizationDriftView } from './generalization-drift-Scene';
import { RetryProductView } from './retry-product-Scene';
import type { ExpansionComputingScene } from './types';
import { VersionsPermissionsView } from './versions-permissions-Scene';

/** Local validated dispatch; production registration remains ordered step 28 work. */
export function ComputingScene({
  scene,
}: {
  scene: ExpansionComputingScene;
}): ReactElement<{ scene: ExpansionComputingScene }> {
  switch (scene.storyId) {
    case '65':
    case '66':
      return <CacheStreamView scene={scene} />;
    case '67':
    case '68':
      return <RetryProductView scene={scene} />;
    case '69':
    case '70':
      return <VersionsPermissionsView scene={scene} />;
    case '71':
    case '72':
      return <GeneralizationDriftView scene={scene} />;
  }
}
