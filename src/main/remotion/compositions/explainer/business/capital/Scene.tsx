import type React from 'react';
import { DiagramStage } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime } from '../../stage';
import { CapitalDiagramParts, CapitalModelParts } from './parts';
import type { CapitalScene } from './types';

/** Original source object and resolve beat go straight to the established stage chrome. */
export function CapitalSceneView({ scene }: { scene: CapitalScene }): React.ReactElement {
  const { t } = useSceneTime();
  const diagram = <CapitalDiagramParts scene={scene} seconds={t} />;
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
      model={<CapitalModelParts scene={scene} seconds={t} />}
      diagram={diagram}
    />
  );
}
