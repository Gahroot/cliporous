import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  RANKING_CALENDAR_DETAIL as D,
  type RankingCalendarPose,
  rankingRankDomain,
  rankingRankTracks,
} from './ranking-calendar-poses';
import type { ExpansionRankingCalendarScene } from './ranking-calendar-types';

/** Both render modes share this sole owner of every source fact. Left context never disappears. */
export function RankingCalendarDiagram({
  scene,
  pose,
}: {
  scene: ExpansionRankingCalendarScene;
  pose: RankingCalendarPose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const text = (value: string, x: number, y: number) => (
    <text x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {value}
    </text>
  );
  return (
    <g data-ranking-calendar-page={pose.page} data-record-id={page.id}>
      {scene.storyId === '21' ? (
        <g data-context="author-ordered-tracks">
          {text('Supplied rank states', 12, 38)}
          {text('Earlier', 160, 68)}
          {text('Later', 320, 68)}
          {rankingRankDomain(scene).map((rank, i, domain) => (
            <g key={`endpoint-${i === 0 ? 'first' : 'last'}`}>
              {text(String(rank), 12, domain[0] === domain[1] ? 218 + i * 28 : 108 + i * 220)}
            </g>
          ))}
          {text('No rank', 12, 362)}
          {rankingRankTracks(scene).map((track) => (
            <g key={track.actorId} data-actor-id={track.actorId}>
              <path
                d={`M${track.points[0].x} ${track.points[0].y}L${track.points[1].x} ${track.points[1].y}`}
                stroke={track.points.some((p) => p.record.id === page.id) ? S.accent : S.muted}
                strokeDasharray={
                  track.points.some((p) => p.record.rank === undefined) ? '3 2' : undefined
                }
                opacity={pose.response}
                fill="none"
              />
              {track.points.map(({ record: r, x, y, tied }) => (
                <g
                  key={r.id}
                  data-source-record={r.id}
                  data-state={r.quantity.state}
                  data-unranked={Boolean(r.unrankedEvidence)}
                  data-tied={tied}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={5}
                    fill={r.id === page.id ? S.accent : S.card}
                    stroke={S.text}
                    strokeDasharray={r.rank === undefined ? '3 2' : undefined}
                  />
                </g>
              ))}
            </g>
          ))}
          {text('Identity tracks, not scores', 12, 390)}
        </g>
      ) : (
        <g data-context="supplied-calendar-periods">
          {text('Supplied calendar records', 12, 38)}
          {scene.records.map((r, i) => {
            const x = 12 + (i % 4) * 116;
            const y = 64 + Math.floor(i / 4) * 98;
            return (
              <g key={r.id} data-source-record={r.id} data-state={r.quantity.state}>
                <rect
                  x={x}
                  y={y}
                  width={108}
                  height={88}
                  rx={8}
                  fill={r.id === page.id ? S.card : 'none'}
                  stroke={r.id === page.id ? S.accent : S.muted}
                />
                {text(`R${i + 1}`, x + 8, y + 26)}
                {text(String(r.calendar.year), x + 8, y + 52)}
                {text(`M${r.calendar.month}`, x + 8, y + 78)}
              </g>
            );
          })}
          {text('No unsupplied periods', 12, 390)}
        </g>
      )}
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {page.lines.map((line, i) => (
        <g key={page.lineIds[i]}>{text(line, D.x, D.y + i * D.lineHeight)}</g>
      ))}
      {text(`Source lens ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
