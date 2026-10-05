import { diagramPose } from '../../diagrams/motion';
import type { ExpansionFitScaleScene } from './fit-scale-types';

export interface FitScalePage {
  id: string;
  lines: string[];
  lineIds: string[];
}
export const FIT_SCALE_COLUMNS = 18;
export const FIT_SCALE_LINES = 16;
/** Fixed projections, never dimensions calculated from source quantities. */
export const FIT_SCALE_SHAPES = {
  tray: [40, 220, 400, 160],
  block: [160, 280, 140, 70],
  building: [40, 220, 400, 160],
  room: [100, 260, 280, 110],
  object: [190, 300, 100, 50],
} as const;
const pageCache = new WeakMap<ExpansionFitScaleScene, FitScalePage[]>();
export function fitScalePages(scene: ExpansionFitScaleScene): FitScalePage[] {
  const cached = pageCache.get(scene);
  if (cached) return cached;
  const names = new Map([...scene.entities, ...scene.records].map((r) => [r.id, r.label]));
  const pages: FitScalePage[] = [];
  const add = (id: string, fields: unknown[]) => {
    const lines = fields.flatMap((f) => {
      const chars = Array.from(String(f));
      return Array.from(
        { length: Math.max(1, Math.ceil(chars.length / FIT_SCALE_COLUMNS)) },
        (_, i) => chars.slice(i * FIT_SCALE_COLUMNS, (i + 1) * FIT_SCALE_COLUMNS).join(''),
      );
    });
    for (let i = 0; i < lines.length; i += FIT_SCALE_LINES)
      pages.push({
        id: `${id}:${i}`,
        lines: lines.slice(i, i + FIT_SCALE_LINES),
        lineIds: lines.slice(i, i + FIT_SCALE_LINES).map((_, j) => `${id}:line:${i + j}`),
      });
  };
  const fields = (o: object): unknown[] => {
    if ('numerator' in o && 'denominator' in o) return [`${o.numerator}/${o.denominator}`];
    return Object.entries(o).flatMap(([k, v]) => {
      if (k === 'id' || k === 'evidence') return [];
      if (Array.isArray(v))
        return [k, ...v.flatMap((x) => (typeof x === 'string' ? (names.get(x) ?? x) : fields(x)))];
      if (v && typeof v === 'object') return [k, ...fields(v)];
      return [`${k}: ${typeof v === 'string' ? (names.get(v) ?? v) : v}`];
    });
  };
  add('source', [
    scene.label,
    scene.subject,
    scene.outcome,
    scene.evidence,
    scene.representation,
    scene.template,
    scene.scope,
    scene.period,
    ...(scene.condition ? [scene.condition] : []),
  ]);
  for (const e of scene.entities) add(e.id, [e.label]);
  for (const r of scene.records) add(r.id, fields(r));
  for (const d of scene.dimensions) add(d.id, fields(d));
  for (const r of scene.relations) add(r.id, fields(r));
  add(scene.result.id, fields(scene.result));
  pageCache.set(scene, pages);
  return pages;
}
export function fitScalePose(scene: ExpansionFitScaleScene, time: number) {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const p = diagramPose(t, scene);
  const pages = fitScalePages(scene);
  const frames = Math.max(1, Math.floor((scene.resolveAt - scene.setupAt) * 30));
  const frame = Math.max(0, Math.floor((t - scene.setupAt) * 30));
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    page: Math.min(pages.length - 1, Math.floor((frame * pages.length) / frames)),
    blockY: 220 + 60 * p.response,
  };
}
export type FitScalePose = ReturnType<typeof fitScalePose>;
