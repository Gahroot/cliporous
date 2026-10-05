import { expect, it } from 'vitest';
import { SectionUnfoldModels } from './section-unfold-models';
import { cubeFaceVertices, sectionUnfoldPages, sectionUnfoldPose } from './section-unfold-poses';
import {
  sectionAccepted,
  sectionCases,
  sectionMeshWorldVertices,
} from './section-unfold-test-fixtures';

for (const story of sectionCases)
  it(`five-beat deterministic finite seeks and source reachability ${story.id}/${story.name}`, () => {
    const scene = sectionAccepted(story);
    const pages = sectionUnfoldPages(scene);
    const frames = Math.ceil(story.window.endTime * 30);
    const seen = new Set<number>();
    const poses = Array.from({ length: frames + 1 }, (_, f) => {
      const p = sectionUnfoldPose(scene, f / 30, pages);
      seen.add(p.page);
      for (const n of [p.reveal, p.action, p.response, p.check, p.resolve, p.sweep, p.fold])
        expect(Number.isFinite(n) && n >= 0 && n <= 1).toBe(true);
      return p;
    });
    expect(seen.size).toBe(pages.length);
    expect(pages.length).toBeLessThanOrEqual(Math.floor((scene.resolveAt - scene.setupAt) * 30));
    for (let f = frames; f >= 0; f--)
      expect(sectionUnfoldPose(scene, f / 30, pages)).toEqual(poses[f]);
    for (const f of [frames, 0, 17, 8, frames, 17, 0])
      expect(sectionUnfoldPose(scene, f / 30, pages)).toEqual(poses[f]);
    for (const t of [NaN, Infinity, -Infinity])
      expect(sectionUnfoldPose(scene, t, pages)).toEqual(
        sectionUnfoldPose(scene, scene.setupAt, pages),
      );
    expect(sectionUnfoldPose(scene, story.window.endTime + 10, pages)).toEqual(
      sectionUnfoldPose(scene, story.window.endTime + 100, pages),
    );
    expect(sectionUnfoldPages(sectionAccepted(story, 'hybrid'))).toEqual(pages);
    for (const page of pages) {
      expect(page.lines.length).toBeLessThanOrEqual(14);
      expect(page.lines.every((l) => Array.from(l).length <= 18)).toBe(true);
    }
    if (scene.storyId === '58' && !('value' in scene.correspondence))
      expect(poses.every((p) => p.correspondenceIds.length === 0)).toBe(true);
    if (scene.storyId === '57') {
      const final = poses[frames];
      for (const p of scene.parts) {
        if (!('value' in p))
          expect([...final.visibleIds, ...final.revealedIds]).not.toContain(p.id);
        else if (
          p.id === scene.section.partId &&
          'value' in scene.section &&
          scene.section.value === 'intersects' &&
          'value' in scene.result &&
          scene.result.value === 'revealed'
        )
          expect(final.revealedIds).toContain(p.id);
      }
    }
  });

for (const story of sectionCases.filter((s) => s.id === '58'))
  it(`actual parent FK all six faces/all frames ${story.name}`, () => {
    const scene = sectionAccepted(story, 'hybrid');
    if (scene.storyId !== '58') throw new Error('Expected unfold');
    const pages = sectionUnfoldPages(scene);
    const times = [
      ...Array.from({ length: Math.ceil(story.window.endTime * 30) + 1 }, (_, f) => f / 30),
      NaN,
      Infinity,
      -Infinity,
      -10,
      100,
    ];
    for (const time of times) {
      const pose = sectionUnfoldPose(scene, time, pages);
      const tree = SectionUnfoldModels({
        scene,
        pose,
        colors: { surface: '#eee', text: '#222', accent: '#987', muted: '#777' },
      });
      const vertices = sectionMeshWorldVertices(tree);
      expect(vertices.size).toBe(6);
      for (const face of scene.faces) {
        const actual = vertices.get(face.id);
        if (!actual) throw new Error(`Missing actual mesh ${face.id}`);
        const expected = cubeFaceVertices(face.face, pose.fold).map(([x, y, z]) => [
          x * 1.25,
          y * 1.25 - 0.4,
          z * 1.25,
        ]);
        for (let i = 0; i < 4; i++)
          for (let axis = 0; axis < 3; axis++)
            expect(actual[i][axis]).toBeCloseTo(expected[i][axis], 12);
      }
    }
  });
