import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import { projectGeometryPoint } from '../kits/geometry';
import {
  exactText,
  type RegionsDimensionsPose,
  regionPlacement,
  wrapSource,
} from './regions-dimensions-poses';
import type { ExpansionRegionsDimensionsScene } from './regions-dimensions-types';

function sourceLines(lines: readonly string[], sourceId: string): { id: string; text: string }[] {
  return lines.map((text, row) => ({ id: `${sourceId}:line:${row}`, text }));
}

/** Persistent planar quantities in both modes. The teaching shape is explicitly schematic. */
export function RegionsDimensionsDiagram({
  scene,
  pose,
}: {
  scene: ExpansionRegionsDimensionsScene;
  pose: RegionsDimensionsPose;
}): ReactElement {
  const S = useStage();
  const text = (s: string, x: number, y: number) => (
    <text x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {s}
    </text>
  );
  const page = pose.pages[pose.page];
  const placement = regionPlacement(pose);
  const cube = [
    [-0.6, -0.6, -0.6],
    [0.6, -0.6, -0.6],
    [0.6, 0.6, -0.6],
    [-0.6, 0.6, -0.6],
    [-0.6, -0.6, 0.6],
    [0.6, -0.6, 0.6],
    [0.6, 0.6, 0.6],
    [-0.6, 0.6, 0.6],
  ] as const;
  return (
    <g data-page-id={page.id} data-story={scene.storyId}>
      {text('Schematic, not measured', 12, 30)}
      {scene.storyId === '63' ? (
        <g>
          {text(`${pose.relation} / ${scene.overlap.state}`, 12, 70)}
          {placement.centers.map((x, i) => (
            <g key={scene.regionIds[i]} data-region-id={scene.regionIds[i]}>
              {pose.relation === 'unresolved' ? (
                <rect
                  data-identity-panel="true"
                  x={x - 80}
                  y={145}
                  width={160}
                  height={150}
                  fill={S.card}
                  stroke={S.muted}
                  strokeWidth={2}
                />
              ) : (
                <circle
                  cx={x}
                  cy={225}
                  r={placement.radius}
                  fill={S.card}
                  fillOpacity={0.45}
                  stroke={S.accent}
                  strokeWidth={3}
                />
              )}
              {text(`Region ${i + 1}`, x - 44, 115)}
              {'value' in scene.restriction && pose.restrictionRegion === i && (
                <path
                  d={`M${x - 42} 260h84m-84 10h84`}
                  stroke={S.muted}
                  strokeWidth={3}
                  opacity={pose.response}
                />
              )}
            </g>
          ))}
          {pose.relation === 'unresolved' && (
            <g data-no-chosen-relation="true">
              <path d="M192 220h60" stroke={S.muted} strokeDasharray="4 4" />
              {text('?', 220, 208)}
            </g>
          )}
          <g
            data-membership-id={scene.membership.id}
            data-region-id={scene.membership.regionId}
            data-other-region="not-asserted"
          >
            {text(`Membership: ${pose.member}`, 12, 348)}
            {text(`Region ${pose.memberRegion + 1} / ${scene.membership.state}`, 12, 376)}
            {text('Other region: not asserted', 12, 404)}
          </g>
          {text(`Restriction: ${scene.restriction.state}`, 12, 446)}
        </g>
      ) : (
        <g data-dimension={pose.exponent}>
          {pose.exponent === 1 ? (
            <path d="M80 245H370M80 234v22M370 234v22" stroke={S.accent} strokeWidth={4} />
          ) : pose.exponent === 2 ? (
            <rect
              x={155}
              y={110}
              width={140}
              height={140}
              fill={S.card}
              stroke={S.accent}
              strokeWidth={4}
            />
          ) : (
            [
              [0, 1],
              [1, 2],
              [2, 3],
              [3, 0],
              [4, 5],
              [5, 6],
              [6, 7],
              [7, 4],
              [0, 4],
              [1, 5],
              [2, 6],
              [3, 7],
            ].map(([a, b]) => {
              const from = projectGeometryPoint(cube[a]),
                to = projectGeometryPoint(cube[b]);
              return (
                <path
                  key={`${a}:${b}`}
                  d={`M${225 + from[0]} ${185 + from[1]}L${225 + to[0]} ${185 + to[1]}`}
                  stroke={S.accent}
                  strokeWidth={3}
                  fill="none"
                />
              );
            })
          )}
          {text(`Base × scale^${pose.exponent}`, 12, 70)}
          {text(
            `Source: ${scene.result.state === 'derived' ? scene.result.sourceState : scene.result.state}`,
            12,
            98,
          )}
          {(scene.result.state === 'derived'
            ? [
                { role: 'scale', value: `Scale: ${exactText(scene.result.operands[0])}` },
                { role: 'base', value: `Base: ${exactText(scene.result.operands[1])}` },
                { role: 'result', value: `Result: ${exactText(scene.result.result)}` },
              ]
            : [
                {
                  role: 'scale',
                  value: `Scale: ${'amount' in scene.scale.quantity && scene.scale.quantity.amount.kind === 'rational' ? exactText(scene.scale.quantity.amount.value) : scene.scale.quantity.state}`,
                },
                {
                  role: 'base',
                  value: `Base: ${'amount' in scene.original.quantity && scene.original.quantity.amount.kind === 'rational' ? exactText(scene.original.quantity.amount.value) : scene.original.quantity.state}`,
                },
                { role: 'result', value: `Result: ${scene.result.state}` },
              ]
          ).map(({ role, value }, block) => (
            <g key={role}>
              {sourceLines(wrapSource(value), `${scene.storyId}:${role}`).map((line, row) => (
                <g key={line.id}>{text(line.text, 12, 310 + block * 56 + row * 28)}</g>
              ))}
            </g>
          ))}
        </g>
      )}
      {sourceLines(page.lines, page.id).map((line, i) => (
        <g key={line.id}>{text(line.text, 492, 38 + i * 28)}</g>
      ))}
    </g>
  );
}
