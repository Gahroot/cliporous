import { describe, expect, it } from 'vitest';
import { buildExplainerPrompt, buildReviewPrompt, parseExplainerPlan } from '../explainer-scenes';
import { fundFixture } from './hybrid-test-fixtures';

describe('hybrid draft/review and protected extras', () => {
  it('offers equal presentations and concrete grounding restrictions in both prompt passes', () => {
    const f = fundFixture();
    const bounds = { minStart: 0, maxEnd: 10 };
    for (const prompt of [
      buildExplainerPrompt(f.words, bounds),
      buildReviewPrompt(f.words, [f.raw], bounds),
    ]) {
      expect(prompt).toContain('Diagram and hybrid have equal explanatory standing');
      expect(prompt).toContain('Spirit of Detroit is unavailable');
      expect(prompt).toContain('Unknown is not zero');
      expect(prompt).toContain('no numerical weights');
      expect(prompt).toContain('0.8s final hold');
    }
  });
  it('accepts the real parser path and omits known extras on a protected story', () => {
    const f = fundFixture();
    const result = parseExplainerPlan(
      {
        scenes: [
          {
            ...f.raw,
            layout: 'stack',
            continues: false,
            laterStamp: { text: 'GUARANTEED', word: f.raw.checkWord },
            reactions: [{ word: f.raw.checkWord, strength: 'shake' }],
          },
        ],
      },
      f.words,
      { minStart: 0, maxEnd: 60 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].scene.kind).toBe('fund-flow');
    expect(result[0].scene.overlayStamp).toBeUndefined();
    expect(result[0].scene.pulses).toBeUndefined();
  });
});
