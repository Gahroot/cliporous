import type { ExpansionCacheStreamScene } from './cache-stream-types';
import type { ExpansionGeneralizationDriftScene } from './generalization-drift-types';
import type { ExpansionRetryProductScene } from './retry-product-types';
import type { ExpansionVersionsPermissionsScene } from './versions-permissions-types';

export type ExpansionComputingScene =
  | ExpansionCacheStreamScene
  | ExpansionRetryProductScene
  | ExpansionVersionsPermissionsScene
  | ExpansionGeneralizationDriftScene;
