import { PerspectiveCamera, Vector3 } from 'three';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionAmount, ExpansionQuantity } from '../value-types';
import type { ExpansionPriorityTreeScene } from './priority-tree-types';

export const PRIORITY_TREE_CAMERA = EXPLANATION_CAMERA;
export const PRIORITY_TREE_VIEWPORT = {
  width: 1080,
  height: 960,
  surface: DIAGRAM_REGIONS.body,
};
export interface PriorityTreeViewport {
  readonly width: number;
  readonly height: number;
  readonly surface: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}
export interface PriorityTreePage {
  readonly id: string;
  readonly title: string;
  readonly context: string;
  readonly text: string;
}
export interface PriorityTreeAnchor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly marker: string;
}
export function priorityTreeLabel(scene: ExpansionPriorityTreeScene, id: string): string {
  const entity = scene.entities.find((e) => e.id === id);
  if (!entity) throw new Error(`Missing validated decision identity: ${id}`);
  return entity.label;
}
/** Character wrapping preserves even unbroken maximum-length source strings. No truncation. */
export function priorityTreeLines(text: string, columns = 36): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.ceil(chars.length / columns) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
function amountText(amount: ExpansionAmount): string {
  if (amount.notation) return amount.notation;
  return amount.kind === 'rational'
    ? `${amount.value.numerator}/${amount.value.denominator}`
    : `${amount.value.minorUnits} minor units ${amount.value.currency}`;
}
/** Quantities are exact source text, not magnitudes, scores or calculated rankings. */
function quantityPages(id: string, title: string, q: ExpansionQuantity): PriorityTreePage[] {
  const fields: [string, string][] = [
    ['actor', q.actor],
    ['claim', q.claim],
    ['state', q.state],
    ['unit', q.basis.unit],
    ['period', q.basis.period],
    ['scope', q.basis.population],
  ];
  if (q.basis.denominator)
    fields.push([
      'denominator',
      `${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`,
    ]);
  if ('amount' in q) fields.push(['source amount', amountText(q.amount)]);
  if ('alternatives' in q)
    q.alternatives.forEach((a, i) => {
      fields.push([`disputed alternative ${i + 1}`, amountText(a)]);
    });
  if ('qualifier' in q) fields.push(['qualifier', q.qualifier]);
  if ('condition' in q) fields.push(['condition', q.condition]);
  return fields.map(([field, text]) => ({ id: `${id}/${field}`, title, context: field, text }));
}
export function priorityTreePages(scene: ExpansionPriorityTreeScene): PriorityTreePage[] {
  const label = (id: string) => priorityTreeLabel(scene, id);
  const pages: PriorityTreePage[] = [
    { id: 'owner', title: 'Source owner', context: 'actor', text: label(scene.ownerId) },
  ];
  if (scene.storyId === '27') {
    for (const effect of scene.effects) {
      const id = `effect/${effect.candidateId}/${effect.criterionId}`;
      const title = label(effect.candidateId),
        context = label(effect.criterionId);
      pages.push({ id, title, context, text: effect.text });
      pages.push({ id: `${id}/state`, title, context: `${context}: state`, text: effect.state });
      if (effect.condition)
        pages.push({ id: `${id}/condition`, title, context: 'condition', text: effect.condition });
      if (effect.qualifier)
        pages.push({ id: `${id}/qualifier`, title, context: 'qualifier', text: effect.qualifier });
    }
    for (const criterion of scene.criteria)
      if (criterion.weight)
        pages.push(
          ...quantityPages(
            `weight/${criterion.entityId}`,
            label(criterion.entityId),
            criterion.weight,
          ),
        );
    for (const score of scene.scores)
      pages.push(
        ...quantityPages(`score/${score.candidateId}`, label(score.candidateId), score.quantity),
      );
  } else {
    for (const node of scene.nodes) {
      const marker = `N${scene.nodes.indexOf(node) + 1}`;
      const id = `node/${node.entityId}`,
        title = label(node.entityId);
      pages.push({
        id,
        title,
        context: `${marker}: ${node.role} · ${node.state}`,
        text: node.text,
      });
      if (node.condition)
        pages.push({ id: `${id}/condition`, title, context: 'condition', text: node.condition });
      if (node.qualifier)
        pages.push({ id: `${id}/qualifier`, title, context: 'qualifier', text: node.qualifier });
    }
    for (const branch of scene.branches) {
      const id = `branch/${branch.fromId}/${branch.toId}`;
      pages.push({
        id,
        title: label(branch.fromId),
        context: label(branch.toId),
        text: branch.test,
      });
    }
  }
  pages.push({
    id: 'resolve',
    title: 'Source choice',
    context: scene.resolution.state,
    text: scene.resolutionText,
  });
  return pages;
}
/** All detail pages precede resolve; final hold is stable and never implies a traversal. */
export function priorityTreePose(
  scene: ExpansionPriorityTreeScene,
  seconds: number,
): ExpansionKitPose & { page: number } {
  const t = Number.isFinite(seconds) ? seconds : scene.setupAt - 1;
  const rise = (at: number) => {
    const u = Math.max(0, Math.min(1, (t - at) / 0.25));
    return u * u * (3 - 2 * u);
  };
  const count = priorityTreePages(scene).length;
  const fraction = Math.max(
    0,
    Math.min(1, (t - scene.actionAt) / (scene.resolveAt - scene.actionAt)),
  );
  return {
    reveal: rise(scene.setupAt),
    action: rise(scene.actionAt),
    response: rise(scene.responseAt),
    check: rise(scene.checkAt),
    resolve: rise(scene.resolveAt),
    page:
      t >= scene.resolveAt ? count - 1 : Math.min(count - 2, Math.floor(fraction * (count - 1))),
  };
}
/** Typed topology: breadth by depth, not evaluated predicates. Marker numbers are identity keys. */
export function priorityTreeAnchors(scene: ExpansionPriorityTreeScene): PriorityTreeAnchor[] {
  if (scene.storyId === '27') {
    const before = scene.priorities?.before.order ?? scene.criteria.map((c) => c.entityId);
    return [
      ...before.map((id, i) => ({ id, x: 40, y: 65 + i * 56, marker: 'before' })),
      ...(scene.priorities?.after.order.map((id, i) => ({
        id,
        x: 516,
        y: 65 + i * 56,
        marker: 'after',
      })) ?? []),
    ];
  }
  const depth = new Map<string, number>([[scene.rootId, 0]]);
  for (let pass = 0; pass < scene.nodes.length; pass++)
    for (const edge of scene.branches) {
      const parent = depth.get(edge.fromId);
      if (parent !== undefined) depth.set(edge.toId, parent + 1);
    }
  return scene.nodes.map((node, i) => {
    const level = depth.get(node.entityId);
    if (level === undefined) throw new Error('Disconnected validated tree');
    const peers = scene.nodes.filter((n) => depth.get(n.entityId) === level);
    return {
      id: node.entityId,
      x: 80 + level * 240,
      y: 32 + (peers.indexOf(node) + 0.5) * (216 / peers.length),
      marker: `N${i + 1}`,
    };
  });
}
export function priorityTreeCamera(
  viewport: PriorityTreeViewport = PRIORITY_TREE_VIEWPORT,
): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    PRIORITY_TREE_CAMERA.fov,
    viewport.width / viewport.height,
    0.1,
    100,
  );
  camera.position.set(...PRIORITY_TREE_CAMERA.position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}
export function priorityTreeModelPlacement(
  x: number,
  y: number,
  viewport: PriorityTreeViewport = PRIORITY_TREE_VIEWPORT,
) {
  const b = viewport.surface,
    unit = Math.min(b.width / 952, b.height / 478);
  const px = b.x + (b.width - 952 * unit) / 2 + x * unit;
  const py = b.y + (b.height - 478 * unit) / 2 + y * unit;
  const camera = priorityTreeCamera(viewport);
  const world = new Vector3(
    (2 * px) / viewport.width - 1,
    1 - (2 * py) / viewport.height,
    new Vector3().project(camera).z,
  ).unproject(camera);
  return {
    position: world.toArray() as [number, number, number],
    quaternion: camera.quaternion.toArray() as [number, number, number, number],
    scale:
      ((2 * camera.position.length() * Math.tan((PRIORITY_TREE_CAMERA.fov * Math.PI) / 360)) /
        viewport.height) *
      unit *
      30,
  };
}
