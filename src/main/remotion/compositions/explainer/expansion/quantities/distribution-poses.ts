import { diagramPose } from '../../diagrams/motion';
import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import { compare, rationalPosition } from '../value-logic';
import type { ExpansionDerivedValue, ExpansionQuantity, ExpansionRational } from '../value-types';
import type { ExpansionDistributionScene } from './distribution-types';

export const DISTRIBUTION_DETAIL = {
  x: 492,
  y: 34,
  font: 22,
  lineHeight: 28,
  columns: 20,
  rows: 14,
};
export const distributionWrap = (s: string, columns = 20): string[] => {
  const c = Array.from(s);
  return Array.from({ length: Math.max(1, Math.ceil(c.length / columns)) }, (_, i) =>
    c.slice(i * columns, (i + 1) * columns).join(''),
  );
};
const exact = (r: ExpansionRational) => `${r.numerator}/${r.denominator}`;
export function distributionValueFields(q: ExpansionQuantity | ExpansionDerivedValue): string[] {
  return [
    plottedValueText(q),
    `State: ${q.state}`,
    `Unit: ${q.basis.unit}`,
    `Population: ${q.basis.population}`,
    `Period: ${q.basis.period}`,
    ...(q.basis.denominator ? [`Basis denominator: ${exact(q.basis.denominator)}`] : []),
    ...(q.state === 'derived'
      ? [
          `Operation: ${q.operation}`,
          ...q.operands.map((v) => `Operand: ${exact(v)}`),
          `Result: ${exact(q.result)}`,
        ]
      : [
          q.actor,
          q.claim,
          ...('condition' in q ? [q.condition] : 'qualifier' in q ? [q.qualifier] : []),
          ...('amount' in q && q.amount.kind === 'rational'
            ? [`Exact: ${exact(q.amount.value)}`]
            : []),
          ...(q.state === 'disputed'
            ? q.alternatives.map((a) =>
                a.kind === 'rational'
                  ? `Exact: ${exact(a.value)}`
                  : `Minor units: ${a.value.minorUnits}`,
              )
            : []),
        ]),
  ];
}
export interface DistributionPage {
  id: string;
  record: number;
  aggregate: boolean;
  lines: readonly string[];
  lineIds: readonly string[];
}
export function distributionFields(
  scene: ExpansionDistributionScene,
): { id: string; record: number; aggregate: boolean; fields: string[] }[] {
  const entity = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  const domain = distributionDomain(scene);
  const common = [
    scene.label,
    scene.subject,
    scene.outcome,
    scene.metric,
    ...(scene.storyId === '17'
      ? [
          'Common vertical domain; zero baseline',
          ...(domain
            ? [`Axis lower exact: ${exact(domain.low)}`, `Axis upper exact: ${exact(domain.high)}`]
            : ['No supplied numeric domain']),
          'Equal slots are ordered categories, not interval widths',
        ]
      : scene.actorIds
          .flatMap((id, i) => [`A${i + 1}: ${entity(id)}`])
          .concat(scene.groupIds.map((id, i) => `G${i + 1}: ${entity(id)}`))),
  ];
  const rows =
    scene.storyId === '17'
      ? scene.records.map((r, record) => ({
          id: r.id,
          record,
          aggregate: false,
          fields: [
            ...common,
            entity(scene.actorId),
            scene.dataMeaning,
            scene.valueUnit,
            ...(r.role === 'bin'
              ? [
                  r.label,
                  `Lower inclusive: ${r.lower.notation}`,
                  `Lower exact: ${exact(r.lower.value)}`,
                  `Upper exclusive: ${r.upper.notation}`,
                  `Upper exact: ${exact(r.upper.value)}`,
                  'Aggregate bin; no individual membership',
                  ...distributionValueFields(r.count),
                ]
              : [
                  'Supplied observation; no generated samples',
                  ...distributionValueFields(r.quantity),
                ]),
          ],
        }))
      : scene.records.map((r, record) => ({
          id: r.id,
          record,
          aggregate: false,
          fields: [
            ...common,
            entity(r.actorId),
            entity(r.groupId),
            scene.meaning,
            `Result: ${scene.result.state}`,
            'Numerator',
            ...distributionValueFields(r.numerator),
            'Denominator',
            ...distributionValueFields(r.denominator),
            ...(scene.result.state === 'derived'
              ? scene.result.subgroupRates
                  .filter((v) => v.recordId === r.id)
                  .flatMap((v) => ['Subgroup rate', ...distributionValueFields(v.value)])
              : ['Source qualified; no computed rate']),
          ],
        }));
  if (scene.storyId === '18') {
    const result = scene.result;
    scene.actorIds.forEach((actorId, record) => {
      rows.push({
        id: `aggregate:${actorId}`,
        record,
        aggregate: true,
        fields: [
          ...common,
          entity(actorId),
          `Aggregate population: ${scene.aggregatePopulation}`,
          scene.meaning,
          `Result: ${result.state}`,
          'Subgroup direction is scope-bound',
          entity(scene.subgroupHigherActorId),
          'Aggregate direction is scope-bound',
          entity(scene.aggregateHigherActorId),
          ...(result.state === 'derived'
            ? result.aggregates
                .filter((a) => a.actorId === actorId)
                .flatMap((a) => [
                  'Aggregate numerator',
                  ...distributionValueFields(a.numerator),
                  'Aggregate denominator',
                  ...distributionValueFields(a.denominator),
                  'Aggregate rate',
                  ...distributionValueFields(a.rate),
                ])
            : ['Source qualified; no computed aggregate']),
        ],
      });
    });
  }
  return rows;
}
export function distributionPages(scene: ExpansionDistributionScene): DistributionPage[] {
  return distributionFields(scene).flatMap(({ fields, ...identity }) => {
    const lines = fields.flatMap((s) => distributionWrap(s));
    return Array.from({ length: Math.ceil(lines.length / 14) }, (_, p) => ({
      ...identity,
      lines: lines.slice(p * 14, (p + 1) * 14),
      lineIds: lines.slice(p * 14, (p + 1) * 14).map((_, i) => `${identity.id}:line:${p * 14 + i}`),
    }));
  });
}
export interface DistributionPose extends ExpansionKitPose {
  page: number;
  pages: readonly DistributionPage[];
  record: number;
  aggregate: boolean;
}
export function distributionPose(scene: ExpansionDistributionScene, t: number): DistributionPose {
  const p = diagramPose(t, scene),
    pages = distributionPages(scene);
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
    aggregate: pages[page].aggregate,
  };
}
function values(q: ExpansionQuantity): ExpansionRational[] {
  const amounts = q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : [];
  return amounts.map((a) =>
    a.kind === 'rational' ? a.value : { numerator: a.value.minorUnits, denominator: 100 },
  );
}
export function distributionDomain(scene: ExpansionDistributionScene) {
  if (scene.storyId !== '17') return null;
  const supplied = scene.records.flatMap((r) => values(r.role === 'bin' ? r.count : r.quantity));
  if (!supplied.length) return null;
  const zero = { numerator: 0, denominator: 1 };
  const order = (a: ExpansionRational, b: ExpansionRational) => {
    const c = compare(a, b);
    if (!c.ok) throw new Error('Invalid distribution domain');
    return c.value;
  };
  return {
    low: supplied.reduce((a, b) => (order(b, a) < 0 ? b : a), zero),
    high: supplied.reduce((a, b) => (order(b, a) > 0 ? b : a), zero),
  };
}
/** A common exact source domain. Empty states have NO plotted positions, not zero. */
export function distributionHistogram(scene: ExpansionDistributionScene) {
  if (scene.storyId !== '17') return [];
  const quantities = scene.records.map((r) => (r.role === 'bin' ? r.count : r.quantity));
  const domain = distributionDomain(scene);
  const project = (r: ExpansionRational) => {
    if (!domain || (domain.low.numerator === 0 && domain.high.numerator === 0)) return 0.5;
    const p = rationalPosition(r, domain.low, domain.high);
    if (!p.ok) throw new Error('Invalid distribution domain');
    return p.value;
  };
  return quantities.map((q, i) => ({
    id: scene.records[i].id,
    state: q.state,
    positions: values(q).map(project),
    baseline: project({ numerator: 0, denominator: 1 }),
  }));
}
export function distributionTable(scene: ExpansionDistributionScene) {
  if (scene.storyId !== '18') return [];
  const result = scene.result;
  return [...scene.groupIds, null].map((groupId, i) => {
    const rates = scene.actorIds.map((actorId) =>
      result.state !== 'derived'
        ? undefined
        : groupId === null
          ? result.aggregates.find((a) => a.actorId === actorId)?.rate
          : result.subgroupRates.find((r) => r.actorId === actorId && r.groupId === groupId)?.value,
    );
    const relation = rates[0] && rates[1] ? compare(rates[0].result, rates[1].result) : undefined;
    if (relation && !relation.ok) throw new Error('Invalid subgroup comparison');
    return {
      scopeId: groupId ?? 'aggregate',
      label: groupId === null ? 'All' : `G${i + 1}`,
      actorIds: scene.actorIds,
      values: rates.map((r) => (r ? exact(r.result) : 'No computed rate')),
      relation: relation?.ok ? (relation.value > 0 ? '>' : relation.value < 0 ? '<' : '=') : '—',
      state: result.state,
    };
  });
}
