import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { projectToStage } from '../../three-helpers';
import type {
  InformationScene,
  InformationTransformScene,
  SemanticSortScene,
  SystemLayersScene,
} from './types';

export type InformationPoint = [number, number, number];
export const INFORMATION_YAW = Math.atan2(
  EXPLANATION_CAMERA.position[0],
  EXPLANATION_CAMERA.position[2],
);

/** Smooth finite interpolation: seeking never depends on the previous frame. */
export function informationProgress(t: number, from: number, to: number): number {
  const p = Math.max(0, Math.min(1, (t - from) / Math.max(0.001, to - from)));
  return p * p * (3 - 2 * p);
}

export function informationMix(
  a: InformationPoint,
  b: InformationPoint,
  p: number,
): InformationPoint {
  return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
}

/** Same static studio camera, with authored actors facing it rather than a new lighting rig. */
export function informationProject(point: InformationPoint): { x: number; y: number } {
  const [x, y, z] = point;
  return projectToStage(EXPLANATION_CAMERA, [
    x * Math.cos(INFORMATION_YAW) + z * Math.sin(INFORMATION_YAW),
    y,
    z * Math.cos(INFORMATION_YAW) - x * Math.sin(INFORMATION_YAW),
  ]);
}

export function informationLane(index: number, count: number): number {
  return (index - (count - 1) / 2) * (count === 2 ? 3.2 : 2.25);
}

export function semanticSortPose(scene: SemanticSortScene, t: number) {
  const paired = scene.items.filter((item) => item.targetId !== null);
  const targets = scene.targets.map((target, index) => ({
    id: target.id,
    position: [informationLane(index, scene.targets.length), -0.7, -0.95] as InformationPoint,
    selected: t >= scene.checkAt && paired.some((item) => item.targetId === target.id),
  }));
  const items = scene.items.map((item, index) => {
    const columns = Math.min(3, scene.items.length);
    const unpaired = scene.items.filter((other) => other.targetId === null);
    const unpairedIndex = unpaired.findIndex((other) => other.id === item.id);
    const unpairedColumns = Math.min(3, unpaired.length);
    const start: InformationPoint =
      item.targetId === null
        ? [
            ((unpairedIndex % unpairedColumns) - (unpairedColumns - 1) / 2) * 1.65,
            -0.46,
            2.05 + Math.floor(unpairedIndex / unpairedColumns) * 0.6,
          ]
        : [
            ((index % columns) - (columns - 1) / 2) * 2.15,
            -0.3,
            0.7 + Math.floor(index / columns) * 0.75,
          ];
    const targetIndex = scene.targets.findIndex((target) => target.id === item.targetId);
    const peers = scene.items.filter((other) => other.targetId === item.targetId);
    const slot = peers.findIndex((other) => other.id === item.id);
    const end: InformationPoint =
      targetIndex < 0
        ? start
        : [
            informationLane(targetIndex, scene.targets.length) +
              (slot - (peers.length - 1) / 2) * 0.55,
            scene.preset === 'closest-match' ? 0.4 : -0.18 + slot * 0.08,
            scene.preset === 'closest-match' ? 0.35 : -0.66 + slot * 0.18,
          ];
    const order = paired.findIndex((other) => other.id === item.id);
    const gap = (scene.responseAt - scene.actionAt) / Math.max(1, paired.length);
    const progress =
      targetIndex < 0
        ? 0
        : informationProgress(
            t,
            scene.actionAt + order * gap * 0.55,
            scene.responseAt - (paired.length - 1 - order) * gap * 0.25,
          );
    const position = informationMix(start, end, progress);
    position[1] += Math.sin(progress * Math.PI) * 0.62;
    return {
      id: item.id,
      position,
      progress,
      paired: targetIndex >= 0,
      tilt: -0.12 * Math.sin(progress * Math.PI),
    };
  });
  return { targets, items, reveal: informationProgress(t, scene.responseAt, scene.checkAt) };
}

/** Physical shelves/boards open vertically, hold their function, then seat on the same pins. */
export function systemLayersPose(scene: SystemLayersScene, t: number) {
  const open = informationProgress(t, scene.actionAt, scene.responseAt);
  const close = informationProgress(t, scene.checkAt, scene.resolveAt);
  const separation = open * (1 - close);
  const pitch = scene.preset === 'business-stack' ? 0.61 : 0.32;
  const spread = (scene.layers.length === 4 ? 0.9 : scene.layers.length === 3 ? 1.25 : 1.7) - pitch;
  return {
    separation,
    connections: informationProgress(t, scene.responseAt, scene.checkAt) * (1 - close),
    layers: scene.layers.map((layer, index) => ({
      id: layer.id,
      position: [0, -1.02 + index * (pitch + spread * separation), 0] as InformationPoint,
    })),
  };
}

/** A source never disappears; only its attributed detail becomes a row in the result. */
export function informationTransformPose(scene: InformationTransformScene, t: number) {
  const gap = (scene.responseAt - scene.actionAt) / scene.inputs.length;
  return {
    binding: informationProgress(t, scene.responseAt, scene.checkAt),
    inputs: scene.inputs.map((input, index) => {
      const y = ((scene.inputs.length - 1) / 2 - index) * 0.94;
      const source: InformationPoint = [-2.45, y, 0];
      const start: InformationPoint = [-2.07, y - 0.08, 0.15];
      const end: InformationPoint = [1.7, y - 0.08, 0.2];
      const progress = informationProgress(
        t,
        scene.actionAt + index * gap * 0.45,
        scene.responseAt - (scene.inputs.length - 1 - index) * gap * 0.2,
      );
      const position = informationMix(start, end, progress);
      position[1] += Math.sin(progress * Math.PI) * 0.24;
      return { id: input.id, source, position, progress, detailScale: 0.42 + 0.58 * progress };
    }),
  };
}

export function informationPose(scene: InformationScene, t: number) {
  switch (scene.kind) {
    case 'system-layers':
      return systemLayersPose(scene, t);
    case 'semantic-sort':
      return semanticSortPose(scene, t);
    case 'information-transform':
      return informationTransformPose(scene, t);
  }
}

/** Labels never travel through other labels; source/category reservations are disjoint. */
export function semanticSortLabels(scene: SemanticSortScene) {
  return {
    targets: scene.targets.map((target, index) => {
      const point = informationProject([informationLane(index, scene.targets.length), 0, -0.95]);
      const width = scene.targets.length === 3 ? 160 : 220;
      return { id: target.id, x: point.x - width / 2, y: 305, width, height: 64 };
    }),
    items: scene.items.map((item, index) => ({
      id: item.id,
      x: 80 + (index % 3) * 310,
      y: 694 + Math.floor(index / 3) * 62,
      width: 290,
      height: 56,
    })),
  };
}
