import { diagramPose } from '../../diagrams/motion';
import { plottedValueText, precisionPlotLayout } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionAmount, ExpansionQuantity, ExpansionRational } from '../value-types';
import type {
  ExpansionRiskCalibrationScene,
  ExpansionRiskDimension,
} from './risk-calibration-types';

const ZERO = { numerator: 0, denominator: 1 };
export const RISK_DETAIL = {
  x: 492,
  y: 34,
  width: 450,
  height: 420,
  font: 22,
  lineHeight: 28,
  columns: 20,
};
export interface RiskDetailPage {
  id: string;
  record: number;
  lines: readonly string[];
  lineIds: readonly string[];
}
export interface RiskCalibrationPose extends ExpansionKitPose {
  page: number;
  pages: readonly RiskDetailPage[];
  record: number;
}
export function quantityFields(q: ExpansionQuantity): string[] {
  return [
    q.actor,
    q.claim,
    plottedValueText(q),
    `Unit: ${q.basis.unit}`,
    `Population: ${q.basis.population}`,
    `Period: ${q.basis.period}`,
    ...(q.basis.denominator
      ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
      : []),
    ...('condition' in q ? [q.condition] : 'qualifier' in q ? [q.qualifier] : []),
  ];
}
function dimensionFields(d: ExpansionRiskDimension): string[] {
  return d.state === 'quantity'
    ? quantityFields(d.quantity)
    : [
        d.state,
        d.state === 'qualitative' ? d.label : d.qualifier,
        d.basis.population,
        d.basis.period,
        ...(d.condition ? [d.condition] : []),
      ];
}
export function riskCalibrationFields(
  scene: ExpansionRiskCalibrationScene,
  index: number,
): string[] {
  const entity = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  if (scene.storyId === '15') {
    const r = scene.records[index];
    return [
      scene.label,
      entity(r.actorId),
      entity(r.eventId),
      'Likelihood',
      ...dimensionFields(r.likelihood),
      'Impact',
      ...dimensionFields(r.impact),
      'Check',
      ...(scene.check.condition ? [scene.check.condition] : []),
      'Result: scoped',
      ...(scene.result.condition ? [scene.result.condition] : []),
    ];
  }
  const r = scene.records[index];
  return [
    scene.label,
    r.label,
    entity(r.actorId),
    'Prediction',
    ...quantityFields(r.prediction),
    'Observation',
    ...quantityFields(r.observation),
    `Comparison: ${r.comparison.state === 'compared' ? r.comparison.relation : 'uncompared'}`,
    ...(r.comparison.condition ? [r.comparison.condition] : []),
    ...(r.predictionRatio ? [plottedValueText(r.predictionRatio)] : []),
    ...(r.observationRatio ? [plottedValueText(r.observationRatio)] : []),
    'Result: scoped',
    ...(scene.result.condition ? [scene.result.condition] : []),
  ];
}
export function riskCalibrationPages(scene: ExpansionRiskCalibrationScene): RiskDetailPage[] {
  return scene.records.flatMap((r, record) => {
    const lines = riskCalibrationFields(scene, record).flatMap((field) => {
      const chars = Array.from(field);
      return Array.from(
        { length: Math.max(1, Math.ceil(chars.length / RISK_DETAIL.columns)) },
        (_, i) => chars.slice(i * RISK_DETAIL.columns, (i + 1) * RISK_DETAIL.columns).join(''),
      );
    });
    return Array.from({ length: Math.ceil(lines.length / 13) }, (_, i) => ({
      id: r.id,
      record,
      lines: lines.slice(i * 13, (i + 1) * 13),
      lineIds: lines
        .slice(i * 13, (i + 1) * 13)
        .map((_, line) => `${r.id}:source-line:${i * 13 + line}`),
    }));
  });
}
/** Every page gets equal source-window time; resolve holds the final lens, not a new verdict. */
export function riskCalibrationPose(
  scene: ExpansionRiskCalibrationScene,
  t: number,
): RiskCalibrationPose {
  const p = diagramPose(t, scene);
  const pages = riskCalibrationPages(scene);
  const progress = Number.isFinite(t)
    ? Math.max(
        0,
        Math.min(1, (t - scene.setupAt) / Math.max(0.001, scene.resolveAt - scene.setupAt)),
      )
    : 0;
  const page = Math.min(pages.length - 1, Math.floor(progress * pages.length));
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    page,
    pages,
    record: pages[page].record,
  };
}
function amount(a: ExpansionAmount): ExpansionRational {
  return a.kind === 'rational' ? a.value : { numerator: a.value.minorUnits, denominator: 100 };
}
/** Zero is a domain endpoint, NEVER a substitute for an absent value. */
export function riskQuantityDomain(
  q: ExpansionQuantity,
): readonly [ExpansionRational, ExpansionRational] {
  if (q.basis.unit === 'percent') return [ZERO, { numerator: 100, denominator: 1 }];
  if (q.basis.unit === 'ratio') return [ZERO, { numerator: 1, denominator: 1 }];
  if (q.basis.unit === 'count' && q.basis.denominator) return [ZERO, q.basis.denominator];
  const values =
    q.state === 'disputed' ? q.alternatives.map(amount) : 'amount' in q ? [amount(q.amount)] : [];
  const max = values.reduce(
    (a, b) => (b.numerator / b.denominator > a.numerator / a.denominator ? b : a),
    { numerator: 1, denominator: 1 },
  );
  return [ZERO, max];
}
/** Reuse the precision kit's exact rational projection, with separate source bases. */
export function riskQuantityPositions(q: ExpansionQuantity): readonly number[] {
  return precisionPlotLayout({
    records: [{ id: 'value', label: 'value', quantity: q }],
    domain: riskQuantityDomain(q),
    basis: q.basis,
    pose: { reveal: 1, action: 1, response: 1, check: 1, resolve: 1 },
    state: 'retained',
    colors: { surface: '#fff', text: '#000', accent: '#000', muted: '#aaa' },
    position: [0, 0, 0],
  })[0].positions.map((y) => 1 - y / 160);
}
