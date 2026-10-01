import { describe, expect, it, vi } from 'vitest';

const paid = vi.hoisted(() => ({ construct: vi.fn(), call: vi.fn() }));
vi.mock('@google/genai', () => ({ GoogleGenAI: paid.construct, ThinkingLevel: {} }));
vi.mock('../gemini-client', () => ({
  MODELS: { BALANCED: ['test-gemini'] },
  callGeminiWithRetry: paid.call,
}));

import { planExplainerScenes } from '../explainer-scenes';
import type { PlannerGenerator } from './planner-generation';

const words = 'One two three four five six seven eight nine ten'
  .split(' ')
  .map((text, i) => ({ text, start: i, end: i + 0.8 }));
const bounds = { minStart: 2, maxEnd: 12 };

describe('injected planner completion', () => {
  it('uses real parsing without constructing Gemini or needing a key', async () => {
    const generate: PlannerGenerator = vi.fn(async () => ({
      text: '{"scenes":[]}',
      metadata: { provider: 'offline', model: 'fixture', configId: 'test', latencyMs: 0 },
    }));
    const result = await planExplainerScenes('', words, bounds, { generator: generate });
    expect(result).toEqual({ ok: true, value: [] });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(paid.construct).not.toHaveBeenCalled();
    expect(paid.call).not.toHaveBeenCalled();
  });
  it('never falls back to a paid provider on injected failure', async () => {
    const result = await planExplainerScenes('', words, bounds, {
      generator: async () => {
        throw new Error('subscription limit');
      },
    });
    expect(result).toEqual({ ok: false, error: 'subscription limit' });
    expect(paid.construct).not.toHaveBeenCalled();
    expect(paid.call).not.toHaveBeenCalled();
  });
  it('does not start a request after cancellation', async () => {
    const generate = vi.fn();
    const signal = AbortSignal.abort();
    const result = await planExplainerScenes('', words, bounds, { generator: generate, signal });
    expect(result.ok).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
});
