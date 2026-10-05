import type React from 'react';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime } from '../../stage';
import { MarketsDiagramParts } from './MarketsDiagramParts';
import { MarketsModelParts } from './MarketsModelParts';
import type { MarketsScene } from './types';

export { MarketsDiagramParts } from './MarketsDiagramParts';
export { MarketsModelParts } from './MarketsModelParts';

/** Only the existing wrapper owns a stage; diagram-only OP-44 never mounts models. */
export function MarketsSceneView({ scene }: { scene: MarketsScene }): React.ReactElement {
  const { t } = useSceneTime();
  return (
    <HybridStage
      scene={scene}
      settledOutcome
      model={scene.visualMode === 'hybrid' ? <MarketsModelParts scene={scene} seconds={t} /> : null}
      diagram={<MarketsDiagramParts scene={scene} seconds={t} />}
    />
  );
}
