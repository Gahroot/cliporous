import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { projectToStage } from '../../three-helpers';
import type { CollectivePatternScene, ModularMachineScene, RobotPerceptionScene } from './types';

export type AdaptivePoint = [number, number, number];
export const ADAPTIVE_GROUND = -1.25;
/** Existing fixed studio camera; HTML identity labels follow the same seekable pose. */
export function adaptiveLabelAnchor(position: AdaptivePoint): { x: number; y: number } {
  const projected = projectToStage(EXPLANATION_CAMERA, [
    position[0],
    position[1] + 1.32,
    position[2],
  ]);
  return { x: projected.x - 72, y: projected.y - 50 };
}
/** Conservative authored mesh bounds, including tools, flags and physical boundary posts. */
export const ADAPTIVE_ENVELOPE = { x: [-3.2, 3.2], y: [-1.4, 1.1], z: [-1.8, 1.8] } as const;
/** Maximum meshes including links/observation brackets; fixed caps, not measured GPU costs. */
export const ADAPTIVE_MESH_BUDGETS = {
  'network-clusters': 110,
  'adoption-wave': 150,
  'coordinated-swarm': 140,
  'recognized-target': 65,
  'uncertain-target': 70,
  reconfigure: 95,
  'incompatible-module': 95,
} as const;

export function adaptiveProgress(t: number, start: number, end: number): number {
  const x = Math.max(0, Math.min(1, (t - start) / Math.max(0.001, end - start)));
  return x * x * (3 - 2 * x);
}
export function adaptiveMix(a: AdaptivePoint, b: AdaptivePoint, p: number): AdaptivePoint {
  if (p <= 0) return [...a];
  if (p >= 1) return [...b];
  return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
}
function grid(index: number, count: number): AdaptivePoint {
  const cols = count <= 4 ? 2 : 3;
  return [
    ((index % cols) - (cols - 1) / 2) * 2.1,
    ADAPTIVE_GROUND,
    Math.floor(index / cols) * 1.7 - 0.8,
  ];
}

function clusters(scene: CollectivePatternScene): string[][] {
  const groups = scene.actors.map((actor) => [actor.id]);
  for (const edge of scene.relationships) {
    const a = groups.find((group) => group.includes(edge.fromId));
    const b = groups.find((group) => group.includes(edge.toId));
    if (a && b && a !== b) {
      a.push(...b);
      groups.splice(groups.indexOf(b), 1);
    }
  }
  return groups;
}

export function collectivePatternPose(scene: CollectivePatternScene, t: number) {
  const groups = clusters(scene);
  const actors = scene.actors.map((actor, index) => {
    const initial = grid(index, scene.actors.length);
    const incoming = scene.relationships.find((edge) => edge.toId === actor.id);
    const first = scene.relationships.find(
      (edge) => edge.fromId === actor.id || edge.toId === actor.id,
    );
    const interactionAt = incoming?.at ?? first?.at ?? scene.actionAt;
    const arrival = adaptiveProgress(
      t,
      interactionAt,
      Math.min(interactionAt + 0.85, scene.resolveAt),
    );
    let destination = initial;
    if (scene.preset === 'network-clusters') {
      const groupIndex = groups.findIndex((group) => group.includes(actor.id));
      const slot = groups[groupIndex]?.indexOf(actor.id) ?? 0;
      // Two connected groups can split 2+4 as well as 3+3; each actor needs its own slot.
      const offsets = [
        [-0.45, 0.9],
        [0.45, -0.8],
        [-0.5, -0.8],
        [0.5, 0.9],
      ] as const;
      const offset = offsets[slot] ?? offsets[0];
      destination = [(groupIndex === 0 ? -1.55 : 1.55) + offset[0], ADAPTIVE_GROUND, offset[1]];
    } else if (scene.preset === 'coordinated-swarm') {
      // A bounded convoy: following rows reveal local coordination, not free-running motion.
      destination = [
        -1.9 + Math.floor(index / 2) * 1.85,
        ADAPTIVE_GROUND,
        index % 2 === 0 ? -0.65 : 0.9,
      ];
    }
    return {
      id: actor.id,
      position: adaptiveMix(initial, destination, arrival),
      adopted:
        scene.preset === 'adoption-wave'
          ? adaptiveProgress(t, interactionAt + (incoming ? 0.35 : 0), interactionAt + 0.85)
          : 0,
      linked: arrival,
      yaw: scene.preset === 'coordinated-swarm' ? (-Math.PI / 2) * arrival : 0,
    };
  });
  const links = scene.relationships.map((edge) => {
    const from = actors.find((actor) => actor.id === edge.fromId);
    const to = actors.find((actor) => actor.id === edge.toId);
    const contactDuration = scene.preset === 'adoption-wave' ? 0.35 : 0.8;
    const p = adaptiveProgress(t, edge.at, Math.min(edge.at + contactDuration, scene.resolveAt));
    const start: AdaptivePoint = [
      from?.position[0] ?? 0,
      ADAPTIVE_GROUND + 0.08,
      from?.position[2] ?? 0,
    ];
    const end: AdaptivePoint = [to?.position[0] ?? 0, ADAPTIVE_GROUND + 0.08, to?.position[2] ?? 0];
    return {
      fromId: edge.fromId,
      toId: edge.toId,
      start,
      end: adaptiveMix(start, end, p),
      progress: p,
      signal: adaptiveMix(start, end, p),
    };
  });
  return { actors, links };
}

