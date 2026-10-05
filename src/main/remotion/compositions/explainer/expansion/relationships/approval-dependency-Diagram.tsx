import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  approvalDependencyLabel,
  approvalDependencyLines,
  approvalDependencyPages,
  approvalDependencyPose,
} from './approval-dependency-poses';
import type { ExpansionApprovalDependencyScene } from './approval-dependency-types';

export function ApprovalDependencyDiagram({
  scene,
  t,
}: {
  scene: ExpansionApprovalDependencyScene;
  t: number;
}): ReactElement {
  const S = useStage();
  const pose = approvalDependencyPose(scene, t),
    pages = approvalDependencyPages(scene),
    page = pages[pose.page];
  if (!page) throw new Error('Missing source page');
  const text = (id: string, value: string, x: number, y: number, columns = 19): ReactElement => (
    <g data-label-id={id}>
      {approvalDependencyLines(value, columns)
        .map((line, i) => ({ line, id: `${id}/line-${i * columns}:${line}`, baseline: y + i * 28 }))
        .map((row) => (
          <text
            key={row.id}
            x={x}
            y={row.baseline}
            fontSize={22}
            fontFamily={UI_FONT}
            fill={S.text}
          >
            {row.line}
          </text>
        ))}
    </g>
  );
  const card = (id: string, role: string, x: number, y: number): ReactElement => (
    <g data-entity-id={id} data-role={role}>
      <rect x={x - 12} y={y - 28} width={216} height={166} rx={10} fill={S.card} stroke={S.muted} />
      {text(`${id}/role`, role, x, y, 9)}
      {text(id, approvalDependencyLabel(scene, id), x, y + 34, 9)}
    </g>
  );
  const edge =
    scene.storyId === '35'
      ? scene.records.find((r) => r.id === page.factId)
      : scene.relations.find((r) => r.id === page.factId);
  const approvalX = (id: string): number => {
    if (scene.storyId !== '35') throw new Error('Approval station required');
    if (id === scene.ownerId) return 118;
    if (id === scene.approverId) return 358;
    throw new Error('Record endpoint is not a source actor station');
  };
  return (
    <g data-template={scene.template} data-source-only="true">
      {scene.storyId === '35' ? (
        <>
          {card(scene.ownerId, 'owner', 20, 36)}
          {card(scene.approverId, 'approver', 260, 36)}
          <g data-entity-id={scene.workItemId} data-role="work item">
            <rect x={8} y={242} width={456} height={112} rx={10} fill={S.card} stroke={S.muted} />
            {text('work-role', 'work item', 20, 270)}
            {text(scene.workItemId, approvalDependencyLabel(scene, scene.workItemId), 20, 302)}
          </g>
          {edge && 'targetId' in edge && (
            <g
              data-record-id={edge.id}
              data-type={edge.type}
              data-status={edge.state}
              data-from-id={edge.actorId}
              data-to-id={edge.targetId}
            >
              <path
                d={`M${approvalX(edge.actorId)} 182H${approvalX(edge.targetId)}M${approvalX(edge.targetId) + (approvalX(edge.actorId) < approvalX(edge.targetId) ? -10 : 10)} 176L${approvalX(edge.targetId)} 182L${approvalX(edge.targetId) + (approvalX(edge.actorId) < approvalX(edge.targetId) ? -10 : 10)} 188`}
                fill="none"
                stroke={edge.type === 'authorization' ? S.accent : S.muted}
                strokeWidth={3}
                strokeDasharray={edge.type === 'authorization' ? '3 5' : undefined}
              />
              {text('record-type', edge.type, 20, 204)}
              {text('record-state', edge.state, 260, 204)}
            </g>
          )}
          {text('authority-limit', 'Roles and handoffs do not grant authority', 20, 394)}
        </>
      ) : (
        <>
          {text('actor', `Actor: ${approvalDependencyLabel(scene, scene.actorId)}`, 20, 32)}
          <g data-graph="source-typed-links">
            {scene.relations.map((r, i) => {
              const nodes = scene.entities.filter((e) => e.id !== scene.actorId);
              const point = (id: string): readonly [number, number] => {
                const index = nodes.findIndex((e) => e.id === id);
                if (index < 0) throw new Error('Missing source graph endpoint');
                return [40 + (index % 4) * 124, 104 + Math.floor(index / 4) * 70];
              };
              const a = point(r.fromId),
                b = point(r.toId);
              const lane = 84 + i * 5,
                arrowY = b[1] + (lane < b[1] ? -8 : 8);
              return (
                <g
                  key={r.id}
                  data-relation-id={r.id}
                  data-type={r.type}
                  data-status={r.state}
                  data-from-id={r.fromId}
                  data-to-id={r.toId}
                  data-direction={r.type === 'dependency' ? 'from requires to' : 'source direction'}
                >
                  <path
                    d={`M${a[0]} ${a[1]}V${lane}H${b[0]}V${b[1]}`}
                    fill="none"
                    stroke={r.id === page.factId ? S.accent : S.muted}
                    strokeWidth={r.type === 'flow' ? 4 : 2}
                    strokeDasharray={
                      r.type === 'dependency' ? '3 4' : r.type === 'order' ? '8 4' : undefined
                    }
                  />
                  <path
                    d={`M${b[0] + 6} ${arrowY}L${b[0]} ${b[1]}L${b[0] - 6} ${arrowY}`}
                    fill="none"
                    stroke={S.text}
                    strokeWidth={2}
                  />
                </g>
              );
            })}
            {scene.entities
              .filter((e) => e.id !== scene.actorId)
              .map((e, i) => (
                <circle
                  key={e.id}
                  data-entity-id={e.id}
                  cx={40 + (i % 4) * 124}
                  cy={104 + Math.floor(i / 4) * 70}
                  r={8}
                  fill={e.id === page.factId ? S.accent : S.card}
                  stroke={S.text}
                />
              ))}
          </g>
          {edge && 'fromId' in edge ? (
            <g data-selected-relation-id={edge.id}>
              {card(edge.fromId, 'from', 20, 230)}
              {card(edge.toId, 'to', 260, 230)}
              {text('link-type', edge.type, 20, 402)}
              {text('link-state', edge.state, 260, 402)}
              {text(
                'link-direction',
                edge.type === 'dependency'
                  ? 'From requires to'
                  : edge.type === 'order'
                    ? 'Source order only'
                    : edge.type === 'transfer'
                      ? 'Supplied transfer'
                      : 'Supplied flow',
                20,
                450,
              )}
            </g>
          ) : (
            text('schedule-limit', 'No schedule or transitive links inferred', 20, 286)
          )}
        </>
      )}
      <rect x={488} y={8} width={456} height={462} rx={12} fill={S.card} />
      <g key={page.id} data-page-id={page.id} data-fact-id={page.factId} data-active="true">
        {page.lines
          .map((line, i) => ({
            line,
            id: `${page.id}/line-${i * 19}:${line}`,
            baseline: 38 + i * 28,
          }))
          .map((row) => (
            <text
              key={row.id}
              x={500}
              y={row.baseline}
              fontSize={22}
              fontFamily={UI_FONT}
              fill={S.text}
            >
              {row.line}
            </text>
          ))}
        <text
          x={500}
          y={456}
          fontSize={22}
          fontFamily={UI_FONT}
          fill={S.muted}
        >{`${pose.page + 1}/${pages.length}`}</text>
      </g>
    </g>
  );
}
