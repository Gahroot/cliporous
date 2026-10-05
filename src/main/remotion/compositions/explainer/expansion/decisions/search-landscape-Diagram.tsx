import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  SEARCH_SLOTS,
  searchLabel,
  searchLines,
  searchPages,
  searchPose,
  searchWellSlots,
} from './search-landscape-poses';
import type { ExpansionSearchLandscapeScene } from './search-landscape-types';

export function SearchLandscapeDiagram({
  scene,
  t,
}: {
  scene: ExpansionSearchLandscapeScene;
  t: number;
}): ReactElement {
  const S = useStage(),
    pose = searchPose(scene, t);
  const pages = searchPages(scene),
    page = pages[pose.page];
  if (!page) throw new Error('Invalid authored source page');
  const text = (id: string, value: string, x: number, y: number, columns = 19) =>
    searchLines(value, columns)
      .map((line, i) => ({
        line,
        baseline: y + i * 28,
        key: `${scene.storyId}/${id}/${line}/${i}`,
      }))
      .map(({ line, baseline, key }) => (
        <text key={key} x={x} y={baseline} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
          {line}
        </text>
      ));
  return (
    <g data-template={scene.template} data-qualification={scene.qualification}>
      {scene.storyId === '29' ? (
        <g opacity={pose.reveal}>
          {scene.links.map((l) => {
            const from = scene.nodes.find((n) => n.id === l.fromId),
              to = scene.nodes.find((n) => n.id === l.toId);
            if (!from || !to) throw new Error('Lost source link');
            const a = SEARCH_SLOTS[from.slot],
              b = SEARCH_SLOTS[to.slot];
            const distance = Math.hypot(b[0] - a[0], b[1] - a[1]),
              ux = (b[0] - a[0]) / distance,
              uy = (b[1] - a[1]) / distance;
            const tip = [b[0] - ux * 32, b[1] - uy * 32];
            const arrow = `M${tip[0]} ${tip[1]}L${tip[0] - ux * 12 - uy * 5} ${tip[1] - uy * 12 + ux * 5}L${tip[0] - ux * 12 + uy * 5} ${tip[1] - uy * 12 - ux * 5}Z`;
            const route = scene.route.nodeIds.some(
              (id, i, ids) => id === l.fromId && ids[i + 1] === l.toId,
            );
            return (
              <g
                key={`${l.fromId}/${l.toId}`}
                data-from-id={l.fromId}
                data-to-id={l.toId}
                data-status={l.status}
              >
                <path
                  d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`}
                  fill="none"
                  stroke={route && pose.check > 0 ? S.accent : S.muted}
                  strokeWidth={route ? 5 : 2}
                  strokeDasharray={
                    l.status === 'open' ? undefined : l.status === 'blocked' ? '2 3' : '8 6'
                  }
                  opacity={pose.action}
                />
                <path
                  data-direction="supplied"
                  d={arrow}
                  fill={route && pose.check > 0 ? S.accent : S.muted}
                  opacity={pose.action}
                />
                {l.status === 'blocked' && (
                  <path
                    d={`M${(a[0] + b[0]) / 2 - 8} ${(a[1] + b[1]) / 2 - 8}l16 16m-16 0l16 -16`}
                    stroke={S.text}
                    strokeWidth={3}
                  />
                )}
              </g>
            );
          })}
          {scene.nodes.map((n) => {
            const [x, y] = SEARCH_SLOTS[n.slot];
            return (
              <g
                key={n.id}
                data-node-id={n.id}
                data-entity-id={n.entityId}
                data-status={n.status}
                data-slot={n.slot}
                data-goal={n.id === scene.goalId}
                data-frontier-order={scene.frontier.nodeIds.indexOf(n.id)}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={22}
                  fill={S.card}
                  stroke={n.status === 'blocked' ? S.text : S.accent}
                  strokeWidth={3}
                  strokeDasharray={
                    n.status === 'open' || n.status === 'blocked' ? undefined : '5 4'
                  }
                />
                {n.id === scene.goalId && (
                  <rect
                    x={x - 32}
                    y={y - 32}
                    width={64}
                    height={64}
                    rx={8}
                    fill="none"
                    stroke={S.text}
                    strokeWidth={2}
                  />
                )}
                {scene.frontier.nodeIds.includes(n.id) && (
                  <circle
                    cx={x}
                    cy={y}
                    r={28}
                    fill="none"
                    stroke={S.accent}
                    strokeWidth={2}
                    opacity={pose.response}
                  />
                )}
                {text(
                  `${n.id}/symbol`,
                  n.status === 'blocked' ? '×' : n.status === 'open' ? '' : '?',
                  x - 7,
                  y + 7,
                )}
                {text(
                  `${n.id}/label`,
                  searchLabel(scene, n.entityId),
                  Math.min(330, Math.max(8, x - 65)),
                  y + 52,
                  7,
                )}
                {text(`${n.id}/status`, n.status, Math.min(330, Math.max(8, x - 65)), y - 40, 8)}
              </g>
            );
          })}
        </g>
      ) : (
        <g opacity={pose.reveal}>
          {scene.wells.map((w, i) => {
            const [x, y] = searchWellSlots(scene)[i];
            return (
              <g key={w.id} data-well-id={w.id} data-entity-id={w.entityId} data-role={w.role}>
                <path
                  data-schematic-role={w.role}
                  d={`M${x - 108} 138C${x - 70} 138 ${x - 70} ${y} ${x} ${y}S${x + 70} 138 ${x + 108} 138`}
                  fill="none"
                  stroke={w.role === 'unresolved' ? S.muted : S.accent}
                  strokeWidth={4}
                  strokeDasharray={w.role === 'unresolved' ? '6 5' : undefined}
                />
                <circle cx={x} cy={y} r={9} fill={w.role === 'unresolved' ? S.muted : S.accent} />
                {text(`${w.id}/label`, searchLabel(scene, w.entityId), x - 88, y + 48, 9)}
                {text(`${w.id}/role`, w.role, x - 88, y + 160, 9)}
              </g>
            );
          })}
          <path
            data-from-id={scene.branch.fromId}
            data-to-id={scene.branch.toId}
            data-status={scene.branch.status}
            d={
              scene.branch.fromId === scene.wells[0].id
                ? 'M148 100H332M320 92L332 100L320 108'
                : 'M332 100H148M160 92L148 100L160 108'
            }
            fill="none"
            stroke={S.text}
            strokeWidth={3}
            strokeDasharray={scene.branch.status === 'unresolved' ? '6 5' : undefined}
            opacity={pose.check}
          />
          {text('schematic', 'Schematic only', 24, 36)}
        </g>
      )}
      <rect x={488} y={8} width={456} height={462} rx={12} fill={S.card} />
      <g key={page.id} data-page-id={page.id} data-active={true} opacity={pose.reveal}>
        {page.lines
          .map((line, j) => ({
            line,
            baseline: 38 + j * 28,
            key: `${scene.storyId}/${page.id}/${line}/${j}`,
          }))
          .map(({ line, baseline, key }) => (
            <text key={key} x={500} y={baseline} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
              {line}
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
