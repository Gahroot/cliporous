import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  type DistributionPose,
  distributionHistogram,
  distributionTable,
  distributionWrap,
} from './distribution-poses';
import type { ExpansionDistributionScene } from './distribution-types';

export function DistributionDiagram({
  scene,
  pose,
}: {
  scene: ExpansionDistributionScene;
  pose: DistributionPose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const text = (s: string, x: number, y: number, key = s) => (
    <text key={key} x={x} y={y} fill={S.text} fontFamily={UI_FONT} fontSize={22}>
      {s}
    </text>
  );
  return (
    <g data-story={scene.storyId} data-source-id={page.id} data-page={pose.page}>
      {text(scene.storyId === '17' ? 'Supplied distribution' : 'Linked scope tables', 16, 34)}
      {scene.storyId === '17' ? (
        <>
          {text(
            scene.representation === 'bins'
              ? 'Ordered bins; no smoothing'
              : 'Only supplied observations',
            16,
            66,
          )}
          <path d="M16 108V300H470" stroke={S.muted} fill="none" />
          {distributionHistogram(scene).map((r, i) => {
            const x = 28 + i * 36,
              baseline = 280 - r.baseline * 160;
            return (
              <g key={r.id} data-record-id={r.id} data-state={r.state}>
                <rect
                  x={x - 6}
                  y={104}
                  width={30}
                  height={202}
                  rx={3}
                  fill="none"
                  stroke={i === pose.record ? S.accent : S.muted}
                />
                {r.positions.map((v, j) => {
                  const y = 280 - v * 160;
                  return scene.representation === 'observations' || v === r.baseline ? (
                    <circle
                      key={`${r.id}:alternative:${v}`}
                      data-zero={
                        scene.representation === 'bins' && v === r.baseline ? true : undefined
                      }
                      cx={x + j * 8}
                      cy={y}
                      r={4}
                      fill={S.accent}
                    />
                  ) : (
                    <rect
                      key={`${r.id}:alternative:${v}`}
                      x={x + j * 8}
                      y={Math.min(y, baseline)}
                      width={7}
                      height={Math.abs(y - baseline)}
                      fill={S.accent}
                    />
                  );
                })}
                {text(String(i + 1), x - 4, 336, r.id)}
                {r.positions.length === 0 && <path d={`M${x} 192h10m-5-5v10`} stroke={S.muted} />}
              </g>
            );
          })}
          {text(`Source record ${pose.record + 1}`, 16, 374)}
          {text('Common axis / exact bounds →', 16, 406)}
          {text('Equal slots; not interval widths', 16, 438)}
        </>
      ) : (
        <>
          {text('Scope', 24, 66)}
          {text('A1 rate', 120, 66)}
          {text('A2 rate', 300, 66)}
          {distributionTable(scene).map((row, i) => (
            <g
              key={row.scopeId}
              data-scope-id={row.scopeId}
              data-actor-ids={row.actorIds.join(' ')}
              data-result={row.state}
              data-relation={row.relation}
            >
              <rect x={16} y={82 + i * 76} width={454} height={76} fill="none" stroke={S.muted} />
              {text(row.label, 24, 108 + i * 76, `${row.scopeId}:scope`)}
              {text(row.relation, 24, 140 + i * 76, `${row.scopeId}:relation`)}
              {row.values.map((value, a) =>
                distributionWrap(value, 9).map((s, j) =>
                  text(
                    s,
                    120 + a * 180,
                    108 + i * 76 + j * 22,
                    `${row.scopeId}:${row.actorIds[a]}:${j}`,
                  ),
                ),
              )}
            </g>
          ))}
        </>
      )}
      <path d="M480 8V470" stroke={S.muted} />
      {page.lines.map((s, i) => text(s, 492, 34 + i * 28, page.lineIds[i]))}
      {text(`Page ${pose.page + 1}/${pose.pages.length}`, 492, 454)}
    </g>
  );
}
