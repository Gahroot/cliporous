import type React from 'react';
import { ModelHousing } from '../cognition/models';
import { HybridStage } from '../diagrams/HybridStage';
import { reveal } from '../diagrams/motion';
import { DiagramText, MetricRail } from '../diagrams/primitives';
import { useSceneTime } from '../stage';
import { comparisonMetricReveal } from './poses';
import type { InferenceTradeoffScene as Scene } from './types';

export function InferenceTradeoffScene({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useSceneTime();
  const column = 952 / scene.models.length;
  return (
    <HybridStage
      scene={scene}
      handoffBeat="action"
      model={
        <>
          {scene.models.map((model, i) => (
            <group
              key={model.id}
              position={[(i - (scene.models.length - 1) / 2) * 2.25, 0, 0]}
              scale={0.88}
            >
              <ModelHousing />
            </group>
          ))}
        </>
      }
      diagram={
        <>
          {scene.models.map((model, i) => (
            <g key={model.id} data-entity-id={model.id}>
              <DiagramText
                x={column * (i + 0.5)}
                y={18}
                size={scene.constraint ? 26 : 28}
                columns={10}
                strong
              >
                {model.label}
              </DiagramText>
              {scene.metrics.map((metric, j) => {
                const measurement = metric.values.find((v) => v.modelId === model.id)
                  ?.measurement ?? { state: 'unknown' as const };
                const maximum =
                  metric.kind === 'score'
                    ? 100
                    : Math.max(
                        ...metric.values.map((v) =>
                          v.measurement.state === 'measured' ? v.measurement.value : 0,
                        ),
                      );
                return (
                  <g key={metric.kind} opacity={comparisonMetricReveal(t, scene, metric.kind)}>
                    <MetricRail
                      x={column * i + 20}
                      y={(scene.constraint ? 116 : 125) + j * 98}
                      width={column - 56}
                      compact
                      metric={measurement}
                      maximum={maximum}
                      label={
                        metric.kind === 'score'
                          ? 'Task score ↑'
                          : metric.kind === 'cost'
                            ? 'Cost ↓'
                            : 'Latency ↓'
                      }
                    />
                  </g>
                );
              })}
            </g>
          ))}
          <DiagramText
            x={476}
            y={scene.constraint ? 416 : 434}
            size={scene.constraint ? 21 : 26}
            columns={48}
          >{`${scene.task} · ${scene.basis}`}</DiagramText>
          {scene.constraint && (
            <g opacity={reveal(t, scene.checkAt, 0.45)}>
              <DiagramText x={476} y={470} size={22} columns={48} strong>
                {`${scene.constraint.metric === 'cost' ? 'Cost' : 'Latency'} limit: ${scene.constraint.maximum} ${scene.constraint.unit}`}
              </DiagramText>
            </g>
          )}
        </>
      }
    />
  );
}
