import { type CameraSpec, projectToStage } from '../three-helpers';
import { phaseProgress } from './motion';
import {
  RETRIEVAL_GROUNDING_GEOMETRY,
  type RetrievalEvidencePose,
  type RetrievalGroundingPose,
} from './retrieval-grounding';
import type { RetrievalGroundingScene } from './types';

type Point = [number, number, number];

/** World-space presentation only; the validated story/pose coordinates stay unchanged. */
export const RETRIEVAL_CLAY = {
  depth: 2.2,
  libraryX: -2.05,
  answerX: 2.05,
  rows: [1.62, -0.36],
  slipSize: [3.22, 1.85, 0.045] as Point,
  slipZ: 0.62,
  libraryLabel: [-2.05, 2.75, 2.2] as Point,
  answerLabel: [2.05, 2.75, 2.2] as Point,
};

/** Envelopes include shelf lips, clip handles, the loupe/stop seal, recoil and lifted transfers. */
export const RETRIEVAL_AUTHORED_BOUNDS: readonly { name: string; min: Point; max: Point }[] = [
  { name: 'library', min: [-3.85, -1.38, 1.32], max: [-0.05, 2.72, 3.35] },
  { name: 'answer lectern', min: [0.31, -1.4, 1.26], max: [3.79, 2.73, 3.35] },
  { name: 'question travel', min: [-3.151, -1.141, 2.95], max: [-0.829, -0.976, 4.07] },
  { name: 'excerpt travel', min: [-3.661, -1.31, 2.797], max: [3.661, 2.635, 3.373] },
];

export function retrievalSlipPosition(slip: RetrievalEvidencePose, workspaceOffset: number): Point {
  const lift = 4 * slip.progress * (1 - slip.progress);
  return [
    RETRIEVAL_CLAY.libraryX + (RETRIEVAL_CLAY.answerX - RETRIEVAL_CLAY.libraryX) * slip.progress,
    RETRIEVAL_CLAY.rows[slip.reference - 1] +
      0.08 * lift -
      (slip.inAnswer ? workspaceOffset / 125 : 0),
    RETRIEVAL_CLAY.depth + RETRIEVAL_CLAY.slipZ + 0.5 * lift,
  ];
}

/** Inscribed screen-aligned text rectangle, inset from all four projected paper edges. */
export function retrievalSlipTextRect(
  camera: CameraSpec,
  slip: RetrievalEvidencePose,
  offset: number,
): { left: number; top: number; width: number; height: number } {
  const [x, y, z] = retrievalSlipPosition(slip, offset);
  const [w, h] = RETRIEVAL_CLAY.slipSize;
  const corners = [-1, 1].flatMap((side) =>
    [-1, 1].map((row) => projectToStage(camera, [x + (side * w) / 2, y + (row * h) / 2, z + 0.04])),
  );
  const left = Math.max(corners[0].x, corners[1].x) + 16;
  const right = Math.min(corners[2].x, corners[3].x) - 12;
  const top = Math.max(corners[1].y, corners[3].y) + 8;
  const bottom = Math.min(corners[0].y, corners[2].y) - 8;
  return { left, top, width: right - left, height: bottom - top };
}

export function retrievalQuestionPosition(pose: RetrievalGroundingPose): Point {
  const G = RETRIEVAL_GROUNDING_GEOMETRY;
  const arrival = (pose.question.y - G.questionFrom.y) / (G.questionTo.y - G.questionFrom.y);
  return [
    RETRIEVAL_CLAY.libraryX + 0.12 * (1 - arrival),
    -1.06,
    RETRIEVAL_CLAY.depth + 1.06 + 0.5 * (1 - arrival),
  ];
}

const ESTABLISH: CameraSpec = { position: [0.25, 3.6, 15.65], fov: 36 };
const READ_REFERENCES: CameraSpec = { position: [-0.25, 3.8, 15.65], fov: 36 };

/** Never orbit during search/transfer or receiver recoil; leave a quiet lead-in to resolution. */
export function retrievalGroundingCamera(scene: RetrievalGroundingScene, time: number): CameraSpec {
  const room = scene.resolveAt - scene.checkAt >= 1.6 - 1e-7;
  const progress = room ? phaseProgress(time, scene.checkAt + 0.65, scene.checkAt + 1.2) : 0;
  return {
    fov: ESTABLISH.fov,
    position: ESTABLISH.position.map(
      (value, index) => value + (READ_REFERENCES.position[index] - value) * progress,
    ) as Point,
  };
}
