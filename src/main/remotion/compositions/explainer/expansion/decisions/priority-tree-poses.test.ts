import { describe, expect, it } from 'vitest';
import {
  priorityTreeAnchors,
  priorityTreeLines,
  priorityTreePages,
  priorityTreePose,
} from './priority-tree-poses';
import { parsePriorityTree, priorityTreeFixtures } from './priority-tree-test-fixtures';

describe('priority/tree real source parser and seekable poses', () => {
  for (const [index, fixture] of priorityTreeFixtures().entries()) {
    it(`${fixture.id}/${index}: accepted in both modes, every authored frame and page`, () => {
      const scene = parsePriorityTree(fixture);
      expect(parsePriorityTree(fixture, 'hybrid')).toEqual({ ...scene, visualMode: 'hybrid' });
      const pages = priorityTreePages(scene);
      expect(new Set(pages.map((p) => p.id)).size).toBe(pages.length);
      const poses = Array.from({ length: 361 }, (_, frame) => priorityTreePose(scene, frame / 30));
      const seen = new Set(poses.map((p) => p.page));
      expect(seen.size).toBe(pages.length);
      for (const [frame, pose] of poses.entries()) {
        expect(Object.values(pose).every(Number.isFinite)).toBe(true);
        expect(pose.page).toBeGreaterThanOrEqual(0);
        expect(pose.page).toBeLessThan(pages.length);
        expect(priorityTreePose(scene, frame / 30)).toEqual(pose);
      }
      for (let i = 0; i < poses.length; i++) {
        const frame = (i * 137) % poses.length;
        expect(priorityTreePose(scene, frame / 30)).toEqual(poses[frame]);
      }
      for (const t of [NaN, Infinity, -Infinity])
        expect(priorityTreePose(scene, t)).toEqual(priorityTreePose(scene, scene.setupAt - 1));
      expect(priorityTreePose(scene, 12)).toEqual(priorityTreePose(scene, scene.resolveAt + 0.25));
      for (const p of pages)
        for (const value of [p.title, p.context, p.text])
          expect(priorityTreeLines(value).join('')).toBe(value);
      if (scene.storyId === '27') {
        expect(scene.effects).toHaveLength(scene.criteria.length * 2);
        expect(pages.filter((p) => p.id.startsWith('score/')).length > 0).toBe(
          scene.scores.length > 0,
        );
        for (const c of scene.criteria) {
          const weightPages = pages.filter((p) => p.id.startsWith(`weight/${c.entityId}/`));
          expect(weightPages.length > 0).toBe(c.weight !== undefined);
          if (c.weight && (c.weight.state === 'unknown' || c.weight.state === 'missing')) {
            expect(weightPages.some((p) => p.context === 'source amount')).toBe(false);
            expect(weightPages.find((p) => p.context === 'state')?.text).toBe(c.weight.state);
          }
        }
        if (scene.priorities) {
          const anchors = priorityTreeAnchors(scene);
          expect(anchors.filter((a) => a.marker === 'before').map((a) => a.id)).toEqual(
            scene.priorities.before.order,
          );
          expect(anchors.filter((a) => a.marker === 'after').map((a) => a.id)).toEqual(
            scene.priorities.after.order,
          );
        }
      } else {
        expect(priorityTreeAnchors(scene).map((a) => a.id)).toEqual(
          scene.nodes.map((n) => n.entityId),
        );
        for (const branch of scene.branches)
          expect(pages.find((p) => p.id === `branch/${branch.fromId}/${branch.toId}`)?.text).toBe(
            branch.test,
          );
        expect(scene.branches).toHaveLength(scene.nodes.length - 1);
      }
      expect(pages.at(-1)?.text).toBe(scene.resolutionText);
      expect(pages.at(-1)?.context).toBe(scene.resolution.state);
    });
  }
});
