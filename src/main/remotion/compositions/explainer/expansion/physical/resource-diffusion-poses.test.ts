import { describe, expect, it } from 'vitest';
import {
  resourceDiffusionChrome,
  resourceDiffusionPages,
  resourceDiffusionPose,
  resourceDiffusionQuantity,
  resourceDiffusionWrap,
} from './resource-diffusion-poses';
import { resourceDiffusionCases } from './resource-diffusion-test-fixtures';

describe('resource and diffusion source-preserving seekable poses', () => {
  const cases = resourceDiffusionCases();
  it('covers both stories, paraphrases, both modes and all seven quantity states', () => {
    expect(cases).toHaveLength(114);
    expect(new Set(cases.flatMap((s) => s.records.map((r) => r.quantity.state))).size).toBe(7);
    expect(cases.filter((s) => s.visualMode === 'diagram')).toHaveLength(57);
    expect(cases.filter((s) => s.visualMode === 'hybrid')).toHaveLength(57);
    expect(Math.max(...cases.map((s) => s.label.length))).toBe(48);
    expect(Math.max(...cases.map((s) => s.outcome.length))).toBe(54);
    expect(Math.max(...cases.map((s) => s.period.length))).toBe(32);
    expect(Math.max(...cases.map((s) => s.population.length))).toBe(40);
    expect(Math.max(...cases.flatMap((s) => s.entities.map((e) => e.label.length)))).toBe(28);
    expect(
      Math.max(
        ...cases.flatMap((s) =>
          s.records.map((r) => ('condition' in r.quantity ? r.quantity.condition.length : 0)),
        ),
      ),
    ).toBe(96);
  });
  for (const [index, scene] of cases.entries())
    it(`source ${index}: every page reachable at 30fps; shuffled, repeated and boundary seeks`, () => {
      const before = structuredClone(scene),
        pages = resourceDiffusionPages(scene),
        reached = new Set<number>();
      const samples = Array.from(
        { length: Math.ceil(scene.resolveAt * 30) + 31 },
        (_, i) => i / 30,
      );
      const reference = samples.map((t) => resourceDiffusionPose(scene, t));
      for (let i = samples.length - 1; i >= 0; i--) {
        const pose = resourceDiffusionPose(scene, samples[i]);
        expect(pose).toEqual(reference[i]);
        expect(resourceDiffusionPose(scene, samples[i])).toEqual(pose);
        if (samples[i] >= scene.setupAt && samples[i] <= scene.resolveAt) reached.add(pose.page);
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          expect(Number.isFinite(pose[key])).toBe(true);
          expect(pose[key]).toBeGreaterThanOrEqual(0);
          expect(pose[key]).toBeLessThanOrEqual(1);
        }
      }
      expect([...reached].sort((a, b) => a - b)).toEqual(pages.map((_, i) => i));
      for (const t of [NaN, Infinity, -Infinity])
        expect(resourceDiffusionPose(scene, t)).toEqual(
          resourceDiffusionPose(scene, scene.setupAt),
        );
      for (const t of [scene.resolveAt, scene.resolveAt + 0.8, 1000])
        expect(resourceDiffusionPose(scene, t).page).toBe(pages.length - 1);
      for (const record of scene.records) {
        const continuation = pages.filter((p) => p.id === record.id);
        expect(continuation.length).toBeGreaterThan(0);
        expect(continuation.every((p) => p.state === record.quantity.state)).toBe(true);
        expect(continuation.flatMap((p) => p.lines)).toEqual(
          [record.role, ...resourceDiffusionQuantity(record.quantity)].flatMap(
            resourceDiffusionWrap,
          ),
        );
        if (record.quantity.state === 'unknown' || record.quantity.state === 'missing')
          expect('amount' in record.quantity).toBe(false);
      }
      const contexts = pages.filter((p) => p.id === `${scene.storyId}:context`);
      expect(contexts.every((p) => p.state === scene.evidence)).toBe(true);
      for (const id of ['label', 'outcome'] as const) {
        const chunks = resourceDiffusionWrap(scene[id]);
        expect(pages.length).toBeGreaterThanOrEqual(chunks.length);
        expect(
          chunks
            .map((_, page) => resourceDiffusionChrome(scene, { ...reference[0], page })[id])
            .join(''),
        ).toBe(scene[id]);
      }
      const factStates =
        scene.storyId === '75'
          ? { '75:access': 'conditional', '75:decision': scene.decision.state }
          : { '76:model': scene.model, '76:filter': scene.model, '76:result': scene.result.state };
      for (const [id, state] of Object.entries(factStates)) {
        const continuation = pages.filter((p) => p.id === id);
        expect(continuation.length).toBeGreaterThan(0);
        expect(continuation.every((p) => p.state === state)).toBe(true);
      }
      const condition = scene.storyId === '75' ? scene.access.condition : scene.filter.condition;
      for (const id of scene.storyId === '75'
        ? ['75:access', '75:decision']
        : ['76:filter', '76:result'])
        expect(
          pages
            .filter((p) => p.id === id)
            .flatMap((p) => p.lines)
            .join(''),
        ).toContain(condition);
      const order = samples
        .map((_, i) => i)
        .sort(
          (a, b) => ((a * 2654435761 + 1013904223) >>> 0) - ((b * 2654435761 + 1013904223) >>> 0),
        );
      for (const i of order) expect(resourceDiffusionPose(scene, samples[i])).toEqual(reference[i]);
      expect(scene).toEqual(before);
    });
  it('retains every character without ellipsis including unbroken maximum-width labels', () => {
    const source = 'W'.repeat(96);
    expect(resourceDiffusionWrap(source).join('')).toBe(source);
    expect(resourceDiffusionWrap(source).every((s) => s.length <= 18)).toBe(true);
  });
});
