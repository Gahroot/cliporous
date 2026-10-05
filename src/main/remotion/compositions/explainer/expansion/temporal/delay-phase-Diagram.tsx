import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  DELAY_PHASE_AXIS,
  delayPhaseExtent,
  delayPhasePages,
  delayPhasePose,
  delayPhaseRational,
  delayPhaseSignal,
} from './delay-phase-poses';
import type { ExpansionDelayPhaseScene } from './delay-phase-types';

export function DelayPhaseDiagram({
  scene,
  t,
}: {
  scene: ExpansionDelayPhaseScene;
  t: number;
}): ReactElement {
  const S = useStage();
  const pose = delayPhasePose(scene, t),
    pages = delayPhasePages(scene),
    page = pages[pose.page];
  if (!page) throw new Error('Missing parser source page');
  const extent =
    scene.storyId === '45' && page.recordId ? delayPhaseExtent(scene, page.recordId) : null;
  const record = scene.records.find((r) => r.id === page.recordId);
  const signal =
    scene.storyId === '46' && page.actorId
      ? delayPhaseSignal(
          scene,
          page.actorId,
          t,
          record?.dimension === 'phase' ? record.id : undefined,
        )
      : null;
  const text = (
    id: string,
    value: string,
    x: number,
    y: number,
    anchor: 'start' | 'end' = 'start',
  ): ReactElement => (
    <text key={id} x={x} y={y} textAnchor={anchor} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {value}
    </text>
  );
  return (
    <g
      data-template={scene.template}
      data-page-id={page.id}
      data-record-id={page.recordId}
      data-actor-id={page.actorId}
      opacity={pose.reveal}
    >
      <rect x={8} y={216} width={936} height={254} rx={12} fill={S.card} />
      {scene.storyId === '45' ? (
        <g>
          {text('independent', 'Latency ≠ throughput; separate source dimensions', 30, 38)}
          {text(
            'dimension',
            record
              ? `${record.dimension}; ${record.quantity.state}${extent?.subpixel ? '; positive below 1px' : ''}`
              : 'Independent waiting interval / completed items',
            30,
            74,
          )}
          <path
            d={`M${DELAY_PHASE_AXIS.start} 108V166H${DELAY_PHASE_AXIS.end}M${DELAY_PHASE_AXIS.start} 138H${DELAY_PHASE_AXIS.end}`}
            fill="none"
            stroke={S.muted}
            strokeWidth={2}
          />
          {extent ? (
            <g
              data-known-zero={extent.zero}
              data-axis-start={DELAY_PHASE_AXIS.start}
              data-axis-end={DELAY_PHASE_AXIS.end}
              data-domain-upper={delayPhaseRational(extent.upper)}
            >
              {extent.zero ? (
                <circle
                  data-zero-marker="true"
                  cx={DELAY_PHASE_AXIS.start}
                  cy={138}
                  r={5}
                  fill={S.accent}
                />
              ) : (
                <rect
                  data-quantity-bar="true"
                  x={DELAY_PHASE_AXIS.start}
                  y={120}
                  width={extent.width}
                  height={32}
                  fill={S.accent}
                />
              )}
              {extent.subpixel && (
                <circle
                  data-positive-subpixel="true"
                  cx={DELAY_PHASE_AXIS.start + extent.width}
                  cy={138}
                  r={5}
                  fill="none"
                  stroke={S.accent}
                  strokeWidth={2}
                />
              )}
              {text('zero', '0', DELAY_PHASE_AXIS.start - 2, 196)}
              {text('upper', delayPhaseRational(extent.upper), DELAY_PHASE_AXIS.end, 196, 'end')}
            </g>
          ) : (
            text(
              'unresolved',
              record
                ? `${record.quantity.state}: no numeric bar`
                : 'No joint score or reciprocal rate',
              100,
              138,
            )
          )}
        </g>
      ) : (
        <g data-teaching="not-measured" data-phase-available={signal !== null}>
          {text('teaching', 'Authored teaching signal: not a measured curve', 30, 38)}
          {signal ? (
            signal.template === 'cycle-dial' ? (
              <g>
                <circle cx={476} cy={122} r={60} fill="none" stroke={S.muted} strokeWidth={3} />
                <path
                  d={`M476 122L${476 + Math.sin(signal.angle) * 54} ${122 - Math.cos(signal.angle) * 54}`}
                  stroke={S.accent}
                  strokeWidth={4}
                />
                {text('origin', 'Relative reference origin, not absolute phase', 30, 204)}
              </g>
            ) : (
              <g>
                <path d="M100 60V158H800M100 88H800" fill="none" stroke={S.muted} strokeWidth={2} />
                <polyline
                  data-samples={64}
                  points={signal.points}
                  fill="none"
                  stroke={S.accent}
                  strokeWidth={3}
                />
                {text('domain', 'Two authored cycles; no extrapolation', 100, 196)}
              </g>
            )
          ) : (
            text('missing', 'No complete supplied phase/period/direction to draw', 30, 118)
          )}
        </g>
      )}
      <g data-source-page="current" data-font-minimum={22}>
        {page.lines.map((line, i) => text(`${page.id}/${i}`, line, 30, 240 + i * 28))}
      </g>
      {text('page', `${pose.page + 1}/${pages.length}`, 830, 465)}
    </g>
  );
}
