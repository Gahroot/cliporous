import { diagramPose } from '../../diagrams/motion';
import { businessLabelLines, businessTextWidth } from '../text-width';
import type { BusinessIdentity } from '../types';
import { INFRASTRUCTURE_LIMITS, type InfrastructureRow, type InfrastructureScene } from './types';

export const INFRASTRUCTURE_RAIL = {
  width: 952,
  height: 478,
  padding: 24,
  fontSize: 24,
  lineHeight: 29,
  bodyLines: 11,
  minimumPageSec: 1.5,
  finalHoldSec: 0.8,
} as const;
export function infrastructureLines(text: string): string[] {
  const width = INFRASTRUCTURE_RAIL.width - 2 * INFRASTRUCTURE_RAIL.padding;
  if (
    text.split(/\s+/u).some((word) => businessTextWidth(word, INFRASTRUCTURE_RAIL.fontSize) > width)
  )
    return [text];
  return businessLabelLines(text, width, INFRASTRUCTURE_RAIL.fontSize);
}
export function infrastructureIdentities(scene: InfrastructureScene): BusinessIdentity[] {
  switch (scene.preset) {
    case 'installed-used-reserved':
      return [scene.resource];
    case 'physical-readiness':
      return [scene.resource, scene.funding, scene.power, scene.cooling];
    case 'bounded-request-capacity':
      return [scene.resource, scene.task];
    case 'resource-states':
      return [scene.resource, scene.cooling];
    case 'declared-processing-scope':
      return [scene.resource, scene.item, scene.boundary];
    case 'end-to-end-periods':
      return [scene.resource, scene.task, ...scene.stages.map((s) => s.identity)];
    case 'evidence-and-missing-information':
      return [scene.owner, ...scene.items.map((item) => item.entry.identity)];
    case 'provider-transition':
      return [scene.resource, scene.fromProvider, scene.toProvider, scene.dependency];
    case 'versioned-provenance':
      return [scene.owner, ...scene.entries.map((entry) => entry.identity)];
    case 'evaluation-periods':
      return [scene.owner, scene.task];
  }
}
export function infrastructureRows(scene: InfrastructureScene): InfrastructureRow[] {
  // Names are complete in the heading; do not repeat every name as a second body line.
  const rows: InfrastructureRow[] = infrastructureIdentities(scene).map((identity) => ({
    id: `identity:${identity.id}`,
    label: identity.label,
    state: 'source-named',
    text: '',
  }));
  const add = (id: string, label: string, fact: { state?: string; text: string }) =>
    rows.push({ id, label, state: fact.state ?? 'source-stated', text: fact.text });
  switch (scene.preset) {
    case 'installed-used-reserved':
      add('installed', 'Installed capacity', scene.installed);
      add('used', 'Used capacity', scene.used);
      add('reserved', 'Reserved capacity', scene.reserved);
      add('partition', 'Nonoverlap declaration', scene.partition);
      break;
    case 'physical-readiness':
      add('money-ready', 'Financing readiness', scene.moneyReady);
      add('power-ready', 'Power readiness', scene.powerReady);
      add('cooling-ready', 'Cooling readiness', scene.coolingReady);
      break;
    case 'bounded-request-capacity':
      add('queued', 'Queued requests', scene.queued);
      add('capacity', 'Request capacity', scene.capacity);
      break;
    case 'resource-states':
      add('installed', 'Installed capacity', scene.installed);
      add('idle', 'Idle allocation', scene.idle);
      add('reserved', 'Reserved allocation', scene.reserved);
      add('burst', 'Burst allocation', scene.burst);
      add('cooling-ready', 'Cooling readiness', scene.coolingReady);
      add('partition', 'Nonoverlap declaration', scene.partition);
      break;
    case 'declared-processing-scope':
      add('processing', 'Declared processing scope', scene.processing);
      break;
    case 'end-to-end-periods':
      for (const stage of scene.stages)
        add(`latency:${stage.identity.id}`, `${stage.identity.label} latency`, stage.quantity);
      add('total', 'End-to-end latency', scene.total);
      add('aggregation', 'Aggregation evidence', scene.aggregation);
      break;
    case 'evidence-and-missing-information':
      for (const item of scene.items)
        add(
          `item:${item.entry.identity.id}:${item.entry.version}`,
          `${item.entry.identity.label} · ${item.entry.version} · ${item.date}`,
          item.fact,
        );
      break;
    case 'provider-transition':
      add('transition', 'Provider transition', scene.transition);
      break;
    case 'versioned-provenance':
      for (const entry of scene.entries)
        add(`version:${entry.identity.id}:${entry.version}`, `${entry.identity.label} version`, {
          text: `${entry.identity.label} · ${entry.version} · ${scene.period}`,
        });
      for (const edge of scene.edges)
        add(`edge:${edge.fromId}:${edge.toId}`, 'Declared provenance', edge);
      break;
    case 'evaluation-periods':
      for (const snapshot of scene.snapshots)
        add(
          `snapshot:${snapshot.version}:${snapshot.date}`,
          `${snapshot.version} · ${snapshot.date}`,
          snapshot.quantity,
        );
      break;
  }
  return rows;
}
export function infrastructurePages(scene: InfrastructureScene) {
  const pages: { rows: InfrastructureRow[]; lines: number }[] = [];
  for (const row of infrastructureRows(scene)) {
    const lines =
      infrastructureLines(`${row.label} · ${row.state}`).length +
      infrastructureLines(row.text).length;
    const prior = pages.at(-1);
    if (prior && prior.lines + lines <= INFRASTRUCTURE_RAIL.bodyLines) {
      prior.rows.push(row);
      prior.lines += lines;
    } else pages.push({ rows: [row], lines });
  }
  return pages;
}
export function infrastructureReadingStart(scene: InfrastructureScene): number {
  if (scene.visualMode === 'diagram') return scene.actionAt;
  // Match the existing HybridStage default response-beat handoff exactly.
  return scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt);
}
export function infrastructureDetailWindows(scene: InfrastructureScene) {
  const pages = infrastructurePages(scene),
    start = infrastructureReadingStart(scene);
  return pages.map((page, index) => ({
    page,
    index,
    start: start + ((scene.resolveAt - start) * index) / pages.length,
    end: start + ((scene.resolveAt - start) * (index + 1)) / pages.length,
  }));
}
export function infrastructurePageIndex(scene: InfrastructureScene, seconds: number): number {
  const n = infrastructurePages(scene).length,
    start = infrastructureReadingStart(scene);
  if (!Number.isFinite(seconds) || seconds <= start) return 0;
  if (seconds >= scene.resolveAt) return n - 1;
  // Compare against the same authored boundaries used by detail windows; division/floor
  // can choose the previous page at an exact floating-point page boundary.
  let index = 0;
  for (const window of infrastructureDetailWindows(scene))
    if (seconds >= window.start) index = window.index;
  return index;
}
export function infrastructurePresentationFits(
  scene: InfrastructureScene,
  endTime: number,
): boolean {
  const pages = infrastructurePages(scene),
    start = infrastructureReadingStart(scene);
  return (
    Number.isFinite(endTime) &&
    endTime - scene.resolveAt >= INFRASTRUCTURE_RAIL.finalHoldSec &&
    pages.length > 0 &&
    pages.length <= INFRASTRUCTURE_LIMITS.pages &&
    (scene.resolveAt - start) / pages.length >= INFRASTRUCTURE_RAIL.minimumPageSec &&
    diagramPose(start, scene).setup === 1 &&
    (scene.visualMode === 'diagram' || diagramPose(start, scene).diagramOpacity === 1) &&
    pages.every(
      (page) =>
        page.lines <= INFRASTRUCTURE_RAIL.bodyLines &&
        page.rows.every((row) =>
          [row.text, `${row.label} · ${row.state}`].every((text) =>
            infrastructureLines(text).every(
              (line) =>
                businessTextWidth(line, INFRASTRUCTURE_RAIL.fontSize) <=
                INFRASTRUCTURE_RAIL.width - 2 * INFRASTRUCTURE_RAIL.padding,
            ),
          ),
        ),
    )
  );
}
