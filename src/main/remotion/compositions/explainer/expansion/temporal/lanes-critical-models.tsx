import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { TemporalTaskClay } from '../kits/temporal';
import type { ExpansionKitColors } from '../scene-types';
import { lanesCriticalPose } from './lanes-critical-poses';
import type { ExpansionLanesCriticalScene } from './lanes-critical-types';

/** Schematic work stations, never a second factual time axis. Precision stays planar. */
export function LanesCriticalModels({
  scene,
  t,
  colors,
}: {
  scene: ExpansionLanesCriticalScene;
  t: number;
  colors: ExpansionKitColors;
}): ReactElement {
  const pose = lanesCriticalPose(scene, t);
  const y = (id: string): number => {
    const index = scene.tasks.findIndex((task) => task.id === id);
    if (index < 0) throw new Error('Missing retained task');
    return 1.5 - index * 0.5;
  };
  return (
    <group userData={{ template: scene.template, schematic: true }}>
      {scene.tasks.map((task, i) => (
        <TemporalTaskClay
          key={task.id}
          interval={{
            id: task.id,
            label: `Task ${i + 1}`,
            kind: 'qualitative',
            qualifier: 'Identity, not a time interval',
          }}
          domain={[
            { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 1 },
          ]}
          position={[0.6, y(task.id), 0]}
          pose={pose}
          state="retained"
          colors={colors}
        />
      ))}
      {scene.relations.map((r, i) => {
        const from = y(r.fromId),
          to = y(r.toId),
          x = -0.8 - i * 0.045;
        const critical = scene.storyId === '42' && scene.result.criticalRelationIds.includes(r.id);
        const color = critical ? colors.accent : colors.muted;
        return (
          <group
            key={r.id}
            userData={{
              relationId: r.id,
              type: r.type,
              state: r.state,
              fromId: r.fromId,
              toId: r.toId,
            }}
          >
            <ClayBlock
              size={[0.04, Math.abs(to - from), 0.04]}
              position={[x, (from + to) / 2, 0]}
              color={color}
              opacity={pose.action}
            />
            <ClayBlock
              size={[0.4 - x, 0.04, 0.04]}
              position={[(x + 0.4) / 2, from, 0]}
              color={color}
              opacity={pose.action}
            />
            <ClayBlock
              size={[0.4 - x, 0.04, 0.04]}
              position={[(x + 0.4) / 2, to, 0]}
              color={color}
              opacity={pose.response}
            />
          </group>
        );
      })}
    </group>
  );
}
