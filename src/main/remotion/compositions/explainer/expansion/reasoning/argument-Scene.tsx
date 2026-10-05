import type { ReactElement } from 'react';
import { HybridStage } from '../../diagrams/HybridStage';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { longformTextRegions } from '../../longform-stage-layout';
import { StageSpace, useSceneTime, useStage, useWideStage } from '../../stage';
import { ArgumentDiagram } from './argument-Diagram';
import { ArgumentModels } from './argument-models';
import { argumentModelAnchor, argumentPose } from './argument-poses';
import type { ExpansionReasoningArgumentScene } from './argument-types';

export function ReasoningArgumentView({
  scene,
}: {
  scene: ExpansionReasoningArgumentScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = argumentPose(scene, t);
  const wide = useWideStage();
  const condition = wide ? longformTextRegions(wide).condition : DIAGRAM_REGIONS.condition;
  const handoff = diagramPose(t, scene, 'action');
  return (
    <>
      <HybridStage
        scene={scene}
        handoffBeat="action"
        model={
          <ArgumentModels
            scene={scene}
            pose={pose}
            colors={{
              surface: S.cardRaised,
              text: S.text,
              accent: S.accent,
              muted: S.cardBorder,
            }}
          />
        }
        diagram={<ArgumentDiagram scene={scene} pose={pose} />}
      />
      <StageSpace>
        {scene.condition && (
          <div
            data-argument-condition={scene.condition}
            data-authored-condition-highlight={pose.conditionHighlight}
            style={{
              position: 'absolute',
              left: condition.x,
              top: condition.y,
              width: condition.width,
              height: condition.height,
              borderRadius: 10,
              outline: `3px solid ${S.accent}`,
              opacity: pose.conditionHighlight,
              pointerEvents: 'none',
            }}
          />
        )}
        {scene.visualMode === 'hybrid' &&
          pose.stations.map((station, index) => {
            const anchor = argumentModelAnchor(scene, t, index, wide?.model);
            return (
              <div
                key={station.id}
                data-model-anchor-id={station.id}
                data-anchor-x={anchor.x}
                data-anchor-y={anchor.y}
                style={{
                  position: 'absolute',
                  left: anchor.x,
                  top: anchor.y,
                  transform: 'translate(-50%, -50%)',
                  color: S.text,
                  fontFamily: S.font,
                  fontSize: 20,
                  opacity: handoff.modelOpacity * handoff.setup * station.reveal,
                  background: S.cardRaised,
                  padding: '3px 8px',
                  borderRadius: 6,
                }}
              >
                {station.id}
              </div>
            );
          })}
      </StageSpace>
    </>
  );
}
