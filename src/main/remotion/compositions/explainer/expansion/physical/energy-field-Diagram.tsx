import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import type { EnergyFieldPose } from './energy-field-poses';
import type { ExpansionEnergyFieldScene } from './energy-field-types';
export function EnergyFieldDiagram({
  scene,
  pose,
}: {
  scene: ExpansionEnergyFieldScene;
  pose: EnergyFieldPose;
}): ReactElement {
  const S = useStage(),
    page = pose.pages[pose.page];
  const text = (value: string, y: number) => (
    <text key={y} x={16} y={y} fill={S.text} fontFamily={UI_FONT} fontSize={22}>
      {value}
    </text>
  );
  return (
    <g data-page={pose.page} data-state={page.state}>
      <rect x={0} y={0} width={740} height={478} rx={16} fill={S.card} />
      {text(page.state, 30)}
      {page.qualification.map((line, i) => text(line, 60 + i * 26))}
      {page.lines.map((line, i) => text(line, 240 + i * 28))}
      {scene.storyId === '80' ? (
        <g transform="translate(842 250)" opacity={pose.fieldVisible ? 1 : 0}>
          {pose.arrows.map((a, i) => (
            <g key={`${a.x}:${a.y}`} data-arrow={i}>
              {a.available ? (
                <path
                  d={`M${a.x} ${a.y}l${a.dx} ${a.dy}m${-a.dx * 0.3 - a.dy * 0.2} ${-a.dy * 0.3 + a.dx * 0.2}l${a.dx * 0.3 + a.dy * 0.2} ${a.dy * 0.3 - a.dx * 0.2}l${-a.dx * 0.3 + a.dy * 0.2} ${-a.dy * 0.3 - a.dx * 0.2}`}
                  stroke={S.accent}
                  strokeWidth={3}
                  fill="none"
                />
              ) : (
                <circle cx={a.x} cy={a.y} r={5} fill="none" stroke={S.muted} />
              )}
            </g>
          ))}
        </g>
      ) : (
        <g>
          <path
            d="M760 230H900L885 218M900 230L885 242"
            stroke={S.accent}
            strokeWidth={3}
            fill="none"
          />
          <text x={745} y={285} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
            Transfer
          </text>
          <text x={745} y={313} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
            not balance
          </text>
          <text x={745} y={345} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
            Illustrative
          </text>
        </g>
      )}
    </g>
  );
}
