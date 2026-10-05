import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { DelayPhaseDiagram } from './delay-phase-Diagram';
import { DelayPhaseModels } from './delay-phase-models';
import type { ExpansionDelayPhaseScene } from './delay-phase-types';

/** Parent owns shared dispatch and source fixture registration. */
export function DelayPhaseView({ scene }: { scene: ExpansionDelayPhaseScene }): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const diagram = <DelayPhaseDiagram scene={scene} t={t} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        handoffBeat="action"
        model={
          <DelayPhaseModels
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
