import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import { plottedValueText } from '../kits/plots';
import type { ExpansionQuantity, ExpansionRational } from '../value-types';
import {
  RISK_DETAIL,
  type RiskCalibrationPose,
  riskQuantityDomain,
  riskQuantityPositions,
} from './risk-calibration-poses';
import type { ExpansionRiskCalibrationScene } from './risk-calibration-types';

const exact = (r: ExpansionRational) => `${r.numerator}/${r.denominator}`;
export function RiskCalibrationDiagram({
  scene,
  pose,
}: {
  scene: ExpansionRiskCalibrationScene;
  pose: RiskCalibrationPose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const text = (s: string, x: number, y: number, size = 22) => (
    <text x={x} y={y} fontSize={size} fontFamily={UI_FONT} fill={S.text}>
      {s}
    </text>
  );
  const domainLabel = (value: ExpansionRational, x: number, y: number) => {
    const label = exact(value);
    if (label.length <= 12) return text(label, x, y);
    const slash = label.indexOf('/') + 1;
    return (
      <>
        {text(label.slice(0, slash), x, y)}
        {text(label.slice(slash), x, y + 28)}
      </>
    );
  };
  const quantity = (q: ExpansionQuantity, x: number, title: string, opacity: number) => {
    const domain = riskQuantityDomain(q);
    return (
      <g opacity={opacity} data-quantity-state={q.state}>
        {text(title, x - 40, 38)}
        <path d={`M${x} 80V330M${x - 8} 80h16M${x - 8} 330h16`} stroke={S.text} fill="none" />
        {domainLabel(domain[1], x + 14, 86)}
        {domainLabel(domain[0], x + 14, 336)}
        {riskQuantityPositions(q).map((v) => (
          <circle
            key={v}
            cx={x}
            cy={330 - v * 250}
            r={6}
            fill={S.accent}
            stroke={S.text}
            strokeDasharray={q.state === 'known' ? undefined : '2 2'}
          />
        ))}
        {text(q.basis.unit, x - 40, 365)}
        {text(q.state, x - 40, 389)}
      </g>
    );
  };
  let plot: ReactElement;
  if (scene.storyId === '15') {
    const r = scene.records[pose.record];
    const xs =
      r.likelihood.state === 'quantity' ? riskQuantityPositions(r.likelihood.quantity) : [];
    const ys = r.impact.state === 'quantity' ? riskQuantityPositions(r.impact.quantity) : [];
    // Only a single supplied pair is a point. Disputed alternatives are separate axis marks.
    plot = (
      <g data-risk-record={r.id}>
        {text(
          `Likelihood: ${r.likelihood.state === 'quantity' ? r.likelihood.quantity.state : r.likelihood.state}`,
          8,
          38,
        )}
        {text(
          `Impact: ${r.impact.state === 'quantity' ? r.impact.quantity.state : r.impact.state}`,
          8,
          66,
        )}
        <path d="M110 130V330H410" fill="none" stroke={S.text} />
        {text('Impact', 8, 108)}
        {text('Likelihood', 110, 380)}
        {r.likelihood.state === 'quantity' && (
          <g opacity={pose.action}>
            {text(
              `${exact(riskQuantityDomain(r.likelihood.quantity)[0])} – ${exact(riskQuantityDomain(r.likelihood.quantity)[1])} ${r.likelihood.quantity.basis.unit}`,
              110,
              355,
              22,
            )}
            {xs.map((x) => (
              <path key={x} d={`M${110 + x * 300} 326v8`} stroke={S.accent} />
            ))}
          </g>
        )}
        {r.impact.state === 'quantity' && (
          <g opacity={pose.response}>
            {text(
              `${exact(riskQuantityDomain(r.impact.quantity)[0])} – ${exact(riskQuantityDomain(r.impact.quantity)[1])} ${r.impact.quantity.basis.unit}`,
              110,
              108,
              22,
            )}
            {ys.map((y) => (
              <path key={y} d={`M106 ${330 - y * 200}h8`} stroke={S.accent} />
            ))}
          </g>
        )}
        {xs.length === 1 && ys.length === 1 ? (
          <circle
            cx={110 + xs[0] * 300}
            cy={330 - ys[0] * 200}
            r={7}
            fill={S.accent}
            opacity={pose.response}
          />
        ) : (
          text('No single numeric pair', 8, 405, 22)
        )}
        {text('Independent source axes', 8, 452, 22)}
      </g>
    );
  } else {
    const r = scene.records[pose.record];
    plot = (
      <g data-calibration-record={r.id}>
        {quantity(r.prediction, 85, 'Prediction', pose.action)}
        {quantity(r.observation, 295, 'Observation', pose.response)}
        <g opacity={pose.check}>
          {text(
            r.comparison.state === 'compared'
              ? `Prediction ${r.comparison.relation} observation`
              : 'Uncompared',
            8,
            405,
            22,
          )}
        </g>
        {text('Source pair · no fitted curve', 8, 452, 22)}
      </g>
    );
  }
  return (
    <g data-risk-calibration-page={pose.page} data-record-id={page.id}>
      {plot}
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {page.lines.map((line, i) => (
        <g key={page.lineIds[i]}>
          {text(line, RISK_DETAIL.x, RISK_DETAIL.y + i * RISK_DETAIL.lineHeight)}
        </g>
      ))}
      {text(`Source lens ${pose.page + 1}/${pose.pages.length}`, 492, 454, 22)}
    </g>
  );
}

/** Exposed source lexeme helper for callers inspecting the paired values. */
export { plottedValueText as riskCalibrationValueText };
