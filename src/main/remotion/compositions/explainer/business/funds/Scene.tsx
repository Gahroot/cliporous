import type React from 'react';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime } from '../../stage';
import { FundsDiagramParts, FundsModelParts } from './parts';
import { sampleFundsScene } from './poses';
import type { FundsScene } from './types';
export function FundsSceneView({ scene }: { scene: FundsScene }): React.ReactElement {
  const { t } = useSceneTime();
  const pose = sampleFundsScene(scene, t);
  return (
    <HybridStage
      scene={scene}
      settledOutcome
      model={<FundsModelParts scene={scene} pose={pose} />}
      diagram={<FundsDiagramParts scene={scene} pose={pose} />}
    />
  );
}
