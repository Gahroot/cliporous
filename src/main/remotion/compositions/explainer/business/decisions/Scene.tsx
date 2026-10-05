import type React from 'react';
import { DiagramStage } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { DecisionsDiagram, DecisionsNativeParts } from './parts';
import type { DecisionsScene } from './types';
export function DecisionsSceneView({ scene }: { scene: DecisionsScene }): React.ReactElement {
  const diagram = <DecisionsDiagram scene={scene} />;
  if (scene.visualMode === 'diagram')
    return (
      <DiagramStage scene={scene} settledOutcome>
        {diagram}
      </DiagramStage>
    );
  return (
    <HybridStage
      scene={scene}
      settledOutcome
      model={<DecisionsNativeParts scene={scene} />}
      diagram={diagram}
    />
  );
}
