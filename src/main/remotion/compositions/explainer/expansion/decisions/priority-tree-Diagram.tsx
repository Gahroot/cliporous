import type { ReactElement } from 'react';
import { useStage } from '../../stage';
import {
  priorityTreeAnchors,
  priorityTreeLabel,
  priorityTreeLines,
  priorityTreePages,
  priorityTreePose,
} from './priority-tree-poses';
import type { ExpansionPriorityTreeScene } from './priority-tree-types';

function Text({
  identity,
  text,
  x,
  y,
  columns = 36,
}: {
  identity: string;
  text: string;
  x: number;
  y: number;
  columns?: number;
}): ReactElement {
  const S = useStage();
  let offset = 0;
  const lines = priorityTreeLines(text, columns).map((line) => {
    const key = `${identity}/${offset}`;
    const dy = offset === 0 ? 0 : 26;
    offset += Array.from(line).length;
    return { key, line, dy };
  });
  return (
    <text
      x={x}
      y={y}
      fill={S.text}
      fontFamily={S.font}
      fontSize={22}
      fontWeight={400}
      xmlSpace="preserve"
      style={{ whiteSpace: 'pre' }}
    >
      {lines.map((part) => (
        <tspan key={part.key} x={x} dy={part.dy}>
          {part.line}
        </tspan>
      ))}
    </text>
  );
}
/** Persistent before/after rails or the real typed topology. Dashed edges are never truth indicators. */
export function PriorityTreeDiagram({
  scene,
  t,
}: {
  scene: ExpansionPriorityTreeScene;
  t: number;
}): ReactElement {
  const S = useStage(),
    pose = priorityTreePose(scene, t),
    anchors = priorityTreeAnchors(scene);
  const label = (id: string) => priorityTreeLabel(scene, id);
  if (scene.storyId === '27') {
    const before = scene.priorities?.before.order ?? scene.criteria.map((c) => c.entityId);
    const after = scene.priorities?.after.order;
    return (
      <g data-story="27" opacity={pose.reveal}>
        {[
          { name: after ? 'Before' : 'Source criteria · supplied weights', order: before, x: 16 },
          ...(after ? [{ name: 'After', order: after, x: 492 }] : []),
        ].map((rail) => (
          <g key={rail.name} data-priority-endpoint={rail.name}>
            <Text identity={`priority/${rail.name}`} text={rail.name} x={rail.x} y={24} />
            {rail.order.map((id, i) => (
              <g key={id} data-criterion-id={id} data-order-index={i}>
                <rect
                  x={rail.x}
                  y={38 + i * 56}
                  width={440}
                  height={54}
                  rx={6}
                  fill={scene.visualMode === 'hybrid' ? 'none' : S.card}
                  stroke={S.cardBorder}
                />
                <Text
                  identity={`priority/${rail.name}/${id}`}
                  text={label(id)}
                  x={rail.x + 52}
                  y={60 + i * 56}
                  columns={16}
                />
              </g>
            ))}
          </g>
        ))}
      </g>
    );
  }
  return (
    <g data-story="28" opacity={pose.reveal}>
      {scene.branches.map((edge) => {
        const from = anchors.find((a) => a.id === edge.fromId),
          to = anchors.find((a) => a.id === edge.toId);
        if (!from || !to) throw new Error('Lost typed branch');
        return (
          <g
            key={`${edge.fromId}/${edge.toId}`}
            data-from-id={edge.fromId}
            data-to-id={edge.toId}
            data-role="conditional"
            data-test={edge.test}
          >
            <path
              d={`M${from.x + 30} ${from.y}L${to.x - 30} ${to.y}`}
              fill="none"
              stroke={S.muted}
              strokeWidth={2}
              strokeDasharray="5 5"
            />
            <path
              d={`M${to.x - 40} ${to.y - 6}L${to.x - 30} ${to.y}L${to.x - 40} ${to.y + 6}`}
              fill="none"
              stroke={S.muted}
              strokeWidth={2}
            />
          </g>
        );
      })}
      {anchors.map((anchor, i) => {
        const node = scene.nodes[i];
        const selected =
          scene.resolution.state === 'source-chosen' &&
          scene.resolution.choiceId === node.entityId &&
          pose.resolve > 0;
        return (
          <g
            key={anchor.id}
            data-node-id={anchor.id}
            data-node-role={node.role}
            data-state={node.state}
            data-source-chosen={selected}
          >
            {node.role === 'condition' ? (
              <path
                d={`M${anchor.x} ${anchor.y - 27}L${anchor.x + 30} ${anchor.y}L${anchor.x} ${anchor.y + 27}L${anchor.x - 30} ${anchor.y}Z`}
                fill={S.card}
                stroke={S.text}
                strokeWidth={selected ? 4 : 2}
              />
            ) : (
              <rect
                x={anchor.x - 30}
                y={anchor.y - 25}
                width={60}
                height={50}
                rx={5}
                fill={S.card}
                stroke={S.text}
                strokeDasharray={node.state === 'known' ? undefined : '4 3'}
                strokeWidth={selected ? 4 : 2}
              />
            )}
            <Text
              identity={`node/${anchor.id}`}
              text={anchor.marker}
              x={anchor.x - 16}
              y={anchor.y + 8}
            />
          </g>
        );
      })}
    </g>
  );
}
/** Always planar, including the hybrid model phase. Complete source text, qualification and basis pages. */
export function PriorityTreeFacts({
  scene,
  t,
}: {
  scene: ExpansionPriorityTreeScene;
  t: number;
}): ReactElement {
  const S = useStage(),
    pose = priorityTreePose(scene, t);
  const page = priorityTreePages(scene)[pose.page];
  return (
    <g data-owner-id={scene.ownerId}>
      <rect x={8} y={264} width={936} height={210} rx={8} fill={S.card} stroke={S.cardBorder} />
      <g key={page.id} data-page-id={page.id} data-active="true" opacity={pose.reveal}>
        <Text identity={`${page.id}/title`} text={page.title} x={28} y={290} />
        <Text identity={`${page.id}/context`} text={page.context} x={28} y={326} />
        <Text identity={`${page.id}/text`} text={page.text} x={28} y={362} />
      </g>
    </g>
  );
}
