import type { ExpansionDelayPhaseScene } from './delay-phase-types';
import type { ExpansionHistoryTwinScene } from './history-twin-types';
import type { ExpansionLanesCriticalScene } from './lanes-critical-types';
import type { ExpansionReversibleExpiryScene } from './reversible-expiry-types';

/** Local source semantics; actual views and render fixtures precede runtime registration. */
export type ExpansionTemporalScene =
  | ExpansionLanesCriticalScene
  | ExpansionReversibleExpiryScene
  | ExpansionDelayPhaseScene
  | ExpansionHistoryTwinScene;
