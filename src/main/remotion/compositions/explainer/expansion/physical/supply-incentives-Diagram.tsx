import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  SUPPLY_INCENTIVES_DETAIL,
  type SupplyIncentivesPose,
  supplyIncentivesActiveRecord,
  supplyIncentivesWrap,
} from './supply-incentives-poses';
import type { ExpansionSupplyIncentivesScene } from './supply-incentives-types';

/** Precision stays planar in both modes. Relation arrows show only source direction. */
export function SupplyIncentivesDiagram({
  scene,
  pose,
}: {
  scene: ExpansionSupplyIncentivesScene;
  pose: SupplyIncentivesPose;
}): ReactElement {
  const S = useStage(),
    page = pose.pages[pose.page],
    r = supplyIncentivesActiveRecord(scene, pose);
  const name = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  const text = (s: string, x: number, y: number) => (
    <text x={x} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {s}
    </text>
  );
  const runs = (value: string, id: string, x: number, y: number, columns: number) =>
    supplyIncentivesWrap(value, columns).map((line, offset) => ({
      line,
      id: `${id}:character:${offset * columns}`,
      x,
      y: y + offset * 28,
    }));
  const identity = [
    ...runs(name(r.actorId), `${r.id}:actor`, 24, 76, 10),
    ...runs(name(r.targetId), `${r.id}:target`, 260, 76, 10),
    ...runs(r.stage, `${r.id}:stage`, 24, 176, 18),
  ];
  return (
    <g data-source-id={page.id} data-record-id={r.id} data-role={r.role}>
      {text(`${r.role} · ${r.state}`, 24, 38)}
      {identity.map((run) => (
        <g key={run.id}>{text(run.line, run.x, run.y)}</g>
      ))}
      <g
        data-semantic-rig={scene.template}
        data-actor-id={r.actorId}
        data-target-id={r.targetId}
        fill={S.card}
        stroke={S.accent}
        strokeWidth={2}
      >
        {scene.storyId === '73' ? (
          <>
            <path
              d={
                r.role === 'inventory'
                  ? 'M24 260H144V322H24ZM24 282H144M64 282V322M104 282V322'
                  : 'M24 248H144V322H24ZM36 268H132M36 296H132'
              }
            />
            <path
              d={
                r.role === 'replacement'
                  ? 'M304 260H424V322H304ZM304 282H424M344 282V322M384 282V322'
                  : 'M304 248H424V322H304ZM316 268H412M316 296H412'
              }
            />
            {(r.role === 'transfer' || r.role === 'replacement') && (
              <g transform={`translate(${184 + pose.travel * 30} 258)`} data-carrier-id={r.id}>
                <path d="M0 10L24 0L48 10V50L24 60L0 50ZM0 10L24 20L48 10M24 20V60" />
                <path d="M-12 68H60M54 62L60 68L54 74" fill="none" />
              </g>
            )}
          </>
        ) : (
          <>
            <path d="M40 320V282H104V320M48 268A24 24 0 1 0 96 268A24 24 0 1 0 48 268M344 320V282H408V320M352 268A24 24 0 1 0 400 268A24 24 0 1 0 352 268" />
            {r.role === 'payment' && (
              <g data-payment-id={r.id} transform={`translate(${176 + pose.travel * 30} 268)`}>
                <path d="M0 0H84V40H0ZM12 8H72V32H12Z" />
                <ellipse cx={42} cy={20} rx={10} ry={12} />
              </g>
            )}
            {r.role === 'benefit' && (
              <path
                data-benefit-id={r.id}
                d="M192 268L224 252L256 268V304L224 320L192 304ZM192 268L224 284L256 268M224 284V320"
              />
            )}
            {r.role === 'external-effect' && (
              <g data-external-effect-id={r.id}>
                <circle cx={224} cy={282} r={24} />
                <path d="M192 282H164M256 282H288M218 240H230M218 324H230" fill="none" />
              </g>
            )}
          </>
        )}
        <path d="M154 344H294M286 338L294 344L286 350" fill="none" data-direction="source-only" />
      </g>
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      <g
        data-fact-state={page.state ?? scene.evidence}
        data-quantity-state={page.quantityState}
        data-quantity-index={page.quantityIndex}
      >
        {text(
          `${page.quantityIndex === undefined ? 'Fact' : 'Quantity'}: ${page.state ?? scene.evidence}`,
          500,
          38,
        )}
        {runs(page.qualification.join(''), `${page.id}:qualification`, 500, 66, 18)
          .filter(() => page.qualification.length > 0)
          .map((run) => (
            <g key={run.id} data-qualification-line={run.id}>
              {text(run.line, run.x, run.y)}
            </g>
          ))}
      </g>
      {page.lines.map((line, i) => (
        <g key={page.lineIds[i]} data-line-id={page.lineIds[i]}>
          {text(
            line,
            SUPPLY_INCENTIVES_DETAIL.x,
            SUPPLY_INCENTIVES_DETAIL.y + i * SUPPLY_INCENTIVES_DETAIL.leading,
          )}
        </g>
      ))}
      {text(`Source ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
