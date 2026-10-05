import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { ConstraintCandidateClay } from '../kits/constraints';
import type { ExpansionKitColors } from '../scene-types';
import { searchLabel, searchPose } from './search-landscape-poses';
import type { ExpansionSearchLandscapeScene } from './search-landscape-types';

/** Authored teaching assembly. No numeric value controls perspective geometry. */
export function SearchLandscapeModels({
  scene,
  t,
  colors,
}: {
  scene: ExpansionSearchLandscapeScene;
  t: number;
  colors: ExpansionKitColors;
}): ReactElement {
  const pose = searchPose(scene, t);
  if (scene.storyId === '30')
    return (
      <group userData={{ template: 'two-well' }}>
        <ClayBlock
          size={[5.2, 0.12, 2.2]}
          position={[0, -0.9, 0]}
          color={colors.surface}
          opacity={pose.reveal}
        />
        {scene.wells.map((w, i) => (
          <group
            key={w.id}
            position={[i === 0 ? -1.4 : 1.4, w.role === 'global' ? -0.2 : 0, 0]}
            userData={{ wellId: w.id, entityId: w.entityId, role: w.role }}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.7, 0.16, 12, 32]} />
              <Clay
                color={w.role === 'unresolved' ? colors.muted : colors.accent}
                opacity={pose.reveal}
              />
            </mesh>
            <mesh position={[0, -0.38, 0]}>
              <cylinderGeometry args={[0.52, 0.52, 0.1, 32]} />
              <Clay color={colors.surface} opacity={pose.reveal} />
            </mesh>
          </group>
        ))}
        {scene.branch.status === 'supplied' && (
          <ClayBlock
            size={[1.4, 0.06, 0.12]}
            position={[0, 0.05, 0]}
            color={colors.accent}
            opacity={pose.check}
          />
        )}
      </group>
    );
  const positions = {
    start: [-2.4, 0, 0],
    upper: [0, 1.1, 0],
    lower: [0, -1.1, 0],
    goal: [2.4, 0, 0],
  } as const;
  return (
    <group userData={{ template: 'grid-route' }}>
      {scene.links.map((l) => {
        const from = scene.nodes.find((n) => n.id === l.fromId),
          to = scene.nodes.find((n) => n.id === l.toId);
        if (!from || !to) throw new Error('Lost authored endpoints');
        const a = positions[from.slot],
          b = positions[to.slot];
        const onRoute = scene.route.nodeIds.some(
          (id, i, ids) => id === l.fromId && ids[i + 1] === l.toId,
        );
        return (
          <group
            key={`${l.fromId}/${l.toId}`}
            userData={{ fromId: l.fromId, toId: l.toId, status: l.status }}
          >
            <ClayBlock
              size={[Math.hypot(b[0] - a[0], b[1] - a[1]), 0.06, 0.08]}
              position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -0.16]}
              rotation={[0, 0, Math.atan2(b[1] - a[1], b[0] - a[0])]}
              color={onRoute ? colors.accent : colors.muted}
              opacity={pose.action}
            />
          </group>
        );
      })}
      {scene.nodes.map((n) => (
        <group
          key={n.id}
          userData={{
            nodeId: n.id,
            entityId: n.entityId,
            status: n.status,
            frontier: scene.frontier.nodeIds.includes(n.id),
          }}
        >
          <ConstraintCandidateClay
            id={n.id}
            label={searchLabel(scene, n.entityId)}
            position={positions[n.slot]}
            scale={0.8}
            colors={colors}
            state={
              n.status === 'open'
                ? 'active'
                : n.status === 'blocked'
                  ? 'excluded'
                  : n.status === 'disputed'
                    ? 'disputed'
                    : 'unknown'
            }
            pose={pose}
            requirements={[
              {
                id: n.id,
                label: n.status,
                result:
                  n.status === 'open'
                    ? 'pass'
                    : n.status === 'blocked'
                      ? 'fail'
                      : n.status === 'missing'
                        ? 'not-stated'
                        : 'unknown',
              },
            ]}
          />
        </group>
      ))}
    </group>
  );
}
