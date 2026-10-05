import { diagramPose } from '../../diagrams/motion';
import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import { compare, rationalPosition } from '../value-logic';
import type { ExpansionBasis, ExpansionQuantity, ExpansionRational } from '../value-types';
import type { ExpansionUnitsEquivalenceScene } from './units-equivalence-types';

export const UNITS_EQUIVALENCE_DETAIL = {
  x: 500,
  y: 38,
  width: 440,
  font: 22,
  lineHeight: 28,
  columns: 18,
  rows: 13,
} as const;
export interface UnitsEquivalencePage {
  readonly id: string;
  readonly lines: readonly string[];
  readonly lineIds: readonly string[];
}
export interface UnitsEquivalencePose extends ExpansionKitPose {
  readonly turn: number;
  readonly page: number;
  readonly pages: readonly UnitsEquivalencePage[];
}
export function exactRationalText(v: ExpansionRational): string {
  return `${v.numerator}/${v.denominator}`;
}
export function unitsEquivalenceDomain(
  values: readonly ExpansionRational[],
): readonly [ExpansionRational, ExpansionRational] | null {
  if (!values.length) return null;
  let low = values[0],
    high = values[0];
  for (const v of values) {
    const a = compare(v, low),
      b = compare(v, high);
    if (!a.ok || !b.ok) throw new Error('Invalid exact domain');
    if (a.value < 0) low = v;
    if (b.value > 0) high = v;
  }
  return [low, high];
}
export function unitsEquivalencePosition(
  value: ExpansionRational,
  domain: readonly [ExpansionRational, ExpansionRational],
): number {
  const equal = compare(domain[0], domain[1]);
  if (!equal.ok) throw new Error('Invalid domain');
  if (equal.value === 0) return 0.5;
  const p = rationalPosition(value, domain[0], domain[1]);
  if (!p.ok) throw new Error('Invalid exact position');
  return p.value;
}
function basisFields(b: ExpansionBasis): string[] {
  return [
    `Unit: ${b.unit}`,
    `Population: ${b.population}`,
    `Period: ${b.period}`,
    ...(b.denominator ? [`Denominator: ${exactRationalText(b.denominator)}`] : []),
  ];
}
function quantityFields(q: ExpansionQuantity): string[] {
  return [
    q.actor,
    q.claim,
    `State: ${q.state}`,
    plottedValueText(q),
    ...basisFields(q.basis),
    ...('condition' in q ? [q.condition] : 'qualifier' in q ? [q.qualifier] : []),
  ];
}
export function unitsEquivalenceFields(
  scene: ExpansionUnitsEquivalenceScene,
): readonly { id: string; fields: readonly string[] }[] {
  const common = {
    id: `${scene.result.id}:context`,
    fields: [
      scene.label,
      scene.subject,
      scene.identity,
      scene.population,
      scene.period,
      ...scene.actors.map((a) => a.label),
      scene.outcome,
    ],
  };
  if (scene.storyId === '49')
    return [
      common,
      { id: scene.record.id, fields: quantityFields(scene.record.quantity) },
      {
        id: scene.result.id,
        fields: [
          `Operation: ${scene.result.operation}`,
          `From: ${scene.conversion.fromUnit}`,
          `To: ${scene.conversion.toUnit}`,
          `Source state: ${scene.result.sourceState}`,
          `Result: ${scene.result.state}`,
          ...basisFields(scene.result.originalBasis),
          ...basisFields(scene.result.basis),
          ...(scene.result.state === 'derived'
            ? scene.result.values.map((v) => exactRationalText(v.value))
            : []),
          ...quantityFields(scene.result.operand),
        ],
      },
    ];
  return [
    common,
    ...scene.records.map((r) => ({ id: r.id, fields: quantityFields(r.quantity) })),
    {
      id: scene.result.id,
      fields: [
        `Operation: ${scene.result.operation}`,
        `Result: ${scene.result.state}`,
        ...basisFields(scene.result.basis),
        ...(scene.result.state === 'derived'
          ? [`Ratio: ${exactRationalText(scene.result.ratio)}`]
          : []),
        ...scene.result.operands.flatMap(quantityFields),
      ],
    },
    ...scene.views.map((v) => ({
      id: v.id,
      fields: [
        `View: ${v.kind}`,
        ...v.quantityIds,
        ...(v.marks === undefined
          ? ['No resolved marks']
          : [
              `Marks: ${v.marks}`,
              `Selected: ${v.selectedMarks}`,
              ...(v.unitsPerMark ? [`Units per mark: ${exactRationalText(v.unitsPerMark)}`] : []),
              ...(v.ratio ? [`Ratio: ${exactRationalText(v.ratio)}`] : []),
            ]),
      ],
    })),
  ];
}
/** Complete copy is paged, not abbreviated; IDs are parser IDs, never time-derived identities. */
export function unitsEquivalencePages(
  scene: ExpansionUnitsEquivalenceScene,
): UnitsEquivalencePage[] {
  const D = UNITS_EQUIVALENCE_DETAIL;
  return unitsEquivalenceFields(scene).flatMap(({ id, fields }) => {
    const lines = fields.flatMap((field) => {
      const chars = Array.from(field);
      return Array.from({ length: Math.max(1, Math.ceil(chars.length / D.columns)) }, (_, i) =>
        chars.slice(i * D.columns, (i + 1) * D.columns).join(''),
      );
    });
    return Array.from({ length: Math.ceil(lines.length / D.rows) }, (_, i) => ({
      id,
      lines: lines.slice(i * D.rows, (i + 1) * D.rows),
      lineIds: lines
        .slice(i * D.rows, (i + 1) * D.rows)
        .map((_, j) => `${id}:line:${i * D.rows + j}`),
    }));
  });
}
export function unitsEquivalenceConversionCards(
  scene: ExpansionUnitsEquivalenceScene,
  pose: UnitsEquivalencePose,
): readonly { id: string; lines: readonly string[]; lineIds: readonly string[] }[] {
  if (scene.storyId !== '49') return [];
  const q = scene.record.quantity;
  const qualifier = 'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : '';
  const fields = [
    [plottedValueText(q), scene.conversion.fromUnit, q.state, qualifier],
    [
      scene.result.state === 'derived'
        ? scene.result.values.map((v) => exactRationalText(v.value)).join(' or ')
        : scene.result.state,
      scene.conversion.toUnit,
      scene.result.state,
      q.state,
      qualifier,
    ],
  ];
  return fields.map((copy, i) => {
    const lines = copy.filter(Boolean).flatMap((field) =>
      Array.from({ length: Math.ceil(Array.from(field).length / 8) }, (_, j) =>
        Array.from(field)
          .slice(j * 8, (j + 1) * 8)
          .join(''),
      ),
    );
    const count = Math.ceil(lines.length / 12);
    const page = Math.min(
      count - 1,
      Math.floor((pose.page / Math.max(1, pose.pages.length - 1)) * count),
    );
    return {
      id: i === 0 ? scene.record.id : scene.result.id,
      lines: lines.slice(page * 12, (page + 1) * 12),
      lineIds: lines
        .slice(page * 12, (page + 1) * 12)
        .map((_, j) => `${i === 0 ? scene.record.id : scene.result.id}:card-line:${page * 12 + j}`),
    };
  });
}
export function unitsEquivalencePose(
  scene: ExpansionUnitsEquivalenceScene,
  time: number,
): UnitsEquivalencePose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene),
    pages = unitsEquivalencePages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / Math.max(0.001, scene.resolveAt - scene.setupAt)),
  );
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    turn: p.modelTurn,
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
    pages,
  };
}
