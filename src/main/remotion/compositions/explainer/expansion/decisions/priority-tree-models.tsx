import type { ReactElement } from 'react';
import { RetainedChoiceClay } from '../kits/constraints';
import { ClaimPlaqueClay } from '../kits/evidence';
import { RelationshipEntityClay, TypedRelationshipClay } from '../kits/relationships';
import type { ExpansionKitColors } from '../scene-types';
import {
  type PriorityTreeViewport,
  priorityTreeAnchors,
  priorityTreeLabel,
  priorityTreeModelPlacement,
  priorityTreePose,
} from './priority-tree-poses';
import type { ExpansionPriorityTreeScene } from './priority-tree-types';

/** Semantic criterion tiles, candidate trays and condition/outcome plaques. No precision text in WebGL. */
export function PriorityTreeModels({
  scene,
  t,
  colors,
  viewport,
  turn = 0,
}: {
  scene: ExpansionPriorityTreeScene;
  t: number;
  colors: ExpansionKitColors;
  viewport?: PriorityTreeViewport;
  turn?: number;
}): ReactElement {
  const pose = priorityTreePose(scene, t);
  const props = {
    pose,
    colors,
    state: 'unknown' as const,
    position: [0, 0, 0] as const,
    placement: { position: [0, 0, 0] as const, scale: 1 },
  };
  return (
    <group name={`priority-tree-${scene.storyId}`} rotation={[0, -turn, 0]}>
      {priorityTreeAnchors(scene).map((anchor) => {
        const node =
          scene.storyId === '28' ? scene.nodes.find((n) => n.entityId === anchor.id) : undefined;
        const state =
          node?.role === 'condition'
            ? 'unknown'
            : node?.state === 'disputed'
              ? 'disputed'
              : !node || node.state === 'known'
                ? 'retained'
                : 'unknown';
        return (
          <group
            key={`${anchor.marker}/${anchor.id}`}
            userData={{
              entityId: anchor.id,
              role: node?.role ?? 'criterion',
              evaluation: 'not-evaluated',
            }}
            {...priorityTreeModelPlacement(anchor.x, anchor.y, viewport)}
          >
            {scene.storyId === '27' ? (
              <RelationshipEntityClay
                {...props}
                state={state}
                entity={{
                  id: anchor.id,
                  label: priorityTreeLabel(scene, anchor.id),
                  role: 'resource',
                }}
              />
            ) : (
              <group rotation={[0, 0, node?.role === 'condition' ? Math.PI / 4 : 0]} scale={0.7}>
                <ClaimPlaqueClay {...props} state={state} id={anchor.id} claim="" />
              </group>
            )}
          </group>
        );
      })}
      {scene.storyId === '28' &&
        scene.branches.map((edge) => {
          const anchors = priorityTreeAnchors(scene);
          const from = anchors.find((a) => a.id === edge.fromId),
            to = anchors.find((a) => a.id === edge.toId);
          if (!from || !to) throw new Error('Lost conditional endpoints');
          return (
            <group
              key={`${edge.fromId}/${edge.toId}`}
              userData={{ role: 'conditional', test: edge.test }}
            >
              <TypedRelationshipClay
                {...props}
                {...{ role: 'correspondence' as const }}
                id={`${edge.fromId}/${edge.toId}`}
                condition={edge.test}
                from={priorityTreeModelPlacement(from.x, from.y, viewport).position}
                to={priorityTreeModelPlacement(to.x, to.y, viewport).position}
              />
            </group>
          );
        })}
      {scene.storyId === '27' &&
        scene.candidateIds.map((id, i) => (
          <group key={id} {...priorityTreeModelPlacement(700, 70 + i * 120, viewport)}>
            {scene.resolution.state === 'source-chosen' &&
            scene.resolution.choiceId === id &&
            pose.resolve > 0 ? (
              <RelationshipEntityClay
                {...props}
                state="retained"
                entity={{ id, label: priorityTreeLabel(scene, id), role: 'candidate' }}
              />
            ) : (
              <RetainedChoiceClay
                {...props}
                id={id}
                label={priorityTreeLabel(scene, id)}
                disposition="unresolved"
              />
            )}
          </group>
        ))}
    </group>
  );
}
