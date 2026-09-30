import { describe, expect, it } from 'vitest';
import {
  type PlannerWord,
  parseExplainerPlan,
  parsePlanWithDiagnostics,
} from '../explainer-scenes';

function conveyorInput(): {
  words: PlannerWord[];
  bounds: { minStart: number; maxEnd: number };
  raw: unknown;
} {
  const words: PlannerWord[] =
    'The conveyor belt carries parcels while the gate stays open and the order moves forward cleanly'
      .split(' ')
      .map((text, i) => ({ text, start: 10 + i * 0.4, end: 10.35 + i * 0.4 }));
  return {
    words,
    bounds: { minStart: 8, maxEnd: 30 },
    raw: {
      scenes: [
        {
          kind: 'hero',
          prop: 'conveyor',
          label: 'Conveyor belt',
          word: 1,
          startWord: 0,
          endWord: words.length - 1,
          layout: 'stack',
          reactions: [{ word: 7, strength: 'shake' }],
          annotation: { kind: 'circle', word: 6 },
          laterStamp: { text: 'OPEN', word: 9 },
          dimWord: 12,
        },
      ],
    },
  };
}

describe('causal hero restraint at the planner boundary', () => {
  it('keeps the hero but omits competing effects and reports why', () => {
    const { raw, words, bounds } = conveyorInput();
    const result = parsePlanWithDiagnostics(raw, words, bounds);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    const scene = result.accepted[0]?.scene;
    expect(scene).toMatchObject({ kind: 'hero', prop: 'conveyor', label: 'Conveyor belt' });
    expect(scene?.pulses).toBeUndefined();
    expect(scene?.annotation).toBeUndefined();
    expect(scene?.overlayStamp).toBeUndefined();
    expect(scene?.dimAt).toBeUndefined();
    expect(result.omitted[0]?.problems.join(' ')).toContain('own their emphasis');
  });

  it('does not re-inject fallback pulses after validation', () => {
    const { raw, words, bounds } = conveyorInput();
    const scenes = parseExplainerPlan(raw, words, bounds, { emphasisTimes: [10.8, 11.6, 12.4] });
    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.scene.pulses).toBeUndefined();
  });
});
