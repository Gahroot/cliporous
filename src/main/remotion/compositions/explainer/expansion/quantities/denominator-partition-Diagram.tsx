import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import type { ExpansionQuantity } from '../value-types';
import {
  type DenominatorPartitionPose,
  denominatorDomain,
  denominatorExact,
  denominatorPartitionSegments,
  denominatorPositions,
  denominatorRelative,
} from './denominator-partition-poses';
import type { ExpansionDenominatorPartitionScene } from './denominator-partition-types';

/** All quantities remain planar in both modes. Rails encode amounts, never invented people. */
export function DenominatorPartitionDiagram({
  scene,
  pose,
}: {
  scene: ExpansionDenominatorPartitionScene;
  pose: DenominatorPartitionPose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const text = (s: string, x: number, y: number) => (
    <text x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {s}
    </text>
  );
  const rows: { id: string; label: string; q: ExpansionQuantity }[] =
    scene.storyId === '19'
      ? scene.comparisons.flatMap((r, i) => [
          { id: `${r.entityId}:amount`, label: `${i + 1} A`, q: r.amount },
          { id: `${r.entityId}:reference`, label: `${i + 1} R`, q: r.reference },
        ])
      : [
          { id: scene.wholeId, label: 'Total', q: scene.total },
          ...scene.parts.map((r, i) => ({
            id: r.entityId,
            label: `${i + 1}${r.role === 'remainder' ? ' R' : ' P'}`,
            q: r.quantity,
          })),
        ];
  return (
    <g>
      {text(scene.storyId === '19' ? 'A amount / R reference' : 'P part / R remainder', 8, 34)}
      {denominatorDomain(scene).map((value, index) => {
        const chars = Array.from(denominatorExact(value));
        return (
          <g key={denominatorExact(value)}>
            {text(index === 0 ? 'Domain start' : 'Domain end', 8 + index * 240, 62)}
            {text(chars.slice(0, 12).join(''), 8 + index * 240, 90)}
            {text(chars.slice(12).join(''), 8 + index * 240, 118)}
          </g>
        );
      })}
      <g opacity={pose.reveal}>
        {rows.map((r, index) => {
          const y = 152 + index * 22;
          const positions = denominatorPositions(scene, r.q);
          return (
            <g key={r.id} data-entity-id={r.id} data-state={r.q.state}>
              {text(r.label, 8, y + 6)}
              <path d={`M82 ${y}H446`} stroke={S.muted} fill="none" />
              {positions.length === 0 ? (
                <path
                  data-unknown={r.q.state}
                  d={`M82 ${y - 7}h14v14H82Z`}
                  fill="none"
                  stroke={S.text}
                  strokeDasharray="3 3"
                />
              ) : (
                positions.map((v) => (
                  <circle
                    key={`${r.id}:${v}`}
                    cx={82 + v * 364}
                    cy={y}
                    r={4}
                    fill={S.accent}
                    stroke={S.text}
                    strokeDasharray={r.q.state === 'known' ? undefined : '2 2'}
                  />
                ))
              )}
            </g>
          );
        })}
      </g>
      {text('Aggregate quantities', 8, scene.storyId === '19' ? 246 : 318)}
      {scene.storyId === '19' && denominatorRelative(scene).length > 0 && (
        <g opacity={pose.response}>
          {text('Authored ratios', 8, 278)}
          {[denominatorRelative(scene)[0].low, denominatorRelative(scene)[0].high].map(
            (value, index) => {
              const chars = Array.from(denominatorExact(value));
              return (
                <g key={denominatorExact(value)} data-ratio-bound={index}>
                  {text(chars.slice(0, 12).join(''), 82 + index * 218, 304)}
                  {text(chars.slice(12).join(''), 82 + index * 218, 326)}
                </g>
              );
            },
          )}
          {denominatorRelative(scene).map((r, index) => (
            <g key={r.id} data-derived-id={r.id}>
              {text(`D${r.index + 1}`, 8, 354 + index * 28)}
              <path d={`M82 ${348 + index * 28}H446`} stroke={S.muted} />
              <circle cx={82 + r.position * 364} cy={348 + index * 28} r={4} fill={S.accent} />
            </g>
          ))}
          {text('Exact bases in lens', 8, 426)}
        </g>
      )}
      {scene.storyId === '20' && (
        <g opacity={pose.check} data-partition-axis="zero-to-source-whole">
          {text('Known parts -> total', 8, 350)}
          {denominatorPartitionSegments(scene).map((part) => (
            <rect
              key={part.id}
              data-part-id={part.id}
              x={82 + part.start * 364}
              y={370}
              width={(part.end - part.start) * 364}
              height={16}
              fill={S.accent}
              stroke={S.text}
            />
          ))}
          {text('Unvalued parts: no fill', 8, 426)}
        </g>
      )}
      {text(`Source lens ${pose.record + 1}`, 8, 454)}
      <g data-source-entity={page.id}>
        {page.lines.map((line, i) => (
          <g key={page.lineIds[i]} data-source-line={page.lineIds[i]}>
            {text(line, 492, 34 + i * 28)}
          </g>
        ))}
        {text(`Page ${pose.page + 1}/${pose.pages.length}`, 492, 454)}
      </g>
    </g>
  );
}
