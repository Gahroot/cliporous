import { describe, expect, it } from 'vitest';
import { cameraRig, projectToStage } from '../three-helpers';
import {
  SOFTWARE_RELEASE_CAMERA as camera,
  softwareCheckLabelPosition,
  softwareDocumentPosition,
  softwareGatePosition,
  softwareReceiptPosition,
  softwareReceiptTrack,
  SOFTWARE_RELEASE_VIEW as V,
} from './software-camera';
import { SOFTWARE_RELEASE_WORKBENCH as bench, softwareReleasePose } from './software-release';
import type { SoftwareReleaseScene } from './types';

type Point = [number, number, number];
const base: SoftwareReleaseScene = {
  kind: 'software-release',
  preset: 'fix-pass',
  label: 'The patch fixes the bug',
  subject: 'patch',
  outcome: 'patch is released',
  checkLabels: ['tests'],
  setupAt: 0.3,
  actionAt: 0.9,
  responseAt: 1.9,
  checkAt: 2.9,
  resolveAt: 3.9,
};
const scenes: SoftwareReleaseScene[] = [
  base,
  { ...base, preset: 'regression-rollback', previousVersion: 'v1', outcome: 'restores v1' },
  { ...base, preset: 'parallel-release', checkLabels: ['Unit tests', 'security checks'] },
];

function inStage(point: Point): void {
  const p = projectToStage(camera, point);
  expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  expect(p.x).toBeGreaterThanOrEqual(64);
  expect(p.x).toBeLessThanOrEqual(1016);
  expect(p.y).toBeGreaterThanOrEqual(200);
  expect(p.y).toBeLessThanOrEqual(790);
}

function box(center: Point, size: Point): void {
  for (const x of [-0.5, 0.5])
    for (const y of [-0.5, 0.5])
      for (const z of [-0.5, 0.5])
        inStage([center[0] + x * size[0], center[1] + y * size[1], center[2] + z * size[2]]);
}

describe('software clay workbench projection', () => {
  it('contains the complete bench, feet, checks, receiving tray and raised common latch', () => {
    box([0, -1.02, 0], [7.4, 0.28, 3.5]);
    for (const x of [-3.14, 3.14])
      for (const z of [-1.35, 1.35]) box([x, -1.25, z], [0.36, 0.3, 0.36]);
    for (const parallel of [false, true]) {
      for (let index = 0; index < (parallel ? 2 : 1); index++) {
        const gate = softwareGatePosition(parallel, index);
        box([gate[0], -0.2, gate[2]], [1.8, 1.2, 1.1]);
      }
    }
    box([V.releaseX, -0.6, -0.2], [1.5, 0.4, 2.75]);
    box([V.joinX, -0.03, V.laneZ], [0.5, 1.9, 2.1]);
  });

  it('reserves separate source-label columns above the machinery and an identity rail below it', () => {
    const labels = [
      { p: V.changeLabel, width: 180, height: 40 },
      { p: softwareCheckLabelPosition(true, 0), width: V.checkLabelWidth, height: 124 },
      { p: softwareCheckLabelPosition(true, 1), width: V.checkLabelWidth, height: 124 },
      { p: V.releaseLabel, width: 158, height: 105 },
    ].map(({ p, width, height }) => ({ ...projectToStage(camera, p), width, height }));
    for (const label of labels) {
      expect(label.x - label.width / 2).toBeGreaterThanOrEqual(64);
      expect(label.x + label.width / 2).toBeLessThanOrEqual(1016);
      expect(label.y).toBeGreaterThan(280); // After a two-line title and condition.
      expect(label.y + label.height).toBeLessThan(V.documentLabelY);
    }
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i].x - labels[i].width / 2).toBeGreaterThan(
        labels[i - 1].x + labels[i - 1].width / 2,
      );
    }
    expect(V.documentLabelY + 2 * 26 * 1.16).toBeLessThan(790);
    for (const x of [-3.7, 3.7]) {
      const edge = projectToStage(camera, [x, -1.16, 1.75]);
      expect(edge.y).toBeLessThan(V.documentLabelY - 10);
    }
  });

  it.each(
    scenes,
  )('$preset keeps documents, receipts and source identities in bounds on every seek', (scene) => {
    const parallel = scene.preset === 'parallel-release';
    const times = Array.from({ length: 211 }, (_, frame) => frame / 30);
    for (const t of [...times].reverse()) {
      const pose = softwareReleasePose(scene, t);
      for (const point of [pose.change, pose.previousVersion]) {
        const world = softwareDocumentPosition(point, pose.dockRecoil);
        box(world, [1.2, 0.3, 0.85]);
        const label = projectToStage(camera, world);
        expect(label.x - V.documentLabelWidth / 2).toBeGreaterThanOrEqual(64);
        expect(label.x + V.documentLabelWidth / 2).toBeLessThanOrEqual(1016);
      }
      pose.checks.forEach((check, index) => {
        const receipt = softwareReceiptPosition(check, parallel, index);
        box(receipt, [0.45, 0.15, 0.45]);
        if (check.receiptArrived) {
          const seat = softwareReceiptTrack(parallel, index)[1];
          expect(receipt[0]).toBe(seat[0]);
          expect(receipt[2]).toBe(seat[2]);
        }
      });
      expect(cameraRig(camera, t, { driftDeg: 0, pushAmount: 0, bobAmount: 0 })).toEqual(
        cameraRig(camera, 0, { driftDeg: 0, pushAmount: 0, bobAmount: 0 }),
      );
      if (t >= scene.resolveAt) {
        const final = softwareReleasePose(scene, scene.resolveAt);
        expect(softwareDocumentPosition(pose.change, pose.dockRecoil)).toEqual(
          softwareDocumentPosition(final.change, final.dockRecoil),
        );
        expect(softwareDocumentPosition(pose.previousVersion)).toEqual(
          softwareDocumentPosition(final.previousVersion),
        );
      }
    }
  });

  it('retains the dock hold until both checks join and restores only the stated prior object', () => {
    const parallel = scenes[2];
    const one = softwareReleasePose(parallel, parallel.responseAt + 0.4);
    expect(softwareDocumentPosition(one.change)).toEqual(softwareDocumentPosition(bench.testDock));
    expect(one.joinOpen).toBe(0);
    const joined = softwareReleasePose(parallel, parallel.checkAt + 0.3);
    expect(joined.checks.every((check) => check.receiptArrived)).toBe(true);
    expect(softwareReceiptPosition(joined.checks[0], true, 0)).not.toEqual(
      softwareReceiptPosition(joined.checks[1], true, 1),
    );
    const rollback = softwareReleasePose(scenes[1], base.resolveAt);
    expect(softwareDocumentPosition(rollback.change)[0]).toBe(V.dockX);
    expect(softwareDocumentPosition(rollback.previousVersion)).toEqual(
      softwareDocumentPosition(bench.release),
    );
    expect(rollback.released).toBe(false);
    expect(rollback.joinOpen).toBe(0);
  });
});
