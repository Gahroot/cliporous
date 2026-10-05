import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  lanesCriticalPages,
  lanesCriticalPose,
  lanesCriticalPosition,
} from './lanes-critical-poses';
import type { ExpansionLanesCriticalScene } from './lanes-critical-types';

export function LanesCriticalDiagram({
  scene,
  t,
}: {
  scene: ExpansionLanesCriticalScene;
  t: number;
}): ReactElement {
  const S = useStage(),
    pose = lanesCriticalPose(scene, t),
    pages = lanesCriticalPages(scene),
    page = pages[pose.page];
  if (!page) throw new Error('Missing source page');
  const text = (id: string, value: string, x: number, y: number): ReactElement => (
    <text key={id} data-label-id={id} x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {value}
    </text>
  );
  const row = (id: string): number => {
    const i = scene.tasks.findIndex((task) => task.id === id);
    if (i < 0) throw new Error('Missing source endpoint');
    return 100 + i * 44;
  };
  return (
    <g data-template={scene.template} data-source-only="true">
      {text(
        'lane-key',
        scene.storyId === '41' ? 'Task lanes; no time axis' : 'Derived: early / late',
        20,
        32,
      )}
      {scene.tasks.map((task, i) => {
        const y = row(task.id);
        const schedule =
          scene.storyId === '42'
            ? scene.result.schedule.find((s) => s.taskId === task.id)
            : undefined;
        const critical = scene.storyId === '42' && scene.result.criticalTaskIds.includes(task.id);
        const span = (start: number, end: number, latest: boolean): ReactElement =>
          end === start ? (
            <line
              x1={160 + 300 * start}
              x2={160 + 300 * start}
              y1={y + (latest ? 14 : -6)}
              y2={y + (latest ? 26 : 6)}
              stroke={critical ? S.accent : S.text}
              data-zero={
                task.duration?.state === 'known' &&
                task.duration.amount.kind === 'rational' &&
                task.duration.amount.value.numerator === 0
              }
              data-below-resolution={
                task.duration?.state === 'known' &&
                task.duration.amount.kind === 'rational' &&
                task.duration.amount.value.numerator !== 0
              }
            />
          ) : (
            <rect
              x={160 + 300 * start}
              y={y + (latest ? 14 : -6)}
              width={300 * (end - start)}
              height={12}
              fill={latest ? 'none' : S.card}
              stroke={critical ? S.accent : S.text}
              strokeWidth={critical ? 3 : 1}
              strokeDasharray={latest ? '4 3' : undefined}
            />
          );
        return (
          <g
            key={task.id}
            data-task-id={task.id}
            data-critical={critical}
            data-duration-state={task.duration?.state ?? 'not-supplied'}
          >
            {text(task.id, `Task ${i + 1}`, 20, y + 7)}
            {schedule && scene.storyId === '42' ? (
              <>
                <path d={`M160 ${y}H460`} stroke={S.muted} />
                {span(
                  lanesCriticalPosition(schedule.earliestStart, scene.result.duration),
                  lanesCriticalPosition(schedule.earliestFinish, scene.result.duration),
                  false,
                )}
                {span(
                  lanesCriticalPosition(schedule.latestStart, scene.result.duration),
                  lanesCriticalPosition(schedule.latestFinish, scene.result.duration),
                  true,
                )}
              </>
            ) : (
              <>
                <rect
                  x={160}
                  y={y - 14}
                  width={300}
                  height={28}
                  rx={6}
                  fill={S.card}
                  stroke={S.muted}
                  strokeDasharray="4 3"
                />
                {text(`${task.id}/station`, 'Identity, not interval', 174, y + 7)}
              </>
            )}
          </g>
        );
      })}
      <g data-links="explicit-only">
        {scene.relations.map((r, i) => {
          const a = row(r.fromId),
            b = row(r.toId),
            x = 118 + i * 2;
          const asserted = r.state === 'known' || r.state === 'conditional';
          const critical =
            scene.storyId === '42' && scene.result.criticalRelationIds.includes(r.id);
          return (
            <g
              key={r.id}
              data-relation-id={r.id}
              data-type={r.type}
              data-status={r.state}
              data-from-id={r.fromId}
              data-to-id={r.toId}
              data-critical={critical}
            >
              <path
                d={`M156 ${a}H${x}V${b}H156`}
                fill="none"
                stroke={critical || r.id === page.factId ? S.accent : S.muted}
                strokeWidth={critical ? 3 : 1}
                strokeDasharray={!asserted ? '1 5' : r.type === 'concurrent' ? '5 3' : undefined}
              />
              {r.type !== 'concurrent' && asserted && (
                <path d={`M150 ${b - 4}L156 ${b}L150 ${b + 4}`} fill="none" stroke={S.text} />
              )}
            </g>
          );
        })}
      </g>
      {scene.storyId === '42' ? (
        <>
          {text('domain-zero', '0', 160, 438)}
          {text('domain-end', 'Project finish', 260, 438)}
          {text(
            'multiplicity',
            `${scene.result.criticalPathCount} ${scene.result.pathMultiplicity} paths`,
            20,
            462,
          )}
        </>
      ) : (
        <>
          {text('links-key', 'Dashed = concurrent', 20, 438)}
          {text('no-inference', 'Solid = before; dots = unasserted', 20, 462)}
        </>
      )}
      <rect x={488} y={8} width={456} height={462} rx={12} fill={S.card} />
      <g key={page.id} data-page-id={page.id} data-fact-id={page.factId} data-active="true">
        {page.lines.map((line, i) => text(`${page.id}/line-${i}`, line, 500, 38 + i * 28))}
        {text('page-number', `${pose.page + 1}/${pages.length}`, 500, 456)}
      </g>
    </g>
  );
}
