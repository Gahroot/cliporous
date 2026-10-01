import type { CognitionScene } from './types';

export type CognitionPoint = [number, number, number];
export interface PaperPose {
  position: CognitionPoint;
  tilt: number;
  visible: boolean;
}

export interface TeamPose {
  kind: 'agent-team';
  preset: 'parallel-specialists' | 'contractor-crew';
  desks: CognitionPoint[];
  papers: PaperPose[];
  fan: number;
  work: number;
  join: number;
  toolAngle: number;
}
export interface PlanPose {
  kind: 'agent-plan';
  preset: 'replan' | 'fixed-vs-adaptive';
  adaptiveX: number;
  fixedX: number | null;
  adaptive: CognitionPoint;
  fixed: CognitionPoint | null;
  information: number;
  revision: number;
  travel: number;
}
export interface BudgetPose {
  kind: 'agent-budget';
  preset: 'stop' | 'request-more';
  workPaper: CognitionPoint;
  remaining: number;
  spent: number;
  press: number;
  gate: number;
  request: number;
  requestPaper: CognitionPoint;
}
export interface TrainingPose {
  kind: 'model-training';
  preset: 'train-then-use' | 'examples-correction';
  example: PaperPose;
  correction: PaperPose;
  input: PaperPose;
  output: PaperPose;
  modelChange: number;
  correctionChange: number;
  trainingClosed: boolean;
  inference: number;
}
export interface EvaluationPose {
  kind: 'model-evaluation';
  preset: 'same-tests' | 'tradeoffs';
  benches: { x: number; papers: PaperPose[] }[];
  tests: number[];
  separation: number;
}
export interface ConflictPose {
  kind: 'evidence-conflict';
  preset: 'unresolved' | 'human-review';
  papers: PaperPose[];
  divider: number;
  referral: number;
}
export type CognitionPose =
  | TeamPose
  | PlanPose
  | BudgetPose
  | TrainingPose
  | EvaluationPose
  | ConflictPose;

/** Smooth, clamped intervals give exact setup and final holds, including out-of-order seeks. */
function phase(t: number, start: number, end: number): number {
  if (t <= start) return 0;
  if (t >= end) return 1;
  const u = (t - start) / Math.max(0.001, end - start);
  return u * u * (3 - 2 * u);
}
function mix(a: number, b: number, p: number): number {
  if (p <= 0) return a;
  if (p >= 1) return b;
  return a + (b - a) * p;
}
function point(a: CognitionPoint, b: CognitionPoint, p: number): CognitionPoint {
  return [mix(a[0], b[0], p), mix(a[1], b[1], p), mix(a[2], b[2], p)];
}
function carry(a: CognitionPoint, b: CognitionPoint, p: number): CognitionPoint {
  const result = point(a, b, p);
  result[1] += 0.38 * 4 * p * (1 - p);
  return result;
}
function pulse(p: number): number {
  return 4 * p * (1 - p);
}
function path(points: CognitionPoint[], progress: number): CognitionPoint {
  const segment = Math.min(points.length - 2, Math.floor(progress * (points.length - 1)));
  const u = progress * (points.length - 1) - segment;
  return point(points[segment], points[segment + 1], u);
}
const flat = -Math.PI / 2;

/** Authored detour clears the new-information memo; neither plan crosses that obstacle. */
export function revisedPlanPath(x: number): CognitionPoint[] {
  return [
    [x, -0.26, -0.62],
    [x + 0.77, -0.26, -0.62],
    [x + 0.77, -0.26, 0.7],
    [x, -0.26, 0.7],
    [x, -0.26, 1.12],
  ];
}

