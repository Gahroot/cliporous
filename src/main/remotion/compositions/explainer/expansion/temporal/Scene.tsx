import type { ReactElement } from 'react';
import { DelayPhaseView } from './delay-phase-Scene';
import { HistoryTwinView } from './history-twin-Scene';
import { LanesCriticalView } from './lanes-critical-Scene';
import { ReversibleExpiryView } from './reversible-expiry-Scene';
import type { ExpansionTemporalScene } from './types';

/** Local validated dispatch; production registration remains ordered step 28 work. */
export function TemporalScene({
  scene,
}: {
  scene: ExpansionTemporalScene;
}): ReactElement<{ scene: ExpansionTemporalScene }> {
  switch (scene.storyId) {
    case '41':
    case '42':
      return <LanesCriticalView scene={scene} />;
    case '43':
    case '44':
      return <ReversibleExpiryView scene={scene} />;
    case '45':
    case '46':
      return <DelayPhaseView scene={scene} />;
    case '47':
    case '48':
      return <HistoryTwinView scene={scene} />;
  }
}
