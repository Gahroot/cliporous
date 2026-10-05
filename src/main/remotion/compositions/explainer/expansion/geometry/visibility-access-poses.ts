import { diagramPose } from '../../diagrams/motion';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionVisibilityAccessScene } from './visibility-access-types';

export type VisibilityAccessFact =
  | ExpansionVisibilityAccessScene['records'][number]
  | ExpansionVisibilityAccessScene['relations'][number];
export interface VisibilityAccessPage {
  id: string;
  lines: string[];
  sourceIds: string[];
  factId?: string;
}
export interface VisibilityAccessPose extends ExpansionKitPose {
  page: number;
  pages: readonly VisibilityAccessPage[];
}
export const SOURCE_COLUMNS = 18;
export const SOURCE_LINES = 14;
export function wrapSource(text: string): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / SOURCE_COLUMNS)) }, (_, i) =>
    chars.slice(i * SOURCE_COLUMNS, (i + 1) * SOURCE_COLUMNS).join(''),
  );
}
export function factStatus(fact: VisibilityAccessFact): string {
  return [
    fact.state,
    'value' in fact ? fact.value : '',
    'condition' in fact ? fact.condition : 'qualifier' in fact ? fact.qualifier : '',
  ]
    .filter(Boolean)
    .join(': ');
}
/** Exact canonical dictionaries are referenced, never shortened source labels. No evidence-index prose. */
export function visibilityAccessPages(
  scene: ExpansionVisibilityAccessScene,
): VisibilityAccessPage[] {
  const pages: VisibilityAccessPage[] = [];
  const add = (id: string, fields: string[], sourceIds: string[], factId?: string) => {
    const lines = fields.flatMap(wrapSource);
    for (let i = 0; i < lines.length; i += SOURCE_LINES)
      pages.push({
        id: `${id}:${i / SOURCE_LINES}`,
        lines: lines.slice(i, i + SOURCE_LINES),
        sourceIds: [...sourceIds],
        factId,
      });
  };
  add(
    'story',
    [
      scene.label,
      scene.subject,
      scene.outcome,
      scene.evidence,
      scene.template,
      scene.meaning,
      'Schematic only',
      ...(scene.condition ? [scene.condition] : []),
    ],
    [],
  );
  const names = new Map(scene.entities.map((e, i) => [e.id, `Entity ${i + 1}`]));
  for (const e of scene.entities) add(e.id, [names.get(e.id) ?? '', e.label], [e.id]);
  add(
    'local',
    [
      'Local scope',
      scene.scope,
      'Local period',
      scene.period,
      ...(scene.storyId === '61' ? ['Viewpoint', scene.viewpoint] : []),
    ],
    scene.entities.map((e) => e.id),
  );
  const statuses: { id: string; text: string; sourceIds: string[] }[] = [];
  const facts = [...scene.records, ...scene.relations];
  for (const f of facts) {
    const status = factStatus(f);
    let entry = statuses.find((s) => s.text === status);
    if (!entry) {
      entry = { id: `Status ${statuses.length + 1}`, text: status, sourceIds: [] };
      statuses.push(entry);
    }
    entry.sourceIds.push(f.id);
    const ids =
      'targetId' in f
        ? [f.actorId, f.targetId, ...('occluderId' in f ? [f.occluderId] : [])]
        : [f.actorId, f.routeId, f.fromId, f.toId];
    add(
      f.id,
      [
        f.role,
        ...ids.map(
          (id, i) =>
            `${'targetId' in f ? ['Observer', 'Target', 'Occluder'][i] : ['Actor', 'Route', 'From', 'To'][i]}: ${names.get(id)}`,
        ),
        'Scope/period: Local',
        ...('viewpoint' in f ? [`Viewpoint: ${f.viewpoint}`] : []),
        entry.id,
      ],
      [f.id, ...ids],
      f.id,
    );
  }
  for (const s of statuses) add(s.id, [s.id, s.text], s.sourceIds);
  return pages;
}
/** Bounded local cache: identity keyed; no source mutation or retained global string cache. */
const pageCache = new WeakMap<ExpansionVisibilityAccessScene, readonly VisibilityAccessPage[]>();
export function visibilityAccessPose(
  scene: ExpansionVisibilityAccessScene,
  t: number,
  suppliedPages?: readonly VisibilityAccessPage[],
): VisibilityAccessPose {
  let pages = suppliedPages ?? pageCache.get(scene);
  if (!pages) {
    pages = visibilityAccessPages(scene);
    pageCache.set(scene, pages);
  }
  const p = diagramPose(t, scene);
  const time = Number.isFinite(t) ? t : scene.setupAt;
  const progress = Math.max(
    0,
    Math.min(1, (time - scene.setupAt) / Math.max(1 / 30, scene.resolveAt - scene.setupAt)),
  );
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
  };
}
export function relatedFact(
  scene: ExpansionVisibilityAccessScene,
  f: VisibilityAccessFact,
  role: string,
): VisibilityAccessFact | undefined {
  return [...scene.records, ...scene.relations].find(
    (r) =>
      r.role === role &&
      r.actorId === f.actorId &&
      ('targetId' in f && 'targetId' in r
        ? r.targetId === f.targetId &&
          (!('occluderId' in f) || !('occluderId' in r) || f.occluderId === r.occluderId)
        : 'routeId' in f &&
          'routeId' in r &&
          r.routeId === f.routeId &&
          r.fromId === f.fromId &&
          r.toId === f.toId),
  );
}
export function connectionState(
  scene: ExpansionVisibilityAccessScene,
  f: VisibilityAccessFact,
): 'connected' | 'disconnected' | 'reference' {
  const route = relatedFact(scene, f, 'route');
  return route?.state === 'known' &&
    'value' in route &&
    (route.value === 'connected' || route.value === 'disconnected')
    ? route.value
    : 'reference';
}
export function currentFact(
  scene: ExpansionVisibilityAccessScene,
  pose: VisibilityAccessPose,
): VisibilityAccessFact {
  return (
    [...scene.records, ...scene.relations].find((f) => f.id === pose.pages[pose.page].factId) ??
    scene.relations[0]
  );
}
