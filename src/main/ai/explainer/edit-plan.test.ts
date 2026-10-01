import { describe, expect, it, vi } from 'vitest';
import {
  parseExplainerEditPlan,
  planExplainerEditPlan,
  planExplainerScenes,
} from '../explainer-scenes';

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      throw new Error('No paid provider');
    }
  },
  ThinkingLevel: {},
}));
const words =
  'Today we tested the idea and learned test the need before building anything new tomorrow'
    .split(' ')
    .map((text, i) => ({ text, start: i * 0.7, end: i * 0.7 + 0.6 }));
const bounds = { minStart: 2, maxEnd: 12 };
const quote = {
  startWord: 7,
  endWord: 11,
  text: 'test the need before building',
  reason: 'takeaway',
};
const metadata = { provider: 'offline' as const, model: 'fixture', configId: 'test', latencyMs: 0 };

describe('complete source-backed edit plans', () => {
  it('supports a quote-only plan without inventing an animation', async () => {
    const result = await planExplainerEditPlan('', words, bounds, {
      profile: 'content-led-codex-v1',
      generator: async (request) => {
        expect(request.prompt).toContain('Optional full-screen emphasis');
        return { text: JSON.stringify({ scenes: [], quotes: [quote] }), metadata };
      },
    });
    expect(result.ok && result.value.scenes).toEqual([]);
    expect(result.ok && result.value.quotes).toHaveLength(1);
  });
  it('invalid quote extras never destroy valid animation cores', () => {
    const raw = {
      scenes: [
        {
          kind: 'statement',
          startWord: 7,
          endWord: 11,
          layout: 'stack',
          words: [
            { text: 'test', word: 7 },
            { text: 'need', word: 9 },
          ],
        },
      ],
      quotes: [{ ...quote, text: 'invented lesson' }],
    };
    const result = parseExplainerEditPlan(raw, words, bounds, { profile: 'content-led-codex-v1' });
    expect(result.scenes).toHaveLength(1);
    expect(result.quotes).toEqual([]);
    expect(result.diagnostics.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ stage: 'quote', action: 'rejected' })]),
    );
  });
  it('keeps the compatible scene-array wrapper and explicitly valid zero quotes', async () => {
    const generator = async () => ({ text: '{"scenes":[],"quotes":[]}', metadata });
    expect(await planExplainerScenes('', words, bounds, { generator })).toEqual({
      ok: true,
      value: [],
    });
    const result = await planExplainerEditPlan('', words, bounds, {
      generator,
      profile: 'content-led-codex-v1',
    });
    expect(result.ok && result.value.quotes).toEqual([]);
  });
});
