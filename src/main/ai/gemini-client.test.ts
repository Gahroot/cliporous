import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { callGeminiWithRetry, MODELS, resolveGeminiConfig } from './gemini-client';

describe('Gemini cancellation compatibility', () => {
  it('passes the signal and never retries or falls back after cancellation', async () => {
    const ai = new GoogleGenAI({ apiKey: 'unused-test-key' });
    const controller = new AbortController();
    const generate = vi.spyOn(ai.models, 'generateContent').mockImplementation(async () => {
      controller.abort();
      throw new Error('503 UNAVAILABLE');
    });
    await expect(
      callGeminiWithRetry(
        ai,
        { model: 'primary', fallbacks: ['fallback'] },
        'fixture',
        'test',
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].config?.abortSignal).toBe(controller.signal);
  });
});

describe('MODELS', () => {
  it('uses Gemini 3.8 Flash as the balanced workhorse with no 2.5 fallbacks', () => {
    expect(MODELS.BALANCED[0]).toBe('gemini-3.8-flash');
    const all: readonly string[] = [...MODELS.FAST, ...MODELS.BALANCED];
    expect(all.some((model) => model.startsWith('gemini-2.5'))).toBe(false);
  });
});

describe('resolveGeminiConfig', () => {
  it.each([
    { temperature: 0.3, expected: undefined },
    { temperature: 0.99, expected: undefined },
    { temperature: 1, expected: 1 },
    { temperature: 1.2, expected: 1.2 },
  ])('drops sub-1.0 temperature $temperature', ({ temperature, expected }) => {
    const config = resolveGeminiConfig({
      model: MODELS.BALANCED[0],
      config: { responseMimeType: 'application/json', temperature },
    });
    expect(config?.temperature).toBe(expected);
    expect(config?.responseMimeType).toBe('application/json');
  });

  it('applies the requested thinking level', () => {
    const config = resolveGeminiConfig({ model: MODELS.BALANCED[0], thinking: 'high' });
    expect(config?.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.HIGH);
  });

  it('defaults the FAST head model to low thinking', () => {
    const config = resolveGeminiConfig({ model: MODELS.FAST[0] });
    expect(config?.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.LOW);
  });

  it('never overrides an explicit thinkingConfig', () => {
    const config = resolveGeminiConfig({
      model: MODELS.FAST[0],
      thinking: 'high',
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });
    expect(config?.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('returns undefined when there is nothing to send', () => {
    expect(resolveGeminiConfig({ model: MODELS.BALANCED[0] })).toBeUndefined();
  });
});
