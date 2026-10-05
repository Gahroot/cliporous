import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  interferenceCycleEligibility,
  interferenceCyclePages,
  interferenceCyclePose,
  interferenceCycleTraces,
} from './interference-cycle-poses';
import type { ExpansionInterferenceCycleScene } from './interference-cycle-types';

export function InterferenceCycleDiagram({
  scene,
  t,
}: {
  scene: ExpansionInterferenceCycleScene;
  t: number;
}): ReactElement {
  const S = useStage();
  const pose = interferenceCyclePose(scene, t);
  const pages = interferenceCyclePages(scene);
  const page = pages[pose.page];
  const traces = interferenceCycleTraces(scene);
  const eligibility = interferenceCycleEligibility(scene);
  const text = (value: string, y: number, key = value): ReactElement => (
    <text key={key} x={30} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {value}
    </text>
  );
  return (
    <g data-template={scene.template} data-source-page={page.id}>
      <rect x={8} y={216} width={936} height={254} rx={12} fill={S.card} />
      {scene.storyId === '77' ? (
        <g>
          {(['amplitude', 'frequency', 'phaseData', 'domainDuration'] as const).map((name, row) =>
            text(
              `Input 1 ${name === 'phaseData' ? 'phase' : name === 'domainDuration' ? 'duration' : name}: ${scene.waves[0][name].state}; Input 2: ${scene.waves[1][name].state}`,
              36 + row * 28,
              name,
            ),
          )}
          <path d="M100 130V158H800M100 145H800" fill="none" stroke={S.muted} strokeWidth={2} />
          {traces
            ? traces.map((points, i) => (
                <polyline
                  key={scene.waves[i]?.id ?? 'expansion-77-derived-sum'}
                  data-trace={scene.waves[i]?.id ?? 'expansion-77-derived-sum'}
                  points={points}
                  fill="none"
                  stroke={[S.accent, S.text, S.muted][i]}
                  strokeWidth={3}
                />
              ))
            : text(
                eligibility === 'resolution-unavailable'
                  ? 'Graphic resolution unavailable (64 samples; 8/cycle)'
                  : 'Unavailable parameters: no inferred curve or zero',
                150,
              )}
          {text(
            traces?.length === 3
              ? 'Analytic teaching curves; derived sum, not measured'
              : traces
                ? 'Analytic teaching curves; unequal domains — no sum'
                : eligibility === 'resolution-unavailable'
                  ? 'Source values/states retained; no inferred curve or sum'
                  : 'No analytic curve without complete supplied parameters',
            174,
          )}
        </g>
      ) : (
        <g>
          {text('Source state cycle — not a physical simulation', 36)}
          {scene.records.map((record, i) => (
            <g key={record.id}>
              <rect
                x={40 + i * 290}
                y={65}
                width={270}
                height={106}
                rx={10}
                fill={S.card}
                stroke={S.accent}
                strokeWidth={2}
              />
              <text x={54 + i * 290} y={96} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
                {record.role}
              </text>
              <text x={54 + i * 290} y={124} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
                {record.state}
              </text>
              <text x={54 + i * 290} y={154} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
                {(i === 0 ? record.value : record.value?.split(' ')[2]) ?? 'Not supplied'}
              </text>
            </g>
          ))}
        </g>
      )}
      <g data-state={page.state} data-font-minimum={22}>
        {page.lines.map((line, i) => text(line, 240 + i * 28, `${page.id}/${i}`))}
      </g>
      <text x={830} y={465} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
        {pose.page + 1}/{pages.length}
      </text>
    </g>
  );
}
