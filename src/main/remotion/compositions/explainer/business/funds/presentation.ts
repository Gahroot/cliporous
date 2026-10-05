import { formatMoney } from '../../finance/poses';

import { businessLabelLines } from '../text-width';
import {
  type FundsAmount,
  type FundsScene,
  fundsAmounts,
  fundsRecipe,
  FUNDS_METRICS as M,
} from './types';

export const FUNDS_TABLE = {
  font: 24,
  lineHeight: 30,
  width: 952,
  height: 478,
  x: [24, 296, 722] as const,
  railWidths: [252, 402, 206] as const,
  rowTop: 96,
  rowBottom: 456,
  settledSeconds: 1.5,
} as const;
export interface FundsRow {
  id: string;
  cells: readonly [string, string, string];
  state: string;
}
export interface FundsPage {
  rows: FundsRow[];
  heights: number[];
  height: number;
}
export function fundsAmountText(value: FundsAmount): string {
  return `${value.amount ? formatMoney(value.amount) : `${value.state} ${value.basis.unit}`} — ${value.state}${value.condition ? `; ${value.condition}` : ''}`;
}
export function fundsBasisText(value: FundsAmount): string {
  return `${value.basis.period}; ${value.basis.unit} per ${value.basis.denominator ?? 'unknown'} ${value.basis.population}`;
}
export function fundsRows(scene: FundsScene): FundsRow[] {
  const row = (id: string, label: string, amount: FundsAmount): FundsRow => ({
    id,
    cells: [label, fundsAmountText(amount), fundsBasisText(amount)],
    state: amount.state,
  });
  switch (scene.preset) {
    case 'capital-states':
      return ['committed', 'called', 'contributed', 'deployed', 'retained'].map((key) => {
        switch (key) {
          case 'committed':
            return row('committed', M.committed, scene.committed);
          case 'called':
            return row('called', M.called, scene.called);
          case 'contributed':
            return row('contributed', M.contributed, scene.contributed);
          case 'deployed':
            return row('deployed', M.deployed, scene.deployed);
          default:
            return row('retained', M.retained, scene.retained);
        }
      });
    case 'subscriptions-and-close':
      return [
        row('subscriptions', M.subscriptions, scene.subscriptions),
        row('uncalled', M.uncalled, scene.uncalled),
        row('cash', M.cash, scene.cash),
        {
          id: 'closing',
          cells: ['Subscription close', scene.closing.state, scene.closing.date],
          state: scene.closing.state,
        },
      ];
    case 'source-periods':
      return scene.periods.map((period) =>
        row(
          period.identity.id,
          `${period.identity.label}: ${M[period.account]} (${period.date})`,
          period.value,
        ),
      );
    case 'retained-follow-on-capital':
      return [
        row('retained', M.retained, scene.retained),
        row('allocated', M.allocated, scene.allocated),
        row('remaining', M.remaining, scene.remaining),
      ];
    case 'stated-priority-tiers':
      return [
        row('proceeds', M.proceeds, scene.proceeds),
        ...scene.tiers.map(
          (tier): FundsRow => ({
            id: tier.identity.id,
            cells: [
              `Priority ${tier.priority}: ${tier.identity.label}`,
              `Ceiling ${fundsAmountText(tier.ceiling)}; Distribution ${fundsAmountText(tier.allocation)}`,
              `${fundsBasisText(tier.ceiling)}; ${fundsBasisText(tier.allocation)}`,
            ],
            state: `${tier.ceiling.state}/${tier.allocation.state}`,
          }),
        ),
        row('retained', M.distributionRetained, scene.retained),
      ];
    case 'gross-to-net':
      return [
        row('gross', M.gross, scene.gross),
        ...scene.costs.map((cost) =>
          row(cost.identity.id, `Stated cost: ${cost.identity.label}`, cost.amount),
        ),
        row('net', M.net, scene.net),
        row('remainder', M.remainder, scene.remainder),
      ];
    case 'periodic-repurchase':
      return [
        {
          id: 'window',
          cells: ['Interval fund window', scene.window.label, 'Source-stated'],
          state: 'source-stated',
        },
        row('cap', M.cap, scene.cap),
        row('cash', M.cash, scene.cash),
        ...scene.requests.map(
          (request): FundsRow => ({
            id: request.identity.id,
            cells: [
              `${request.identity.label}: repurchase request`,
              `${request.state}; ${fundsAmountText(request.amount)}`,
              fundsBasisText(request.amount),
            ],
            state: request.state,
          }),
        ),
      ];
    case 'valuation-cash-distinction':
      return [row('valuation', M.valuation, scene.valuation), row('cash', M.cash, scene.cash)];
  }
}
export function fundsSemanticIds(scene: FundsScene): string[] {
  return [
    scene.fund.id,
    scene.operator.id,
    ...fundsRows(scene)
      .filter((row) => row.id !== 'window')
      .map((row) => `${scene.fund.id}:${row.id}`),
  ];
}
export function fundsResourceCounts(scene: FundsScene) {
  const entities = fundsSemanticIds(scene).length;
  const holds =
    fundsAmounts(scene).filter((amount) => amount.state !== 'source-stated').length +
    (scene.preset === 'subscriptions-and-close' && scene.closing.state !== 'closed' ? 1 : 0) +
    (scene.preset === 'periodic-repurchase'
      ? scene.requests.filter((request) => request.state !== 'fulfilled').length
      : 0);
  const relationships =
    entities -
    1 +
    (scene.preset === 'stated-priority-tiers'
      ? scene.tiers.length
      : scene.preset === 'gross-to-net'
        ? scene.costs.length
        : scene.preset === 'periodic-repurchase'
          ? 1
          : 0);
  return { entities, relationships, holds };
}
export function fundsRowLines(row: FundsRow): string[][] {
  return row.cells.map((cell, index) =>
    businessLabelLines(cell, FUNDS_TABLE.railWidths[index], FUNDS_TABLE.font),
  );
}
export function fundsPages(scene: FundsScene): FundsPage[] {
  const pages: FundsPage[] = [];
  let current: FundsPage = { rows: [], heights: [], height: 0 };
  for (const row of fundsRows(scene)) {
    const height =
      Math.max(...fundsRowLines(row).map((lines) => lines.length)) * FUNDS_TABLE.lineHeight + 20;
    const capacity = FUNDS_TABLE.rowBottom - FUNDS_TABLE.rowTop;
    if (height > capacity) throw new Error('A complete fixed-font funds fact exceeds its rail');
    if (current.height + height > capacity) {
      pages.push(current);
      current = { rows: [], heights: [], height: 0 };
    }
    current.rows.push(row);
    current.heights.push(height);
    current.height += height;
  }
  if (current.rows.length) pages.push(current);
  return pages;
}
export function fundsReadingStart(scene: FundsScene): number {
  if (scene.visualMode === 'diagram') return scene.actionAt;
  // diagramPose's default response handoff is fully opaque after this exact duration.
  return scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt);
}
export function fundsPageDuration(scene: FundsScene, count = fundsPages(scene).length): number {
  return (scene.resolveAt - fundsReadingStart(scene)) / count;
}
export function fundsPageAt(scene: FundsScene, time: number): FundsPage {
  const pages = fundsPages(scene),
    duration = fundsPageDuration(scene, pages.length);
  const index =
    time >= scene.resolveAt
      ? pages.length - 1
      : Math.max(
          0,
          Math.min(pages.length - 1, Math.floor((time - fundsReadingStart(scene)) / duration)),
        );
  return pages[index];
}
export function fundsTitle(scene: FundsScene): string {
  return `${scene.fund.label}; operator ${scene.operator.label} — ${fundsRecipe(scene)}`;
}
