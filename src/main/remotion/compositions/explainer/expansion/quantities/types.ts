import type { ExpansionDenominatorPartitionScene } from './denominator-partition-types';
import type { ExpansionDeviationMultiplesScene } from './deviation-multiples-types';
import type { ExpansionDistributionScene } from './distribution-types';
import type { ExpansionRankingCalendarScene } from './ranking-calendar-types';

/** Local source semantics; production registration waits for actual views and render fixtures. */
export type ExpansionQuantitiesScene =
  | ExpansionDistributionScene
  | ExpansionDenominatorPartitionScene
  | ExpansionRankingCalendarScene
  | ExpansionDeviationMultiplesScene;
