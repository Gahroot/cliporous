import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  type GeneralizationDriftPose,
  generalizationDriftWrap,
} from './generalization-drift-poses';
import type { ExpansionGeneralizationDriftScene } from './generalization-drift-types';

/** The split is never an outcome axis: equal lanes, no inferred accuracy/error bars. */
export function GeneralizationDriftDiagram({
  scene,
  pose,
}: {
  scene: ExpansionGeneralizationDriftScene;
  pose: GeneralizationDriftPose;
}): ReactElement {
  const S = useStage(),
    page = pose.pages[pose.page];
  const text = (value: string, x: number, y: number) => (
    <text key={`${x}:${y}`} x={x} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {value}
    </text>
  );
  return (
    <g data-generalization-drift-page={pose.page} data-category={page.category}>
      {scene.records.map((r, column) => {
        const x = 12 + column * 476;
        return (
          <g
            key={r.id}
            data-record-id={r.id}
            data-dataset-id={r.datasetId}
            data-state={r.result.state}
          >
            <rect x={x} y={8} width={452} height={386} rx={12} fill={S.card} stroke={S.muted} />
            {text(r.role, x + 16, 38)}
            {text(r.result.state, x + 238, 36)}
            {generalizationDriftWrap(
              scene.entities.find((e) => e.id === r.datasetId)?.label ?? r.datasetId,
            ).map((line, i) => text(line, x + 16, 66 + i * 28))}
            {page.lanes[column].map((line, i) => text(line, x + 16, 126 + i * 28))}
            {text(page.category, x + 16, 378)}
            <path
              d={`M${x + 120} 410H${x + 332}M${x + 226} 402V418`}
              stroke={S.accent}
              fill="none"
            />
            {text(
              r.role === 'held-out'
                ? 'Separate examples'
                : r.role === 'changed'
                  ? 'Changed scope'
                  : 'Source examples',
              x + 16,
              464,
            )}
          </g>
        );
      })}
    </g>
  );
}
