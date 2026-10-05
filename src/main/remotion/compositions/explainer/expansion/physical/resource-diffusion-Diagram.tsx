import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import type { ResourceDiffusionPose } from './resource-diffusion-poses';
import type { ExpansionResourceDiffusionScene } from './resource-diffusion-types';

export function ResourceDiffusionDiagram({
  scene,
  pose,
}: {
  scene: ExpansionResourceDiffusionScene;
  pose: ResourceDiffusionPose;
}): ReactElement {
  const S = useStage(),
    page = pose.pages[pose.page];
  const text = (s: string, x: number, y: number, key?: string) => (
    <text key={key} x={x} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {s}
    </text>
  );
  return (
    <g data-resource-diffusion-page={pose.page} data-source-id={page.id} data-state={page.state}>
      {text(scene.storyId === '75' ? 'Shared resource' : 'Diffusion / filter', 20, 38)}
      {text('Analytic teaching rig', 20, 76)}
      {text('Not real physics', 20, 108)}
      {text('No inferred rates or allocation', 20, 140)}
      {text(
        scene.storyId === '75' ? `Decision: ${scene.decision.state}` : `Model: ${scene.model}`,
        20,
        180,
      )}
      {text(
        scene.storyId === '75'
          ? `Result: ${scene.decision.result}`
          : `Result: ${scene.result.relation}`,
        20,
        212,
      )}
      {text(
        scene.storyId === '75' ? 'Access rule: source-paged' : 'Filter rule: source-paged',
        20,
        244,
      )}
      <g data-teaching-apparatus="true" fill="none" stroke={S.muted} strokeWidth={3}>
        <rect x={38} y={326} width={132} height={110} rx={scene.storyId === '76' ? 32 : 8} />
        <rect x={226} y={326} width={132} height={110} rx={8} />
        {scene.storyId === '76' &&
          [246, 266, 286, 306, 326].map((x) => <path key={x} d={`M${x} 326V436`} />)}
      </g>
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {text(`State: ${page.state}`, 500, 44)}
      {page.lines.map((line, i) => text(line, 500, 84 + i * 30, `${page.id}:${page.part}:${i}`))}
      {text(`Part ${page.part + 1}/${page.parts}`, 500, 406)}
      {text(`Source page ${pose.page + 1}/${pose.pages.length}`, 500, 448)}
    </g>
  );
}
