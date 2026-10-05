import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { HistoryTwinDiagram } from './history-twin-Diagram';
import { HistoryTwinModels } from './history-twin-models';
import type { ExpansionHistoryTwinScene } from './history-twin-types';

export function HistoryTwinView({ scene }: { scene: ExpansionHistoryTwinScene }): ReactElement {
  const { t } = useSceneTime(),
    S = useStage();
  const diagram = <HistoryTwinDiagram scene={scene} t={t} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        handoffBeat="response"
        model={
          <HistoryTwinModels
            scene={scene}
            t={t}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
        diagram={null}
      />
      <DiagramSurface>{diagram}</DiagramSurface>
    </>
  );
}
