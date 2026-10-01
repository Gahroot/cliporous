import { describe, expect, it } from 'vitest';
import { attentionFixture, tradeoffFixture } from './hybrid-test-fixtures';
import { makeParseContext } from './kind-spec';
import { inferenceTradeoffSpec, tokenAttentionSpec } from './kinds-ai-diagrams';

describe('comparable model metrics', () => {
  for (const preset of ['measured-comparison', 'constraint-choice'])
    for (const mode of ['diagram', 'hybrid'])
      it(`${preset}/${mode}`, () => {
        const f = tradeoffFixture(preset, mode);
        const scene = inferenceTradeoffSpec.parse(f.raw, f.ctx);
        expect(scene, f.ctx.issues.join('; ')).not.toBeNull();
        expect(scene?.metrics.map((m) => m.kind)).toEqual(['cost', 'latency', 'score']);
      });
  for (const change of [
    { basis: 'another test' },
    { task: 'translation' },
    { winner: 'a' },
    { metrics: [] },
    { models: Array(4).fill({ id: 'a', label: 'Model A' }) },
    { constraint: { metric: 'cost', maximum: 0.5, unit: 'USD/task', selectedId: 'b' } },
  ])
    it(`rejects ${JSON.stringify(change)}`, () => {
      const f = tradeoffFixture('constraint-choice');
      expect(inferenceTradeoffSpec.parse({ ...f.raw, ...change }, f.ctx)).toBeNull();
    });
  it('rejects metric units from a different benchmark', () => {
    const f = tradeoffFixture();
    const words = f.words.map((word) => ({
      ...word,
      text: word.text === 'ms/task.' ? 'seconds/task.' : word.text,
    }));
    expect(inferenceTradeoffSpec.parse(f.raw, makeParseContext(words, f.ctx.win))).toBeNull();
  });
});

describe('illustrative word relationships', () => {
  for (const preset of ['reference-link', 'context-link'])
    for (const mode of ['diagram', 'hybrid'])
      it(`${preset}/${mode}`, () => {
        const f = attentionFixture(preset, mode);
        const scene = tokenAttentionSpec.parse(f.raw, f.ctx);
        expect(scene, f.ctx.issues.join('; ')).not.toBeNull();
        expect(scene?.tokens[4].text).toBe('It');
        expect(scene?.tokens[3].text).toBe('shop.');
      });
  for (const change of [
    { weights: [0.8, 0.2] },
    { evidence: 'source-stated' },
    { targetIndex: 1 },
    { contextIndex: 7 },
    { contextIndex: 0 },
    { targetIndex: 99 },
    { svg: '<path/>' },
    { sentence: 'A fabricated sentence.' },
    { outcome: 'The model understands' },
  ]) {
    it(`rejects ${JSON.stringify(change)}`, () => {
      const f = attentionFixture();
      expect(tokenAttentionSpec.parse({ ...f.raw, ...change }, f.ctx)).toBeNull();
    });
  }
});