export function robotPerceptionPose(scene: RobotPerceptionScene, t: number) {
  const observe = adaptiveProgress(t, scene.actionAt, scene.responseAt);
  const recognize = adaptiveProgress(t, scene.responseAt, scene.checkAt);
  const move =
    scene.preset === 'recognized-target' ? adaptiveProgress(t, scene.checkAt, scene.resolveAt) : 0;
  return {
    robot: [-2.15 + move * 0.9, ADAPTIVE_GROUND, 0.1] as AdaptivePoint,
    target: [1.15, ADAPTIVE_GROUND, -0.6] as AdaptivePoint,
    distractor: [2, ADAPTIVE_GROUND, 0.85] as AdaptivePoint,
    boundaryX: -0.45,
    observe,
    // Both brackets persist in uncertainty; no success mark or hidden action follows.
    targetBracket: observe,
    distractorBracket: observe * (scene.preset === 'recognized-target' ? 1 - recognize : 1),
    recognized: scene.preset === 'recognized-target' ? recognize : 0,
    deferred: scene.preset === 'uncertain-target' ? recognize : 0,
    headYaw: Math.PI / 2 + (scene.preset === 'uncertain-target' ? 0.2 : -0.12) * recognize,
    wheelTurn: move * 2.8,
    move,
  };
}

export function modularMachinePose(scene: ModularMachineScene, t: number) {
  const remove = adaptiveProgress(t, scene.actionAt, scene.responseAt);
  const approach = adaptiveProgress(t, scene.responseAt, scene.checkAt);
  const finish = adaptiveProgress(t, scene.checkAt, scene.resolveAt);
  const compatible = scene.preset === 'reconfigure';
  const seated: AdaptivePoint = [0, -0.02, 0.2];
  const storage: AdaptivePoint = [-2.1, -0.18, 0.2];
  const candidateStart: AdaptivePoint = [2.1, -0.18, 0.2];
  const rejected: AdaptivePoint = [1.25, -0.02, 0.2];
  return {
    current: adaptiveMix(seated, storage, compatible ? remove : remove * (1 - finish)),
    candidate: compatible
      ? adaptiveMix(candidateStart, seated, approach)
      : adaptiveMix(candidateStart, rejected, approach * (1 - finish)),
    seated: compatible && approach === 1,
    rejected: !compatible && t >= scene.responseAt,
    // One finite work stroke; everything settles before the final hold.
    work: compatible ? Math.sin(Math.PI * finish) : 0,
    toolTurn: compatible ? finish * Math.PI * 2 : 0,
    active: compatible && t >= scene.checkAt,
    socketOpen: remove * (compatible ? 1 - approach : 1 - finish),
  };
}
