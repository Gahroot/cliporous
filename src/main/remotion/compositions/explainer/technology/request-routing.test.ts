import { describe, expect, it } from 'vitest';
import fixtures from '../../../../../../scripts/explainer-stills/fixtures/technology-request-routing.json';
import { makeParseContext } from '../../../../ai/explainer/kind-spec';
import { REQUEST_ROUTING_SPEC } from '../../../../ai/explainer/kinds-request-routing';
import { ROUTING_POINTS, requestRoutingPose } from './request-routing';

const examples = fixtures.map((fixture) => {
  const { fps, stepFrames, durationFrames } = fixture.wordTiming;
  const words = fixture.sourceText.split(/\s+/).map((text, i) => ({
    text,
    start: (i * stepFrames) / fps,
    end: (i * stepFrames + durationFrames) / fps,
  }));
  const ctx = makeParseContext(words, {
    startWord: fixture.raw.startWord,
    endWord: fixture.raw.endWord,
    startTime: 0,
    endTime: fixture.durationSec,
  });
  const scene = REQUEST_ROUTING_SPEC.parse(fixture.raw, ctx);
  if (!scene) throw new Error(`${fixture.name}: ${ctx.issues.join('; ')}`);
  return { ...fixture, scene };
});

function finiteTree(value: unknown) {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true);
    expect(Math.abs(value)).toBeLessThanOrEqual(1080);
  } else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) finiteTree(item);
  }
}

