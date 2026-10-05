import { diagramPose } from '../../diagrams/motion';
import { plottedValueText, precisionPlotLayout } from '../kits/plots';
import { quantityFields } from '../probability/risk-calibration-poses';
import type { ExpansionKitPose } from '../scene-types';
import { add, compare, rationalPosition } from '../value-logic';
import type { ExpansionAmount, ExpansionQuantity, ExpansionRational } from '../value-types';
import type { ExpansionDenominatorPartitionScene } from './denominator-partition-types';

export const DENOMINATOR_DETAIL = { x: 492, y: 34, font: 22, lineHeight: 28, columns: 20 };
export interface DenominatorPage {
  id: string;
  record: number;
  lines: string[];
  lineIds: string[];
}
export interface DenominatorPartitionPose extends ExpansionKitPose {
  pages: DenominatorPage[];
  page: number;
  record: number;
}
export const denominatorExact = (r: ExpansionRational): string => `${r.numerator}/${r.denominator}`;
export function denominatorValues(q: ExpansionQuantity): ExpansionRational[] {
  const value = (a: ExpansionAmount): ExpansionRational =>
    a.kind === 'rational' ? a.value : { numerator: a.value.minorUnits, denominator: 100 };
  return q.state === 'disputed'
    ? q.alternatives.map(value)
    : 'amount' in q
      ? [value(q.amount)]
      : [];
}
export function denominatorQuantities(
  scene: ExpansionDenominatorPartitionScene,
  record: number,
): readonly [ExpansionQuantity, ExpansionQuantity] {
  return scene.storyId === '19'
    ? [scene.comparisons[record].amount, scene.comparisons[record].reference]
    : [scene.parts[record].quantity, scene.total];
}
function denominatorOrder(a: ExpansionRational, b: ExpansionRational): number {
  const order = compare(a, b);
  if (!order.ok) throw new RangeError('Invalid source domain value');
  return order.value;
}
export function denominatorDomain(
  scene: ExpansionDenominatorPartitionScene,
): readonly [ExpansionRational, ExpansionRational] {
  const quantities =
    scene.storyId === '19'
      ? scene.comparisons.flatMap((r) => [r.amount, r.reference])
      : [scene.total, ...scene.parts.map((r) => r.quantity)];
  const values = quantities.flatMap(denominatorValues);
  const low = values.reduce((a, b) => (denominatorOrder(b, a) < 0 ? b : a), {
    numerator: 0,
    denominator: 1,
  });
  const high = values.reduce((a, b) => (denominatorOrder(b, a) > 0 ? b : a), {
    numerator: 1,
    denominator: 1,
  });
  return [low, high];
}
export function denominatorPositions(
  scene: ExpansionDenominatorPartitionScene,
  q: ExpansionQuantity,
): number[] {
  return precisionPlotLayout({
    records: [{ id: 'source', label: 'source', quantity: q }],
    domain: denominatorDomain(scene),
    basis: q.basis,
    pose: { reveal: 1, action: 1, response: 1, check: 1, resolve: 1 },
    state: 'retained',
    position: [0, 0, 0],
    colors: { surface: '#fff', text: '#000', accent: '#000', muted: '#aaa' },
  })[0].positions.map((v) => 1 - v / 160);
}
/** Authored relative results only; no ratio is created by the view. */
export function denominatorRelative(scene: ExpansionDenominatorPartitionScene) {
  if (scene.storyId !== '19') return [];
  return scene.derived.flatMap((d, index) => {
    if (d.operation !== 'ratio') return [];
    const peers = scene.derived.filter((v) => v.operation === 'ratio').map((v) => v.result);
    const low = peers.reduce((a, b) => (denominatorOrder(b, a) < 0 ? b : a), {
      numerator: 0,
      denominator: 1,
    });
    const high = peers.reduce((a, b) => (denominatorOrder(b, a) > 0 ? b : a), {
      numerator: 1,
      denominator: 1,
    });
    const position = rationalPosition(d.result, low, high);
    if (!position.ok) throw new RangeError('Invalid authored relative result');
    return [
      { id: `${scene.storyId}:derived:${index}`, index, position: position.value, low, high },
    ];
  });
}
/** Explicit known components only. Unknown/disputed/qualified parts never fill a gap. */
export function denominatorPartitionSegments(scene: ExpansionDenominatorPartitionScene) {
  if (scene.storyId !== '20' || scene.total.state !== 'known') return [];
  let cursor: ExpansionRational = { numerator: 0, denominator: 1 };
  const total = denominatorValues(scene.total)[0];
  const positive = compare(total, { numerator: 0, denominator: 1 });
  if (!positive.ok || positive.value <= 0) return [];
  const domain = [{ numerator: 0, denominator: 1 }, total] as const;
  return scene.parts.flatMap((part) => {
    if (part.quantity.state !== 'known') return [];
    const end = add(cursor, denominatorValues(part.quantity)[0]);
    if (!end.ok) throw new RangeError('Invalid source part sum');
    const start = rationalPosition(cursor, domain[0], domain[1]);
    const finish = rationalPosition(end.value, domain[0], domain[1]);
    cursor = end.value;
    if (!start.ok || !finish.ok) throw new RangeError('Invalid source partition');
    return [{ id: part.entityId, start: start.value, end: finish.value }];
  });
}
export function denominatorFields(
  scene: ExpansionDenominatorPartitionScene,
  record: number,
): string[] {
  const entity = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  const quantities = denominatorQuantities(scene, record);
  const exactFields = (q: ExpansionQuantity) => [
    ...quantityFields(q),
    ...denominatorValues(q).map((r) => `Exact: ${denominatorExact(r)}`),
  ];
  return [
    scene.subject,
    scene.label,
    scene.evidence,
    scene.resolutionText,
    ...(scene.condition ? [`Condition: ${scene.condition}`] : []),
    scene.storyId === '19'
      ? entity(scene.comparisons[record].entityId)
      : entity(scene.parts[record].entityId),
    scene.storyId === '19' ? 'Amount' : `Part: ${scene.parts[record].role}`,
    ...exactFields(quantities[0]),
    scene.storyId === '19' ? 'Reference total' : 'Whole total',
    ...exactFields(quantities[1]),
    ...(scene.storyId === '19'
      ? scene.derived.flatMap((d) => [
          d.operation,
          plottedValueText(d),
          `Unit: ${d.basis.unit}`,
          `Population: ${d.basis.population}`,
          `Period: ${d.basis.period}`,
          ...(d.basis.denominator ? [`Denominator: ${denominatorExact(d.basis.denominator)}`] : []),
          ...d.operands.map((r) => `Operand: ${denominatorExact(r)}`),
          ...d.sourceQuantities.flatMap(exactFields),
        ])
      : [`Membership: ${entity(scene.parts[record].entityId)} -> ${entity(scene.wholeId)}`]),
    scene.resolutionText,
  ];
}
/** Fixed-size source text; wrapping retains every character and stable entity/field IDs. */
export function denominatorPartitionPages(
  scene: ExpansionDenominatorPartitionScene,
): DenominatorPage[] {
  const records = scene.storyId === '19' ? scene.comparisons : scene.parts;
  return records.flatMap((r, record) => {
    const rows = denominatorFields(scene, record).flatMap((field, index) => {
      const chars = Array.from(field);
      return Array.from({ length: Math.max(1, Math.ceil(chars.length / 20)) }, (_, line) => ({
        text: chars.slice(line * 20, (line + 1) * 20).join(''),
        id: `${r.entityId}:field:${index}:line:${line}`,
      }));
    });
    return Array.from({ length: Math.ceil(rows.length / 13) }, (_, page) => ({
      id: r.entityId,
      record,
      lines: rows.slice(page * 13, (page + 1) * 13).map((r) => r.text),
      lineIds: rows.slice(page * 13, (page + 1) * 13).map((r) => r.id),
    }));
  });
}
export function denominatorPartitionPose(
  scene: ExpansionDenominatorPartitionScene,
  time: number,
): DenominatorPartitionPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene);
  const pages = denominatorPartitionPages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / Math.max(0.001, scene.resolveAt - scene.setupAt)),
  );
  const page = Math.min(pages.length - 1, Math.floor(progress * pages.length));
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    page,
    record: pages[page].record,
  };
}
