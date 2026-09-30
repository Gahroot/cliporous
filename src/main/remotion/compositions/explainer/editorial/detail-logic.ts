import { type Material, type Mesh, type Object3D, Plane, Vector3 } from 'three';
import { placeLabel, projectAnchor } from '../mechanisms/anchors';
import type { Vec3 } from '../mechanisms/paths';
import type { CameraSpec } from '../three-helpers';
import { ease } from './motion';
import type { DetailTreatment } from './types';

/** Sampled from the authored part's exact pose, never supplied by the model. */
export interface DetailAnchor {
  point: Vec3;
  /** World origin of the origin-centred cloned part; point may be a surface detail away from it. */
  partOrigin?: Vec3;
  endpoints?: readonly [Vec3, Vec3];
  radius: number;
}

const SAFE = { x: 72, y: 170, width: 936, height: 666 };
export const DETAIL_MAGNIFICATION = 2;
export const DETAIL_CLIP_SIDES = 24;

/** Inscribed aperture rays, not a cylinder: clipping stays inside the screen circle at ANY depth. */
export function detailClippingPlanes(
  camera: CameraSpec,
  center: Vec3,
  right: Vec3,
  up: Vec3,
  radius: number,
): Plane[] {
  const eye = new Vector3(...camera.position);
  const middle = new Vector3(...center);
  const rim = Array.from({ length: DETAIL_CLIP_SIDES }, (_, i) => {
    const angle = (i * Math.PI * 2) / DETAIL_CLIP_SIDES;
    return middle
      .clone()
      .addScaledVector(new Vector3(...right), radius * Math.cos(angle))
      .addScaledVector(new Vector3(...up), radius * Math.sin(angle));
  });
  return rim.map((a, i) => {
    const b = rim[(i + 1) % rim.length];
    if (!b) throw new Error('Missing authored aperture edge');
    const plane = new Plane().setFromCoplanarPoints(eye, a, b);
    // Three discards negative signed distances (vClipPosition = -mvPosition).
    if (plane.distanceToPoint(middle) < 0) plane.negate();
    return plane;
  });
}

type ClippingRenderer = { localClippingEnabled: boolean };
const clippingLeases = new WeakMap<ClippingRenderer, { previous: boolean; users: number }>();

/** Only this subtree's materials are replaced. Shared source materials/geometries/textures stay untouched. */
export function installDetailClipping(
  root: Object3D,
  renderer: ClippingRenderer,
  planes: Plane[],
): () => void {
  const materials = new Map<Material, Material>();
  const bindings: { mesh: Mesh; original: Material | Material[]; owned: Material | Material[] }[] =
    [];
  const clone = (source: Material): Material => {
    const cached = materials.get(source);
    if (cached) return cached;
    const material = source.clone();
    material.clippingPlanes = planes;
    material.clipIntersection = false;
    material.clipShadows = true;
    materials.set(source, material);
    return material;
  };
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const original = mesh.material;
    const owned = Array.isArray(original) ? original.map(clone) : clone(original);
    bindings.push({ mesh, original, owned });
    mesh.material = owned;
  });
  const lease = clippingLeases.get(renderer) ?? {
    previous: renderer.localClippingEnabled,
    users: 0,
  };
  lease.users += 1;
  clippingLeases.set(renderer, lease);
  renderer.localClippingEnabled = true;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const { mesh, original, owned } of bindings) {
      if (mesh.material === owned) mesh.material = original;
    }
    for (const material of materials.values()) material.dispose();
    lease.users -= 1;
    if (lease.users === 0) {
      renderer.localClippingEnabled = lease.previous;
      clippingLeases.delete(renderer);
    }
  };
}

export function detailFocusOpacity(
  detail: DetailTreatment | undefined,
  target: string,
  time: number,
): number {
  if (!detail || detail.kind !== 'focus-isolation' || detail.target === target) return 1;
  return 1 - 0.74 * ease((time - detail.at) / 0.4);
}

/** Same look-at-origin convention as projectAnchor/Stage3D. No independent camera or clock. */
export function sampleDetailLayout(camera: CameraSpec, anchor: DetailAnchor, compact = false) {
  if (!Number.isFinite(anchor.radius) || anchor.radius <= 0) return null;
  const source = projectAnchor(camera, anchor.point);
  if (!source) return null;
  const distance = Math.hypot(...camera.position);
  const normal = camera.position.map((v) => v / distance) as [number, number, number];
  const horizontal = Math.hypot(normal[0], normal[2]);
  if (horizontal < 0.001) return null;
  const right: Vec3 = [normal[2] / horizontal, 0, -normal[0] / horizontal];
  const up: Vec3 = [
    (-normal[1] * normal[0]) / horizontal,
    horizontal,
    (-normal[1] * normal[2]) / horizontal,
  ];
  const depth = distance * 0.52;
  const units = (2 * depth * Math.tan((camera.fov * Math.PI) / 360)) / 960;
  const inset = { x: source.x < 540 ? 815 : 265, y: 330, radius: compact ? 146 : 136 };
  const insetWorld = normal.map(
    (n, i) =>
      n * (distance - depth) +
      (right[i] ?? 0) * (inset.x - 540) * units +
      (up[i] ?? 0) * (480 - inset.y) * units,
  ) as [number, number, number];
  const q = Math.sqrt(2 * (1 + normal[2]));
  if (q < 0.001) return null;
  const facing: [number, number, number, number] = [-normal[1] / q, normal[0] / q, 0, q / 2];
  const targetDepth = distance - anchor.point.reduce((sum, v, i) => sum + v * (normal[i] ?? 0), 0);
  if (targetDepth <= 0) return null;
  // Keep the camera's projected scale, then double it; fitting the whole part can shrink it.
  const cloneScale = (DETAIL_MAGNIFICATION * depth) / targetDepth;
  const cloneOffset = anchor.point.map((v, i) => (anchor.partOrigin?.[i] ?? v) - v) as [
    number,
    number,
    number,
  ];
  const clippingPlanes = detailClippingPlanes(
    camera,
    insetWorld,
    right,
    up,
    (inset.radius - 3) * units,
  );
  // Move the backing along its viewing ray and resize it to keep the same projected circle.
  const backingRatio = (depth + anchor.radius * cloneScale + 0.05) / depth;
  const backingWorld = insetWorld.map(
    (v, i) => (camera.position[i] ?? 0) + (v - (camera.position[i] ?? 0)) * backingRatio,
  ) as [number, number, number];
  const sourceRadius = Math.max(
    22,
    Math.min(
      220,
      anchor.radius / ((2 * targetDepth * Math.tan((camera.fov * Math.PI) / 360)) / 960),
    ),
  );
  const endpoints = anchor.endpoints?.map((point) => projectAnchor(camera, point));
  const label = placeLabel(
    { x: source.x < 540 ? 815 : 265, y: 650 },
    compact ? 350 : 320,
    116,
    SAFE,
  );
  return {
    source,
    sourceRadius,
    inset,
    insetWorld,
    facing,
    normal,
    label,
    insetWorldRadius: inset.radius * units,
    cloneScale,
    cloneOffset,
    clippingPlanes,
    backingWorld,
    backingWorldRadius: inset.radius * units * backingRatio,
    endpoints: endpoints?.[0] && endpoints[1] ? ([endpoints[0], endpoints[1]] as const) : undefined,
  };
}
