import { describe, expect, it } from 'vitest';
import {
  parseExpansionSetOperations,
  parseExpansionTopology,
} from '../../../../../ai/explainer/expansion-relationships-sets-topology-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { setsTopologyPages, setsTopologyPose } from './sets-topology-poses';
import {
  acceptedSetsTopology,
  packet,
  setsTopologyCases,
  setsTopologyFixture,
} from './sets-topology-test-fixtures';

describe('sets/topology source semantics and seekable five beats', () => {
  it('accepts raw sources and all real caps/states, never computes a selection or applies a failure', () => {
    const scenes = setsTopologyCases();
    expect(
      Math.max(...scenes.filter((s) => s.storyId === '39').map((s) => s.memberships.length)),
    ).toBe(12);
    for (const scene of scenes) {
      if (scene.storyId === '39') {
        expect(scene.entities.length).toBeLessThanOrEqual(8);
        if (scene.selection.state === 'unresolved')
          expect(scene.selection).not.toHaveProperty('memberIds');
      } else {
        expect(scene.edges.length).toBeLessThanOrEqual(scene.template === 'chain' ? 3 : 4);
        expect(scene.failure.state).toBe('conditional');
        const before = JSON.stringify(scene.edges);
        setsTopologyPose(scene, 100);
        expect(JSON.stringify(scene.edges)).toBe(before);
      }
    }
    const unresolved = acceptedSetsTopology(packet.stories[0]);
    expect(unresolved.storyId === '39' && unresolved.selection.state).toBe('unresolved');
    const exclusion = acceptedSetsTopology(setsTopologyFixture('39', 'known', 'exclusion'));
    expect(
      exclusion.storyId === '39' &&
        exclusion.selection.state === 'complete' &&
        exclusion.selection.memberIds,
    ).toEqual([]);
  });
  it('every frame, shuffled/repeated seeks, nonfinite input and final holds are deterministic', () => {
    for (const scene of setsTopologyCases()) {
      const snapshot = JSON.stringify(scene);
      const expected = Array.from({ length: 361 }, (_, f) =>
        JSON.stringify(setsTopologyPose(scene, f / 30)),
      );
      for (let i = 0; i < expected.length; i++) {
        const f = (i * 97) % expected.length;
        expect(JSON.stringify(setsTopologyPose(scene, f / 30))).toBe(expected[f]);
        expect(JSON.stringify(setsTopologyPose(scene, f / 30))).toBe(expected[f]);
      }
      for (const t of [NaN, Infinity, -Infinity])
        expect(setsTopologyPose(scene, t)).toEqual(setsTopologyPose(scene, scene.setupAt));
      expect(setsTopologyPose(scene, scene.resolveAt + 0.79)).toEqual(setsTopologyPose(scene, 100));
      const pages = setsTopologyPages(scene);
      for (let i = 0; i < pages.length; i++)
        expect(
          setsTopologyPose(
            scene,
            scene.setupAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt),
          ).page,
        ).toBe(i);
      expect(JSON.stringify(scene)).toBe(snapshot);
    }
  });
  it('rejects fabricated selection, conditional failure rewrite, and unprovided template links', () => {
    for (const story of packet.stories)
      for (const negative of story.negatives) {
        const ctx = makeParseContext(
          negative.words ?? story.words,
          negative.window ?? story.window,
        );
        expect(
          story.id === '39'
            ? parseExpansionSetOperations(negative.proposal, ctx)
            : parseExpansionTopology(negative.proposal, ctx),
          negative.name,
        ).toBeNull();
      }
    const story = setsTopologyFixture('40', 'known', 'intersection', 'diamond', 6, true);
    const scene = acceptedSetsTopology(story);
    expect(scene.storyId === '40' && scene.edges.length).toBe(2);
    const failure = story.proposal.failure;
    if (typeof failure !== 'object' || failure === null) throw new Error('Missing test failure');
    const ctx = makeParseContext(story.words, story.window);
    expect(
      parseExpansionTopology({ ...story.proposal, failure: { ...failure, effect: 'absent' } }, ctx),
    ).toBeNull();
  });
});
