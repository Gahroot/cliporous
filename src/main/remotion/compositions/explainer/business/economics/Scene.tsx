import type React from 'react';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime } from '../../stage';
import { EconomicsDiagramParts, EconomicsModelParts } from './parts';
import type { EconomicsScene } from './types';

export { EconomicsDiagramParts, EconomicsModelParts } from './parts';
export type { EconomicsScene } from './types';
/** Existing DiagramStory studio/palette/font route: diagram has zero canvases, hybrid has one. */
export function EconomicsSceneView({ scene }: { scene: EconomicsScene }): React.ReactElement {
  const { t } = useSceneTime();
  return (
    <HybridStage
      scene={scene}
      handoffBeat="response"
      settledOutcome
      diagram={<EconomicsDiagramParts scene={scene} seconds={t} />}
      model={
        scene.visualMode === 'hybrid' ? <EconomicsModelParts scene={scene} seconds={t} /> : null
      }
    />
  );
}
