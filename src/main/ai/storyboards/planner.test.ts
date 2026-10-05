import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORYBOARD_LIMITS as L } from '../../../shared/storyboards';
import { MODELS } from '../gemini-client';
import { partitionLongformSections } from '../longform-sections';
import { boardFixture } from './fixtures';
import { planStoryboardSection, type StoryboardPlanningOptions } from './planner';

const { generateContent, emitUsageFromResponse } = vi.hoisted(() => ({
  generateContent:
    vi.fn<
      (request: {
        model: string;
        contents: string;
        config?: { abortSignal?: AbortSignal; maxOutputTokens?: number };
      }) => Promise<{ text: string; usageMetadata?: object }>
    >(),
  emitUsageFromResponse: vi.fn(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  ThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));
vi.mock('../../ai-usage', () => ({ emitUsageFromResponse }));

function fixture() {
  const f = boardFixture();
  const options: StoryboardPlanningOptions = {
    apiKey: 'offline',
    words: f.words,
    duration: f.duration,
    section: partitionLongformSections(f.words)[0],
    style: 'ink',
  };
  const response = {
    text: JSON.stringify({ board: f.spec }),
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 },
  };
  const invalid = {
    text: JSON.stringify({
      board: { ...f.spec, subject: { ...f.spec.subject, text: 'invented subject' } },
    }),
  };
  return { f, options, response, invalid };
}
beforeEach(() => {
  generateContent.mockReset();
  emitUsageFromResponse.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('bounded storyboard proposals through the real Gemini transport', () => {
  it('compiles raw JSON and reports usage through the existing client with finite output budget', async () => {
    const { options, response } = fixture();
    generateContent.mockResolvedValue(response);
    const result = await planStoryboardSection(options);
    expect(result.ok && result.value.board?.board.elements.length).toBeGreaterThan(0);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0]).toMatchObject({
      model: MODELS.BALANCED[0],
      config: { maxOutputTokens: 6144 },
    });
    expect(emitUsageFromResponse).toHaveBeenCalledWith(
      'longform-storyboard',
      MODELS.BALANCED[0],
      response,
    );
  });
  it('shows the model the ordinary scene windows it must contain or avoid', async () => {
    const { options, response } = fixture();
    generateContent.mockResolvedValue(response);
    await planStoryboardSection({
      ...options,
      occupied: [
        { startWord: 30, endWord: 41 },
        { startWord: 4, endWord: 12 },
      ],
    });
    const prompt = String(generateContent.mock.calls[0][0].contents);
    expect(prompt).toContain('word ranges): 4..12, 30..41.');
    expect(prompt).toContain('Never cut through a range.');
  });
  it('omits the occupied-window guide when the section has no ordinary scenes', async () => {
    const { options, response } = fixture();
    generateContent.mockResolvedValue(response);
    await planStoryboardSection(options);
    expect(String(generateContent.mock.calls[0][0].contents)).not.toContain('already planned');
  });
  it('makes one useful semantic repair and retains rejection diagnostics', async () => {
    const { options, response, invalid } = fixture();
    generateContent.mockResolvedValueOnce(invalid).mockResolvedValueOnce(response);
    const result = await planStoryboardSection(options);
    expect(result.ok && result.value.board).toBeTruthy();
    expect(result.ok && result.value.diagnostics.some((d) => d.code === 'evidence')).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].contents).toContain('SEMANTIC_REPAIR_ONCE');
    expect(emitUsageFromResponse).toHaveBeenCalledTimes(2);
  });
  it('fails after one unsuccessful repair rather than returning empty success', async () => {
    const { options, invalid } = fixture();
    generateContent.mockResolvedValue(invalid);
    const result = await planStoryboardSection(options);
    expect(result.ok).toBe(false);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
  it.each([
    'malformed',
    'extra-board',
    'unsafe',
    'oversized',
    'provider',
  ])('never semantically repairs %s failure', async (reason) => {
    const { options, f } = fixture();
    if (reason === 'provider')
      generateContent.mockRejectedValue(
        Object.assign(new Error('private-provider-secret'), { status: 400 }),
      );
    else
      generateContent.mockResolvedValue({
        text:
          reason === 'malformed'
            ? 'not json'
            : reason === 'oversized'
              ? 'x'.repeat(L.maxResponseBytes + 1)
              : JSON.stringify(
                  reason === 'extra-board'
                    ? { boards: [f.spec, f.spec] }
                    : { board: { ...f.spec, code: 'arbitrary' } },
                ),
      });
    const result = await planStoryboardSection(options);
    expect(result.ok).toBe(false);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('private-provider-secret');
  });
  it('accepts explicit null, including a safe decline after semantic repair', async () => {
    const { options, invalid } = fixture();
    generateContent
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce({ text: '{"board":null}' });
    const result = await planStoryboardSection(options);
    expect(result.ok && result.value.board).toBeNull();
    expect(result.ok && result.value.diagnostics.length).toBeGreaterThan(0);
  });
  it('propagates abort before and during the provider call, with no repair or late usage', async () => {
    const { options } = fixture();
    const controller = new AbortController();
    generateContent.mockImplementation(() => new Promise(() => {}));
    const pending = planStoryboardSection({ ...options, signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(generateContent).toHaveBeenCalledTimes(1);
    controller.abort();
    await rejected;
    expect(generateContent.mock.calls[0][0].config?.abortSignal?.aborted).toBe(true);
    await expect(
      planStoryboardSection({ ...options, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(emitUsageFromResponse).not.toHaveBeenCalled();
  });
  it('has a hard deadline even if the SDK never resolves or honors cancellation', async () => {
    vi.useFakeTimers();
    const { options } = fixture();
    generateContent.mockImplementation(() => new Promise(() => {}));
    const pending = planStoryboardSection(options);
    await vi.advanceTimersByTimeAsync(L.proposalTimeoutMs);
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.at(-1)?.message).toContain('timed out');
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config?.abortSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(emitUsageFromResponse).not.toHaveBeenCalled();
  });
  it('skips ineligible tiny sections without a provider request', async () => {
    const { options } = fixture();
    const result = await planStoryboardSection({
      ...options,
      section: { ...options.section, endWord: options.section.startWord },
    });
    expect(result).toEqual({ ok: true, value: { board: null, diagnostics: [] } });
    expect(generateContent).not.toHaveBeenCalled();
  });
});
