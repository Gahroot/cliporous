import { describe, expect, it } from 'vitest';
import fixtures from '../../../../../../scripts/explainer-stills/fixtures/technology-request-routing.json';
import { type CameraSpec, cameraRig, projectToStage } from '../three-helpers';
import { ROUTING_POINTS, requestRoutingPose } from './request-routing';
import {
  ROUTING_LABEL_ANCHORS,
  requestRoutingCamera,
  routingPointToWorld,
  routingRequestLabelPosition,
} from './routing-camera';
import type { RequestRoutingScene } from './types';

type Point = [number, number, number];
const examples = fixtures.flatMap(({ scene }) => [
  scene as RequestRoutingScene,
  {
    ...scene,
    setupAt: 1,
    actionAt: 1.6,
    responseAt: 2.6,
    checkAt: 3.6,
    resolveAt: 4.6,
  } as RequestRoutingScene,
]);

function inside(x: number, y: number, width = 0, height = 0) {
  expect(x).toBeGreaterThanOrEqual(64);
  expect(x + width).toBeLessThanOrEqual(1016);
  expect(y).toBeGreaterThanOrEqual(200);
  expect(y + height).toBeLessThanOrEqual(790);
}

function bounds(camera: CameraSpec, low: Point, high: Point) {
  for (const x of [low[0], high[0]])
    for (const y of [low[1], high[1]])
      for (const z of [low[2], high[2]]) {
        const point = projectToStage(camera, [x, y, z]);
        inside(point.x, point.y);
      }
}

describe('clay routing camera', () => {
  it.each(
    examples,
  )('$preset ($resolveAt): keeps authored solids and label envelopes in frame', (scene) => {
    const fallback = scene.preset === 'timeout-fallback';
    for (let frame = 0; frame <= (scene.resolveAt + 1) * 30; frame++) {
      const time = frame / 30;
      const pose = requestRoutingPose(scene, time);
      const camera = cameraRig(requestRoutingCamera(scene, time), time, {
        driftDeg: 0,
        pushAmount: 0,
        bobAmount: 0,
      });
      // Board, selector and receiver envelopes include bevels, seals and actual contact recoil.
      bounds(camera, [-3.55, -1.15, -2], [3.5, -0.83, 1.85]);
      bounds(camera, [-0.625, -0.835, -1.9], [0.525, 0.28, -1.2]);
      for (const [point, offset, top] of [
        [ROUTING_POINTS.primary, pose.primaryOffset, 0.87],
        fallback
          ? ([ROUTING_POINTS.alternate, pose.fallbackOffset, 0.09] as const)
          : ([ROUTING_POINTS.cache, pose.cacheOffset, 0.64] as const),
      ] as const) {
        const [x, , z] = routingPointToWorld(point);
        bounds(
          camera,
          [x - 0.96, -0.86 + offset / 125, z - 0.8],
          [x + 1.03, top + offset / 125, z + 0.59],
        );
      }
      const [x, y, z] = routingPointToWorld(pose.request);
      bounds(camera, [x - 0.585, y - 0.24, z - 0.37], [x + 0.585, y + 0.14, z + 0.37]);
      for (const zone of ['switchboard', 'primary', fallback ? 'alternate' : 'cache'] as const) {
        const anchor = ROUTING_LABEL_ANCHORS[zone];
        const label = projectToStage(camera, anchor.point);
        inside(
          label.x - anchor.width / 2,
          label.y - (zone === 'alternate' ? 0 : 54),
          anchor.width,
          zone === 'switchboard' ? 46 : 118,
        );
      }
      const label = routingRequestLabelPosition(camera, pose.request, fallback);
      // Three subject lines plus the response line; no DOM/font measurement claimed here.
      inside(label.x, label.y, 264, 136);
    }
  });

  it.each(
    examples,
  )('$preset ($resolveAt): moves only with the same request stopped and recoil settled', (scene) => {
    for (let frame = 1; frame <= (scene.resolveAt + 1) * 30; frame++) {
      const before = (frame - 1) / 30;
      const time = frame / 30;
      if (
        JSON.stringify(requestRoutingCamera(scene, before)) ===
        JSON.stringify(requestRoutingCamera(scene, time))
      )
        continue;
      const pose = requestRoutingPose(scene, time);
      expect(pose.request).toEqual(requestRoutingPose(scene, before).request);
      expect(pose.cacheOffset).toBe(0);
      expect(pose.primaryOffset).toBe(0);
      expect(pose.fallbackOffset).toBe(0);
    }
    if (
      scene.preset === 'cache-miss' ||
      (scene.preset === 'timeout-fallback' && scene.responseAt - scene.actionAt < 1.3)
    ) {
      expect(requestRoutingCamera(scene, 0)).toEqual(requestRoutingCamera(scene, scene.resolveAt));
    } else {
      expect(requestRoutingCamera(scene, 0)).not.toEqual(
        requestRoutingCamera(scene, scene.resolveAt),
      );
    }
  });

  it.each(
    examples,
  )('$preset ($resolveAt): finite, seekable and exactly still throughout the final hold', (scene) => {
    const original = JSON.stringify(scene);
    const times = Array.from({ length: Math.ceil((scene.resolveAt + 2) * 30) }, (_, i) => i / 30);
    const cameras = times.map((time) => requestRoutingCamera(scene, time));
    for (const index of times.map((_, i) => i).reverse()) {
      expect(requestRoutingCamera(scene, times[index])).toEqual(cameras[index]);
      expect(cameras[index].position.every(Number.isFinite)).toBe(true);
    }
    const final = requestRoutingCamera(scene, scene.resolveAt);
    for (let frame = 0; frame <= 60; frame++) {
      const time = scene.resolveAt + frame / 30;
      expect(requestRoutingCamera(scene, time)).toEqual(final);
      expect(cameraRig(final, time, { driftDeg: 0, pushAmount: 0, bobAmount: 0 })).toEqual(
        cameraRig(final, scene.resolveAt, { driftDeg: 0, pushAmount: 0, bobAmount: 0 }),
      );
    }
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(requestRoutingCamera(scene, time)).toEqual(
        requestRoutingCamera(scene, scene.setupAt - 1),
      );
    }
    expect(JSON.stringify(scene)).toBe(original);
  });
});