describe('requestRoutingPose', () => {
  it.each(
    examples,
  )('$name: every frame, exact boundaries, repeated and shuffled seeks are bounded and pure', ({
    scene,
    durationSec,
    samples,
  }) => {
    const original = JSON.stringify(scene);
    const boundaries = [
      scene.setupAt - 0.25,
      scene.setupAt,
      scene.actionAt,
      scene.actionAt + 0.12,
      scene.responseAt - 1 / 3,
      scene.responseAt,
      scene.responseAt + 0.12,
      scene.checkAt - 1 / 3,
      scene.checkAt,
      scene.checkAt + 0.2,
      scene.resolveAt,
    ];
    const times = [
      ...Array.from({ length: durationSec * 30 + 31 }, (_, i) => i / 30),
      ...boundaries.flatMap((at) => [at - 1e-6, at, at + 1e-6]),
      ...samples.map(({ frame }) => frame / 30),
    ];
    const poses = times.map((t) => requestRoutingPose(scene, t));
    for (const pose of poses) {
      finiteTree(pose);
      expect(pose.request.x).toBeGreaterThanOrEqual(112);
      expect(pose.request.x).toBeLessThanOrEqual(704);
      expect(pose.request.y).toBeGreaterThanOrEqual(352);
      expect(pose.request.y).toBeLessThanOrEqual(646);
      for (const field of [
        'requestOpacity',
        'response',
        'cacheContent',
        'lookupWire',
        'primaryWire',
        'fallbackWire',
        'returnWire',
        'switchTurn',
        'outcome',
      ] as const) {
        expect(pose[field]).toBeGreaterThanOrEqual(0);
        expect(pose[field]).toBeLessThanOrEqual(1);
      }
      for (const field of ['cacheOffset', 'primaryOffset', 'fallbackOffset'] as const)
        expect(Math.abs(pose[field])).toBeLessThanOrEqual(8);
    }
    // A fixed pseudo-random ordering, plus backwards seeks: no playback-history dependency.
    const order = times.map((_, i) => i).sort((a, b) => ((a * 7919) % 997) - ((b * 7919) % 997));
    for (const i of [...order, ...[...order].reverse()])
      expect(requestRoutingPose(scene, times[i])).toEqual(poses[i]);
    for (const at of boundaries) {
      const before = requestRoutingPose(scene, at - 1e-6).request;
      const after = requestRoutingPose(scene, at + 1e-6).request;
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.01);
    }
    expect(JSON.stringify(scene)).toBe(original);
  });

  it.each(
    examples,
  )('$name: exactly static for the whole final hold, including minimum-gap stories', ({
    scene,
    durationSec,
  }) => {
    for (const story of [
      scene,
      { ...scene, setupAt: 1, actionAt: 1.6, responseAt: 2.6, checkAt: 3.6, resolveAt: 4.6 },
    ]) {
      const final = requestRoutingPose(story, story.resolveAt);
      expect(final.request).toEqual(ROUTING_POINTS.client);
      expect(final.outcome).toBe(1);
      for (let frame = 0; frame <= 60; frame++)
        expect(requestRoutingPose(story, story.resolveAt + frame / 30)).toEqual(final);
      expect(requestRoutingPose(story, durationSec + 100)).toEqual(final);
      expect(final.cacheOffset).toBe(0);
      expect(final.primaryOffset).toBe(0);
      expect(final.fallbackOffset).toBe(0);
      expect(requestRoutingPose(story, story.resolveAt - 1e-6).outcome).toBe(0);
    }
  });

  it('cache hit bypasses all backend work and retains its matching response', () => {
    const { scene, durationSec } = examples[0];
    for (let frame = 0; frame < durationSec * 30; frame++) {
      const pose = requestRoutingPose(scene, frame / 30);
      expect(pose.primaryWire).toBe(0);
      expect(pose.primaryOffset).toBe(0);
      expect(pose.fallbackWire).toBe(0);
      expect(pose.request.x).toBeLessThanOrEqual(ROUTING_POINTS.upper.x);
      expect(pose.cacheContent).toBe(1);
    }
    expect(requestRoutingPose(scene, scene.actionAt).request).toEqual(ROUTING_POINTS.cache);
    expect(requestRoutingPose(scene, scene.actionAt).cacheOffset).toBe(0);
    expect(requestRoutingPose(scene, scene.actionAt + 0.1).cacheOffset).not.toBe(0);
    expect(requestRoutingPose(scene, scene.checkAt).primaryState).toBe('Bypassed');
  });

  it('miss visits backend and cannot populate cache before response and subsequent cache contact', () => {
    const { scene } = examples[1];
    const contact = scene.responseAt - 1 / 3;
    expect(requestRoutingPose(scene, contact).request).toEqual(ROUTING_POINTS.primary);
    expect(requestRoutingPose(scene, contact - 0.01).primaryOffset).toBe(0);
    expect(requestRoutingPose(scene, contact).primaryOffset).toBe(0);
    expect(requestRoutingPose(scene, contact + 0.1).primaryOffset).not.toBe(0);
    for (let frame = 0; frame / 30 <= scene.checkAt; frame++)
      expect(requestRoutingPose(scene, frame / 30).cacheContent).toBe(0);
    expect(requestRoutingPose(scene, scene.responseAt).response).toBe(0);
    expect(requestRoutingPose(scene, scene.responseAt + 0.1).response).toBeGreaterThan(0);
    expect(requestRoutingPose(scene, scene.checkAt).request).toEqual(ROUTING_POINTS.cache);
    expect(requestRoutingPose(scene, scene.checkAt + 0.1).cacheContent).toBeGreaterThan(0);
    expect(requestRoutingPose(scene, scene.checkAt + 0.1).cacheOffset).not.toBe(0);
  });

  it('fallback waits for timeout, uses alternate service, then returns the same ticket', () => {
    const { scene } = examples[2];
    const contact = scene.checkAt - 1 / 3;
    expect(requestRoutingPose(scene, scene.actionAt).request).toEqual(ROUTING_POINTS.primary);
    expect(requestRoutingPose(scene, scene.responseAt - 0.01).fallbackWire).toBe(0);
    expect(requestRoutingPose(scene, scene.responseAt).primaryState).toBe('Timed out');
    expect(requestRoutingPose(scene, contact).request).toEqual(ROUTING_POINTS.alternate);
    expect(requestRoutingPose(scene, contact - 0.01).fallbackOffset).toBe(0);
    expect(requestRoutingPose(scene, contact).fallbackOffset).toBe(0);
    expect(requestRoutingPose(scene, contact + 0.1).fallbackOffset).not.toBe(0);
    expect(requestRoutingPose(scene, scene.checkAt - 0.01).response).toBe(0);
    expect(requestRoutingPose(scene, scene.checkAt + 0.1).response).toBeGreaterThan(0);
    expect(requestRoutingPose(scene, scene.resolveAt).request).toEqual(ROUTING_POINTS.client);
    expect(requestRoutingPose(scene, scene.resolveAt).cacheState).toBe('Idle');
  });

  it.each(examples)('$name handles nonfinite/outside seek times without NaN or mutation', ({
    scene,
  }) => {
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -100])
      finiteTree(requestRoutingPose(scene, time));
  });
});
