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
  it('rejects raw short-form statements with a reviewable policy reason', () => {
    const result = parseExplainerEditPlan(
      {
        scenes: [
          {
            kind: 'statement',
            startWord: 7,
            endWord: 11,
            layout: 'stack',
            words: [{ text: 'test', word: 7 }],
          },
        ],
        quotes: [quote],
      },
      words,
      bounds,
      { profile: 'content-led-codex-v1' },
    );
    expect(result.scenes).toEqual([]);
    expect(result.quotes).toEqual([]);
    expect(result.diagnostics.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'policy',
          kind: 'statement',
          reason: 'short-form-redundant-text',
        }),
        expect.objectContaining({ stage: 'quote', reason: 'short-form-redundant-text' }),
      ]),
    );
  });

  it('preserves longform statement and optional quote behavior', () => {
    const result = parseExplainerEditPlan(
      {
        scenes: [
          {
            kind: 'statement',
            startWord: 3,
            endWord: 5,
            layout: 'stack',
            words: [{ text: 'idea', word: 4 }],
          },
        ],
        quotes: [quote],
      },
      words,
      bounds,
      { aspect: '16:9', profile: 'content-led-codex-v1' },
    );
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]?.scene.kind).toBe('statement');
    expect(result.quotes).toHaveLength(1);
  });

  it('keeps a source-attributed quote that adds factual context', () => {
    const source = 'Remember this idea Naval said test the need before building Naval Ravikant'
      .split(' ')
      .map((text, i) => ({ text, start: i * 0.7, end: i * 0.7 + 0.6 }));
    const result = parseExplainerEditPlan(
      {
        scenes: [
          {
            kind: 'quote',
            startWord: 0,
            endWord: 11,
            layout: 'stack',
            text: 'test the need before building',
            author: 'Naval',
            word: 5,
            authorWord: 10,
          },
        ],
      },
      source,
      { minStart: 0, maxEnd: 9 },
      { profile: 'content-led-codex-v1' },
    );
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]?.scene).toMatchObject({ kind: 'quote', author: 'Naval' });
  });

  it('asks review to omit redundant statements rather than restyle the repeated speech', async () => {
    const phases: string[] = [];
    const result = await planExplainerEditPlan('', words, bounds, {
      profile: 'content-led-codex-v1',
      generator: async (request) => {
        phases.push(request.phase);
        if (request.phase === 'review') {
          expect(request.prompt).toContain('short-form-redundant-text');
          expect(request.prompt).toContain('do not repackage the speech as a quote or headline');
          return { text: '{"scenes":[]}', metadata };
        }
        return {
          text: JSON.stringify({
            scenes: [
              {
                kind: 'statement',
                startWord: 7,
                endWord: 11,
                layout: 'stack',
                words: [{ text: 'test', word: 7 }],
              },
            ],
          }),
          metadata,
        };
      },
    });
    expect(phases).toEqual(['draft', 'review']);
    expect(result).toMatchObject({ ok: true, value: { scenes: [], quotes: [] } });
  });
  it('omits quote-only short-form plans without inventing an animation', async () => {
    const result = await planExplainerEditPlan('', words, bounds, {
      profile: 'content-led-codex-v1',
      generator: async (request) => {
        expect(request.prompt).not.toContain('Optional full-screen emphasis');
        return { text: JSON.stringify({ scenes: [], quotes: [quote] }), metadata };
      },
    });
    expect(result.ok && result.value.scenes).toEqual([]);
    expect(result.ok && result.value.quotes).toEqual([]);
  });
  it('invalid quote extras never destroy valid animation cores', () => {
    const raw = {
      scenes: [
        {
          kind: 'stack',
          startWord: 7,
          endWord: 11,
          layout: 'stack',
          layers: [
            { label: 'test', word: 7 },
            { label: 'need', word: 9 },
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
