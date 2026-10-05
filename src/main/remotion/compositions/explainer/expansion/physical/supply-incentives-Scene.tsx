import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { SupplyIncentivesDiagram } from './supply-incentives-Diagram';
import { SUPPLY_INCENTIVES_CAMERA, SupplyIncentivesModels } from './supply-incentives-models';
import { supplyIncentivesPose } from './supply-incentives-poses';
import type { ExpansionSupplyIncentivesScene } from './supply-incentives-types';

export function SupplyIncentivesView({
  scene,
}: {
  scene: ExpansionSupplyIncentivesScene;
}): ReactElement {
  const { t } = useSceneTime(),
    S = useStage(),
    pose = supplyIncentivesPose(scene, t);
  const persistentDiagramSurface = (
    <DiagramSurface>
      <SupplyIncentivesDiagram scene={scene} pose={pose} />
    </DiagramSurface>
  );
  if (scene.visualMode === 'diagram')
    return (
      <DiagramStage scene={scene}>
        <SupplyIncentivesDiagram scene={scene} pose={pose} />
      </DiagramStage>
    );
  return (
    <>
      <HybridStage
        scene={scene}
        camera={SUPPLY_INCENTIVES_CAMERA}
        diagram={null}
        model={
          <SupplyIncentivesModels
            scene={scene}
            pose={pose}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
      />
      {persistentDiagramSurface}
    </>
  );
}
