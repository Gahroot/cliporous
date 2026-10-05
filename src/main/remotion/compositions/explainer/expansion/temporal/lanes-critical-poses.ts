import { plottedValueText } from '../kits/plots';
import { compare, rationalPosition } from '../value-logic';
import type { ExpansionRational } from '../value-types';
import type { ExpansionLanesCriticalScene } from './lanes-critical-types';

export interface LanesCriticalPage {
  readonly id: string;
  readonly factId: string;
  readonly text: string;
  readonly lines: readonly string[];
}
export interface LanesCriticalPose {
  readonly reveal: number;
  readonly action: number;
  readonly response: number;
  readonly check: number;
  readonly resolve: number;
  readonly page: number;
}
export function lanesCriticalLines(text: string, columns = 19): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function lanesCriticalLabel(scene: ExpansionLanesCriticalScene, id: string): string {
  const entity = scene.entities.find((e) => e.id === id);
  if (!entity) throw new Error(`Missing retained entity ${id}`);
  return entity.label;
}
export function lanesCriticalTaskLabel(scene: ExpansionLanesCriticalScene, id: string): string {
  const task = scene.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`Missing retained task ${id}`);
  return lanesCriticalLabel(scene, task.entityId);
}
export function lanesCriticalRational(value: ExpansionRational): string {
  return `${value.numerator}/${value.denominator}`;
}
/** Exact domain projection only. A zero-length project is a milestone, not unknown. */
export function lanesCriticalPosition(value: ExpansionRational, total: ExpansionRational): number {
  const zero = { numerator: 0, denominator: 1 };
  const order = compare(total, zero);
  if (!order.ok || order.value < 0) throw new Error('Invalid schedule domain');
  if (order.value === 0) {
    const same = compare(value, zero);
    if (!same.ok || same.value !== 0) throw new Error('Outside zero project domain');
    return 0;
  }
  const projected = rationalPosition(value, zero, total);
  if (!projected.ok) throw new Error('Outside schedule domain');
  return projected.value;
}
const pageCache = new WeakMap<ExpansionLanesCriticalScene, LanesCriticalPage[]>();
export function lanesCriticalPages(scene: ExpansionLanesCriticalScene): LanesCriticalPage[] {
  const cached = pageCache.get(scene);
  if (cached) return cached;
  const facts: { id: string; text: string }[] = [
    {
      id: 'context',
      text: `${scene.label}; ${scene.subject}; ${scene.scope}; ${scene.period}; ${scene.storyId === '41' ? 'Durations do not assert starts, order or overlap' : 'Derived schedule; earliest solid, latest dashed; critical outlined; common domain from project start'}`,
    },
  ];
  for (const [i, task] of scene.tasks.entries()) {
    const q = task.duration;
    facts.push({
      id: task.id,
      text: `Task ${i + 1}; ${lanesCriticalTaskLabel(scene, task.id)}; ${q ? `${q.actor}; ${q.claim}; ${q.state}; ${plottedValueText(q)}; ${q.basis.unit}; ${q.basis.population}; ${q.basis.period}; ${'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : ''}` : 'duration not supplied; no measured interval'}`,
    });
  }
  for (const r of scene.relations)
    facts.push({
      id: r.id,
      text: `${r.type}; ${lanesCriticalTaskLabel(scene, r.fromId)} to ${lanesCriticalTaskLabel(scene, r.toId)}; ${r.state}; ${r.claim}; ${lanesCriticalLabel(scene, r.actorId)}; ${r.scope}; ${r.period}${'condition' in r ? `; ${r.condition}` : ''}`,
    });
  if (scene.storyId === '42') {
    const r = scene.result,
      b = r.scheduleBasis;
    facts.push({
      id: 'basis',
      text: `Derived; ${b.claim}; ${b.origin}; ${b.policy}; ${b.resourceModel}; ${r.basis.unit}; ${r.basis.population}; ${r.basis.period}; ${lanesCriticalLabel(scene, b.actorId)}`,
    });
    for (const operand of r.operands)
      facts.push({
        id: `${operand.taskId}/operands`,
        text: `Retained operands; ${lanesCriticalTaskLabel(scene, operand.taskId)}; duration ${plottedValueText(operand.duration)} ${operand.duration.basis.unit}; prerequisites: ${operand.prerequisites.prerequisiteIds.map((id) => lanesCriticalTaskLabel(scene, id)).join('; ') || 'explicit none'}; ${operand.prerequisites.scope}; ${operand.prerequisites.period}`,
      });
    for (const s of r.schedule)
      facts.push({
        id: `${s.taskId}/schedule`,
        text: `Derived; ${lanesCriticalTaskLabel(scene, s.taskId)}; earliest start ${lanesCriticalRational(s.earliestStart)}; earliest finish ${lanesCriticalRational(s.earliestFinish)}; latest start ${lanesCriticalRational(s.latestStart)}; latest finish ${lanesCriticalRational(s.latestFinish)}; slack ${lanesCriticalRational(s.slack)}; ${r.basis.unit}; ${r.criticalTaskIds.includes(s.taskId) ? 'critical' : 'noncritical'}`,
      });
    facts.push({
      id: r.id,
      text: `Derived critical-path calculation; duration ${lanesCriticalRational(r.duration)} ${r.basis.unit}; ${r.criticalPathCount} paths; ${r.pathMultiplicity}; critical tasks: ${r.criticalTaskIds.map((id) => lanesCriticalTaskLabel(scene, id)).join('; ')}; critical links: ${r.criticalRelationIds.join('; ')}; ${r.scope}; ${r.period}`,
    });
  } else {
    const r = scene.result;
    facts.push({
      id: r.id,
      text: `${lanesCriticalLabel(scene, r.actorId)}; ${r.claim}; ${r.state}; ${r.scope}; ${r.period}${'condition' in r ? `; ${r.condition}` : ''}`,
    });
  }
  const pages = facts.flatMap(({ id, text }) => {
    const lines = lanesCriticalLines(text);
    return Array.from({ length: Math.ceil(lines.length / 13) }, (_, i) => ({
      id: `${id}/page-${i}`,
      factId: id,
      text,
      lines: lines.slice(i * 13, (i + 1) * 13),
    }));
  });
  pageCache.set(scene, pages);
  return pages;
}
/** Only these five beat ramps are animated. Represented quantities are never changed. */
export function lanesCriticalPose(
  scene: ExpansionLanesCriticalScene,
  time: number,
): LanesCriticalPose {
  const t = Number.isFinite(time) ? time : scene.setupAt - 1;
  const ramp = (at: number): number => Math.max(0, Math.min(1, (t - at) / 0.3));
  const pages = lanesCriticalPages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / (scene.resolveAt - scene.setupAt)),
  );
  return {
    reveal: ramp(scene.setupAt),
    action: ramp(scene.actionAt),
    response: ramp(scene.responseAt),
    check: ramp(scene.checkAt),
    resolve: ramp(scene.resolveAt),
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
  };
}
