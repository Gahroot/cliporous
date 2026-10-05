import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { TemporalStateBadgeClay } from '../kits/temporal';
import type { ExpansionKitColors } from '../scene-types';
import { historyTwinLabel, historyTwinPose } from './history-twin-poses';
import type { ExpansionHistoryTwinScene } from './history-twin-types';

/** Authored state board or same-subject pair. Source values never move an actor or run a switch. */
export function HistoryTwinModels({
  scene,
  t,
  colors,
}: {
  scene: ExpansionHistoryTwinScene;
  t: number;
  colors: ExpansionKitColors;
}): ReactElement {
  const pose = historyTwinPose(scene, t),
    ids = scene.storyId === '47' ? scene.stateIds : scene.viewIds;
  return (
    <group userData={{ template: scene.template, actorId: scene.actorId, sourceOnly: true }}>
      {ids.map((id, i) => (
        <TemporalStateBadgeClay
          key={id}
          id={id}
          label={historyTwinLabel(scene, id)}
          history="not-stated"
          state="retained"
          colors={colors}
          pose={pose}
          position={[i * 3 - 1.5, 0.5, 0]}
        />
      ))}
      {scene.storyId === '47' ? (
        <>
          {scene.rules.map((r, i) => (
            <group
              key={r.id}
              userData={{
                ruleId: r.id,
                role: r.role,
                fromId: r.fromId,
                toId: r.toId,
                condition: r.condition,
                thresholdId: r.thresholdId,
                state: r.state,
              }}
            >
              <ClayBlock
                size={[2, 0.04, 0.04]}
                position={[0, 0.1 - i * 0.22, 0]}
                color={colors.muted}
                opacity={i === 0 ? pose.action : pose.response}
              />
              <ClayBlock
                size={[0.16, 0.16, 0.04]}
                position={[i === 0 ? 1 : -1, 0.1 - i * 0.22, 0]}
                rotation={[0, 0, Math.PI / 4]}
                color={colors.accent}
              />
            </group>
          ))}
          {scene.history.map((h, i) => (
            <group
              key={h.id}
              userData={{
                historyId: h.id,
                dataTime: h.dataTime,
                status: h.state,
                valueId: 'valueId' in h ? h.valueId : undefined,
              }}
            >
              <TemporalStateBadgeClay
                id={h.id}
                label={historyTwinLabel(scene, scene.actorId)}
                history="retained"
                state={
                  h.state === 'unknown' || h.state === 'missing'
                    ? 'unknown'
                    : h.state === 'disputed'
                      ? 'disputed'
                      : 'retained'
                }
                colors={colors}
                pose={pose}
                scale={0.5}
                position={[(i % 4) * 0.85 - 1.3, -0.65 - Math.floor(i / 4) * 0.4, 0]}
              />
            </group>
          ))}
        </>
      ) : (
        <>
          {scene.snapshots.map((s, i) => (
            <group
              key={s.id}
              userData={{
                snapshotId: s.id,
                actorId: s.actorId,
                viewId: s.viewId,
                dataTime: s.dataTime,
                controls: s.controls,
                condition: s.condition,
                state: s.state,
              }}
            >
              <ClayBlock
                size={[0.12, 0.7, 0.12]}
                position={[i * 3 - 1.5, -0.1, 0]}
                color={colors.muted}
              />
            </group>
          ))}
          <ClayBlock
            size={[3, 0.08, 0.12]}
            position={[0, -0.45, 0]}
            color={colors.accent}
            opacity={pose.check}
          />
          <TemporalStateBadgeClay
            id={scene.actorId}
            label={historyTwinLabel(scene, scene.actorId)}
            history="not-stated"
            state="retained"
            colors={colors}
            pose={pose}
            position={[0, -1, 0]}
          />
        </>
      )}
    </group>
  );
}
