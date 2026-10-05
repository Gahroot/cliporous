import { plottedValueText } from '../kits/plots';
import { representationValueText } from '../kits/representations';
import type { ExpansionQuantity } from '../value-types';
import type { ExpansionApprovalDependencyScene } from './approval-dependency-types';

export interface ApprovalDependencyPage {
  readonly id: string;
  readonly factId: string;
  readonly text: string;
  readonly lines: readonly string[];
}
export interface ApprovalDependencyPose {
  readonly reveal: number;
  readonly action: number;
  readonly response: number;
  readonly check: number;
  readonly resolve: number;
  readonly page: number;
}
export function approvalDependencyLabel(
  scene: ExpansionApprovalDependencyScene,
  id: string,
): string {
  const entity = scene.entities.find((e) => e.id === id);
  if (!entity) throw new Error(`Missing retained entity ${id}`);
  return entity.label;
}
/** Conservative one-em character wrapping preserves even long unbroken source tokens. */
export function approvalDependencyLines(text: string, columns = 19): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function approvalDependencyQuantity(q: ExpansionQuantity): string {
  const d = q.basis.denominator;
  return [
    q.actor,
    q.claim,
    q.state,
    plottedValueText(q),
    q.basis.unit,
    q.basis.population,
    q.basis.period,
    d ? `denominator ${representationValueText({ state: 'known', value: d })}` : '',
    'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : '',
  ]
    .filter(Boolean)
    .join('; ');
}
export function approvalDependencyPages(
  scene: ExpansionApprovalDependencyScene,
): ApprovalDependencyPage[] {
  const texts: { id: string; text: string }[] = [];
  const label = (id: string): string => approvalDependencyLabel(scene, id);
  texts.push({ id: 'context', text: `Source only; ${scene.scope}; ${scene.period}` });
  for (const e of scene.entities)
    texts.push({ id: e.id, text: `${e.label}; ${approvalDependencyRole(scene, e.id)}` });
  if (scene.storyId === '35') {
    for (const role of scene.roles)
      texts.push({
        id: role.id,
        text: `${role.type}; ${label(role.actorId)}; ${label(role.itemId)}; ${role.claim}; ${role.scope}; ${role.period}`,
      });
    for (const r of scene.records)
      texts.push({
        id: r.id,
        text: `${r.type}; ${label(r.actorId)} to ${label(r.targetId)}; item ${label(r.itemId)}; ${r.claim}; ${r.state}; ${r.scope}; ${r.period}${'condition' in r ? `; ${r.condition}` : ''}`,
      });
  } else {
    for (const r of scene.relations)
      texts.push({
        id: r.id,
        text: `${r.type}; ${label(r.fromId)} ${r.type === 'dependency' ? 'requires' : 'to'} ${label(r.toId)}; actor ${label(r.actorId)}; ${r.claim}; ${r.state}; ${r.scope}; ${r.period}${'condition' in r ? `; ${r.condition}` : ''}`,
      });
  }
  for (const v of scene.values)
    texts.push({ id: v.id, text: `Supplied only; ${approvalDependencyQuantity(v.quantity)}` });
  const r = scene.result;
  texts.push({
    id: r.id,
    text: `Work result; ${label(r.actorId)}; ${r.subject}; ${r.claim}; ${r.state}; ${r.scope}; ${r.period}${'condition' in r ? `; ${r.condition}` : ''}`,
  });
  return texts.flatMap(({ id, text }) => {
    const lines = approvalDependencyLines(text);
    return Array.from({ length: Math.ceil(lines.length / 13) }, (_, i) => ({
      id: `${id}/page-${i}`,
      factId: id,
      text,
      lines: lines.slice(i * 13, (i + 1) * 13),
    }));
  });
}
export function approvalDependencyRole(
  scene: ExpansionApprovalDependencyScene,
  id: string,
): 'owner' | 'approver' | 'work item' | 'actor' | 'entity' {
  if (scene.storyId === '35')
    return id === scene.ownerId ? 'owner' : id === scene.approverId ? 'approver' : 'work item';
  return id === scene.actorId ? 'actor' : 'entity';
}
/** No authority, completion, schedule or transitive edge is computed by the animation. */
export function approvalDependencyPose(
  scene: ExpansionApprovalDependencyScene,
  time: number,
): ApprovalDependencyPose {
  const t = Number.isFinite(time) ? time : scene.setupAt - 1;
  const ramp = (at: number): number => Math.max(0, Math.min(1, (t - at) / 0.3));
  const pages = approvalDependencyPages(scene);
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
