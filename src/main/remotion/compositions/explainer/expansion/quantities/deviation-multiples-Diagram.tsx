import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  DEVIATION_DETAIL,
  type DeviationMultiplesPose,
  deviationDomain,
  deviationPositions,
  deviationRecords,
  deviationWrap,
  exactDeviationValue,
} from './deviation-multiples-poses';
import type { ExpansionDeviationMultiplesScene } from './deviation-multiples-types';

/** All numerical geometry stays planar in both visual modes. No perspective value bars. */
export function DeviationMultiplesDiagram({
  scene,
  pose,
}: {
  scene: ExpansionDeviationMultiplesScene;
  pose: DeviationMultiplesPose;
}): ReactElement {
  const S = useStage(),
    page = pose.pages[pose.page],
    records = deviationRecords(scene);
  const positions = deviationPositions(scene),
    domain = deviationDomain(scene);
  const focused = records[page.record].quantity;
  const identity = deviationWrap('actor' in focused ? focused.actor : page.id).map((line, row) => ({
    id: `${page.id}:identity:${row}`,
    line,
    y: 38 + row * 28,
  }));
  const endpoints = domain.flatMap((value, column) =>
    deviationWrap(exactDeviationValue(value), 11).map((line, row) => ({
      id: `axis:${column}:${row}`,
      line,
      x: column === 0 ? 24 : 260,
      y: 356 + row * 28,
    })),
  );
  const text = (s: string, x: number, y: number) => (
    <text x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {s}
    </text>
  );
  return (
    <g data-deviation-page={pose.page} data-record-id={page.id}>
      {text(scene.storyId === '23' ? 'Signed deviation' : 'Shared source axes', 24, 38)}
      {records.map((r, i) => {
        const y = 94 + i * 64;
        const opacity = i === 0 ? pose.action : pose.response;
        const markers = positions[i].map((value, alternative) => ({
          id: `${r.id}:${alternative}`,
          value,
        }));
        return (
          <g key={r.id} data-source-id={r.id} data-state={r.quantity.state}>
            {text(`${r.label}${page.record === i ? ' • focus' : ''}`, 24, y - 16)}
            <path d={`M40 ${y}H440M40 ${y - 5}v10M440 ${y - 5}v10`} fill="none" stroke={S.muted} />
            <g opacity={opacity}>
              {markers.map((marker) => (
                <circle
                  key={marker.id}
                  cx={40 + marker.value * 400}
                  cy={y}
                  r={6}
                  fill={r.quantity.state === 'known' ? S.accent : S.card}
                  stroke={S.text}
                  strokeDasharray={r.quantity.state === 'known' ? undefined : '2 2'}
                />
              ))}
              {positions[i].length === 0 && text(r.quantity.state, 300, y - 16)}
            </g>
          </g>
        );
      })}
      {scene.storyId === '23' && positions[0].length === 1 && positions[1].length === 1 && (
        <g opacity={pose.check} data-relation="observation-minus-target">
          <path
            d={`M${40 + positions[0][0] * 400} 220V252H${40 + positions[1][0] * 400}V220`}
            stroke={S.accent}
            fill="none"
          />
          <path d={`M${36 + positions[1][0] * 400} 226l4 -6l4 6`} stroke={S.accent} fill="none" />
          {text('Observation minus target', 24, 284)}
        </g>
      )}
      {text('Min', 24, 328)}
      {text('Max', 260, 328)}
      {endpoints.map((row) => (
        <g key={row.id}>{text(row.line, row.x, row.y)}</g>
      ))}
      {text(`Record ${page.record + 1}/${records.length}`, 24, 410)}
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {identity.map((row) => (
        <g key={row.id}>{text(row.line, 500, row.y)}</g>
      ))}
      {page.lines.map((line, i) => (
        <g key={page.lineIds[i]}>
          {text(line, DEVIATION_DETAIL.x, DEVIATION_DETAIL.y + i * DEVIATION_DETAIL.leading)}
        </g>
      ))}
      {text(`Source lens ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
