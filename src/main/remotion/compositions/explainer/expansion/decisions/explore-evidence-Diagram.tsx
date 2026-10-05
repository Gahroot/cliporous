import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  type ExploreEvidencePose,
  exploreEvidenceLines,
  exploreEvidencePages,
  exploreEvidenceRecords,
} from './explore-evidence-poses';
import type { ExpansionExploreEvidenceScene } from './explore-evidence-types';

export function ExploreEvidenceText({
  text,
  x,
  y,
  width = 880,
}: {
  text: string;
  x: number;
  y: number;
  width?: number;
}): ReactElement {
  const S = useStage(),
    lines = exploreEvidenceLines(text, width);
  if (y + lines.length * 24 > 478) throw new RangeError('Source text requires another page');
  return (
    <text
      x={x}
      y={y + 22}
      fontFamily={UI_FONT}
      fontSize={22}
      fill={S.text}
      data-source-text={text}
      data-x={x}
      data-y={y}
      data-width={width}
      data-lines={lines.length}
    >
      {lines.map((line, i) => {
        const sourcePrefix = lines.slice(0, i + 1).join('');
        return (
          <tspan key={sourcePrefix} x={x} dy={i ? 24 : 0}>
            {line}
          </tspan>
        );
      })}
    </text>
  );
}
/** Same precision plane in both modes. Stable options above an ordered event/test rail. */
export function ExploreEvidenceDiagram({
  scene,
  pose,
}: {
  scene: ExpansionExploreEvidenceScene;
  pose: ExploreEvidencePose;
}): ReactElement {
  const S = useStage(),
    records = exploreEvidenceRecords(scene),
    page = exploreEvidencePages(scene)[pose.pageIndex];
  return (
    <g data-story={scene.storyId} opacity={pose.reveal}>
      {scene.entities.map((entity, i) => (
        <g key={entity.id} data-option-id={entity.id}>
          <rect
            x={28 + i * 228}
            y={6}
            width={216}
            height={108}
            rx={8}
            fill={S.card}
            stroke={S.accent}
            strokeWidth={2}
          />
          <ExploreEvidenceText text={entity.label} x={36 + i * 228} y={10} width={200} />
        </g>
      ))}
      <ExploreEvidenceText text={`${scene.scope}; ${scene.period}`} x={36} y={116} />
      <path d={`M52 200H${52 + (records.length - 1) * 72}`} stroke={S.muted} strokeWidth={3} />
      {records.map((record, i) => (
        <g
          key={record.id}
          data-record-id={record.id}
          data-option-ref={record.optionId}
          data-state={record.state}
          data-order={i + 1}
        >
          <circle
            cx={52 + i * 72}
            cy={200}
            r={17}
            fill={record.id === page.id ? S.accent : S.card}
            stroke={S.text}
            strokeWidth={2}
          />
          <text
            x={52 + i * 72}
            y={207}
            textAnchor="middle"
            fontFamily={UI_FONT}
            fontSize={22}
            fill={S.text}
          >
            {i + 1}
          </text>
        </g>
      ))}
      <g
        data-page-id={page.id}
        data-phase={page.phase}
        data-option-ref={page.optionId}
        opacity={pose.action}
      >
        <ExploreEvidenceText text={page.text} x={36} y={230} />
      </g>
    </g>
  );
}
