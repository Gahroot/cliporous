import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type CameraSpec, cameraRig, projectToStage } from '../three-helpers';
import { CONTEXT_CLAY_LABELS, contextWindowCamera, contextWindowPoint } from './context-camera';
import { contextWindowPose, CONTEXT_WINDOW_GEOMETRY as G } from './context-window';
import type { ContextWindowScene } from './types';

type Point = [number, number, number];
const fixtures: { scene: ContextWindowScene; durationSec: number }[] = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../scripts/explainer-stills/fixtures/technology-context-window.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

function withinStage(camera: CameraSpec, center: Point, half: Point): void {
  for (const x of [-half[0], half[0]])
    for (const y of [-half[1], half[1]])
      for (const z of [-half[2], half[2]]) {
        const point = projectToStage(camera, [center[0] + x, center[1] + y, center[2] + z]);
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
        expect(point.x).toBeGreaterThanOrEqual(64);
        expect(point.x).toBeLessThanOrEqual(1016);
        expect(point.y).toBeGreaterThanOrEqual(280);
        expect(point.y).toBeLessThanOrEqual(750);
      }
}

describe.each(fixtures)('context clay $scene.preset', ({ scene, durationSec }) => {
  it('keeps every assembly and moving paper inside the authored content area', () => {
    const work = contextWindowPoint(G.working);
    const question = contextWindowPoint(G.question);
    const stored = contextWindowPoint(G.stored);
    const outside = contextWindowPoint(G.outside);
    for (let frame = 0; frame <= Math.ceil(durationSec * 30); frame++) {
      const time = frame / 30;
      const camera = contextWindowCamera(scene, time);
      const pose = contextWindowPose(scene, time);
      const recoil = -pose.trayOffset / 180;
      withinStage(
        camera,
        [(work[0] + question[0]) / 2, -0.7425 + recoil, 0.05],
        [2.2, 0.4875, 1.08],
      );
      withinStage(camera, [stored[0], -0.425, stored[2] + 0.05], [1.03, 0.815, 0.86]);
      withinStage(
        camera,
        [question[0], question[1] + recoil + 0.03, question[2]],
        [0.875, 0.095, 0.475],
      );
      if (scene.preset !== 'memory-retrieval')
        withinStage(camera, [outside[0], -0.635, outside[2]], [0.99, 0.11, 0.59]);
      for (const [name, actor] of Object.entries({
        detail: pose.detail,
        subject: pose.subject,
        summary: pose.summary,
        retrieved: pose.retrieved,
      })) {
        if (actor.opacity <= 0) continue;
        const point = contextWindowPoint(actor, name === 'retrieved' ? 0.11 * actor.opacity : 0);
        point[1] += 0.03 + (name === 'detail' ? 0 : recoil);
        withinStage(
          camera,
          point,
          name === 'summary' ? [0.665, 0.095, 0.365] : [0.875, 0.095, 0.475],
        );
      }
      for (const [name, anchor] of Object.entries(CONTEXT_CLAY_LABELS)) {
        const point = projectToStage(camera, anchor);
        const width = name === 'outside' ? 250 : name === 'tray' ? 290 : 280;
        expect(point.x - width / 2).toBeGreaterThanOrEqual(64);
        expect(point.x + width / 2).toBeLessThanOrEqual(1016);
        // Header + two source-label lines, clear of the condition and bottom phase rail.
        expect(Math.max(286, point.y)).toBeGreaterThanOrEqual(286);
        expect(Math.max(286, point.y) + 98).toBeLessThan(762);
      }
    }
  });

  it('moves the camera only after contact recoil, before the outcome reveal', () => {
    const first = contextWindowCamera(scene, 0);
    expect(contextWindowCamera(scene, scene.checkAt + 0.55)).toEqual(first);
    const start = contextWindowPose(scene, scene.checkAt + 0.55);
    for (let step = 0; step <= 12; step++) {
      const time = scene.checkAt + 0.55 + step * 0.05;
      const pose = contextWindowPose(scene, time);
      expect(pose.trayOffset).toBe(0);
      expect(pose.outcomeOpacity).toBe(0);
      expect(pose.detail).toEqual(start.detail);
      expect(pose.subject).toEqual(start.subject);
      expect(pose.retrieved).toEqual(start.retrieved);
    }
    expect(contextWindowCamera(scene, scene.checkAt + 1.15)).not.toEqual(first);
    const short = { ...scene, resolveAt: scene.checkAt + 1 };
    expect(contextWindowCamera(short, short.resolveAt)).toEqual(contextWindowCamera(short, 0));
  });

  it('is finite, seekable, rebased, and exactly still throughout the final hold', () => {
    const before = structuredClone(scene);
    const times = Array.from({ length: Math.ceil(durationSec * 30) + 1 }, (_, frame) => frame / 30);
    const expected = times.map((time) => contextWindowCamera(scene, time));
    const final = contextWindowCamera(scene, scene.resolveAt);
    const shifted = {
      ...scene,
      setupAt: scene.setupAt + 19,
      actionAt: scene.actionAt + 19,
      responseAt: scene.responseAt + 19,
      checkAt: scene.checkAt + 19,
      resolveAt: scene.resolveAt + 19,
    };
    for (const time of [...times].reverse()) {
      const camera = contextWindowCamera(scene, time);
      expect(camera).toEqual(expected[Math.round(time * 30)]);
      expect(camera.position.every(Number.isFinite)).toBe(true);
      contextWindowCamera(shifted, time + 19).position.forEach((value, index) => {
        expect(value).toBeCloseTo(camera.position[index], 10);
      });
      if (time >= scene.resolveAt) {
        expect(camera).toEqual(final);
        expect(cameraRig(camera, time, { driftDeg: 0, pushAmount: 0, bobAmount: 0 })).toEqual(
          cameraRig(final, scene.resolveAt, { driftDeg: 0, pushAmount: 0, bobAmount: 0 }),
        );
      }
    }
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
      expect(contextWindowCamera(scene, time)).toEqual(contextWindowCamera(scene, 0));
    for (const at of [scene.checkAt + 0.55, scene.checkAt + 1.15, scene.resolveAt]) {
      const a = contextWindowCamera(scene, at - 0.000001);
      contextWindowCamera(scene, at + 0.000001).position.forEach((value, index) => {
        expect(Math.abs(value - a.position[index])).toBeLessThan(0.00001);
      });
    }
    expect(contextWindowCamera(scene, 10000)).toEqual(final);
    expect(scene).toEqual(before);
  });
});
