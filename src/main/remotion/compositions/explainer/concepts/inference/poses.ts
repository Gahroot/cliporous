import type {
  EdgeCloudScene,
  ExpertSelectionScene,
  InferenceScene,
  TokenChoiceScene,
} from './types';

export type InferencePoint = [number, number, number];
export const TOKEN_PREFIX: InferencePoint = [-1.3, 1.05, 0];
export const TOKEN_SOCKET: InferencePoint = [1.65, 1.05, 0];
export const EXPERT_TASK: InferencePoint = [0, -0.85, 1.45];

/** Conservative authored ceilings, excluding the existing shared stage/shadow meshes. */
export const INFERENCE_BUDGETS = {
  'next-token': { carriers: 7, meshes: 28 },
  'uncertain-choice': { carriers: 7, meshes: 28 },
  'single-specialist': { carriers: 6, meshes: 100 },
  'specialist-team': { carriers: 8, meshes: 120 },
  'local-processing': { carriers: 4, meshes: 50 },
  'split-processing': { carriers: 8, meshes: 80 },
} as const;

function phase(t: number, start: number, end: number): number {
  const u = Math.max(0, Math.min(1, (t - start) / Math.max(0.001, end - start)));
  return u * u * (3 - 2 * u);
}
function mix(a: number, b: number, p: number): number {
  return p <= 0 ? a : p >= 1 ? b : a + (b - a) * p;
}
function carry(a: InferencePoint, b: InferencePoint, p: number): InferencePoint {
  return [mix(a[0], b[0], p), mix(a[1], b[1], p) + 0.22 * 4 * p * (1 - p), mix(a[2], b[2], p)];
}
function time(scene: InferenceScene, t: number): number {
  return Number.isNaN(t) ? scene.setupAt : t;
}

export function tokenChoicePose(scene: TokenChoiceScene, seconds: number) {
  const t = time(scene, seconds);
  const reveal = phase(t, scene.actionAt, scene.responseAt);
  const join = phase(t, scene.responseAt, scene.checkAt);
  const nextReveal = phase(t, scene.checkAt, scene.resolveAt);
  return {
    kind: scene.kind,
    join,
    uncertain: scene.preset === 'uncertain-choice',
    candidates: scene.candidates.map((candidate, index) => {
      const home: InferencePoint = [(index - (scene.candidates.length - 1) / 2) * 2.25, -0.1, 0.1];
      return {
        id: candidate.id,
        label: candidate.label,
        position: candidate.id === scene.selectedId ? carry(home, TOKEN_SOCKET, join) : home,
        reveal,
        selected: candidate.id === scene.selectedId && join > 0,
        // Nonselection is location/outline, not disappearance or a red failure verdict.
        retained: true,
      };
    }),
    next: scene.nextCandidates.map((candidate, index) => ({
      ...candidate,
      position: [
        (index - (scene.nextCandidates.length - 1) / 2) * 2.25,
        -1.15,
        0.3,
      ] as InferencePoint,
      reveal: nextReveal,
    })),
  };
}

export function expertSelectionPose(scene: ExpertSelectionScene, seconds: number) {
  const t = time(scene, seconds);
  const dispatch = phase(t, scene.actionAt, scene.responseAt);
  const work = phase(t, scene.responseAt, scene.checkAt);
  const returned = phase(t, scene.checkAt, scene.resolveAt);
  let selectedIndex = 0;
  return {
    kind: scene.kind,
    task: EXPERT_TASK,
    experts: scene.experts.map((expert, index) => {
      const position: InferencePoint = [
        (index - (scene.experts.length - 1) / 2) * 2.35,
        -0.3,
        -0.6,
      ];
      const output: InferencePoint = [position[0], -0.15, -0.12];
      const sent = expert.selected ? dispatch : 0;
      const working = expert.selected ? work : 0;
      const back = expert.selected ? returned : 0;
      const ordinal = expert.selected ? selectedIndex++ : 0;
      const destination: InferencePoint = [
        (ordinal - (scene.preset === 'specialist-team' ? 0.5 : 0)) * 0.6,
        -0.65,
        1.6,
      ];
      return {
        id: expert.id,
        position,
        lift: expert.selected ? dispatch * 0.32 : 0,
        active: expert.selected && dispatch > 0,
        stroke: expert.selected ? 4 * work * (1 - work) * 0.15 : 0,
        request: {
          position: carry(EXPERT_TASK, output, sent),
          visible: expert.selected && dispatch > 0 && work === 0,
        },
        contribution: {
          position: carry(output, destination, back),
          visible: expert.selected && work > 0,
          reveal: working,
          returned: back,
        },
      };
    }),
  };
}

export function edgeCloudPose(scene: EdgeCloudScene, seconds: number) {
  const t = time(scene, seconds);
  const local = phase(t, scene.actionAt, scene.responseAt);
  const produced = phase(t, scene.responseAt, scene.checkAt);
  const device: InferencePoint = [scene.remote ? -1.8 : 0, -0.15, 0];
  const cloud: InferencePoint = [2, 0.25, -0.4];
  const midpoint = scene.checkAt + (scene.resolveAt - scene.checkAt) * 0.5;
  const outbound = scene.remote ? phase(t, scene.checkAt, midpoint) : 0;
  const inbound = scene.remote ? phase(t, midpoint, scene.resolveAt) : 0;
  const socket: InferencePoint = [device[0], -0.8, 0.55];
  return {
    kind: scene.kind,
    device,
    cloud,
    local,
    produced,
    chipPress: 4 * local * (1 - local) * 0.1,
    localInput: {
      position: carry([device[0], 0.55, 0.4], [device[0], -0.1, 0.4], local),
      visible: produced < 1,
    },
    localResult: { position: socket, reveal: produced, visible: produced > 0 },
    outbound: {
      position: carry([device[0] + 0.5, 0.1, 0.35], cloud, outbound),
      visible: !!scene.remote && t >= scene.checkAt && inbound === 0,
      progress: outbound,
    },
    inbound: {
      position: carry(cloud, [device[0] + 0.5, -0.4, 1.0], inbound),
      visible: !!scene.remote && inbound > 0,
      progress: inbound,
    },
  };
}

/** Pure seekable poses: no elapsed integration, frame hooks, random data or world state. */
export function inferencePose(scene: InferenceScene, seconds: number) {
  switch (scene.kind) {
    case 'token-choice':
      return tokenChoicePose(scene, seconds);
    case 'expert-selection':
      return expertSelectionPose(scene, seconds);
    case 'edge-cloud':
      return edgeCloudPose(scene, seconds);
  }
}
