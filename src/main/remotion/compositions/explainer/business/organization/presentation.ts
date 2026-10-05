import { moneyText } from '../../../../../ai/explainer/finance-contract';
import { diagramPose } from '../../diagrams/motion';
import { businessLabelLines } from '../text-width';
import type { BusinessIdentity } from '../types';
import type { OrganizationScene } from './types';

export type OrganizationRecipeId =
  | 'OP-25'
  | 'OP-26'
  | 'OP-27'
  | 'OP-28'
  | 'OP-29'
  | 'OP-30'
  | 'OP-31';
export const ORGANIZATION_TABLE = Object.freeze({
  width: 952,
  height: 478,
  font: 24,
  lineHeight: 30,
  railWidths: [252, 402, 206] as const,
  x: [24, 296, 722] as const,
  rowTop: 78,
  rowBottom: 436,
  settledSeconds: 1.5,
});
export interface OrganizationRow {
  id: string;
  cells: readonly [string, string, string];
  state: string;
}
export interface OrganizationPage {
  rows: readonly OrganizationRow[];
  heights: readonly number[];
  height: number;
}
export interface OrganizationPresentation {
  recipeId: OrganizationRecipeId;
  title: string;
  columns: readonly [string, string, string];
  rows: readonly OrganizationRow[];
  pages: readonly OrganizationPage[];
}
export function organizationName(identity: BusinessIdentity): string {
  return identity.label;
}
export function organizationRecipe(scene: OrganizationScene): OrganizationRecipeId {
  switch (scene.preset) {
    case 'federated-units':
      return 'OP-25';
    case 'decision-rights':
      return 'OP-26';
    case 'rollout-rings':
      return 'OP-27';
    case 'legacy-boundaries':
      return 'OP-28';
    case 'merge-identities':
      return 'OP-29';
    case 'stated-chargeback':
      return 'OP-30';
    case 'declared-tool-boundaries':
      return 'OP-31';
  }
}
export function organizationRowLines(row: OrganizationRow): readonly string[][] {
  return row.cells.map((cell, index) =>
    businessLabelLines(cell, ORGANIZATION_TABLE.railWidths[index], ORGANIZATION_TABLE.font),
  );
}
export function organizationRowHeight(row: OrganizationRow): number {
  return (
    Math.max(...organizationRowLines(row).map((lines) => lines.length)) *
      ORGANIZATION_TABLE.lineHeight +
    20
  );
}
/** Only expected fixed-font density failures are caught at the untrusted parser boundary. */
export class OrganizationLayoutError extends Error {}

