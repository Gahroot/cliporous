import { diagramPose } from '../../diagrams/motion';
import type { ExpansionKitPose } from '../scene-types';
import type { CacheStreamFact, ExpansionCacheStreamScene } from './cache-stream-types';

export const CACHE_STREAM_DETAIL = {
  x: 500,
  y: 42,
  columns: 18,
  lines: 13,
  leading: 28,
  font: 22,
} as const;
export function cacheStreamWrap(text: string, columns = 18): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
/** Keys address source character positions, never a mutable render-array index. */
export function cacheStreamLineRuns(lines: readonly string[], sourceId: string) {
  let offset = 0;
  return lines.map((text) => {
    const run = { id: `${sourceId}:character:${offset}`, text };
    offset += Math.max(1, Array.from(text).length);
    return run;
  });
}
export function cacheStreamFields(f: CacheStreamFact): string[] {
  const q = f.qualification;
  return [
    f.role,
    q.state,
    ...('value' in q ? [q.value] : []),
    ...('condition' in q ? [q.condition] : []),
    ...('qualifier' in q ? [q.qualifier] : []),
    f.scope,
    f.period,
  ];
}
export interface CacheStreamPage {
  id: string;
  actorId: string;
  targetId: string;
  fact?: CacheStreamFact;
  lines: string[];
}
/** Source-addressed pages, including every identity and qualification; no derived TTL or rate. */
export function cacheStreamPages(scene: ExpansionCacheStreamScene): CacheStreamPage[] {
  const pages: CacheStreamPage[] = [];
  const add = (
    id: string,
    actorId: string,
    targetId: string,
    fields: string[],
    fact?: CacheStreamFact,
  ) => {
    const lines = fields.flatMap((field) => cacheStreamWrap(field));
    for (let i = 0; i < lines.length; i += CACHE_STREAM_DETAIL.lines)
      pages.push({
        id: `${id}:line:${i}`,
        actorId,
        targetId,
        fact,
        lines: lines.slice(i, i + CACHE_STREAM_DETAIL.lines),
      });
  };
  const actor = scene.entities[0];
  add(`${scene.storyId}:context`, actor.id, scene.entities[1].id, [
    scene.label,
    scene.subject,
    scene.evidence,
    scene.scope,
    scene.period,
    ...(scene.condition ? [scene.condition] : []),
    scene.outcome,
  ]);
  for (const entity of scene.entities) add(entity.id, actor.id, entity.id, [entity.label]);
  for (const fact of [...scene.records, ...scene.relations])
    for (const targetId of fact.targetIds)
      add(`${fact.id}:${targetId}`, fact.actorId, targetId, cacheStreamFields(fact), fact);
  return pages;
}
export interface CacheStreamPose extends ExpansionKitPose {
  page: number;
  pages: CacheStreamPage[];
  time: number;
}
export function cacheStreamPose(scene: ExpansionCacheStreamScene, time: number): CacheStreamPose {
  const t = Number.isFinite(time)
    ? Math.max(scene.setupAt, Math.min(scene.resolveAt + 0.8, time))
    : scene.setupAt;
  const pages = cacheStreamPages(scene);
  const start = Math.ceil(scene.setupAt * 30),
    end = Math.floor(scene.resolveAt * 30);
  const frame = Math.max(start, Math.min(end, Math.floor(t * 30)));
  const page = Math.min(
    pages.length - 1,
    Math.floor(((frame - start) * pages.length) / Math.max(1, end - start)),
  );
  const motion = diagramPose(t, scene);
  return { ...motion, reveal: motion.setup, page, pages, time: t };
}
