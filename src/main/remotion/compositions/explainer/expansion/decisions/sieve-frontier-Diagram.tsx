import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  checkCode,
  frontierMarks,
  type SieveFrontierPose,
  sieveOptionStatus,
} from './sieve-frontier-poses';
import type { ExpansionSieveFrontierScene } from './sieve-frontier-types';

/** Independent criterion rails: source precision/qualifications are paged, never rounded away. */
export function SieveFrontierDiagram({
  scene,
  pose,
}: {
  scene: ExpansionSieveFrontierScene;
  pose: SieveFrontierPose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const text = (s: string, x: number, y: number) => (
    <text x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {s}
    </text>
  );
  const criterion =
    scene.storyId === '26'
      ? scene.criteria.find((c) => c.id === scene.records[page.record].criterionId)
      : undefined;
  const marks = scene.storyId === '26' && criterion ? frontierMarks(scene, criterion.id) : [];
  return (
    <g data-page={pose.page} data-source-record={page.id}>
      {text(scene.storyId === '25' ? 'Requirement sieve' : 'Criterion tradeoffs', 12, 34)}
      {scene.storyId === '25' ? (
        <>
          {scene.requirements.map((c, i) => (
            <g key={c.id} data-column-id={c.id}>
              {text(`C${i + 1}`, 124 + i * 86, 66)}
            </g>
          ))}
          {scene.entities.map((e, i) => {
            const status = sieveOptionStatus(scene, e.id);
            return (
              <g key={e.id} data-option-id={e.id} data-option-status={status.text}>
                {text(`O${i + 1}`, 12, 132 + i * 64)}
                {text(status.code, 12, 158 + i * 64)}
                {status.fail && (
                  <path d={`M10 ${108 + i * 64}H66`} stroke={S.accent} strokeWidth={3} />
                )}
                {scene.requirements.map((c, j) => {
                  const index = scene.records.findIndex(
                    (r) => r.optionId === e.id && r.requirementId === c.id,
                  );
                  const r = scene.records[index];
                  return (
                    <g key={r.id} data-record-id={r.id}>
                      <rect
                        x={112 + j * 86}
                        y={110 + i * 64}
                        width={80}
                        height={56}
                        fill={index === page.record ? S.card : 'none'}
                        stroke={index === page.record ? S.accent : S.muted}
                      />
                      {text(checkCode(r), 124 + j * 86, 145 + i * 64)}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {text('F: fails stated check', 12, 404)}
          {text('P: passes; Q: qualified', 12, 434)}
        </>
      ) : (
        <>
          {text(
            `C${scene.criteria.findIndex((c) => c.id === criterion?.id) + 1}: ${criterion?.direction}`,
            12,
            66,
          )}
          {text(`Unit: ${scene.records[page.record].quantity.basis.unit}`, 12, 94)}
          {scene.entities.map((e, i) => {
            const m = marks.find((m) => m.optionId === e.id);
            if (!m) throw new Error('Missing source criterion operand');
            const y = 132 + i * 64;
            return (
              <g key={e.id} data-option-id={e.id} data-record-id={m.id} data-state={m.state}>
                {text(`O${i + 1}`, 12, y + 8)}
                {scene.result.state === 'derived' &&
                  scene.result.nondominatedOptionIds.includes(e.id) && (
                    <circle cx={32} cy={y} r={25} stroke={S.accent} fill="none" />
                  )}
                <path d={`M96 ${y}H444`} stroke={S.muted} />
                {m.operands.map((operand) => (
                  <circle
                    key={operand.id}
                    data-operand={operand.id}
                    data-position={operand.position}
                    cx={96 + operand.position * 348}
                    cy={y}
                    r={7}
                    fill={m.state === 'known' ? S.accent : S.card}
                    stroke={S.accent}
                  />
                ))}
                {text(m.state, 96, y + 28)}
              </g>
            );
          })}
          {text(
            scene.result.state === 'derived' ? 'Ring: nondominated' : 'Qualified: no frontier',
            12,
            404,
          )}
          {text('Separate criterion scale', 12, 434)}
        </>
      )}
      {text('No universal winner', 12, 464)}
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {page.rows.map((row) => (
        <g key={row.id}>{text(row.text, 500, 38 + row.index * 28)}</g>
      ))}
      {text(`Source ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
