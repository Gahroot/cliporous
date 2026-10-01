import type { CameraSpec } from '../three-helpers';
import type { TechnologyPoint } from './motion';
import { SOFTWARE_RELEASE_WORKBENCH, type SoftwareReleasePose } from './software-release';

type Point = [number, number, number];

/** A held three-quarter view: even the shortest legal join needs an uninterrupted read. */
export const SOFTWARE_RELEASE_CAMERA: CameraSpec = { position: [2.1, 6.1, 13.8], fov: 36 };

/** Authored 3D presentation anchors, not new timing or pose contracts. */
export const SOFTWARE_RELEASE_VIEW = {
  inputX: -2.75,
  dockX: -0.65,
  releaseX: 2.65,
  laneZ: 0.5,
  joinX: 1.45,
  documentLabelY: 716,
  documentLabelWidth: 296,
  checkLabelWidth: 212,
  changeLabel: [-3.05, 1.35, 0.45] as Point,
  releaseLabel: [3.05, 1.35, 0.45] as Point,
} as const;

function mix(from: number, to: number, progress: number): number {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  return from + (to - from) * progress;
}

/** The exact same document follows the existing input → dock → release coordinates. */
export function softwareDocumentPosition(point: TechnologyPoint, recoil = 0): Point {
  const bench = SOFTWARE_RELEASE_WORKBENCH;
  const V = SOFTWARE_RELEASE_VIEW;
  const x =
    point.y <= bench.testDock.y
      ? mix(V.inputX, V.dockX, (point.y - bench.input.y) / (bench.testDock.y - bench.input.y))
      : mix(
          V.dockX,
          V.releaseX,
          (point.y - bench.testDock.y) / (bench.release.y - bench.testDock.y),
        );
  return [
    x,
    -0.5 + recoil / 180,
    mix(V.laneZ, V.laneZ - 1.8, (point.x - bench.release.x) / (bench.prior.x - bench.release.x)),
  ];
}

export function softwareGatePosition(parallel: boolean, index: number): Point {
  return [parallel ? (index === 0 ? -1.18 : 1.18) : 0, 0, -1.05];
}

export function softwareCheckLabelPosition(parallel: boolean, index: number): Point {
  const [x, , z] = softwareGatePosition(parallel, index);
  return [x, 1.48, z];
}

/** Each receipt has its own track and seat; neither duplicates the change document. */
export function softwareReceiptTrack(parallel: boolean, index: number): [Point, Point] {
  const [x] = softwareGatePosition(parallel, index);
  return [
    [x, -0.58, -0.58],
    [1.12, -0.58, parallel && index === 1 ? 1.25 : -0.25],
  ];
}

export function softwareReceiptPosition(
  check: SoftwareReleasePose['checks'][number],
  parallel: boolean,
  index: number,
): Point {
  const progress = Math.max(0, Math.min(1, (check.receipt.y - 605) / 35));
  const [from, to] = softwareReceiptTrack(parallel, index);
  return [mix(from[0], to[0], progress), -0.49, mix(from[2], to[2], progress)];
}
