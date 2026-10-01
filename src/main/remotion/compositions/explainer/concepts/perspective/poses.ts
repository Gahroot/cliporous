import type { CameraSpec } from '../../three-helpers';
import type {
  DigitalTwinScene,
  PerspectiveScene,
  PossibleFuturesScene,
  ScaleHierarchyScene,
} from './types';

export type Point = [number, number, number];

/** Bounded smoothstep, including before/after the authored window. No accumulated state. */
export function phase(t: number, from: number, to: number): number {
  const p = Math.max(0, Math.min(1, (t - from) / Math.max(0.001, to - from)));
  return p * p * (3 - 2 * p);
}

export function mix(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

export const TRACKED_CHIP: Point = [0, 0.12, 0.88];
export const TRACKED_CUSTOMER: Point = [-0.55, -0.48, 0.55];

export function scalePose(scene: ScaleHierarchyScene, t: number) {
  const server = phase(t, scene.actionAt, scene.responseAt);
  const rack = phase(t, scene.responseAt, scene.checkAt);
  const center = phase(t, scene.checkAt, scene.resolveAt);
  const chip = scene.preset === 'chip-to-center';
  const reveal = phase(t, scene.actionAt, scene.resolveAt);
  const camera: CameraSpec = {
    position: chip
      ? [mix(1.4, 5, reveal), mix(1.1, 3.9, reveal), mix(3.8, 11.8, reveal)]
      : [mix(2.5, 4.2, reveal), mix(2.22, 4.5, reveal), mix(6.52, 11.9, reveal)],
    // Four source-label columns can wrap to four lines. Keep the full assemblies
    // above that reserved rail without shrinking or truncating the named labels.
    fov: 58,
  };
  return {
    camera,
    trackedId: scene.trackedId,
    trackedPosition: chip ? TRACKED_CHIP : TRACKED_CUSTOMER,
    server,
    rack,
    center,
    segment: phase(t, scene.actionAt, scene.responseAt),
    market: phase(t, scene.responseAt, scene.resolveAt),
    level: t < scene.actionAt ? -1 : t < scene.responseAt ? 0 : t < scene.checkAt ? 1 : 2,
  };
}

/** Conservative world-space envelopes of the actually visible authored assemblies. */
export function scaleBounds(scene: ScaleHierarchyScene, t: number) {
  const p = scalePose(scene, t);
  const bounds: { min: Point; max: Point }[] = [
    scene.preset === 'chip-to-center'
      ? { min: [-0.51, -0.39, 0.77], max: [0.51, 0.63, 1.04] }
      : { min: [-1.02, -1.33, 0.08], max: [-0.07, 0.35, 1.04] },
  ];
  const scaled = (min: Point, max: Point, scale: number) => ({
    min: [min[0] * scale, min[1] * scale, min[2] * scale] as Point,
    max: [max[0] * scale, max[1] * scale, max[2] * scale] as Point,
  });
  if (scene.preset === 'chip-to-center') {
    if (p.server > 0) bounds.push(scaled([-0.94, -0.3, -0.35], [0.94, 0.26, 1.04], p.server));
    if (p.rack > 0) bounds.push(scaled([-1.2, -1.33, -0.46], [1.2, 1.37, 1.08], p.rack));
    if (p.center > 0) bounds.push(scaled([-3.1, -1.4, -2], [3.1, 1.45, 1.45], p.center));
  } else {
    if (p.segment > 0) bounds.push(scaled([-1.6, -1.4, -0.9], [1.6, 0.35, 1.15], p.segment));
    if (p.market > 0) bounds.push(scaled([-3.25, -1.42, -1.85], [3.25, 1.1, 1.55], p.market));
  }
  return bounds;
}

export const PERSPECTIVE_COMPARE_CAMERA: CameraSpec = { position: [3.4, 4.2, 12.8], fov: 46 };

/** Present stays on its own plinth. Alternatives are copies, not observed changes. */
export function futuresPose(scene: PossibleFuturesScene, t: number) {
  const diverge = phase(t, scene.actionAt, scene.responseAt);
  const compare = phase(t, scene.responseAt, scene.checkAt);
  const revealRange = phase(t, scene.checkAt, scene.resolveAt);
  const n = scene.alternatives.length;
  return {
    camera: PERSPECTIVE_COMPARE_CAMERA,
    present: { id: 'common-present', position: [0, -0.55, 1.1] as Point, scale: 0.62, gate: 0.5 },
    diverge,
    range: scene.preset === 'forecast-range' ? revealRange : 0,
    alternatives: scene.alternatives.map((a, index) => ({
      id: a.id,
      position: [
        mix(0, (index - (n - 1) / 2) * (n === 2 ? 3.6 : 2.65), diverge),
        mix(-0.55, 0.18, diverge),
        mix(1.1, -0.8, diverge),
      ] as Point,
      scale: 0.62 * diverge,
      gate: mix(0.5, a.change === 'reduced' ? 0.08 : a.change === 'expanded' ? 0.95 : 0.5, compare),
      // All paths have identical radius/opacity. No implicit likelihood or winner.
      pathWidth: 0.025,
    })),
  };
}

/** A mirror is a corresponding illustration; a simulation can never mutate physicalPose. */
export function twinPose(scene: DigitalTwinScene, t: number) {
  const copied = phase(t, scene.actionAt, scene.responseAt);
  const changed =
    scene.preset === 'simulated-change' ? phase(t, scene.checkAt, scene.resolveAt) : 0;
  const actual = scene.physicalState === 'open' ? 1 : 0;
  const simulated = scene.simulatedState === 'open' ? 1 : 0;
  return {
    camera: PERSPECTIVE_COMPARE_CAMERA,
    physical: {
      id: scene.physical.id,
      position: [-1.8, -0.3, 0] as Point,
      gate: actual,
      parcelX: -0.22,
    },
    model: {
      id: scene.model.id,
      position: [1.8, -0.3, 0] as Point,
      gate: mix(actual, simulated, changed),
      parcelX: -0.22,
    },
    copied,
    changed,
    connector: phase(t, scene.responseAt, scene.checkAt),
  };
}

export function perspectivePose(scene: PerspectiveScene, t: number) {
  switch (scene.kind) {
    case 'scale-hierarchy':
      return scalePose(scene, t);
    case 'possible-futures':
      return futuresPose(scene, t);
    case 'digital-twin':
      return twinPose(scene, t);
  }
}

/** Geometry, including connector paths, lies inside these authored comparison envelopes. */
export function perspectiveBounds(
  scene: PerspectiveScene,
  t: number,
): { min: Point; max: Point }[] {
  if (scene.kind === 'scale-hierarchy') return scaleBounds(scene, t);
  if (scene.kind === 'possible-futures')
    return [{ min: [-3.55, -1.3, -1.45], max: [3.55, 1.05, 1.75] }];
  return [{ min: [-3.2, -1.45, -0.9], max: [3.2, 1.0, 0.9] }];
}

export function boxCorners(box: { min: Point; max: Point }): Point[] {
  return [box.min[0], box.max[0]].flatMap((x) =>
    [box.min[1], box.max[1]].flatMap((y) => [box.min[2], box.max[2]].map((z): Point => [x, y, z])),
  );
}