/** No wall clock, springs, randomness, or mutable history: poses depend only on these arguments. */
export function cognitionPose(scene: CognitionScene, time: number): CognitionPose {
  const { actionAt: a, responseAt: r, checkAt: c, resolveAt: end } = scene;
  const t = Number.isNaN(time) ? scene.setupAt : time;
  switch (scene.kind) {
    case 'agent-team': {
      const desks: CognitionPoint[] =
        scene.roles.length >= 3
          ? [
              [-2.3, 0, 0.1],
              [0, 0, 1.25],
              [2.3, 0, 0.1],
            ]
          : [
              [-2.15, 0, 0.35],
              [2.15, 0, 0.35],
            ];
      const fan = phase(t, a, r);
      const work = phase(t, r, c);
      const join = phase(t, c, end);
      const papers = desks.map(([x, , z], index): PaperPose => {
        const start: CognitionPoint = [
          (index - (desks.length - 1) / 2) * 0.12,
          -0.415 + index * 0.04,
          -1.25,
        ];
        const desk: CognitionPoint = [x, -0.415, z + 0.14];
        const joined: CognitionPoint = [
          (index - (desks.length - 1) / 2) * 0.24,
          -0.415 + index * 0.04,
          -1.25,
        ];
        return {
          position: join > 0 ? carry(desk, joined, join) : carry(start, desk, fan),
          tilt: flat,
          visible: true,
        };
      });
      return {
        kind: scene.kind,
        preset: scene.preset,
        desks,
        papers,
        fan,
        work,
        join,
        toolAngle: work > 0 && work < 1 ? -0.35 * pulse(work) : 0,
      };
    }
    case 'agent-plan': {
      const adaptiveX = scene.preset === 'fixed-vs-adaptive' ? 1.35 : 0;
      const fixedX = scene.preset === 'fixed-vs-adaptive' ? -1.55 : null;
      const approach = phase(t, a, r);
      const revision = phase(t, r, c);
      const travel = phase(t, c, end);
      return {
        kind: scene.kind,
        preset: scene.preset,
        adaptiveX,
        fixedX,
        adaptive:
          travel > 0
            ? path(revisedPlanPath(adaptiveX), travel)
            : point([adaptiveX, -0.26, -1.12], [adaptiveX, -0.26, -0.62], approach),
        fixed:
          fixedX === null ? null : point([fixedX, -0.26, -1.12], [fixedX, -0.26, -0.62], approach),
        // The incoming memo is fully present at contact, before a route is revised.
        information: phase(t, a, r),
        revision,
        travel,
      };
    }
    case 'agent-budget': {
      // A continuous allowance, never an invented amount or exact action count.
      const spent = phase(t, a, c);
      const request = scene.preset === 'request-more' ? phase(t, c, end) : 0;
      return {
        kind: scene.kind,
        preset: scene.preset,
        workPaper: point([-0.6, -0.405, 0.35], [1.25, -0.405, 0.35], spent),
        remaining: 1 - spent,
        spent,
        press: pulse(spent),
        gate: phase(t, c, c + (end - c) * 0.35),
        request,
        requestPaper: carry([0, -0.2, -0.55], [0, 0.65, -1.4], request),
      };
    }
    case 'model-training': {
      const exampleIn = phase(t, a, r);
      const correctionPreset = scene.preset === 'examples-correction';
      const correctionStart = r + (c - r) * 0.3;
      const correctionContact = r + (c - r) * 0.65;
      const correctionIn = correctionPreset ? phase(t, correctionStart, correctionContact) : 0;
      const correctionChange = correctionPreset ? phase(t, correctionContact, c) : 0;
      const modelChange = correctionPreset
        ? 0.45 * phase(t, r, correctionStart) + 0.55 * correctionChange
        : phase(t, r, c);
      const inputContact = c + (end - c) * 0.5;
      const inference = phase(t, c, end);
      return {
        kind: scene.kind,
        preset: scene.preset,
        example: {
          position: point([-2.2, 0.36, 0.15], [-0.5, 0.36, 0.15], exampleIn),
          tilt: 0,
          visible: t < r,
        },
        correction: {
          position: point([-2.2, 0.36, -0.2], [-0.5, 0.36, 0.15], correctionIn),
          tilt: 0,
          visible: correctionPreset && t < correctionContact,
        },
        input: {
          position: point([-2.2, -0.47, 0.4], [-0.45, -0.47, 0.4], phase(t, c, inputContact)),
          tilt: 0,
          visible: t < inputContact,
        },
        output: {
          position: point([0.55, -0.47, 0.4], [2.2, -0.47, 0.4], phase(t, inputContact, end)),
          tilt: 0,
          visible: t >= inputContact,
        },
        modelChange,
        correctionChange,
        trainingClosed: t >= c,
        inference,
      };
    }
    case 'model-evaluation': {
      const tests = [phase(t, a, r), phase(t, r, c)];
      const separation = scene.preset === 'tradeoffs' ? phase(t, c, end) : 0;
      return {
        kind: scene.kind,
        preset: scene.preset,
        tests,
        separation,
        benches: [-1.65, 1.65].map((x) => ({
          x,
          papers: tests.map((p, i): PaperPose => {
            const origin: CognitionPoint = [(i - 0.5) * 0.48, 0.42, -1.2];
            const port: CognitionPoint = [x, -0.12, 0.04];
            const tray: CognitionPoint = [
              x + (i - 0.5) * (0.12 + separation * 0.8),
              -1.1 + i * 0.045,
              1.2,
            ];
            return {
              position: p < 0.5 ? carry(origin, port, p * 2) : carry(port, tray, (p - 0.5) * 2),
              tilt: mix(-0.1, flat, p),
              visible: true,
            };
          }),
        })),
      };
    }
    case 'evidence-conflict': {
      const approach = phase(t, a, r);
      const divider = phase(t, r, c);
      const referral = scene.preset === 'human-review' ? phase(t, c, end) : 0;
      return {
        kind: scene.kind,
        preset: scene.preset,
        divider,
        referral,
        papers: [-1, 1].map(
          (side): PaperPose => ({
            position: [
              side * mix(2.15, 1.12, approach),
              mix(0.04, 0.01, referral),
              mix(0.85, -0.6, referral),
            ],
            tilt: -0.14 - referral * 0.25,
            visible: true,
          }),
        ),
      };
    }
  }
}
