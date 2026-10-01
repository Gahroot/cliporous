import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ContextWindowPose,
  contextWindowPose,
  CONTEXT_WINDOW_GEOMETRY as G,
} from './context-window';
import type { ContextWindowScene } from './types';

interface Fixture {
  name: string;
  durationSec: number;
  scene: ContextWindowScene;
  samples: { name: string; frame: number }[];
}
const fixtures: Fixture[] = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../scripts/explainer-stills/fixtures/technology-context-window.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

function bounded(pose: ContextWindowPose): void {
  expect(numbers(pose).every(Number.isFinite)).toBe(true);
  for (const [name, actor] of Object.entries({
    subject: pose.subject,
    detail: pose.detail,
    summary: pose.summary,
    retrieved: pose.retrieved,
  })) {
    const width = name === 'retrieved' ? G.storedWidth : G.cardWidth;
    expect(actor.x).toBeGreaterThanOrEqual(64);
    expect(actor.x + width).toBeLessThanOrEqual(1016);
    expect(actor.y).toBeGreaterThanOrEqual(200);
    expect(actor.y + G.cardHeight).toBeLessThanOrEqual(790);
    expect(actor.opacity).toBeGreaterThanOrEqual(0);
    expect(actor.opacity).toBeLessThanOrEqual(1);
  }
  for (const value of [pose.selected, pose.outsideOpacity, pose.outcomeOpacity]) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
  expect(pose.archiveOpacity).toBe(1);
  expect(Math.abs(pose.trayOffset)).toBeLessThanOrEqual(8);
}

describe.each(fixtures)('$name seekable pose', ({ scene, durationSec, samples }) => {
  it('is finite and bounded through every frame, exact boundaries, and invalid input times', () => {
    const boundaries = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.checkAt + 0.5,
      scene.resolveAt - 0.25,
      scene.resolveAt,
    ];
    const times = [
      ...Array.from({ length: Math.ceil(durationSec * 30) + 1 }, (_, frame) => frame / 30),
      ...boundaries.flatMap((at) => [at - 0.000001, at, at + 0.000001]),
      ...samples.map((sample) => sample.frame / 30),
      -100,
      10000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    for (const t of times) bounded(contextWindowPose(scene, t));
    for (const t of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(contextWindowPose(scene, t)).toEqual(contextWindowPose(scene, 0));
    }
    for (const boundary of boundaries) {
      const before = numbers(contextWindowPose(scene, boundary - 0.000001));
      const after = numbers(contextWindowPose(scene, boundary + 0.000001));
      expect(after.every((value, index) => Math.abs(value - before[index]) < 0.01)).toBe(true);
    }
  });

  it('has an exact static final hold of at least .8 seconds, without idle motion', () => {
    expect(durationSec - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    const settled = contextWindowPose(scene, scene.resolveAt);
    expect(settled.outcomeOpacity).toBe(1);
    expect(settled.trayOffset).toBe(0);
    for (
      let frame = Math.ceil(scene.resolveAt * 30);
      frame <= Math.ceil(durationSec * 30);
      frame++
    ) {
      expect(contextWindowPose(scene, frame / 30)).toEqual(settled);
    }
    expect(contextWindowPose(scene, durationSec + 100)).toEqual(settled);
  });

  it('is unchanged by repeated, reversed, and deterministically shuffled seeks', () => {
    const before = structuredClone(scene);
    const frames = Array.from({ length: Math.ceil(durationSec * 30) + 1 }, (_, frame) => frame);
    const expected = frames.map((frame) => contextWindowPose(scene, frame / 30));
    let seed = 713;
    const shuffled = [...frames];
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const frame of [...shuffled, ...[...frames].reverse(), ...shuffled]) {
      expect(contextWindowPose(scene, frame / 30)).toEqual(expected[frame]);
    }
    expect(scene).toEqual(before);
  });

  it('preserves absolute timing and does not reveal an outcome before seating/checking', () => {
    const offset = 17;
    const shifted = {
      ...scene,
      setupAt: scene.setupAt + offset,
      actionAt: scene.actionAt + offset,
      responseAt: scene.responseAt + offset,
      checkAt: scene.checkAt + offset,
      resolveAt: scene.resolveAt + offset,
    };
    for (const t of [
      0,
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      durationSec,
    ]) {
      const a = numbers(contextWindowPose(scene, t));
      const b = numbers(contextWindowPose(shifted, t + offset));
      for (const [i, value] of a.entries()) expect(b[i]).toBeCloseTo(value, 10);
    }
    for (let frame = 0; frame / 30 <= scene.checkAt; frame++) {
      const pose = contextWindowPose(scene, frame / 30);
      expect(pose.outcomeOpacity).toBe(0);
      expect(pose.trayOffset).toBe(0);
    }
    expect(contextWindowPose(scene, scene.checkAt + 0.15).trayOffset).not.toBe(0);
  });

  it('preserves the branch-specific physical relationship and persistent archive', () => {
    const start = contextWindowPose(scene, scene.actionAt);
    const response = contextWindowPose(scene, scene.responseAt);
    const checked = contextWindowPose(scene, scene.checkAt);
    expect(G.tray.x + G.tray.width).toBeLessThan(G.archive.x);
    if (scene.preset === 'overflow') {
      expect(start.subject).toEqual({ ...G.waiting, opacity: 1 });
      expect(response.subject).toEqual({ ...G.lip, opacity: 1 });
      expect(response.detail).toEqual({ ...G.working, opacity: 1 });
      expect(checked.subject).toEqual({ ...G.working, opacity: 1 });
      expect(checked.detail).toEqual({ ...G.outside, opacity: 1 });
      for (let frame = 0; frame / 30 <= durationSec; frame++) {
        const pose = contextWindowPose(scene, frame / 30);
        expect(pose.subject.opacity).toBe(1);
        expect(pose.detail.opacity).toBe(1);
        expect(pose.subject.y + G.cardHeight).toBeLessThanOrEqual(pose.detail.y);
      }
    } else if (scene.preset === 'summarisation') {
      expect(start.detail).toEqual({ ...G.working, opacity: 1 });
      expect(start.summary.opacity).toBe(0);
      expect(response.detail).toEqual({ ...G.outside, opacity: 1 });
      expect(response.outsideOpacity).toBe(1);
      expect(checked.summary).toEqual({ ...G.working, opacity: 1 });
      expect(checked.detail.opacity).toBe(1);
      expect(checked.retrieved.opacity).toBe(0);
    } else {
      expect(start.retrieved).toEqual({ ...G.stored, opacity: 0 });
      expect(response.retrieved).toEqual({ ...G.stored, opacity: 1 });
      expect(response.selected).toBe(1);
      expect(checked.retrieved).toEqual({ ...G.working, opacity: 1 });
      expect(checked.subject).toEqual({ ...G.question, opacity: 1 });
      expect(checked.archiveOpacity).toBe(1);
      expect(checked.outsideOpacity).toBe(0);
    }
    expect(checked.detail.y).toBeGreaterThan(G.tray.y + G.tray.height);
  });
});
