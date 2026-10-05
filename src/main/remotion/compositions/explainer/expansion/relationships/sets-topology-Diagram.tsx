import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  entityCode,
  relationshipCode,
  type SetsTopologyPose,
  topologySlot,
} from './sets-topology-poses';
import type { ExpansionSetsTopologyScene } from './sets-topology-types';

/** The same persistent planar facts/identities qualify both presentations. */
export function SetsTopologyDiagram({
  scene,
  pose,
}: {
  scene: ExpansionSetsTopologyScene;
  pose: SetsTopologyPose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const text = (value: string, x: number, y: number): ReactElement => (
    <text x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {value}
    </text>
  );
  return (
    <g data-page={page.id}>
      {text(
        scene.storyId === '39' ? 'Source set operations' : `Source ${scene.template} topology`,
        12,
        30,
      )}
      {scene.storyId === '39' ? (
        <>
          {text(
            `${scene.operation.kind}: ${entityCode(scene, scene.operation.leftId)} ${scene.operation.kind === 'exclusion' ? 'minus' : scene.operation.kind === 'union' ? 'or' : 'and'} ${entityCode(scene, scene.operation.rightId)}`,
            12,
            62,
          )}
          {scene.setIds.map((id, j) => {
            const x = 72 + j * (370 / scene.setIds.length);
            const operand = id === scene.operation.leftId || id === scene.operation.rightId;
            return (
              <g key={id} data-set-id={id} data-operand={operand}>
                <rect
                  x={x - 8}
                  y={80}
                  width={370 / scene.setIds.length - 4}
                  height={scene.memberIds.length * 38 + 34}
                  fill="none"
                  stroke={operand ? S.accent : S.muted}
                  strokeWidth={operand ? 3 : 1}
                />
                {text(entityCode(scene, id), x, 105)}
              </g>
            );
          })}
          {scene.memberIds.map((id, i) => (
            <g key={id} data-member-id={id}>
              {scene.selection.state === 'complete' &&
                scene.selection.memberIds.includes(id) &&
                pose.resolve > 0 && (
                  <rect
                    x={8}
                    y={115 + i * 38}
                    width={50}
                    height={32}
                    rx={12}
                    stroke={S.accent}
                    strokeWidth={3}
                    fill="none"
                    data-source-selected={id}
                  />
                )}
              {text(entityCode(scene, id), 12, 140 + i * 38)}
              {scene.setIds.map((setId, j) => {
                const r = scene.memberships.find((m) => m.memberId === id && m.setId === setId);
                return (
                  <g
                    key={setId}
                    data-membership-id={r?.id}
                    data-state={r?.state ?? 'not-supplied'}
                    data-membership={r?.membership}
                  >
                    {text(
                      r ? relationshipCode(r, r.membership) : 'NS',
                      72 + j * (370 / scene.setIds.length),
                      140 + i * 38,
                    )}
                  </g>
                );
              })}
            </g>
          ))}
          {text(`Selection: ${scene.selection.state}`, 12, 370)}
        </>
      ) : (
        <>
          {text('Only supplied links; roles on page', 12, 62)}
          {scene.edges.map((r) => {
            const a = topologySlot(scene, r.fromId),
              b = topologySlot(scene, r.toId);
            const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
            const start = [a[0] + Math.cos(angle) * 30, a[1] + Math.sin(angle) * 24];
            const end = [b[0] - Math.cos(angle) * 30, b[1] - Math.sin(angle) * 24];
            const x = (start[0] + end[0]) / 2,
              y = (start[1] + end[1]) / 2;
            return (
              <g
                key={r.id}
                data-edge-id={r.id}
                data-role={r.role}
                data-state={r.state}
                data-status={r.status ?? 'not-supplied'}
              >
                <path
                  d={`M${start[0]} ${start[1]}L${end[0]} ${end[1]}`}
                  stroke={S.muted}
                  strokeWidth={3}
                  strokeDasharray={
                    r.status !== 'present' || r.state !== 'known' ? '5 5' : undefined
                  }
                  fill="none"
                />
                {
                  <path
                    d="M-9 -5L0 0L-9 5"
                    transform={`translate(${end[0]} ${end[1]}) rotate(${(angle * 180) / Math.PI})`}
                    stroke={S.text}
                    strokeWidth={2}
                    fill="none"
                  />
                }
                {r.status === 'failed' && (
                  <path
                    d={`M${x - 6} ${y - 6}L${x + 6} ${y + 6}M${x - 6} ${y + 6}L${x + 6} ${y - 6}`}
                    stroke={S.accent}
                    strokeWidth={3}
                  />
                )}
                {r.status === 'absent' && (
                  <circle cx={x} cy={y} r={7} stroke={S.text} fill={S.card} />
                )}
                {r.status === undefined && (
                  <rect
                    x={x - 7}
                    y={y - 7}
                    width={14}
                    height={14}
                    fill={S.card}
                    stroke={S.text}
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            );
          })}
          {scene.entities.map((e) => {
            const p = topologySlot(scene, e.id);
            return (
              <g key={e.id} data-node-id={e.id}>
                <rect
                  x={p[0] - 28}
                  y={p[1] - 22}
                  width={56}
                  height={44}
                  rx={8}
                  fill={S.card}
                  stroke={S.accent}
                />
                {text(entityCode(scene, e.id), p[0] - 16, p[1] + 8)}
              </g>
            );
          })}
          {text('Failure is conditional, not applied', 12, 352)}
          {text('Outcome is source only', 12, 382)}
        </>
      )}
      {text('K known; ? unknown; M missing', 12, 444)}
      {text(
        scene.storyId === '39'
          ? 'D disputed; + in; - out; NS unstated'
          : 'D disputed; cross failed; ring absent',
        12,
        472,
      )}
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {page.lines.map((line, i) => {
        const sourceOffset = page.lines
          .slice(0, i)
          .reduce((offset, sourceLine) => offset + sourceLine.length + 1, 0);
        return <g key={`${page.id}:${sourceOffset}:${line}`}>{text(line, 500, 38 + i * 28)}</g>;
      })}
      {text(`Source ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
