import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cameraRig, projectToStage } from '../three-helpers';
import {
  RETRIEVAL_CLAY as G,
  RETRIEVAL_AUTHORED_BOUNDS,
  retrievalGroundingCamera,
  retrievalQuestionPosition,
  retrievalSlipPosition,
} from './retrieval-camera';
import { retrievalGroundingPose } from './retrieval-grounding';
import type { RetrievalGroundingScene } from './types';

type Point = [number, number, number];
type Bounds = { min: Point; max: Point };
const fixtures: { name: string; scene: RetrievalGroundingScene; durationSec: number }[] =
  JSON.parse(
    readFileSync(
      resolve('scripts/explainer-stills/fixtures/technology-retrieval-grounding.json'),
      'utf8',
    ),
  );

function corners({ min, max }: Bounds): Point[] {
  return [min[0], max[0]].flatMap((x) =>
    [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z): Point => [x, y, z])),
  );
}

function expectInside(point: Point, bounds: Bounds): void {
  point.forEach((value, axis) => {
    expect(value).toBeGreaterThanOrEqual(bounds.min[axis] - 1e-9);
    expect(value).toBeLessThanOrEqual(bounds.max[axis] + 1e-9);
  });
}

describe.each(fixtures)('$name clay camera', ({ scene, durationSec }) => {
  it('projects every authored envelope inside the content rail throughout the timeline', () => {
    for (let frame = 0; frame <= Math.ceil(durationSec * 30); frame++) {
      const t = frame / 30;
      const camera = cameraRig(retrievalGroundingCamera(scene, t), t, {
        driftDeg: 0,
        pushAmount: 0,
        bobAmount: 0,
      });
      for (const bounds of RETRIEVAL_AUTHORED_BOUNDS) {
        for (const corner of corners(bounds)) {
          const point = projectToStage(camera, corner);
          expect(point.x, bounds.name).toBeGreaterThanOrEqual(64);
          expect(point.x, bounds.name).toBeLessThanOrEqual(1016);
          expect(point.y, bounds.name).toBeGreaterThanOrEqual(200);
          expect(point.y, bounds.name).toBeLessThanOrEqual(790);
        }
      }
      const pose = retrievalGroundingPose(scene, t);
      const question = retrievalQuestionPosition(pose);
      // Include the raised stripe and the full travel, not just the paper's centre.
      for (const local of corners({ min: [-1.1, -0.06, -0.3], max: [1.1, 0.083, 0.3] })) {
        expectInside(
          local.map((value, axis) => question[axis] + value * pose.question.opacity) as Point,
          RETRIEVAL_AUTHORED_BOUNDS[2],
        );
      }
      for (const slip of pose.slips) {
        const position = retrievalSlipPosition(slip, pose.workspaceOffset);
        // Include the protruding reference tab, sheet thickness and receiver recoil.
        for (const local of corners({
          min: [-1.61, -0.925, -0.0225],
          max: [1.61, 0.925, 0.0525],
        })) {
          expectInside(
            local.map((value, axis) => position[axis] + value) as Point,
            RETRIEVAL_AUTHORED_BOUNDS[3],
          );
        }
      }
      for (const anchor of [G.libraryLabel, G.answerLabel]) {
        const label = projectToStage(camera, anchor);
        expect(label.x - 190).toBeGreaterThanOrEqual(64);
        expect(label.x + 190).toBeLessThanOrEqual(1016);
        expect(label.y - 36).toBeGreaterThanOrEqual(200);
      }
      const questionLabel = projectToStage(camera, [question[0], -1.7, G.depth + 0.5]);
      expect(questionLabel.x - 198).toBeGreaterThanOrEqual(64);
      expect(questionLabel.x + 198).toBeLessThanOrEqual(1016);
      expect(questionLabel.y + 2 * 26 * 1.16).toBeLessThanOrEqual(790);
    }
  });

  it('is deterministic on reverse seeks and exactly static after resolution', () => {
    const times = Array.from({ length: Math.ceil(durationSec * 30) + 1 }, (_, frame) => frame / 30);
    const samples = times.map((t) => retrievalGroundingCamera(scene, t));
    for (let index = times.length - 1; index >= 0; index--) {
      expect(retrievalGroundingCamera(scene, times[index])).toEqual(samples[index]);
      expect(samples[index].position.every(Number.isFinite)).toBe(true);
    }
    const final = retrievalGroundingCamera(scene, scene.resolveAt);
    const pose = retrievalGroundingPose(scene, scene.resolveAt);
    for (const time of [scene.resolveAt + 0.01, scene.resolveAt + 0.8, durationSec, 999]) {
      expect(retrievalGroundingCamera(scene, time)).toEqual(final);
      expect(cameraRig(final, time, { driftDeg: 0, pushAmount: 0, bobAmount: 0 })).toEqual(
        cameraRig(final, scene.resolveAt, { driftDeg: 0, pushAmount: 0, bobAmount: 0 }),
      );
      expect(retrievalQuestionPosition(retrievalGroundingPose(scene, time))).toEqual(
        retrievalQuestionPosition(pose),
      );
      expect(
        retrievalGroundingPose(scene, time).slips.map((slip) => retrievalSlipPosition(slip, 0)),
      ).toEqual(pose.slips.map((slip) => retrievalSlipPosition(slip, 0)));
    }
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(retrievalGroundingCamera(scene, time).position.every(Number.isFinite)).toBe(true);
    }
    if (scene.preset === 'no-evidence') expect(pose.slips).toEqual([]);
  });

  it('moves only after all transfers and recoil settle, and skips compressed holds', () => {
    const roomy = { ...scene, resolveAt: scene.checkAt + 1.6 };
    const initial = retrievalGroundingCamera(roomy, scene.setupAt);
    for (const time of [scene.actionAt, scene.responseAt, scene.checkAt, scene.checkAt + 0.65]) {
      expect(retrievalGroundingCamera(roomy, time)).toEqual(initial);
    }
    const movingAt = scene.checkAt + 0.9;
    expect(retrievalGroundingCamera(roomy, movingAt)).not.toEqual(initial);
    const pose = retrievalGroundingPose(roomy, movingAt);
    expect(pose.workspaceOffset).toBe(0);
    expect(pose.slips.every((slip) => slip.inAnswer)).toBe(true);
    expect(retrievalGroundingCamera(roomy, scene.checkAt + 1.2)).toEqual(
      retrievalGroundingCamera(roomy, roomy.resolveAt),
    );
    const short = { ...scene, resolveAt: scene.checkAt + 1 };
    expect(retrievalGroundingCamera(short, short.resolveAt)).toEqual(initial);
    const shifted = {
      ...roomy,
      setupAt: roomy.setupAt + 17,
      actionAt: roomy.actionAt + 17,
      responseAt: roomy.responseAt + 17,
      checkAt: roomy.checkAt + 17,
      resolveAt: roomy.resolveAt + 17,
    };
    retrievalGroundingCamera(shifted, movingAt + 17).position.forEach((value, axis) => {
      expect(value).toBeCloseTo(retrievalGroundingCamera(roomy, movingAt).position[axis], 10);
    });
  });
});
