import type { ReactElement } from 'react';
import { DenominatorPartitionView } from './denominator-partition-Scene';
import { DeviationMultiplesView } from './deviation-multiples-Scene';
import { DistributionView } from './distribution-Scene';
import { RankingCalendarView } from './ranking-calendar-Scene';
import type { ExpansionQuantitiesScene } from './types';

/** Validated local pack dispatch. Production registration remains step28 work. */
export function QuantitiesScene({
  scene,
}: {
  scene: ExpansionQuantitiesScene;
}): ReactElement<{ scene: ExpansionQuantitiesScene }> {
  switch (scene.storyId) {
    case '17':
    case '18':
      return <DistributionView scene={scene} />;
    case '19':
    case '20':
      return <DenominatorPartitionView scene={scene} />;
    case '21':
    case '22':
      return <RankingCalendarView scene={scene} />;
    case '23':
    case '24':
      return <DeviationMultiplesView scene={scene} />;
  }
}
