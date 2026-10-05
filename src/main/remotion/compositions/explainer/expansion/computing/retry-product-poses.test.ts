import { describe, expect, it } from 'vitest';
import {
  retryProductAmount,
  retryProductPages,
  retryProductPose,
  retryProductWrap,
} from './retry-product-poses';
import { retryProductCases } from './retry-product-test-fixtures';

describe('source-only retry and neutral product poses', () => {
  it('accepts original and independent paraphrases, every state and real maximum caps', () => {
    const scenes = retryProductCases();
    expect(scenes.length).toBeGreaterThanOrEqual(20);
    expect(new Set(scenes.map((s) => s.storyId))).toEqual(new Set(['67', '68']));
    expect(new Set(scenes.map((s) => s.records[2].state))).toEqual(
      new Set([
        'stated',
        'unknown',
        'missing',
        'disputed',
        'conditional',
        'simulated',
        'illustrative',
      ]),
    );
    const max = scenes.filter((s) => s.quantities.length === 7);
    expect(max).toHaveLength(2);
    for (const s of max) {
      expect(s.records).toHaveLength(5);
      expect(s.entities).toHaveLength(2);
      expect(s.relations).toHaveLength(5);
      expect(s.records[0].claim).toHaveLength(48);
      expect(s.records[0].value).toHaveLength(64);
      const exact = s.quantities.flatMap((q) =>
        'amount' in q ? [retryProductAmount(q.amount)] : [],
      );
      expect(exact.join('|')).toContain('-1000000000/1');
      expect(exact.join('|')).toContain('1/1000000000');
      expect(exact.join('|')).toContain('0.000001 = 1/1000000');
    }
  });
  for (let index = 0; index < 34; index++)
    it(`pure finite reachable source pages ${index}`, () => {
      const scene = retryProductCases()[index];
      if (!scene) throw new Error('Missing accepted source case');
      const before = structuredClone(scene),
        pages = retryProductPages(scene),
        visited = new Set<number>();
      for (let frame = 0; frame <= 360; frame++) {
        const pose = retryProductPose(scene, frame / 30);
        visited.add(pose.page);
        for (const n of [pose.reveal, pose.action, pose.response, pose.check, pose.resolve]) {
          expect(Number.isFinite(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(1);
        }
      }
      expect(visited.size).toBe(pages.length);
      for (const page of pages) {
        expect(page.lines.length).toBeLessThanOrEqual(12);
        expect(page.lines.every((line) => Array.from(line).length <= 18)).toBe(true);
      }
      for (const id of new Set(pages.map((p) => p.id))) {
        const parts = pages.filter((p) => p.id === id);
        expect(parts.flatMap((p) => p.lines).join('')).toBe(parts[0].fields.join(''));
      }
      const times = [
        NaN,
        Infinity,
        -Infinity,
        -100,
        scene.setupAt,
        scene.actionAt - 1 / 30,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        scene.resolveAt + 0.8,
        100,
      ];
      const poses = times.map((t) => retryProductPose(scene, t));
      for (const i of [11, 2, 6, 0, 8, 1, 10, 3, 9, 4, 7, 5])
        expect(retryProductPose(scene, times[i])).toEqual(poses[i]);
      expect(poses[0]).toEqual(poses[1]);
      expect(poses[1]).toEqual(poses[2]);
      expect(poses[9].page).toBe(pages.length - 1);
      expect(poses[10].page).toBe(pages.length - 1);
      expect(scene).toEqual(before);
      expect(retryProductWrap(' W W  exact ').join('')).toBe(' W W  exact ');
    });
});
