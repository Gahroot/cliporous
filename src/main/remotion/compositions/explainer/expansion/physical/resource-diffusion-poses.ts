import { diagramPose } from '../../diagrams/motion';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionAmount, ExpansionQuantity } from '../value-types';
import type { ExpansionResourceDiffusionScene } from './resource-diffusion-types';

export function resourceDiffusionWrap(text: string): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / 18)) }, (_, i) =>
    chars.slice(i * 18, (i + 1) * 18).join(''),
  );
}
function amount(a: ExpansionAmount): string {
  if (a.notation !== undefined) return a.notation;
  if (a.kind !== 'rational')
    throw new Error('Resource teaching rigs accept rational quantities only');
  return `${a.value.numerator}/${a.value.denominator}`;
}
export function resourceDiffusionQuantity(q: ExpansionQuantity): string[] {
  return [
    q.actor,
    q.claim,
    q.state,
    ...('amount' in q ? [amount(q.amount)] : 'alternatives' in q ? q.alternatives.map(amount) : []),
    `unit ${q.basis.unit}`,
    `period ${q.basis.period}`,
    `population ${q.basis.population}`,
    ...(q.basis.denominator
      ? [`denominator ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
      : []),
    ...('condition' in q ? [q.condition] : []),
    ...('qualifier' in q ? [q.qualifier] : []),
  ];
}
export interface ResourceDiffusionPage {
  readonly id: string;
  readonly state: string;
  readonly lines: readonly string[];
  readonly part: number;
  readonly parts: number;
}
export function resourceDiffusionPages(
  scene: ExpansionResourceDiffusionScene,
): ResourceDiffusionPage[] {
  const name = (id: string): string => {
    const entity = scene.entities.find((e) => e.id === id);
    if (!entity) throw new Error('Missing source identity');
    return entity.label;
  };
  const lenses = [
    {
      id: `${scene.storyId}:context`,
      state: scene.evidence,
      fields: [
        scene.label,
        scene.subject,
        scene.outcome,
        ...(scene.condition ? [scene.condition] : []),
        scene.period,
        scene.population,
        ...scene.entities.map((e) => e.label),
      ],
    },
    ...scene.records.map((r) => ({
      id: r.id,
      state: r.quantity.state,
      fields: [r.role, ...resourceDiffusionQuantity(r.quantity)],
    })),
    ...scene.relations.map((r, i) => ({
      id: `${scene.storyId}:relation:${i}`,
      state: scene.storyId === '75' ? 'conditional' : scene.model,
      fields: [name(r.fromId), name(r.toId), r.role, ...(r.condition ? [r.condition] : [])],
    })),
    ...(scene.storyId === '75'
      ? [
          {
            id: '75:access',
            state: 'conditional',
            fields: [
              name(scene.resourceId),
              name(scene.requesterId),
              'access only',
              scene.access.condition,
              scene.period,
              scene.population,
            ],
          },
          {
            id: '75:decision',
            state: scene.decision.state,
            fields: [
              name(scene.requesterId),
              name(scene.resourceId),
              scene.decision.result,
              scene.decision.condition,
              scene.period,
              scene.population,
            ],
          },
        ]
      : [
          {
            id: '76:model',
            state: scene.model,
            fields: [
              name(scene.materialId),
              name(scene.reservoirId),
              name(scene.filterId),
              scene.movement,
              scene.period,
              scene.population,
            ],
          },
          {
            id: '76:filter',
            state: scene.model,
            fields: [
              name(scene.filterId),
              name(scene.materialId),
              scene.filter.relation,
              scene.filter.condition,
            ],
          },
          {
            id: '76:result',
            state: scene.result.state,
            fields: [
              name(scene.materialId),
              name(scene.filterId),
              scene.result.relation,
              scene.filter.condition,
            ],
          },
        ]),
  ];
  return lenses.flatMap((lens) => {
    const lines = lens.fields.flatMap(resourceDiffusionWrap),
      parts = Math.ceil(lines.length / 9);
    return Array.from({ length: parts }, (_, part) => ({
      id: lens.id,
      state: lens.state,
      lines: lines.slice(part * 9, (part + 1) * 9),
      part,
      parts,
    }));
  });
}
export interface ResourceDiffusionPose extends ExpansionKitPose {
  readonly pages: readonly ResourceDiffusionPage[];
  readonly page: number;
}
/** Shared Chrome receives an exact current source chunk, not a shrinking/ellipsized full label. */
export function resourceDiffusionChrome(
  scene: ExpansionResourceDiffusionScene,
  pose: ResourceDiffusionPose,
): ExpansionResourceDiffusionScene {
  const current = (text: string): string => {
    const lines = resourceDiffusionWrap(text);
    return lines[pose.page % lines.length];
  };
  return {
    ...scene,
    label: current(scene.label),
    outcome: current(scene.outcome),
    ...(scene.condition ? { condition: current(scene.condition) } : {}),
  };
}
/** No particle integration, allocation, rate, permission or collision inference. */
export function resourceDiffusionPose(
  scene: ExpansionResourceDiffusionScene,
  time: number,
): ResourceDiffusionPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene),
    pages = resourceDiffusionPages(scene);
  const frames = Math.max(1, Math.floor((scene.resolveAt - scene.setupAt) * 30));
  if (pages.length > frames) throw new Error('Source pages exceed the supplied beat window');
  const frame = Math.max(0, Math.min(frames, Math.floor((t - scene.setupAt) * 30 + 1e-7)));
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    page: Math.min(pages.length - 1, Math.floor((frame * pages.length) / frames)),
  };
}
