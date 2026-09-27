import { describe, expect, it } from 'vitest';
import { type PlannerWord, parseExplainerPlan, toSceneRelative } from './explainer-scenes';

/** 40 words, one every 0.5s starting at t=10 (source-absolute time). */
function words(count = 40, start = 10): PlannerWord[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `w${i}`,
    start: start + i * 0.5,
    end: start + i * 0.5 + 0.4,
  }));
}

const BOUNDS = { minStart: 12, maxEnd: 30 };

describe('parseExplainerPlan', () => {
  it('maps word indices to exact word times for a checklist', () => {
    const w = words();
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'checklist',
            startWord: 6,
            endWord: 16,
            items: [
              { label: 'Rebuild the deal', icon: 'FileText', word: 8 },
              { label: 'Compare sources', icon: 'Search', word: 12 },
            ],
          },
        ],
      },
      w,
      BOUNDS,
    );

    expect(plan).toHaveLength(1);
    const [scene] = plan;
    expect(scene?.startTime).toBeCloseTo(13 - 0.25);
    expect(scene?.endTime).toBeCloseTo(18.4 + 0.35);
    expect(scene?.layout).toBe('stack');
    expect(scene?.chained).toBe(false);
    expect(scene?.cues.map((c) => c.kind)).toEqual(['slide', 'tick', 'tick']);
    expect(scene?.scene).toEqual({
      kind: 'checklist',
      items: [
        { label: 'Rebuild the deal', icon: 'FileText', doneAt: 14 },
        { label: 'Compare sources', icon: 'Search', doneAt: 16 },
      ],
    });
  });

  it('replaces unknown icons, uppercases stamps, and drops invalid scenes', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'stamp',
            startWord: 6,
            endWord: 14,
            icon: 'NotAnIcon',
            word: 'never',
            stampWord: 9,
            strikeWord: null,
          },
          {
            kind: 'checklist',
            startWord: 20,
            endWord: 30,
            items: [{ label: 'only one', icon: 'Check', word: 22 }],
          },
          { kind: 'hologram', startWord: 32, endWord: 38 },
          { kind: 'versus', startWord: 30, endWord: 20, left: {}, right: {} },
        ],
      },
      words(),
      BOUNDS,
    );

    expect(plan).toHaveLength(1);
    expect(plan[0]?.scene).toEqual({ kind: 'stamp', icon: 'Circle', word: 'NEVER', stampAt: 14.5 });
  });

  it('rejects labels over the length cap and beats outside the scene', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'versus',
            startWord: 6,
            endWord: 16,
            left: { label: 'x'.repeat(40), icon: 'Bot', word: 8 },
            right: { label: 'People', icon: 'Users', word: 12 },
          },
          {
            kind: 'versus',
            startWord: 20,
            endWord: 30,
            left: { label: 'AI', icon: 'Bot', word: 22 },
            right: { label: 'People', icon: 'Users', word: 35 },
          },
        ],
      },
      words(),
      BOUNDS,
    );
    expect(plan).toEqual([]);
  });

  it('clamps the start to minStart and applies variety rules (no repeat kind, gap)', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'stamp',
            startWord: 0,
            endWord: 12,
            icon: 'Ban',
            word: 'Stop',
            stampWord: 8,
            strikeWord: 10,
          },
          {
            kind: 'stamp',
            startWord: 14,
            endWord: 22,
            icon: 'Ban',
            word: 'Again',
            stampWord: 16,
            strikeWord: null,
          },
          {
            kind: 'stamp',
            startWord: 24,
            endWord: 34,
            icon: 'Zap',
            word: 'Yes',
            stampWord: 26,
            strikeWord: null,
          },
        ],
      },
      words(),
      BOUNDS,
    );

    // 2nd stamp is too close AND a repeat kind; 3rd is a repeat of the kept 1st
    // (same kind back-to-back after the drop) — only the first survives.
    expect(plan.map((p) => p.startTime)).toEqual([12]);
    expect(plan[0]?.scene).toMatchObject({ stampAt: 14, strikeAt: 15 });
  });

  it('keeps beats chronological and orders flow output after input', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'flow',
            startWord: 6,
            endWord: 20,
            inputLabel: 'Prompt',
            inputText: 'Closed deal',
            engineLabel: 'AI',
            outputLabel: 'Answer',
            outputText: 'Delivery plan',
            inputWord: 10,
            outputWord: 10,
          },
        ],
      },
      words(),
      BOUNDS,
    );
    expect(plan[0]?.scene).toMatchObject({ kind: 'flow', inputAt: 15, outputAt: 16 });
  });

  it('returns nothing for malformed responses', () => {
    expect(parseExplainerPlan(null, words(), BOUNDS)).toEqual([]);
    expect(parseExplainerPlan({ scenes: 'nope' }, words(), BOUNDS)).toEqual([]);
    expect(parseExplainerPlan({ scenes: [] }, [], BOUNDS)).toEqual([]);
  });
});

