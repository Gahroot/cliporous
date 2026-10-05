import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  historyTwinLabel,
  historyTwinLines,
  historyTwinNumericPositions,
  historyTwinPages,
  historyTwinPose,
} from './history-twin-poses';
import type { ExpansionHistoryTwinScene } from './history-twin-types';

export function HistoryTwinDiagram({
  scene,
  t,
}: {
  scene: ExpansionHistoryTwinScene;
  t: number;
}): ReactElement {
  const S = useStage(),
    pose = historyTwinPose(scene, t),
    page = historyTwinPages(scene)[pose.page];
  if (!page) throw new Error('Missing source page');
  const text = (id: string, value: string, x: number, y: number, columns = 19): ReactElement => (
    <g data-label-id={id}>
      {historyTwinLines(value, columns)
        .map((line, offset) => ({
          line,
          id: `${id}/source-offset-${offset * columns}`,
          y: y + offset * 28,
        }))
        .map((row) => (
          <text key={row.id} x={x} y={row.y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
            {row.line}
          </text>
        ))}
    </g>
  );
  const ids = scene.storyId === '47' ? scene.stateIds : scene.viewIds;
  const positions =
    scene.storyId === '47'
      ? historyTwinNumericPositions(scene.thresholds.map((v) => v.quantity))
      : [];
  return (
    <g data-template={scene.template} data-source-only="true">
      {ids.map((id, i) => (
        <g key={id} data-entity-id={id} data-actor-id={scene.actorId}>
          <rect
            x={8 + i * 240}
            y={8}
            width={216}
            height={158}
            rx={10}
            fill={S.card}
            stroke={S.muted}
          />
          {text(`${id}/role`, scene.storyId === '47' ? 'state' : 'view', 20 + i * 240, 36, 9)}
          {text(id, historyTwinLabel(scene, id), 20 + i * 240, 72, 9)}
        </g>
      ))}
      {scene.storyId === '47' ? (
        <>
          {scene.rules.map((r, i) => (
            <g
              key={r.id}
              data-rule-id={r.id}
              data-role={r.role}
              data-from-id={r.fromId}
              data-to-id={r.toId}
              data-status={r.state}
              data-threshold-id={r.thresholdId}
            >
              <path
                d={
                  i === 0
                    ? 'M118 180H358L350 174M358 180L350 186'
                    : 'M358 220H118L126 214M118 220L126 226'
                }
                fill="none"
                stroke={S.accent}
                strokeWidth={3}
                strokeDasharray="4 4"
              />
              {text(`${r.id}/role`, r.role, 20, 196 + i * 40)}
            </g>
          ))}
          {text('retention', 'Retained history', 20, 282)}
          {scene.history.map((h, i) => (
            <rect
              key={h.id}
              data-history-id={h.id}
              data-time={h.dataTime}
              data-status={h.state}
              data-value-id={'valueId' in h ? h.valueId : undefined}
              x={20 + i * 58}
              y={300}
              width={40}
              height={24}
              fill={S.card}
              stroke={S.accent}
            />
          ))}
          {scene.thresholds.map((v, i) => (
            <g key={v.id} data-threshold-id={v.id} data-status={v.quantity.state}>
              <path d={`M20 ${352 + i * 36}H440`} stroke={S.muted} />
              {positions[i] !== null && positions[i] !== undefined && (
                <circle cx={20 + positions[i] * 420} cy={352 + i * 36} r={5} fill={S.accent} />
              )}
              {text(`${v.id}/role`, v.role, 20, 347 + i * 36)}
            </g>
          ))}
          {text('limit', 'Rules not executed', 20, 436)}
        </>
      ) : (
        <>
          <path
            data-alignment="same-actor-source-controls"
            d="M118 180V220H358V180M228 214L238 220L228 226"
            fill="none"
            stroke={S.accent}
            strokeWidth={3}
          />
          {text('subject', `Same ${historyTwinLabel(scene, scene.actorId)}`, 20, 268)}
          {text('controls', 'Source controls kept', 20, 352)}
          {text('limit', 'No measured forecast', 20, 436)}
        </>
      )}
      <rect x={488} y={8} width={456} height={462} rx={12} fill={S.card} />
      <g key={page.id} data-page-id={page.id} data-fact-id={page.factId} data-active="true">
        {page.lines
          .map((line, offset) => ({
            line,
            id: `${page.id}/source-offset-${offset * 19}`,
            y: 38 + offset * 28,
          }))
          .map((row) => (
            <text key={row.id} x={500} y={row.y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
              {row.line}
            </text>
          ))}
        <text
          x={500}
          y={456}
          fontSize={22}
          fontFamily={UI_FONT}
          fill={S.muted}
        >{`${pose.page + 1}/${historyTwinPages(scene).length}`}</text>
      </g>
    </g>
  );
}