/** Fixed font, natural density. No ellipsis, scale-down, omitted rows or clipped overflow. */
export function organizationPages(rows: readonly OrganizationRow[]): OrganizationPage[] {
  const capacity = ORGANIZATION_TABLE.rowBottom - ORGANIZATION_TABLE.rowTop;
  const pages: OrganizationPage[] = [];
  let current: OrganizationRow[] = [];
  let heights: number[] = [];
  let height = 0;
  for (const row of rows) {
    const next = organizationRowHeight(row);
    if (next > capacity)
      throw new OrganizationLayoutError(
        'Organization fact exceeds the fixed-font page; split the source window',
      );
    if (height + next > capacity) {
      pages.push({ rows: current, heights, height });
      current = [];
      heights = [];
      height = 0;
    }
    current.push(row);
    heights.push(next);
    height += next;
  }
  if (current.length) pages.push({ rows: current, heights, height });
  return pages;
}
export function organizationPresentation(scene: OrganizationScene): OrganizationPresentation {
  const org = organizationName(scene.organization);
  const rows: OrganizationRow[] = [];
  let title: string;
  let columns: readonly [string, string, string];
  function row(id: string, left: string, middle: string, right: string, state = right): void {
    rows.push({ id, cells: [left, middle, right], state });
  }
  const named = (items: readonly BusinessIdentity[], id: string): string => {
    const item = items.find((entry) => entry.id === id);
    if (!item) throw new Error(`Missing validated identity ${id}`);
    return organizationName(item);
  };
  switch (scene.preset) {
    case 'federated-units':
      title = 'Federated responsibilities';
      columns = ['Local unit', 'Responsibility', 'Evidence state'];
      for (const unit of scene.units)
        row(
          `member:${unit.id}`,
          organizationName(unit),
          `Local unit of ${org}`,
          'Declared membership',
        );
      for (const fact of scene.responsibilities)
        row(
          `responsibility:${fact.unitId}:${fact.taskId}`,
          named(scene.units, fact.unitId),
          `${named(scene.tasks, fact.taskId)}; ${fact.scope}${fact.sharedWithId ? ` with ${named(scene.units, fact.sharedWithId)}` : ''}`,
          fact.state,
        );
      break;
    case 'decision-rights': {
      title = 'Declared decision rights';
      columns = ['Unit / role', 'Named decision / scope', 'Permission'];
      const units = scene.units.map((unit) => unit.identity);
      for (const unit of scene.units)
        row(
          `member:${unit.identity.id}`,
          organizationName(unit.identity),
          `${unit.role} unit of ${org}`,
          'Declared role',
        );
      for (const right of scene.rights) {
        row(
          `right:${right.unitId}:${right.decision.id}`,
          named(units, right.unitId),
          `${organizationName(right.decision)}; ${right.scope}${right.sharedWithId ? ` with ${named(units, right.sharedWithId)}` : ''}`,
          right.permission,
        );
        if (right.escalation)
          row(
            `escalation:${right.unitId}:${right.decision.id}`,
            named(units, right.unitId),
            `${right.decision.label}: escalation route to ${named(units, right.escalation.toUnitId)}`,
            right.escalation.state,
          );
      }
      break;
    }
    case 'rollout-rings':
      title = 'Dated rollout states';
      columns = ['Local unit', 'Rollout / source snapshot', 'Rollout state'];
      for (const ring of scene.rings)
        row(
          `ring:${ring.unit.id}`,
          organizationName(ring.unit),
          `${org}; ${organizationName(scene.rollout.identity)} version ${scene.rollout.version}; ${ring.date}`,
          ring.state,
        );
      break;
    case 'legacy-boundaries':
      title = 'Declared legacy interface';
      columns = ['System / role', 'Boundary', 'Source state'];
      row('legacy', organizationName(scene.legacy), `Legacy system at ${org}`, 'Declared role');
      row(
        'replacement',
        organizationName(scene.replacement),
        `Replacement system at ${org}`,
        'Declared role',
      );
      row(
        'boundary',
        organizationName(scene.interface),
        `Interface between ${organizationName(scene.legacy)} and ${organizationName(scene.replacement)}; not monitoring`,
        scene.boundary.state,
      );
      break;
    case 'declared-tool-boundaries':
      title = 'Declared tool boundaries';
      columns = ['Tool / actor', 'Declaration or use', 'Source state'];
      for (const unit of scene.units)
        row(
          `member:${unit.id}`,
          organizationName(unit),
          `Local unit of ${org}`,
          'Declared membership',
        );
      for (const worker of scene.workers)
        row(
          `worker:${worker.identity.id}`,
          organizationName(worker.identity),
          `Worker in ${named(scene.units, worker.unitId)} at ${org}`,
          'Declared role',
        );
      for (const tool of scene.tools)
        row(
          `tool:${tool.identity.id}`,
          organizationName(tool.identity),
          `${org}; declaration for ${named(scene.units, tool.unitId)}; not use`,
          tool.state,
        );
      for (const use of scene.uses)
        row(
          `use:${use.toolId}:${use.unitId}:${use.workerId}`,
          named(
            scene.tools.map((tool) => tool.identity),
            use.toolId,
          ),
          `${org}; ${use.context} use by ${
            use.workerId
              ? `${named(
                  scene.workers.map((worker) => worker.identity),
                  use.workerId,
                )} in `
              : ''
          }${named(scene.units, use.unitId)}; not approval or telemetry`,
          use.state,
        );
      break;
    case 'merge-identities': {
      title = 'Source identities stay distinct';
      columns = ['Record / source', 'Literal provenance / relationship', 'Match state'];
      row(
        `owner:${scene.owner.id}`,
        organizationName(scene.owner),
        `Responsible for reconciliation at ${org}`,
        'Declared responsibility',
      );
      for (const system of scene.systems)
        row(
          `system:${system.identity.id}`,
          organizationName(system.identity),
          `Source system at ${org}; version ${system.version}`,
          'Declared version',
        );
      for (const record of scene.records) {
        const system = scene.systems.find((entry) => entry.identity.id === record.sourceSystemId);
        if (!system) throw new Error('Missing validated source system');
        row(
          `record:${record.identity.id}`,
          organizationName(record.identity),
          `Source ID ${record.sourceId}; ${organizationName(system.identity)} version ${system.version}`,
          'Distinct record',
        );
      }
      for (const collision of scene.collisions)
        row(
          `collision:${collision.leftRecordId}:${collision.rightRecordId}`,
          named(
            scene.records.map((record) => record.identity),
            collision.leftRecordId,
          ),
          `Compared with ${named(
            scene.records.map((record) => record.identity),
            collision.rightRecordId,
          )}; no auto-merge`,
          collision.state,
        );
      break;
    }
    case 'stated-chargeback': {
      title = 'Stated chargeback';
      columns = ['Component / unit', 'Exact allocation / basis', 'Evidence state'];
      row(
        'service',
        organizationName(scene.service),
        `Shared service at ${org}; payer ${organizationName(scene.payer)}`,
        'Stated roles',
      );
      const basisText = (quantity: typeof scene.total): string =>
        `Payer ${organizationName(scene.payer)}; ${scene.service.label} at ${org}; unit ${quantity.basis.unit}; ${quantity.basis.period}; per ${quantity.basis.denominator} ${quantity.basis.population}`;
      const basis = (quantity: typeof scene.total): string =>
        `${moneyText(quantity.amount)}; ${basisText(quantity)}`;
      row('total', 'Stated total', basis(scene.total), scene.total.state);
      for (const allocation of scene.allocations)
        row(
          `allocation:${allocation.unitId}`,
          named(scene.units, allocation.unitId),
          `${basis(allocation)}; ${allocation.components} ${allocation.basis.population}; local unit of ${scene.organization.label}`,
          allocation.state,
        );
      row(
        'remainder',
        'Stated remainder',
        scene.remainder.state === 'unknown'
          ? `Amount and components unknown; ${basisText(scene.total)}`
          : `${basis(scene.remainder)}; ${scene.remainder.components} ${scene.remainder.basis.population}`,
        scene.remainder.state,
      );
      break;
    }
  }
  return {
    recipeId: organizationRecipe(scene),
    title,
    columns,
    rows,
    pages: organizationPages(rows),
  };
}
/** Inspect the real seekable handoff, including floating-point full-opacity settling. */
export function organizationReadingStart(scene: OrganizationScene): number {
  const full = (time: number): boolean => {
    const pose = diagramPose(time, scene);
    return pose.setup === 1 && (scene.visualMode === 'diagram' || pose.diagramOpacity === 1);
  };
  if (!full(scene.resolveAt)) return Number.POSITIVE_INFINITY;
  let low = scene.setupAt;
  let high = scene.resolveAt;
  for (let index = 0; index < 64; index++) {
    const middle = (low + high) / 2;
    if (full(middle)) high = middle;
    else low = middle;
  }
  return high;
}
export function organizationPageDuration(scene: OrganizationScene, pageCount: number): number {
  return (scene.resolveAt - organizationReadingStart(scene)) / pageCount;
}
/** Whole pages are discrete source displays, not state-changing animation. Last page holds. */
export function organizationPageAt(scene: OrganizationScene, time: number): number {
  const count = organizationPresentation(scene).pages.length;
  const duration = organizationPageDuration(scene, count);
  const t = Number.isFinite(time) ? Math.min(scene.resolveAt, time) : 0;
  return Math.max(
    0,
    Math.min(count - 1, Math.floor((t - organizationReadingStart(scene)) / duration)),
  );
}
