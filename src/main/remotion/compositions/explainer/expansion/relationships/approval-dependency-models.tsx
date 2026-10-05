import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import {
  ApprovalStationClay,
  RelationshipEntityClay,
  TypedRelationshipClay,
} from '../kits/relationships';
import type { ExpansionKitColors } from '../scene-types';
import {
  approvalDependencyLabel,
  approvalDependencyPose,
  approvalDependencyRole,
} from './approval-dependency-poses';
import type { ExpansionApprovalDependencyScene } from './approval-dependency-types';

/** Persistent semantic stations and explicit edges; quantities never size or move the assembly. */
export function ApprovalDependencyModels({
  scene,
  t,
  colors,
}: {
  scene: ExpansionApprovalDependencyScene;
  t: number;
  colors: ExpansionKitColors;
}): ReactElement {
  const pose = approvalDependencyPose(scene, t);
  const positions = new Map(
    scene.entities.map((e, i) => [
      e.id,
      (scene.storyId === '35'
        ? e.id === scene.ownerId
          ? [-1.7, 0.5, 0]
          : e.id === scene.approverId
            ? [1.7, 0.5, 0]
            : [0, 1.3, 0]
        : [(i % 4) * 1.5 - 2.25, 1 - Math.floor(i / 4) * 1.3, 0]) as readonly [
        number,
        number,
        number,
      ],
    ]),
  );
  const authorization =
    scene.storyId === '35' ? scene.records.find((r) => r.type === 'authorization') : undefined;
  const stationState = pose.response > 0 ? authorization?.state : undefined;
  const stationAuthorization =
    stationState === 'allowed'
      ? 'granted'
      : stationState === 'denied' || stationState === 'pending' || stationState === 'unknown'
        ? stationState
        : 'not-stated';
  const position = (id: string): [number, number, number] => {
    const p = positions.get(id);
    if (!p) throw new Error('Lost source endpoint');
    return [p[0], p[1], p[2]];
  };
  return (
    <group userData={{ template: scene.template, sourceOnly: true }}>
      {scene.entities.map((e) => {
        const role = approvalDependencyRole(scene, e.id);
        return (
          <RelationshipEntityClay
            key={e.id}
            entity={{
              id: e.id,
              label: e.label,
              role: role === 'owner' || role === 'approver' ? role : 'resource',
            }}
            colors={colors}
            state="retained"
            pose={pose}
            position={position(e.id)}
          />
        );
      })}
      {scene.storyId === '35' ? (
        <>
          <group
            userData={{
              authorizationId: authorization?.id,
              status: stationState ?? 'not-stated',
              condition:
                authorization && 'condition' in authorization ? authorization.condition : undefined,
            }}
          >
            <ApprovalStationClay
              id={authorization?.id ?? scene.roles[1].id}
              ownerLabel={approvalDependencyLabel(scene, scene.ownerId)}
              approverLabel={approvalDependencyLabel(scene, scene.approverId)}
              authorization={stationAuthorization}
              colors={colors}
              state={
                stationState === 'disputed'
                  ? 'disputed'
                  : stationState === 'conditional' ||
                      stationState === 'missing' ||
                      stationState === 'unknown'
                    ? 'unknown'
                    : stationState === 'allowed'
                      ? 'active'
                      : 'retained'
              }
              pose={{ ...pose, check: pose.response }}
              position={[0, -1, 0]}
            />
          </group>
          {scene.records.map((r, i) => (
            <group
              key={r.id}
              position={[0, -0.15 - i * 0.08, -0.2]}
              userData={{
                recordId: r.id,
                type: r.type,
                status: r.state,
                actorId: r.actorId,
                targetId: r.targetId,
                itemId: r.itemId,
                condition: 'condition' in r ? r.condition : undefined,
              }}
            >
              <ClayBlock
                size={[
                  Math.abs(position(r.targetId)[0] - position(r.actorId)[0]),
                  r.type === 'authorization' ? 0.12 : 0.04,
                  0.04,
                ]}
                color={r.type === 'authorization' ? colors.accent : colors.muted}
                opacity={
                  r.type === 'authorization'
                    ? pose.response
                    : r.type === 'handoff'
                      ? pose.check
                      : pose.action
                }
              />
              <mesh
                position={[position(r.targetId)[0], 0, 0]}
                rotation={[
                  0,
                  0,
                  position(r.targetId)[0] > position(r.actorId)[0] ? -Math.PI / 2 : Math.PI / 2,
                ]}
              >
                <coneGeometry args={[0.07, 0.14, 10]} />
                <Clay
                  color={colors.text}
                  opacity={
                    r.type === 'authorization'
                      ? pose.response
                      : r.type === 'handoff'
                        ? pose.check
                        : pose.action
                  }
                />
              </mesh>
            </group>
          ))}
        </>
      ) : (
        scene.relations.map((r) => (
          <group
            key={r.id}
            userData={{
              relationId: r.id,
              type: r.type,
              status: r.state,
              fromId: r.fromId,
              toId: r.toId,
              condition: 'condition' in r ? r.condition : undefined,
            }}
          >
            {r.type === 'dependency' || r.type === 'transfer' ? (
              <TypedRelationshipClay
                id={r.id}
                role={r.type}
                position={[0, 0, 0]}
                from={position(r.fromId)}
                to={position(r.toId)}
                colors={colors}
                state={
                  r.state === 'known' ? 'retained' : r.state === 'disputed' ? 'disputed' : 'unknown'
                }
                pose={pose}
              />
            ) : (
              <>
                <ClayBlock
                  size={[
                    Math.hypot(...position(r.toId).map((v, i) => v - position(r.fromId)[i])),
                    r.type === 'order' ? 0.04 : 0.08,
                    0.04,
                  ]}
                  position={
                    position(r.fromId).map((v, i) => (v + position(r.toId)[i]) / 2) as [
                      number,
                      number,
                      number,
                    ]
                  }
                  rotation={[
                    0,
                    0,
                    Math.atan2(
                      position(r.toId)[1] - position(r.fromId)[1],
                      position(r.toId)[0] - position(r.fromId)[0],
                    ),
                  ]}
                  color={r.type === 'order' ? colors.muted : colors.accent}
                  opacity={pose.action}
                />
                <mesh
                  position={position(r.toId)}
                  rotation={[
                    0,
                    0,
                    Math.atan2(
                      position(r.toId)[1] - position(r.fromId)[1],
                      position(r.toId)[0] - position(r.fromId)[0],
                    ) -
                      Math.PI / 2,
                  ]}
                >
                  <coneGeometry args={[0.07, 0.14, 10]} />
                  <Clay color={colors.text} opacity={pose.action} />
                </mesh>
              </>
            )}
          </group>
        ))
      )}
    </group>
  );
}
