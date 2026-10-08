import { describe, expect, it } from 'vitest';
import type { LongformScenePlacement } from '../../../shared/longform-scenes';
import { arbitrateStoryboards, storyboardPolicyProblem } from './arbitration';

function scene(
  id: string,
  startTime: number,
  endTime: number,
  kind = 'storyboard',
  omitted = false,
): LongformScenePlacement {
  return {
    id,
    kind,
    startTime,
    endTime,
    startWord: 0,
    endWord: 10,
    sectionId: id,
    presentation: 'full-frame',
    sourceSpec: {},
    label: id,
    purpose: id,
    omitted,
  };
}
function arbitrate(
  proposals: LongformScenePlacement[],
  ordinary: LongformScenePlacement[] = [],
  protectedScenes: LongformScenePlacement[] = [],
  duration = 1000,
) {
  return arbitrateStoryboards({ proposals, ordinary, protectedScenes, duration });
}

describe('global source-order storyboard arbitration', () => {
  it.each([
    ['selective', 1, 0.3, 10],
    ['balanced', 2, 0.45, 6],
    ['continuous', 3, 0.6, 3],
  ] as const)('enforces shared %s count, coverage and frame-safe separation', (editCadence, count, coverage, separation) => {
    const short = Array.from({ length: count }, (_, i) => scene(`s${i}`, i * 20, i * 20 + 4));
    expect(storyboardPolicyProblem(short, 90, editCadence)).toBeNull();
    expect(storyboardPolicyProblem([...short, scene('extra', 80, 84)], 90, editCadence)).toContain(
      'count',
    );
    expect(
      storyboardPolicyProblem([scene('coverage', 0, coverage * 100)], 100, editCadence),
    ).toBeNull();
    expect(
      storyboardPolicyProblem([scene('coverage', 0, coverage * 100 + 0.001)], 100, editCadence),
    ).toContain('coverage');
    const a = scene('a', 0, 4);
    const b = scene('b', 4 + separation, 8 + separation);
    expect(storyboardPolicyProblem([a, b], 100, editCadence)).toBeNull();
    expect(
      storyboardPolicyProblem([a, { ...b, startTime: b.startTime - 0.001 }], 100, editCadence),
    ).toContain('separation');
    expect(
      arbitrateStoryboards({
        ordinary: [],
        proposals: [b, a],
        protectedScenes: [],
        duration: 100,
        editCadence,
      }).scenes,
    ).toEqual([a, b]);
  });
  it('fully replaces a contained ordinary story with an explicit diagnostic record', () => {
    const board = scene('board', 0, 20);
    const ordinary = scene('story', 2, 12, 'hero');
    const result = arbitrate([board], [ordinary]);
    expect(result.scenes).toEqual([board]);
    expect(result.replacements).toEqual([
      { boardId: 'board', sceneId: 'story', sectionId: 'story' },
    ]);
  });
  it('declines partial overlaps on either side without shortening any story', () => {
    const story = scene('story', 10, 20, 'hero');
    for (const board of [scene('left', 5, 15), scene('right', 15, 25)]) {
      const result = arbitrate([board], [story]);
      expect(result.scenes).toEqual([story]);
      expect(result.diagnostics[0].message).toContain('Partial overlap');
    }
  });
  it('preserved and omitted decisions win even over fully containing proposals', () => {
    for (const omitted of [false, true]) {
      const protectedScene = scene('protected', 5, 10, 'hero', omitted);
      expect(arbitrate([scene('board', 0, 20)], [], [protectedScene]).scenes).toEqual([
        protectedScene,
      ]);
      expect(
        arbitrate([scene('board', 0, 20)], [scene('ordinary', 5, 10, 'hero', true)]).scenes,
      ).toHaveLength(1);
    }
  });
  it('selects in source order independent of proposal completion and enforces >=10sec separation', () => {
    const a = scene('a', 0, 5);
    const b = scene('b', 14.999, 20);
    const c = scene('c', 15, 20);
    const first = arbitrate([c, b, a]);
    const second = arbitrate([a, b, c]);
    expect(first).toEqual(second);
    expect(first.scenes.map((s) => s.id)).toEqual(['a', 'c']);
  });
  it('caps short sources at one; omissions consume no count/coverage/separation budget', () => {
    const omitted = scene('omitted', 0, 40, 'storyboard', true);
    const a = scene('a', 41, 46);
    const b = scene('b', 60, 65);
    expect(arbitrate([b, a], [], [omitted], 90).scenes).toEqual([omitted, a]);
    expect(storyboardPolicyProblem([omitted, a], 90)).toBeNull();
  });
  it('caps long sources at 30% coverage with outward frame-safe accounting', () => {
    const a = scene('a', 0, 20);
    const b = scene('b', 30, 40);
    const c = scene('c', 60, 64);
    expect(arbitrate([c, b, a], [], [], 100).scenes).toEqual([a, b]);
    expect(storyboardPolicyProblem([a, b, c], 100)).toContain('coverage');
  });
  it('caps accepted boards at 32, reserves protected budget, and rejects duplicate identities', () => {
    const candidates = Array.from({ length: 34 }, (_, i) => scene(`b${i}`, i * 15, i * 15 + 4));
    const protectedBoard = scene('saved', 900, 905);
    const result = arbitrate([...candidates, candidates[0]], [], [protectedBoard], 2000);
    expect(result.scenes).toHaveLength(32);
    expect(result.scenes).toContainEqual(protectedBoard);
    expect(result.diagnostics.some((d) => d.message.includes('Duplicate'))).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('count'))).toBe(true);
  });
});
