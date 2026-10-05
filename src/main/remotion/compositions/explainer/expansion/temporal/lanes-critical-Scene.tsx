import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { LanesCriticalDiagram } from './lanes-critical-Diagram';
import { LanesCriticalModels } from './lanes-critical-models';
import type { ExpansionLanesCriticalScene } from './lanes-critical-types';

/** Parent owns dispatch. All source facts remain on the same persistent planar surface. */
export function LanesCriticalView({ scene }: { scene: ExpansionLanesCriticalScene }): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const diagram = <LanesCriticalDiagram scene={scene} t={t} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        handoffBeat="response"
        model={
          <LanesCriticalModels
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
