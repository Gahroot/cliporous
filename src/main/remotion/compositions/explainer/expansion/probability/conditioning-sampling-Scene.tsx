import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { diagramPose } from '../../diagrams/motion';
import { useSceneTime, useStage, useWideStage } from '../../stage';
import {
  ConditioningSamplingDiagram,
  ConditioningSamplingFacts,
} from './conditioning-sampling-Diagram';
import { ConditioningSamplingModels } from './conditioning-sampling-models';
import { conditioningSamplingPose } from './conditioning-sampling-poses';
import type { ExpansionConditioningSamplingScene } from './conditioning-sampling-types';

export function ConditioningSamplingView({
  scene,
}: {
  scene: ExpansionConditioningSamplingScene;
}): ReactElement {
  const stage = useStage();
  const wide = useWideStage();
  const viewport = wide
    ? {
        width: wide.model.width,
        height: wide.model.height,
        surface: { x: 0, y: 0, width: wide.model.width, height: wide.model.height },
      }
    : undefined;
  const { t } = useSceneTime();
  const props = {
    scene,
    t,
    pose: conditioningSamplingPose(t, scene),
    colors: { surface: stage.card, text: stage.text, accent: stage.accent, muted: stage.muted },
  };
  const diagram = <ConditioningSamplingDiagram {...props} />;
  const facts = <ConditioningSamplingFacts {...props} />;
  if (scene.visualMode === 'diagram')
    return (
      <DiagramStage scene={scene}>
        {diagram}
        {facts}
      </DiagramStage>
    );
  return (
    <>
      <HybridStage
        scene={scene}
        model={
          <ConditioningSamplingModels
            {...props}
            viewport={viewport}
            turn={diagramPose(t, scene).modelTurn}
          />
        }
        diagram={diagram}
      />
      <DiagramSurface>{facts}</DiagramSurface>
    </>
  );
}