/** Long clip so the 55% coverage budget never interferes. */
const WIDE = { minStart: 12, maxEnd: 60 };

describe('parseExplainerPlan v2 extras', () => {
  it('snaps a continuing scene onto the previous one and keeps the shared layout', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'stamp',
            startWord: 6,
            endWord: 14,
            layout: 'stack',
            icon: 'Ban',
            word: 'never',
            stampWord: 9,
            strikeWord: null,
          },
          {
            kind: 'stack',
            startWord: 15,
            endWord: 26,
            layout: 'stack',
            continues: true,
            transition: 'slide',
            layers: [
              { label: 'Tools', word: 17 },
              { label: 'Workflow', word: 20 },
            ],
            dimWord: null,
          },
        ],
      },
      words(100),
      WIDE,
    );
    expect(plan).toHaveLength(2);
    expect(plan[1]?.chained).toBe(true);
    expect(plan[1]?.transition).toBe('slide');
    expect(plan[1]?.startTime).toBeCloseTo(plan[0]?.endTime ?? 0);
  });

  it('parses laterStamp, dimWord and reactions into scene extras', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'flow',
            startWord: 6,
            endWord: 30,
            layout: 'stack',
            inputLabel: 'Prompt',
            inputText: 'Closed deal',
            engineLabel: 'AI',
            outputLabel: 'Answer',
            outputText: 'Delivery plan',
            inputWord: 8,
            outputWord: 12,
            laterStamp: { text: 'Yes, but', word: 20 },
            dimWord: 26,
            reactions: [{ word: 14, item: 1, strength: 'pulse' }],
          },
        ],
      },
      words(100),
      WIDE,
    );
    expect(plan[0]?.scene).toMatchObject({
      overlayStamp: { word: 'YES, BUT', at: 20 },
      dimAt: 23,
      pulses: [{ at: 17, target: 1, strength: 'pulse' }],
    });
    expect(plan[0]?.cues.some((c) => c.kind === 'thump' && c.at > 20)).toBe(true);
  });

  it('falls back to the preferred layout when the model picks one the kind does not allow', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'checklist',
            startWord: 6,
            endWord: 16,
            layout: 'takeover',
            items: [
              { label: 'One', icon: 'Check', word: 8 },
              { label: 'Two', icon: 'Check', word: 12 },
            ],
          },
        ],
      },
      words(100),
      WIDE,
    );
    expect(plan[0]?.layout).toBe('stack');
  });
});

describe('toSceneRelative', () => {
  it('shifts every beat to scene-relative seconds', () => {
    expect(
      toSceneRelative(
        {
          kind: 'stack',
          layers: [
            { label: 'A', at: 12.5 },
            { label: 'B', at: 13.25 },
          ],
          dimAt: 15,
        },
        12,
      ),
    ).toEqual({
      kind: 'stack',
      layers: [
        { label: 'A', at: 0.5 },
        { label: 'B', at: 1.25 },
      ],
      dimAt: 3,
    });
  });
});
