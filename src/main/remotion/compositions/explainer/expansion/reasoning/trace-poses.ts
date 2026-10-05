import { PerspectiveCamera, Vector3 } from 'three';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import type { ExpansionKitPose, ExpansionKitState } from '../scene-types';
import type { ReasoningTraceScene } from './trace-types';

export interface TraceEntityPose {
  readonly id: string;
  readonly kind: 'document' | 'excerpt' | 'claim' | 'statement';
  readonly x: number;
  readonly y: number;
  readonly state: ExpansionKitState;
  readonly pose: ExpansionKitPose;
}
export type TracePage =
  | { readonly id: string; readonly kind: 'record'; readonly index: number }
  | { readonly id: string; readonly kind: 'relation'; readonly index: number }
  | { readonly id: 'resolve'; readonly kind: 'resolve'; readonly index: 0 };
export interface TracePose extends ExpansionKitPose {
  readonly setup: number;
  readonly entities: readonly TraceEntityPose[];
  readonly relations: readonly ExpansionKitPose[];
  readonly pages: readonly TracePage[];
  readonly page: number;
}
export interface TraceViewport {
  readonly width: number;
  readonly height: number;
  readonly surface: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}
export interface TraceModelPlacement {
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly scale: number;
}
export const TRACE_CAMERA = EXPLANATION_CAMERA;
export const TRACE_DEFAULT_VIEWPORT: TraceViewport = {
  width: 1080,
  height: 960,
  surface: DIAGRAM_REGIONS.body,
};
export const TRACE_DETAIL = { x: 8, y: 286, width: 936, height: 190 } as const;
export const TRACE_CARD = { width: 238, height: 142, fontSize: 22 } as const;
export const TRACE_SLOTS = Array.from(
  { length: 8 },
  (_, i) => [119 + 238 * (i % 4), 20 + 142 * Math.floor(i / 4)] as const,
);

/** DiagramSurface's xMidYMid meet transform, relative to the actual ThreeCanvas viewport. */
export function traceSurfacePoint(
  x: number,
  y: number,
  viewport: TraceViewport,
): { x: number; y: number; unit: number } {
  const b = viewport.surface;
  const unit = Math.min(b.width / 952, b.height / 478);
  return {
    x: b.x + (b.width - 952 * unit) / 2 + x * unit,
    y: b.y + (b.height - 478 * unit) / 2 + y * unit,
    unit,
  };
}
export function traceCamera(viewport: TraceViewport): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    TRACE_CAMERA.fov,
    viewport.width / viewport.height,
    0.1,
    100,
  );
  camera.position.set(...TRACE_CAMERA.position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}
/** Billboards on the camera's origin plane: paired with the real SVG meet transform, not a second board. */
export function traceModelPlacement(
  x: number,
  y: number,
  viewport: TraceViewport = TRACE_DEFAULT_VIEWPORT,
): TraceModelPlacement {
  const pixel = traceSurfacePoint(x, y, viewport);
  const camera = traceCamera(viewport);
  const depth = new Vector3().project(camera).z;
  const world = new Vector3(
    (2 * pixel.x) / viewport.width - 1,
    1 - (2 * pixel.y) / viewport.height,
    depth,
  ).unproject(camera);
  const worldPerPixel =
    (2 * camera.position.length() * Math.tan((TRACE_CAMERA.fov * Math.PI) / 360)) / viewport.height;
  return {
    position: [world.x, world.y, world.z],
    quaternion: [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ],
    scale: worldPerPixel * pixel.unit * 30,
  };
}
export function tracePages(scene: ReasoningTraceScene): readonly TracePage[] {
  return [
    ...scene.records.map(
      (record, index): TracePage => ({ id: `record/${record.entityId}`, kind: 'record', index }),
    ),
    ...scene.relations.map(
      (relation, index): TracePage => ({
        id: `relation/${relation.fromId}/${relation.role}/${relation.toId}`,
        kind: 'relation',
        index,
      }),
    ),
    { id: 'resolve', kind: 'resolve', index: 0 },
  ];
}
/** Each detail has its own stable ID; context remains on the identity rail throughout every page. */
export function tracePageTime(
  scene: ReasoningTraceScene,
  page: TracePage,
): { start: number; end: number } {
  if (page.kind === 'resolve') return { start: scene.resolveAt, end: Infinity };
  if (page.kind === 'record') {
    if (page.index === 0) return { start: scene.actionAt, end: scene.responseAt };
    const count = Math.max(1, scene.records.length - 1);
    const span = (scene.checkAt - scene.responseAt) / count;
    return {
      start: scene.responseAt + (page.index - 1) * span,
      end: scene.responseAt + page.index * span,
    };
  }
  const span = (scene.resolveAt - scene.checkAt) / scene.relations.length;
  return { start: scene.checkAt + page.index * span, end: scene.checkAt + (page.index + 1) * span };
}
function rise(t: number, at: number): number {
  const u = Math.max(0, Math.min(1, (t - at) / 0.25));
  return u * u * (3 - 2 * u);
}
/** Pure seconds-based pose; non-finite seeks return the finite pre-setup pose. */
export function tracePose(scene: ReasoningTraceScene, seconds: number): TracePose {
  const t = Number.isFinite(seconds) ? seconds : scene.setupAt - 1;
  const setup = rise(t, scene.setupAt);
  const action = rise(t, scene.actionAt);
  const response = rise(t, scene.responseAt);
  const check = rise(t, scene.checkAt);
  const resolve = rise(t, scene.resolveAt);
  const base = { reveal: setup, action, response, check, resolve };
  const order =
    scene.storyId === '01'
      ? [...scene.entities].sort((a, b) => {
          const rank = (id: string): number => {
            const role = scene.records.find((record) => record.entityId === id)?.role;
            return role === 'claim' ? 2 : role === 'excerpt' ? 1 : 0;
          };
          return rank(a.id) - rank(b.id);
        })
      : scene.entities.flatMap((source) =>
          scene.records.some((record) => record.entityId === source.id)
            ? []
            : [
                source,
                ...scene.entities.filter((entity) =>
                  scene.records.some(
                    (record) =>
                      record.role !== 'claim' &&
                      record.sourceId === source.id &&
                      record.entityId === entity.id,
                  ),
                ),
              ],
        );
  const entities = scene.entities.map((entity): TraceEntityPose => {
    const slot = TRACE_SLOTS[order.findIndex((entry) => entry.id === entity.id)];
    if (!slot) throw new RangeError('Trace identity exceeds its validated eight-entity envelope');
    const record = scene.records.find((entry) => entry.entityId === entity.id);
    return {
      id: entity.id,
      kind: record?.role ?? 'document',
      x: slot[0],
      y: slot[1],
      state: scene.storyId === '02' && record ? 'disputed' : 'active',
      pose: base,
    };
  });
  const pages = tracePages(scene);
  const page = Math.max(
    0,
    pages.findIndex((entry) => {
      const interval = tracePageTime(scene, entry);
      return t >= interval.start && t < interval.end;
    }),
  );
  return {
    ...base,
    setup,
    entities,
    relations: scene.relations.map(() => ({ ...base, reveal: check })),
    pages,
    page,
  };
}
