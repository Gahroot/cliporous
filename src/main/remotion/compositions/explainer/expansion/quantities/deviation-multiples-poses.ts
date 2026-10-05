import { diagramPose } from '../../diagrams/motion';
import { type PlotDatum, plottedValueText, precisionPlotLayout } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import { compare } from '../value-logic';
import type { ExpansionAmount, ExpansionQuantity, ExpansionRational } from '../value-types';
import type { ExpansionDeviationMultiplesScene } from './deviation-multiples-types';

export const DEVIATION_DETAIL = { x: 500, y: 110, columns: 18, lines: 10, leading: 28, font: 22 };
export const exactDeviationValue = (r: ExpansionRational): string =>
  `${r.numerator}/${r.denominator}`;
export function deviationWrap(text: string, columns = DEVIATION_DETAIL.columns): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function deviationRecords(scene: ExpansionDeviationMultiplesScene): PlotDatum[] {
  return scene.storyId === '23'
    ? [
        { id: `${scene.actorId}:target`, label: 'Target', quantity: scene.target },
        { id: `${scene.actorId}:observation`, label: 'Observation', quantity: scene.observation },
      ]
    : scene.records.map((r, i) => ({ id: r.id, label: `Option ${i + 1}`, quantity: r.quantity }));
}
function amount(a: ExpansionAmount): ExpansionRational {
  return a.kind === 'rational' ? a.value : { numerator: a.value.minorUnits, denominator: 100 };
}
/** Complete shared signed domain, never an absent value imputed as zero. */
export function deviationDomain(
  scene: ExpansionDeviationMultiplesScene,
): readonly [ExpansionRational, ExpansionRational] {
  let low = { numerator: 0, denominator: 1 },
    high = { numerator: 1, denominator: 1 };
  for (const { quantity: q } of deviationRecords(scene)) {
    if (q.state === 'derived') continue;
    const values =
      q.state === 'disputed' ? q.alternatives.map(amount) : 'amount' in q ? [amount(q.amount)] : [];
    for (const v of values) {
      const l = compare(v, low),
        h = compare(v, high);
      if (l.ok && l.value < 0) low = v;
      if (h.ok && h.value > 0) high = v;
    }
    if (q.basis.denominator && q.basis.unit === 'count') {
      const c = compare(q.basis.denominator, high);
      if (c.ok && c.value > 0) high = q.basis.denominator;
    }
    if (q.basis.unit === 'percent' && high.numerator / high.denominator < 100)
      high = { numerator: 100, denominator: 1 };
  }
  return [low, high];
}
export function deviationPositions(
  scene: ExpansionDeviationMultiplesScene,
): readonly (readonly number[])[] {
  const records = deviationRecords(scene);
  return precisionPlotLayout({
    records,
    domain: deviationDomain(scene),
    basis: records[0].quantity.basis,
    position: [0, 0, 0],
    pose: { reveal: 1, action: 1, response: 1, check: 1, resolve: 1 },
    state: 'retained',
    colors: { surface: '#fff', text: '#000', accent: '#000', muted: '#aaa' },
  }).map((r) => r.positions.map((y) => 1 - y / 160));
}
function quantityFields(q: ExpansionQuantity): string[] {
  return [
    q.actor,
    q.claim,
    plottedValueText(q),
    `State: ${q.state}`,
    `Unit: ${q.basis.unit}`,
    `Period: ${q.basis.period}`,
    `Population: ${q.basis.population}`,
    ...(q.basis.denominator ? [`Denominator: ${exactDeviationValue(q.basis.denominator)}`] : []),
    ...('condition' in q ? [q.condition] : 'qualifier' in q ? [q.qualifier] : []),
  ];
}
export function deviationFields(scene: ExpansionDeviationMultiplesScene, record: number): string[] {
  const q = deviationRecords(scene)[record].quantity;
  if (q.state === 'derived') throw new Error('Source record expected');
  const domain = deviationDomain(scene);
  return [
    scene.label,
    scene.domain,
    scene.evidence,
    ...(scene.condition ? [scene.condition] : []),
    ...quantityFields(q),
    `Axis minimum: ${exactDeviationValue(domain[0])}`,
    `Axis maximum: ${exactDeviationValue(domain[1])}`,
    ...(scene.storyId === '23'
      ? [
          'Observation minus target',
          scene.result.state === 'derived'
            ? plottedValueText(scene.result.source ?? scene.result)
            : plottedValueText(scene.result.quantity),
          ...(scene.result.state === 'source-qualified'
            ? quantityFields(scene.result.quantity)
            : [
                `Observation: ${exactDeviationValue(scene.result.operands[0])}`,
                `Target: ${exactDeviationValue(scene.result.operands[1])}`,
                `Signed result: ${exactDeviationValue(scene.result.result)}`,
              ]),
          ...(scene.relative ? ['Supplied relative', ...quantityFields(scene.relative)] : []),
        ]
      : [scene.conclusion.qualification]),
    scene.outcome,
  ];
}
export interface DeviationPage {
  id: string;
  record: number;
  lines: readonly string[];
  lineIds: readonly string[];
}
export interface DeviationMultiplesPose extends ExpansionKitPose {
  page: number;
  pages: readonly DeviationPage[];
}
export function deviationPages(scene: ExpansionDeviationMultiplesScene): DeviationPage[] {
  return deviationRecords(scene).flatMap((r, record) => {
    const lines = deviationFields(scene, record).flatMap((field) => deviationWrap(field));
    return Array.from({ length: Math.ceil(lines.length / DEVIATION_DETAIL.lines) }, (_, i) => ({
      id: r.id,
      record,
      lines: lines.slice(i * 10, (i + 1) * 10),
      lineIds: lines.slice(i * 10, (i + 1) * 10).map((_, j) => `${r.id}:line:${i * 10 + j}`),
    }));
  });
}
/** Pure full-window paging; the final lens remains held through the source tail. */
export function deviationMultiplesPose(
  scene: ExpansionDeviationMultiplesScene,
  t: number,
): DeviationMultiplesPose {
  const p = diagramPose(t, scene),
    pages = deviationPages(scene);
  const progress = Number.isFinite(t)
    ? Math.max(
        0,
        Math.min(1, (t - scene.setupAt) / Math.max(0.001, scene.resolveAt - scene.setupAt)),
      )
    : 0;
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
  };
}
