import type { ReactElement } from 'react';
import { useStage } from '../../stage';
import { type ArgumentPose, argumentLines, argumentTextRuns } from './argument-poses';
import type { ExpansionReasoningArgumentScene } from './argument-types';

/** Persistent typed tree above a deterministic quotation lens; comparison effects stay together. */
export function ArgumentDiagram({
  scene,
  pose,
}: {
  scene: ExpansionReasoningArgumentScene;
  pose: ArgumentPose;
}): ReactElement {
  const S = useStage();
  return (
    <g data-story-id={scene.storyId}>
      <title>Source argumentation, not proof or a ranked outcome</title>
      {pose.stations.map((station) => {
        const edge =
          scene.kind === 'argument-map'
            ? scene.edges.find((entry) => entry.fromId === station.id)
            : undefined;
        return (
          <g
            key={station.id}
            opacity={station.reveal}
            data-entity-id={station.id}
            data-actor-id={station.actorId}
            data-from-id={edge?.fromId}
            data-to-id={edge?.toId}
            data-edge-role={edge?.role}
            data-edge-state={edge?.state}
            data-qualifier={edge?.qualifier}
          >
            <rect
              x={station.x}
              y={scene.kind === 'argument-map' ? station.y : 4}
              width={444}
              height={scene.kind === 'argument-map' ? 108 : 470}
              rx={8}
              fill={S.cardRaised}
              stroke={S.cardBorder}
              strokeWidth={2}
            />
          </g>
        );
      })}
      {scene.kind === 'argument-map' && (
        <rect
          data-argument-lens={pose.stations[pose.detailIndex].id}
          x={16}
          y={242}
          width={920}
          height={232}
          rx={8}
          fill={S.cardRaised}
          stroke={S.accent}
          strokeWidth={2}
        />
      )}
      {scene.kind === 'argument-map' &&
        scene.edges.map((edge, index) => {
          const from = pose.stations.find((station) => station.id === edge.fromId);
          const to = pose.stations.find((station) => station.id === edge.toId);
          if (!from || !to) return null;
          const x = 470 + index * 2;
          const targetX = to.x === 16 ? to.x + 444 : to.x;
          const sourceX = from.x === 16 ? from.x + 444 : from.x;
          return (
            <g
              key={edge.fromId}
              data-link-from={edge.fromId}
              data-link-to={edge.toId}
              data-role={edge.role}
              data-state={edge.state}
              opacity={from.reveal}
            >
              <path
                d={`M${sourceX} ${from.y + 54}H${x}V${to.y + 54}H${targetX}`}
                stroke={S.text}
                strokeWidth={2}
                fill="none"
                strokeDasharray={edge.state === 'stated' ? undefined : '4 4'}
              />
              <path
                d={
                  to.x === 16
                    ? `M${targetX + 6} ${to.y + 48}l-6 6 6 6`
                    : `M${targetX - 6} ${to.y + 48}l6 6-6 6`
                }
                stroke={S.text}
                strokeWidth={2}
                fill="none"
              />
            </g>
          );
        })}
      {argumentTextRuns(scene, pose).map((run) => (
        <text
          key={run.id}
          data-source-run={run.id}
          data-source-text={run.text}
          x={run.x}
          y={run.y}
          opacity={run.opacity}
          fill={S.text}
          fontFamily={S.font}
          fontSize={run.size}
          xmlSpace="preserve"
        >
          {argumentLines(run.text, run.columns).map((line, index) => (
            <tspan key={`${run.id}-${index}`} x={run.x} dy={index === 0 ? 0 : run.size * 1.2}>
              {line}
            </tspan>
          ))}
        </text>
      ))}
    </g>
  );
}
