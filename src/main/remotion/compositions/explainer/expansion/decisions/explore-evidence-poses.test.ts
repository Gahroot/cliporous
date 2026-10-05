import { describe, expect, it } from 'vitest';
import { compare } from '../value-logic';
import {
  exploreEvidencePages,
  exploreEvidencePageTimes,
  exploreEvidencePose,
  exploreEvidenceRecords,
} from './explore-evidence-poses';
import {
  exploreEvidenceAccepted,
  exploreEvidenceTestFixtures,
  exploreEvidenceTestScenes,
} from './explore-evidence-test-fixtures';

describe('stories 31–32 actual source parser and pure ordered five-beat poses', () => {
  it('accepts both modes, 11 events/1 reward, 8 events/4 rewards, 12 tests and all seven statuses', () => {
    for (const fixture of exploreEvidenceTestFixtures()) {
      const snapshot = JSON.stringify(fixture);
      for (const visualMode of ['diagram', 'hybrid'] as const)
        for (const layout of ['stack', 'stack-flipped'] as const) {
          const scene = exploreEvidenceAccepted({
            ...fixture,
            proposal: { ...fixture.proposal, visualMode, layout },
          });
          expect(scene.visualMode).toBe(visualMode);
          expect(scene.entities.length).toBeLessThanOrEqual(4);
          expect(exploreEvidenceRecords(scene).map((r) => r.evidence.fromWord)).toEqual(
            exploreEvidenceRecords(scene)
              .map((r) => r.evidence.fromWord)
              .sort((a, b) => a - b),
          );
        }
      expect(JSON.stringify(fixture)).toBe(snapshot);
    }
    expect(exploreEvidenceTestScenes()).toHaveLength(27);
  });
  it('is frame-seekable, repeated/shuffled/nonfinite safe and immutable through final hold', () => {
    for (const scene of exploreEvidenceTestScenes()) {
      const before = JSON.stringify(scene);
      const times = Array.from({ length: 361 }, (_, i) => i / 30);
      const expected = times.map((t) => exploreEvidencePose(scene, t));
      for (const i of times
        .map((_, i) => i)
        .sort((a, b) => ((a * 127) % 361) - ((b * 127) % 361))) {
        expect(exploreEvidencePose(scene, times[i])).toEqual(expected[i]);
        expect(exploreEvidencePose(scene, times[i])).toEqual(expected[i]);
      }
      for (const t of [NaN, Infinity, -Infinity])
        expect(exploreEvidencePose(scene, t)).toEqual(exploreEvidencePose(scene, 0));
      expect(exploreEvidencePose(scene, 999)).toEqual(
        exploreEvidencePose(scene, scene.resolveAt + 0.2),
      );
      exploreEvidencePageTimes(scene).forEach((t, i) => {
        expect(exploreEvidencePose(scene, t).pageIndex).toBe(i);
      });
      expect(JSON.stringify(scene)).toBe(before);
    }
  });
  it('retains exact accepted numeric reward extrema, money minor units and source-only selected/conditional conclusions', () => {
    let numeric = 0,
      selected = 0;
    for (const scene of exploreEvidenceTestScenes())
      if (scene.storyId === '31') {
        const pages = exploreEvidencePages(scene);
        for (const reward of scene.rewards) {
          const q = reward.quantity;
          const amounts = q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : [];
          for (const amount of amounts) {
            numeric++;
            expect(amount.notation).toBeDefined();
            if (amount.kind === 'rational') {
              const allowed = [
                { numerator: -1000000000, denominator: 1 },
                { numerator: 1000000000, denominator: 1 },
                { numerator: 1, denominator: 1000000000 },
                { numerator: 0, denominator: 1 },
              ];
              expect(
                allowed.some((value) => {
                  const equal = compare(amount.value, value);
                  return equal.ok && equal.value === 0;
                }),
              ).toBe(true);
            } else expect([-1000000000, 1000000000, 1, 0]).toContain(amount.value.minorUnits);
          }
        }
        if (scene.decision.selectedId) {
          selected++;
          const text = pages
            .filter((p) => p.id === 'conclusion')
            .map((p) => p.text)
            .join('');
          expect(text).toContain(
            `selected: ${scene.entities.find((e) => e.id === scene.decision.selectedId)?.label}`,
          );
          if (scene.decision.condition) expect(text).toContain(scene.decision.condition);
          expect(scene.decision.retainedIds).toEqual(scene.entities.map((e) => e.id));
        }
      }
    expect(numeric).toBeGreaterThan(0);
    expect(selected).toBe(2);
  });
  it('never turns absent evidence into false/zero or derives a reward/winner', () => {
    for (const scene of exploreEvidenceTestScenes()) {
      const pages = exploreEvidencePages(scene);
      if (scene.storyId === '31') {
        for (const reward of scene.rewards) {
          const text = pages
            .filter((p) => p.id === reward.id)
            .map((p) => p.text)
            .join('');
          expect(text).toContain(reward.quantity.state);
          if (reward.quantity.state === 'unknown' || reward.quantity.state === 'missing') {
            expect('amount' in reward.quantity).toBe(false);
            expect(text).not.toMatch(/unknown.*; 0 count|missing.*; 0 count/);
          }
          if (reward.quantity.state === 'disputed') {
            expect(text).toContain('alternatives:');
            for (const amount of reward.quantity.alternatives)
              expect(text).toContain(amount.notation);
          } else if ('amount' in reward.quantity)
            expect(text).toContain(reward.quantity.amount.notation);
        }
      } else
        for (const test of scene.tests)
          if (['unknown', 'missing', 'disputed'].includes(test.state)) {
            expect(test.outcome).toBeUndefined();
            expect(pages.find((p) => p.id === test.id)?.text).not.toMatch(/failed|false|negative/);
          }
      expect(pages.at(-1)?.phase).toBe('resolve');
    }
  });
});
