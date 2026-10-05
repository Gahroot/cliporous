import type React from 'react';
import { ReasoningArgumentView } from './argument-Scene';
import { ReasoningInformationView } from './information-Scene';
import { ReasoningScopeView } from './scope-Scene';
import { ReasoningTraceView } from './trace-Scene';
import type { ExpansionReasoningScene } from './types';

/** Local authored pack dispatch. Global SceneBody registration waits for complete pack proof. */
export function ReasoningScene({
  scene,
}: {
  scene: ExpansionReasoningScene;
}): React.ReactElement<{ scene: ExpansionReasoningScene }> {
  switch (scene.storyId) {
    case '01':
    case '02':
      return <ReasoningTraceView scene={scene} />;
    case '03':
    case '04':
      return <ReasoningArgumentView scene={scene} />;
    case '05':
    case '06':
      return <ReasoningInformationView scene={scene} />;
    case '07':
    case '08':
      return <ReasoningScopeView scene={scene} />;
  }
}
