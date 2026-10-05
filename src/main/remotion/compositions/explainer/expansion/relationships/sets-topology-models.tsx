import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import {
  RelationshipContainerClay,
  RelationshipEntityClay,
  TypedRelationshipClay,
} from '../kits/relationships';
import type { ExpansionKitColors } from '../scene-types';
import { type SetsTopologyPose, topologySlot } from './sets-topology-poses';
import type { ExpansionSetsTopologyScene, ExpansionTopologyScene } from './sets-topology-types';

export const SETS_TOPOLOGY_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function setsTopologyModelPlacement(
  index: number,
  count: number,
  wide?: { width: number; height: number },
): { position: [number, number, number]; scale: number } {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide
    ? (width - 952 * meet) / 2 + (38 + (index * 414) / count) * meet
    : 102 + (index * 414) / count;
  const y = wide ? (height - 478 * meet) / 2 + 410 * meet : 672;
  const units = worldUnitsPerPixel(SETS_TOPOLOGY_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0],
    scale: 12 * units * meet,
  };
}
export function topologyModelPlacement(
  scene: ExpansionTopologyScene,
  id: string,
  wide?: { width: number; height: number },
): { position: [number, number, number]; scale: number } {
  const slot = topologySlot(scene, id);
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + slot[0] * meet : 64 + slot[0];
  const localY = 410 + (slot[1] - 198) * 0.09;
  const y = wide ? (height - 478 * meet) / 2 + localY * meet : 262 + localY;
  const units = worldUnitsPerPixel(SETS_TOPOLOGY_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0],
    scale: 8 * units * meet,
  };
}
/** Bounded clay identity carriers; labels and qualifications live on the persistent surface. */
export function SetsTopologyModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionSetsTopologyScene;
  pose: SetsTopologyPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  const placement = (id: string): ReturnType<typeof setsTopologyModelPlacement> =>
    scene.storyId === '40'
      ? topologyModelPlacement(scene, id, wide?.model)
      : setsTopologyModelPlacement(
          scene.entities.findIndex((e) => e.id === id),
          scene.entities.length,
          wide?.model,
        );
  return (
    <group>
      {scene.storyId === '40' &&
        scene.edges.map((r) => {
          const from = placement(r.fromId),
            to = placement(r.toId);
          const mid: [number, number, number] = [
            (from.position[0] + to.position[0]) / 2,
            (from.position[1] + to.position[1]) / 2,
            0.03,
          ];
          const mark = from.scale * 0.5;
          const angle = Math.atan2(
            to.position[1] - from.position[1],
            to.position[0] - from.position[0],
          );
          return (
            <group
              key={r.id}
              userData={{
                edgeId: r.id,
                role: r.role,
                status: r.status ?? 'not-supplied',
                state: r.state,
              }}
            >
              <TypedRelationshipClay
                id={r.id}
                role={r.role}
                from={from.position}
                to={to.position}
                position={[0, 0, -0.04]}
                pose={pose}
                colors={colors}
                state={
                  r.status === 'absent'
                    ? 'excluded'
                    : r.state === 'unknown' || r.state === 'missing'
                      ? 'unknown'
                      : r.state === 'disputed'
                        ? 'disputed'
                        : 'retained'
                }
              />
              {r.role === 'membership' && (
                <mesh
                  position={[
                    from.position[0] * 0.3 + to.position[0] * 0.7,
                    from.position[1] * 0.3 + to.position[1] * 0.7,
                    0.03,
                  ]}
                  rotation={[0, 0, angle - Math.PI / 2]}
                >
                  <coneGeometry args={[mark * 0.5, mark * 1.5, 8]} />
                  <Clay color={colors.accent} />
                </mesh>
              )}
              {r.status === 'failed' && (
                <group position={mid}>
                  <group rotation={[0, 0, Math.PI / 4]}>
                    <ClayBlock size={[mark * 2, mark * 0.3, mark * 0.3]} color={colors.accent} />
                  </group>
                  <group rotation={[0, 0, -Math.PI / 4]}>
                    <ClayBlock size={[mark * 2, mark * 0.3, mark * 0.3]} color={colors.accent} />
                  </group>
                </group>
              )}
              {r.status === 'absent' && (
                <mesh position={mid}>
                  <torusGeometry args={[mark, mark * 0.15, 6, 12]} />
                  <Clay color={colors.muted} />
                </mesh>
              )}
              {r.status === undefined && (
                <mesh position={mid}>
                  <octahedronGeometry args={[mark, 0]} />
                  <Clay color={colors.muted} />
                </mesh>
              )}
            </group>
          );
        })}
      {scene.entities.map((e) => {
        const p = placement(e.id);
        const selected =
          scene.storyId === '39' &&
          scene.selection.state === 'complete' &&
          scene.selection.memberIds.includes(e.id) &&
          pose.resolve > 0;
        return (
          <group key={e.id} position={p.position} scale={p.scale}>
            {scene.storyId === '39' && scene.setIds.includes(e.id) ? (
              <RelationshipContainerClay
                id={e.id}
                label={e.label}
                members={scene.memberships
                  .filter(
                    (r) => r.setId === e.id && r.state === 'known' && r.membership === 'included',
                  )
                  .map((r) => {
                    const member = scene.entities.find((m) => m.id === r.memberId);
                    if (!member) throw new Error('Missing source member');
                    return { ...member, role: 'member' as const };
                  })}
                completeness="partial"
                state="retained"
                position={[0, 0, 0]}
                pose={pose}
                colors={colors}
              />
            ) : (
              <RelationshipEntityClay
                entity={{ ...e, role: 'member' }}
                state={selected ? 'active' : 'retained'}
                position={[0, 0, 0]}
                pose={pose}
                colors={colors}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
