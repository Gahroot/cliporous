import { expect, it } from 'vitest';
import { temporalSourceFixtures } from '../../../../../ai/explainer/expansion-temporal-fixtures';
import {
  parseExpansionCriticalPath,
  parseExpansionParallelLanes,
} from '../../../../../ai/explainer/expansion-temporal-lanes-critical-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import {
  lanesCriticalPages,
  lanesCriticalPose,
  lanesCriticalPosition,
} from './lanes-critical-poses';
import {
  lanesCriticalCases,
  lanesCriticalPacket,
  lanesCriticalStressSeed,
  parseLanesCritical,
} from './lanes-critical-test-fixtures';

it('raw real-parser positives/negatives in both modes, not fabricated scene fixtures', () => {
  for (const seed of lanesCriticalPacket.stories)
    for (const mode of ['diagram', 'hybrid'] as const) {
      const scene = parseLanesCritical(seed, mode);
      expect(scene.visualMode).toBe(mode);
      const other = parseLanesCritical(seed, mode === 'diagram' ? 'hybrid' : 'diagram');
      expect({ ...scene, visualMode: 'diagram' }).toEqual({ ...other, visualMode: 'diagram' });
    }
  for (const seed of temporalSourceFixtures(lanesCriticalPacket.stories))
    for (const negative of seed.negatives)
      for (const mode of ['diagram', 'hybrid'] as const) {
        const ctx = makeParseContext(negative.words ?? seed.words, negative.window ?? seed.window);
        const raw = {
          ...negative.proposal,
          ...(negative.proposal.visualMode === 'diagram' ||
          negative.proposal.visualMode === 'hybrid'
            ? { visualMode: mode }
            : {}),
        };
        expect(
          seed.id === '41'
            ? parseExpansionParallelLanes(raw, ctx)
            : parseExpansionCriticalPath(raw, ctx),
        ).toBeNull();
      }
});
it('all authored frames seek repeatably, five beats settle, every full-source page visited; data immutable', () => {
  for (const base of lanesCriticalCases())
    for (const visualMode of ['diagram', 'hybrid'] as const) {
      const scene = { ...base, visualMode },
        before = JSON.stringify(scene),
        pages = lanesCriticalPages(scene);
      const frames = Array.from({ length: 361 }, (_, i) => i);
      const expected = frames.map((f) => lanesCriticalPose(scene, f / 30));
      const visited = new Set(expected.map((p) => p.page));
      expect(visited.size).toBe(pages.length);
      for (const frame of frames.sort((a, b) => ((a * 137) % 361) - ((b * 137) % 361))) {
        expect(lanesCriticalPose(scene, frame / 30)).toEqual(expected[frame]);
        expect(lanesCriticalPose(scene, frame / 30)).toEqual(expected[frame]);
        expect(Object.values(expected[frame]).every(Number.isFinite)).toBe(true);
      }
      for (const t of [NaN, Infinity, -Infinity])
        expect(lanesCriticalPose(scene, t)).toEqual(lanesCriticalPose(scene, scene.setupAt - 1));
      expect(lanesCriticalPose(scene, scene.resolveAt + 0.31)).toEqual(
        lanesCriticalPose(scene, 100),
      );
      for (const [field, at] of [
        ['reveal', scene.setupAt],
        ['action', scene.actionAt],
        ['response', scene.responseAt],
        ['check', scene.checkAt],
        ['resolve', scene.resolveAt],
      ] as const) {
        expect(lanesCriticalPose(scene, at)[field]).toBe(0);
        expect(lanesCriticalPose(scene, at + 0.31)[field]).toBe(1);
      }
      for (const factId of new Set(pages.map((p) => p.factId))) {
        const fact = pages.filter((p) => p.factId === factId);
        expect(fact.flatMap((p) => p.lines).join('')).toBe(fact[0]?.text);
      }
      expect(JSON.stringify(scene)).toBe(before);
      const rebased = {
        ...scene,
        setupAt: scene.setupAt + 100,
        actionAt: scene.actionAt + 100,
        responseAt: scene.responseAt + 100,
        checkAt: scene.checkAt + 100,
        resolveAt: scene.resolveAt + 100,
      };
      expect(rebased.tasks).toBe(scene.tasks);
      expect(rebased.result).toBe(scene.result);
      expect(lanesCriticalPages(rebased)).toEqual(pages);
    }
});
it('exact common domain, close fractions/extrema, zero distinct from unknown and tied critical paths', () => {
  expect(
    lanesCriticalPosition({ numerator: 0, denominator: 1 }, { numerator: 0, denominator: 1 }),
  ).toBe(0);
  expect(
    lanesCriticalPosition(
      { numerator: 999999999, denominator: 1000000000 },
      { numerator: 1, denominator: 1 },
    ),
  ).toBeCloseTo(0.999999999, 12);
  expect(
    lanesCriticalPosition({ numerator: 1, denominator: 1 }, { numerator: 1, denominator: 1 }),
  ).toBe(1);
  expect(() =>
    lanesCriticalPosition({ numerator: 1, denominator: 1 }, { numerator: 0, denominator: 1 }),
  ).toThrow();
  for (const mode of ['diagram', 'hybrid'] as const) {
    const tiedSeed = lanesCriticalPacket.stories.find(
      (s) => s.id === '42' && s.proposal.subject === 'Inez',
    );
    if (!tiedSeed) throw new Error('Missing tied raw fixture');
    const scene = parseLanesCritical(tiedSeed, mode);
    if (scene.storyId !== '42') throw new Error('Critical scene required');
    expect(scene.result.pathMultiplicity).toBe('tied');
    expect(scene.result.criticalPathCount).toBe(2);
    expect(scene.result.criticalTaskIds).toHaveLength(3);
    expect(scene.result.criticalRelationIds).toHaveLength(2);
    expect(scene.result.duration).toEqual({ numerator: 3, denominator: 4 });
    for (const operand of scene.result.operands) {
      const task = scene.tasks.find((t) => t.id === operand.taskId);
      expect(operand.duration).toBe(task?.duration);
      expect(operand.prerequisites).toBe(task?.prerequisites);
    }
    for (const unit of ['second', 'minute', 'hour', 'day']) {
      const max = parseLanesCritical(lanesCriticalStressSeed('42', 'known', unit), mode);
      if (max.storyId !== '42') throw new Error('Critical scene required');
      expect(max.tasks).toHaveLength(7);
      expect(max.entities).toHaveLength(8);
      expect(max.relations).toHaveLength(16);
      expect(max.result.basis.unit).toBe(unit);
      expect(max.result.scheduleBasis).toBe(max.basis);
      for (const s of max.result.schedule)
        for (const value of [s.earliestStart, s.earliestFinish, s.latestStart, s.latestFinish])
          expect(lanesCriticalPosition(value, max.result.duration)).toBeGreaterThanOrEqual(0);
    }
    const zero = parseLanesCritical(lanesCriticalStressSeed('42', 'known', 'hour', true), mode);
    if (zero.storyId !== '42') throw new Error('Critical scene required');
    expect(zero.result.duration.numerator).toBe(0);
    expect(zero.result.pathMultiplicity).toBe('tied');
    const unknown = parseLanesCritical(lanesCriticalStressSeed('41', 'unknown'), mode);
    expect(unknown.tasks.every((task) => task.duration?.state === 'unknown')).toBe(true);
    expect(unknown.relations).toHaveLength(16);
  }
});
