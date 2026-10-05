import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  UNITS_EQUIVALENCE_DETAIL as D,
  type UnitsEquivalencePose,
  unitsEquivalenceConversionCards,
  unitsEquivalencePosition,
} from './units-equivalence-poses';
import type { ExpansionUnitsEquivalenceScene } from './units-equivalence-types';

/** Persistent exact-fact surface shared by both modes. Aggregate marks are not people. */
export function UnitsEquivalenceDiagram({
  scene,
  pose,
}: {
  scene: ExpansionUnitsEquivalenceScene;
  pose: UnitsEquivalencePose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const text = (value: string, x: number, y: number): ReactElement => (
    <text x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {value}
    </text>
  );
  return (
    <g data-units-equivalence-page={pose.page} data-source-id={page.id}>
      {scene.storyId === '49' ? (
        <g data-operation="approved-unit-conversion">
          {text('Same source amount', 12, 38)}
          {unitsEquivalenceConversionCards(scene, pose).map((card, i) => (
            <g key={card.id} data-conversion-card={card.id}>
              <rect
                x={12 + i * 228}
                y={70}
                width={216}
                height={360}
                rx={8}
                fill={S.card}
                stroke={S.accent}
              />
              {card.lines.map((line, j) => (
                <g key={card.lineIds[j]}>{text(line, 24 + i * 228, 100 + j * 28)}</g>
              ))}
            </g>
          ))}
          <path d="M228 250H240" stroke={S.text} opacity={pose.response} />
          {text('Approved conversion', 12, 462)}
        </g>
      ) : (
        <g data-operation="authored-equivalent-views">
          {text('Same source ratio', 12, 38)}
          {scene.views.map((v, i) => {
            const y = 62 + i * 110;
            const marks = v.marks;
            const fraction = v.ratio
              ? unitsEquivalencePosition(v.ratio, [
                  { numerator: 0, denominator: 1 },
                  { numerator: 1, denominator: 1 },
                ])
              : null;
            return (
              <g key={v.id} data-view-id={v.id} data-result-state={scene.result.state}>
                {text(v.kind, 12, y + 20)}
                {marks === undefined ? (
                  <rect
                    x={12}
                    y={y + 34}
                    width={440}
                    height={48}
                    fill="none"
                    stroke={S.muted}
                    strokeDasharray="4 3"
                  />
                ) : (
                  Array.from({ length: marks }, (_, j) => `${v.id}:aggregate:${j}`).map((id, j) => {
                    const set = v.kind === 'set';
                    const cols = Math.min(20, marks);
                    return (
                      <rect
                        key={id}
                        x={12 + (set ? (j % cols) * 21 : (j * 440) / marks)}
                        y={y + 34 + (set ? Math.floor(j / cols) * 9 : 0)}
                        width={set ? 7 : 440 / marks}
                        height={set ? 7 : v.kind === 'length' ? 12 : 48}
                        fill={j < (v.selectedMarks ?? 0) ? S.accent : S.card}
                        stroke={S.text}
                        opacity={pose.response}
                      />
                    );
                  })
                )}
                {fraction === null
                  ? text('Unresolved', 260, y + 20)
                  : text('Derived ratio', 260, y + 20)}
              </g>
            );
          })}
        </g>
      )}
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {page.lines.map((line, i) => (
        <g key={page.lineIds[i]}>{text(line, D.x, D.y + i * D.lineHeight)}</g>
      ))}
      {text(`Source lens ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
