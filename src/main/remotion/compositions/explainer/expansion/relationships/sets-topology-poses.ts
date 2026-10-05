import { diagramPose } from '../../diagrams/motion';
import { boundedKitPose } from '../kits/geometry';
import type { ExpansionKitPose } from '../scene-types';
import type {
  ExpansionRelationshipStatus,
  ExpansionSetsTopologyScene,
  ExpansionTopologyScene,
} from './sets-topology-types';

export interface SetsTopologyPage {
  id: string;
  lines: string[];
}
export interface SetsTopologyPose extends ExpansionKitPose {
  page: number;
  pages: SetsTopologyPage[];
}
export function relationshipQualification(fact: ExpansionRelationshipStatus): string {
  return fact.state === 'conditional'
    ? fact.condition
    : 'qualification' in fact
      ? fact.qualification
      : 'source stated';
}
export function relationshipCode(fact: ExpansionRelationshipStatus, value?: string): string {
  const code = {
    known: 'K',
    conditional: 'C',
    illustrative: 'I',
    simulated: 'S',
    unknown: '?',
    missing: 'M',
    disputed: 'D',
  }[fact.state];
  return (
    code +
    (value === 'included' || value === 'present'
      ? '+'
      : value === 'excluded' || value === 'absent'
        ? '-'
        : value === 'failed'
          ? 'F'
          : '')
  );
}
export function entityCode(scene: ExpansionSetsTopologyScene, id: string): string {
  if (scene.storyId === '40') return `N${scene.entities.findIndex((e) => e.id === id) + 1}`;
  const member = scene.memberIds.indexOf(id);
  return member >= 0 ? `M${member + 1}` : `S${scene.setIds.indexOf(id) + 1}`;
}
/** Slots carry identity only. They never produce edge records. */
export function topologySlot(scene: ExpansionTopologyScene, id: string): readonly [number, number] {
  const i = scene.entities.findIndex((e) => e.id === id);
  const slots = {
    chain: [
      [56, 208],
      [166, 208],
      [276, 208],
      [386, 208],
    ],
    ring: [
      [92, 130],
      [342, 130],
      [342, 270],
      [92, 270],
    ],
    diamond: [
      [217, 98],
      [72, 198],
      [362, 198],
      [217, 298],
    ],
  } as const;
  if (i < 0) throw new Error('Missing source topology identity');
  return slots[scene.template][i];
}
/** Full source strings, including unbroken tokens, are paged at fixed 22px; no shortening. */
export function setsTopologyPages(scene: ExpansionSetsTopologyScene): SetsTopologyPage[] {
  const fields: { id: string; text: string[] }[] = [
    {
      id: `${scene.storyId}:context`,
      text: [
        scene.label,
        scene.subject,
        scene.outcome,
        scene.evidence,
        ...(scene.condition ? [scene.condition] : []),
        `Scope: ${scene.scope}`,
        `Period: ${scene.period}`,
        'C conditional',
        'I illustrative',
        'S simulated',
        '+ included/present',
        '- excluded/absent',
        'F failed',
        'NS not supplied',
      ],
    },
  ];
  fields.push(
    ...scene.entities.map((e) => ({ id: e.id, text: [`${entityCode(scene, e.id)}: ${e.label}`] })),
  );
  if (scene.storyId === '39') {
    fields.push(
      ...scene.memberships.map((r) => ({
        id: r.id,
        text: [
          `${entityCode(scene, r.memberId)} in ${entityCode(scene, r.setId)}`,
          `${r.state}: ${r.membership ?? 'not supplied'}`,
          relationshipQualification(r),
        ],
      })),
    );
    fields.push({
      id: '39:operation',
      text: [
        scene.operation.kind,
        `${entityCode(scene, scene.operation.leftId)} ${scene.operation.kind === 'exclusion' ? 'minus' : scene.operation.kind === 'union' ? 'or' : 'and'} ${entityCode(scene, scene.operation.rightId)}`,
        'Source selection only',
        scene.selection.state,
        ...(scene.selection.state === 'complete'
          ? scene.selection.memberIds.length
            ? scene.selection.memberIds.map(
                (id) =>
                  `${entityCode(scene, id)}: ${scene.entities.find((e) => e.id === id)?.label}`,
              )
            : ['No selected members']
          : [scene.selection.qualification]),
      ],
    });
  } else {
    fields.push(
      ...scene.edges.map((r) => ({
        id: r.id,
        text: [
          `${entityCode(scene, r.fromId)} to ${entityCode(scene, r.toId)}`,
          r.role,
          `${r.state}: ${r.status ?? 'not supplied'}`,
          relationshipQualification(r),
        ],
      })),
    );
    fields.push({
      id: scene.failure.id,
      text: [
        'Conditional failure',
        scene.failure.edgeId,
        scene.failure.condition,
        `Effect: ${scene.failure.effect}`,
        'Condition not assumed',
      ],
    });
    fields.push({
      id: '40:outcome',
      text: [
        `${entityCode(scene, scene.result.actorId)}: ${scene.result.claim}`,
        scene.result.state,
        scene.result.result ?? 'No supplied result',
        relationshipQualification(scene.result),
        'No inferred route',
      ],
    });
  }
  return fields.flatMap((field) => {
    const lines = field.text.flatMap((text) => {
      const chars = Array.from(text);
      return Array.from({ length: Math.max(1, Math.ceil(chars.length / 18)) }, (_, i) =>
        chars.slice(i * 18, (i + 1) * 18).join(''),
      );
    });
    return Array.from({ length: Math.ceil(lines.length / 13) }, (_, i) => ({
      id: `${field.id}:page:${i}`,
      lines: lines.slice(i * 13, (i + 1) * 13),
    }));
  });
}
export function setsTopologyPose(
  scene: ExpansionSetsTopologyScene,
  time: number,
): SetsTopologyPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene);
  const pages = setsTopologyPages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / Math.max(0.001, scene.resolveAt - scene.setupAt)),
  );
  return {
    ...boundedKitPose({
      reveal: p.setup,
      action: p.action,
      response: p.response,
      check: p.check,
      resolve: p.resolve,
    }),
    pages,
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
  };
}
