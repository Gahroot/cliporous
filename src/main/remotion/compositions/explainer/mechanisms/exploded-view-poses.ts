import {
  EXPLODED_RETURN_SECONDS,
  EXPLODED_TARGETS,
  type ExplodedTarget,
  type ExplodedTemplate,
  type ExplodedViewScene,
} from './composed-types';
import { smoothPhase } from './kinematics';
import type { Vec3 } from './paths';

export type DetailShape = 'gear' | 'shaft' | 'panel' | 'paper' | 'chip' | 'fins';
export interface ExplodedPartPose {
  id: ExplodedTarget;
  position: Vec3;
  /** Exact authored bounding size, shared by mesh and grounded measurement anchors. */
  size: Vec3;
  detailShape: DetailShape;
}
export interface ExplodedViewPose {
  template: ExplodedTemplate;
  separation: number;
  explaining: number;
  parts: readonly ExplodedPartPose[];
}
export interface ExplodedDetailAnchor {
  id: ExplodedTarget;
  point: Vec3;
  /** World origin of the selected origin-centred authored mesh, distinct from its surface point. */
  partOrigin: Vec3;
  endpoints: readonly [Vec3, Vec3];
  radius: number;
  normal: Vec3;
  detailShape: DetailShape;
}

/** Three pedagogical assemblies, not claimed anatomy of a branded product. */
export const EXPLODED_PARTS: Readonly<Record<ExplodedTemplate, readonly ExplodedPartPose[]>> = {
  mechanism: [
    { id: 'housing', position: [0, -0.6, 0], size: [1.8, 0.24, 1.1], detailShape: 'panel' },
    { id: 'shaft', position: [0, -0.08, 0], size: [0.22, 0.8, 0.22], detailShape: 'shaft' },
    { id: 'gear', position: [0, 0.24, 0], size: [1.3, 0.18, 1.3], detailShape: 'gear' },
  ],
  parcel: [
    { id: 'base', position: [0, -0.4, 0], size: [1.8, 0.6, 1.2], detailShape: 'panel' },
    { id: 'contents', position: [0, -0.54, 0], size: [1.3, 0.2, 0.85], detailShape: 'paper' },
    { id: 'lid', position: [0, -0.04, 0], size: [1.84, 0.12, 1.24], detailShape: 'panel' },
  ],
  computing: [
    { id: 'board', position: [0, -0.5, 0], size: [1.8, 0.12, 1.2], detailShape: 'panel' },
    { id: 'chip', position: [0, -0.32, 0], size: [0.9, 0.24, 0.8], detailShape: 'chip' },
    { id: 'heatsink', position: [0, 0, 0], size: [1.15, 0.4, 0.95], detailShape: 'fins' },
  ],
};
const OFFSETS = [-0.18, 0.52, 1.45] as const;

export function sampleExplodedViewPose(scene: ExplodedViewScene, t: number): ExplodedViewPose {
  const separation =
    smoothPhase(t, scene.separateAt, scene.explainAt) *
    (1 - smoothPhase(t, scene.returnAt, scene.returnAt + EXPLODED_RETURN_SECONDS));
  return {
    template: scene.template,
    separation,
    explaining:
      smoothPhase(t, scene.explainAt, scene.explainAt + 0.2) *
      (1 - smoothPhase(t, scene.returnAt, scene.returnAt + 0.2)),
    parts: EXPLODED_PARTS[scene.template].map((part, i) => ({
      ...part,
      position: [part.position[0], part.position[1] + OFFSETS[i] * separation, part.position[2]],
    })),
  };
}

/** Authored surface contacts, not generic bounding-box corners; sampled in the part's pose. */
export function getExplodedDetailAnchor(
  pose: ExplodedViewPose,
  target: ExplodedTarget,
): ExplodedDetailAnchor | null {
  if (!(EXPLODED_TARGETS[pose.template] as readonly string[]).includes(target)) return null;
  const part = pose.parts.find((entry) => entry.id === target);
  if (!part) return null;
  const [x, y, z] = part.position;
  const [w, h, d] = part.size;
  const vertical = target === 'shaft';
  // The gear's box corner is empty space; use its solid top annulus and opposing tooth tips.
  // Chip pins extend beyond the body but only at their authored lower height and centre line.
  const gear = target === 'gear';
  const chip = target === 'chip';
  const point: Vec3 = gear ? [x + 0.18, y + h / 2, z] : [x, y, z + d * (chip ? 0.39 : 0.5)];
  const measureY = chip ? y - h * 0.3 : y;
  const measureZ = gear || chip ? z : z + d / 2;
  return {
    id: target,
    point,
    partOrigin: part.position,
    radius: Math.hypot(w, h, d) / 2,
    endpoints: vertical
      ? [
          [x, y - h / 2, z + d / 2],
          [x, y + h / 2, z + d / 2],
        ]
      : [
          [x - w / 2, measureY, measureZ],
          [x + w / 2, measureY, measureZ],
        ],
    normal: gear ? [0, 1, 0] : [0, 0, 1],
    detailShape: part.detailShape,
  };
}
