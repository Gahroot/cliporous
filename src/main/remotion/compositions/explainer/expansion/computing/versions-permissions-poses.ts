import { diagramPose } from '../../diagrams/motion';
import type { ExpansionKitPose } from '../scene-types';
import type {
  ExpansionVersionsPermissionsScene,
  VersionsPermissionsFact,
} from './versions-permissions-types';

export const VERSIONS_PERMISSIONS_DETAIL = {
  x: 500,
  y: 66,
  columns: 18,
  lines: 12,
  leading: 28,
  font: 22,
} as const;
export function versionsPermissionsWrap(text: string, columns = 18): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function versionsPermissionsRuns(text: string, sourceId: string, columns = 18) {
  let offset = 0;
  return versionsPermissionsWrap(text, columns).map((text) => {
    const run = { id: `${sourceId}:character:${offset}`, text };
    offset += Array.from(text).length;
    return run;
  });
}
export interface VersionsPermissionsPage {
  readonly id: string;
  readonly fact?: VersionsPermissionsFact;
  readonly lines: readonly string[];
  readonly lineIds: readonly string[];
}
export function versionsPermissionsPages(
  scene: ExpansionVersionsPermissionsScene,
): VersionsPermissionsPage[] {
  const name = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  const lenses = [
    {
      id: `${scene.storyId}:context`,
      fields: [
        scene.label,
        scene.subject,
        scene.evidence,
        scene.scope,
        scene.period,
        scene.outcome,
        ...scene.entities.map((e) => e.label),
      ],
    },
    ...[...scene.records, ...scene.relations].map((fact) => ({
      id: fact.id,
      fact,
      fields: [
        name(fact.actorId),
        name(fact.resourceId),
        ...(fact.replicaId ? [name(fact.replicaId)] : []),
        ...(fact.otherReplicaId ? [name(fact.otherReplicaId)] : []),
        ...(fact.version ? [fact.version] : []),
        ...(fact.operation ? [fact.operation] : []),
        fact.role,
        fact.result,
        fact.status.state,
        ...('qualification' in fact.status ? [fact.status.qualification] : []),
        ...('condition' in fact.status && fact.status.condition ? [fact.status.condition] : []),
        fact.scope,
        fact.period,
      ],
    })),
  ];
  return lenses.flatMap((lens) => {
    const lines = lens.fields.flatMap((field) => versionsPermissionsWrap(field));
    return Array.from({ length: Math.ceil(lines.length / 12) }, (_, page) => ({
      id: lens.id,
      fact: 'fact' in lens ? lens.fact : undefined,
      lines: lines.slice(page * 12, (page + 1) * 12),
      lineIds: lines
        .slice(page * 12, (page + 1) * 12)
        .map((_, i) => `${lens.id}:line:${page * 12 + i}`),
    }));
  });
}
export interface VersionsPermissionsPose extends ExpansionKitPose {
  readonly page: number;
  readonly pages: readonly VersionsPermissionsPage[];
}
export function versionsPermissionsPose(
  scene: ExpansionVersionsPermissionsScene,
  time: number,
): VersionsPermissionsPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene),
    pages = versionsPermissionsPages(scene);
  const frames = Math.max(1, Math.floor((scene.resolveAt - scene.setupAt) * 30));
  if (pages.length > frames) throw new Error('Source pages exceed authored frame capacity');
  const frame = Math.max(0, Math.min(frames, Math.floor((t - scene.setupAt) * 30 + 1e-7)));
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    page: Math.min(pages.length - 1, Math.floor((frame * pages.length) / frames)),
    pages,
  };
}
