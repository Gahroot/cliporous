import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import { FIT_SCALE_SHAPES, type FitScalePose } from './fit-scale-poses';
import type { ExpansionFitScaleScene } from './fit-scale-types';
export function FitScaleDiagram({
  scene,
  pose,
}: {
  scene: ExpansionFitScaleScene;
  pose: FitScalePose;
}): ReactElement {
  const S = useStage();
  const qualification =
    'condition' in scene.result
      ? scene.result.condition
      : 'qualifier' in scene.result
        ? scene.result.qualifier
        : '';
  const qualificationLines = Array.from(
    { length: Math.ceil(qualification.length / 18) },
    (_, i) => ({
      id: `${scene.result.id}:qualification:${i * 18}`,
      text: qualification.slice(i * 18, (i + 1) * 18),
    }),
  );
  const rect = (id: string, shape: readonly number[], accent = false) => (
    <rect
      key={id}
      data-source-id={id}
      x={shape[0]}
      y={shape[1]}
      width={shape[2]}
      height={shape[3]}
      fill={accent ? S.accent : 'none'}
      stroke={S.muted}
      strokeWidth={3}
    />
  );
  return (
    <g data-page-id={pose.pages[pose.page].id} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      <text x={40} y={38}>
        Supplied {scene.result.state}
      </text>
      {qualificationLines.map((line, i) => (
        <text key={line.id} x={40} y={66 + i * 28}>
          {line.text}
        </text>
      ))}
      {scene.storyId === '59' ? (
        <>
          {rect(scene.result.containerId, FIT_SCALE_SHAPES.tray)}
          {rect(scene.result.partId, [160, pose.blockY, 140, 70], true)}
          <path d="M300 350H440M300 340v20M440 340v20" stroke={S.muted} fill="none" />
          <text x={40} y={430}>
            Schematic clearance
          </text>
          <text x={40} y={466}>
            Supplied verdict: {scene.result.verdict}
          </text>
        </>
      ) : (
        <>
          {rect(scene.records[2].id, FIT_SCALE_SHAPES.building)}
          {rect(scene.records[1].id, FIT_SCALE_SHAPES.room)}
          {rect(scene.records[0].id, FIT_SCALE_SHAPES.object, true)}
          <text x={52} y={244}>
            Building
          </text>
          <text x={112} y={284}>
            Room
          </text>
          <text x={202} y={328}>
            Object
          </text>
          <text x={40} y={430}>
            Supplied identity
          </text>
          <text x={40} y={466}>
            Continuity: {scene.result.state}
          </text>
        </>
      )}
      {pose.pages[pose.page].lines.map((line, i) => (
        <text key={pose.pages[pose.page].lineIds[i]} x={492} y={38 + i * 28}>
          {line}
        </text>
      ))}
    </g>
  );
}
