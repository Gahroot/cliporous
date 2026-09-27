import { describe, expect, it } from 'vitest';
import type { PlannedExplainerScene } from '../ai/explainer-scenes';
import { fitGroupsToSpeakerRanges, longformLayout } from './explainer-longform';
import type { SceneGroup } from './explainer-scenes';
import { subtractRanges } from './longform-pipeline';

function group(startTime: number, endTime: number, layout: SceneGroup['layout']): SceneGroup {
  const scene: PlannedExplainerScene = {
    startTime,
    endTime,
    scene: { kind: 'stamp', icon: 'Ban', word: 'NEVER', stampAt: startTime + 1 },
    layout,
    chained: false,
    transition: 'grow',
    cues: [],
  };
  return { startTime, endTime, layout, scenes: [scene] };
}

describe('longformLayout', () => {
  it.each([
    ['takeover', 'takeover'],
    ['over', 'over'],
    ['stack', 'over'],
    ['stack-flipped', 'over'],
    ['pip', 'over'],
  ] as const)('%s → %s', (input, expected) => {
    expect(longformLayout(input)).toBe(expected);
  });
});

describe('fitGroupsToSpeakerRanges', () => {
  it('keeps only groups fully inside a speaker range and maps layouts', () => {
    const out = fitGroupsToSpeakerRanges(
      [group(5, 9, 'stack'), group(18, 24, 'takeover'), group(28, 33, 'pip')],
      [
        { start: 0, end: 10 },
        { start: 20, end: 40 },
      ],
    );
    expect(out.map((g) => [g.startTime, g.layout])).toEqual([
      [5, 'over'],
      [28, 'over'],
    ]);
  });
});

describe('subtractRanges', () => {
  it('cuts busy intervals out of speaker ranges', () => {
    expect(
      subtractRanges(
        [
          { start: 0, end: 10 },
          { start: 20, end: 30 },
        ],
        [
          { start: 3, end: 5 },
          { start: 18, end: 22 },
          { start: 29, end: 40 },
        ],
      ),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
      { start: 22, end: 29 },
    ]);
  });
});
