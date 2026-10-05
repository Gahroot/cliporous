import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { InterferenceCycleDiagram } from './interference-cycle-Diagram';
import { INTERFERENCE_CYCLE_CAMERA, InterferenceCycleModels } from './interference-cycle-models';
import type { ExpansionInterferenceCycleScene } from './interference-cycle-types';

export function InterferenceCycleView({
  scene,
}: {
  scene: ExpansionInterferenceCycleScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const diagram = <InterferenceCycleDiagram scene={scene} t={t} />;
  // Exact conditions live on source pages, at 22px, including every continuation.
  // Shared landscape Chrome otherwise shrinks maximum conditions below the essential minimum.
  const chromeScene = { ...scene, condition: undefined };
  if (scene.visualMode === 'diagram')
    return <DiagramStage scene={chromeScene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        camera={INTERFERENCE_CYCLE_CAMERA}
        scene={chromeScene}
        handoffBeat="action"
        model={
          <InterferenceCycleModels
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
