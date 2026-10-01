import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeUsage } from '../ai/explainer/recent-usage';
import {
  type PlannerEditPlan,
  type PlannerWord,
  parseExplainerEditPlan,
} from '../ai/explainer-scenes';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import {
  type ApplyExplainerOptions,
  applyExplainerScenes,
  plannerInputFingerprint,
  prepareExplainerTimeline,
} from './explainer-scenes';
import type { ResolvedSegment } from './segment-render';

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  production: vi.fn(() => {
    throw new Error('External generation reached');
  }),
}));
vi.mock('../remotion/render', () => ({ renderRemotionSegment: mocks.render }));
vi.mock('../ai/explainer/planner-generation', async (original) => ({
  ...(await original<typeof import('../ai/explainer/planner-generation')>()),
  createGeminiPlannerGenerator: mocks.production,
}));

const words: PlannerWord[] = Array.from({ length: 90 }, (_, i) => ({
  text: `word${i}`,
  start: 10 + i * 0.5,
  end: 10.5 + i * 0.5,
}));
const bounds = { minStart: 12, maxEnd: 55 };
const profile = 'content-led-codex-v1' as const;
const speaker = (
  startTime = 10,
  endTime = 55,
  extra: Partial<ResolvedSegment> = {},
): ResolvedSegment => ({
  startTime,
  endTime,
  archetype: 'talking-head',
  zoom: { style: 'none', intensity: 1 },
  transitionIn: 'hard-cut',
  ...extra,
});
const quote = (startWord = 40, endWord = startWord + 3) => ({
  startWord,
  endWord,
  text: words
    .slice(startWord, endWord + 1)
    .map((w) => w.text)
    .join(' '),
  reason: 'takeaway',
});
const rawScene = (startWord: number, endWord: number, continues = false, layout = 'stack') => ({
  kind: 'statement',
  startWord,
  endWord,
  layout,
  continues,
  transition: 'slide',
  words: [
    { text: words[startWord + 1].text, word: startWord + 1 },
    { text: words[endWord - 1].text, word: endWord - 1 },
  ],
});
const parse = (raw: unknown): PlannerEditPlan =>
  parseExplainerEditPlan(raw, words, bounds, { profile });
const chain = () =>
  parse({ scenes: [rawScene(8, 15), rawScene(16, 23, true), rawScene(24, 31, true)] });
const options = (
  precomputedPlan = parse({ scenes: [] }),
  extra: Partial<ApplyExplainerOptions> = {},
): ApplyExplainerOptions => ({
  apiKey: '',
  words,
  bounds,
  segments: [speaker()],
  palette: deriveExplainerPalette(),
  noAi: true,
  precomputedPlan,
  precomputedWordsHash: plannerInputFingerprint(words, bounds),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.render.mockReset();
  mocks.render.mockResolvedValue(undefined);
});

describe('saved plan render authorization', () => {
  it('uses canonical SHA256 of only exact ordered words and bounds', () => {
    const canonical = JSON.stringify({
      words: words.map(({ text, start, end }) => ({ text, start, end })),
      bounds,
    });
    expect(plannerInputFingerprint(words, bounds)).toBe(
      createHash('sha256').update(canonical).digest('hex'),
    );
    expect(
      plannerInputFingerprint(
        words.map((w) => ({ end: w.end, start: w.start, text: w.text, path: 'ignored' })),
        { maxEnd: 55, minStart: 12 },
      ),
    ).toBe(plannerInputFingerprint(words, bounds));
    for (const changed of [
      words.slice(1),
      words.map((w, i) => (i ? w : { ...w, text: 'changed' })),
      words.map((w) => ({ ...w, start: w.start + 0.01 })),
    ]) {
      expect(plannerInputFingerprint(changed, bounds)).not.toBe(
        plannerInputFingerprint(words, bounds),
      );
    }
    expect(plannerInputFingerprint(words, { ...bounds, minStart: 13 })).not.toBe(
      plannerInputFingerprint(words, bounds),
    );
  });

  it('accepts explicit empty saved plans without credentials, generation or rendering', async () => {
    const onPlanned = vi.fn();
    const opts = options(undefined, { onPlanned });
    const result = await applyExplainerScenes(opts);
    expect(result).toMatchObject({
      segments: opts.segments,
      rendered: 0,
      failed: 0,
      renderedChoices: [],
    });
    expect(result.segments[0]).toBe(opts.segments[0]);
    expect(onPlanned).toHaveBeenCalledExactlyOnceWith([]);
    expect(mocks.production).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it.each([
    { precomputedPlan: undefined },
    { precomputedWordsHash: undefined },
    { precomputedWordsHash: 'wrong' },
    { words: words.slice(1) },
    { bounds: { ...bounds, maxEnd: 54 } },
  ])('fails closed before all generation and reservations: %j', async (extra) => {
    const generator = vi.fn(mocks.production);
    const onPlanned = vi.fn();
    await expect(
      applyExplainerScenes(options(undefined, { ...extra, generator, onPlanned })),
    ).rejects.toThrow(/precomputed|fingerprint/i);
    expect(generator).not.toHaveBeenCalled();
    expect(mocks.production).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(onPlanned).not.toHaveBeenCalled();
  });

  it('does not silently replan mismatched saved plans even with AI enabled', async () => {
    await expect(
      applyExplainerScenes(
        options(undefined, { noAi: false, apiKey: 'key', precomputedWordsHash: 'wrong' }),
      ),
    ).rejects.toThrow(/fingerprint/i);
    expect(mocks.production).not.toHaveBeenCalled();
  });

  it('reserves an empty no-key result exactly once', async () => {
    const onPlanned = vi.fn();
    await applyExplainerScenes(
      options(undefined, { precomputedPlan: undefined, noAi: false, onPlanned }),
    );
    expect(onPlanned).toHaveBeenCalledExactlyOnceWith([]);
    expect(mocks.production).not.toHaveBeenCalled();
  });
});

describe('pure timeline admission', () => {
  it('keeps three connected stack scenes in one group without mutating saved inputs', () => {
    const plan = chain();
    expect(plan.scenes).toHaveLength(3);
    const segments = [speaker()];
    const before = JSON.stringify({ plan, segments });
    const timeline = prepareExplainerTimeline(segments, plan, bounds);
    expect(timeline.pieces.filter((p) => p.group)).toHaveLength(1);
    expect(timeline.pieces.find((p) => p.group)?.group?.scenes).toHaveLength(3);
    expect(timeline.captionWindows).toHaveLength(1);
    expect(timeline.choices).toEqual(summarizeUsage(plan.scenes));
    expect(JSON.stringify({ plan, segments })).toBe(before);
  });

  it('inserts source-exact optional quotes without an animation or fabricated text', () => {
    const plan = parse({ scenes: [], quotes: [quote()] });
    expect(plan.quotes).toHaveLength(1);
    const timeline = prepareExplainerTimeline([speaker()], plan, bounds);
    expect(timeline.segments.map((s) => [s.startTime, s.endTime, s.archetype])).toEqual([
      [10, 30, 'talking-head'],
      [30, 32, 'fullscreen-quote'],
      [32, 55, 'talking-head'],
    ]);
    expect(timeline.quotes).toEqual(plan.quotes);
    expect(timeline.choices).toEqual([]);
    expect(
      parse({ scenes: [], quotes: [{ ...quote(), text: 'invented text here' }] }).quotes,
    ).toEqual([]);
    expect(parse({ scenes: [], quotes: [quote(0)] }).quotes).toEqual([]);
  });

  it('rejects quotes crossing gaps or overlapping final snapped scenes with diagnostics', () => {
    const observe = vi.fn();
    const quotePlan = parse({ scenes: [], quotes: [quote()] });
    expect(
      prepareExplainerTimeline([speaker(10, 31), speaker(31.5, 55)], quotePlan, bounds, observe)
        .quotes,
    ).toEqual([]);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'quote', action: 'rejected', reason: 'source-gap' }),
    );
    const scenePlan = parse({ scenes: [rawScene(32, 38)], quotes: [quote()] });
    expect(scenePlan.quotes).toHaveLength(1);
    const final = prepareExplainerTimeline(
      [speaker(10, 30.2), speaker(30.2, 55)],
      scenePlan,
      bounds,
      observe,
    );
    expect(final.quotes).toEqual([]);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'quote',
        action: 'rejected',
        reason: 'quote-animation-overlap',
      }),
    );
  });

  it.each([
    { archetype: 'fullscreen-quote' },
    { archetype: 'quote-lower' },
    { archetype: 'split-image', explainerLayout: 'stack' },
    { archetype: 'fullscreen-image', videoPath: 'broll.mp4' },
    { explainerLayout: 'over' },
    { videoPath: 'manual.mp4' },
  ] as Partial<ResolvedSegment>[])('never replaces explicit manual layouts: %j', (extra) => {
    const manual = Object.freeze(speaker(29, 34, extra));
    const segments = [speaker(10, 29), manual, speaker(34, 55)];
    const observe = vi.fn();
    const final = prepareExplainerTimeline(
      segments,
      parse({ scenes: [], quotes: [quote()] }),
      bounds,
      observe,
    );
    expect(final.quotes).toEqual([]);
    expect(final.segments[1]).toBe(manual);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'quote',
        action: 'rejected',
        reason: 'quote-explicit-layout',
      }),
    );
  });
});

describe('local render accounting', () => {
  it('reserves after admission and before face measurement/render; records the whole successful chain', async () => {
    const plan = chain();
    const onPlanned = vi.fn();
    mocks.render.mockImplementation(async () => {
      expect(onPlanned).toHaveBeenCalledExactlyOnceWith(summarizeUsage(plan.scenes));
    });
    const result = await applyExplainerScenes(options(plan, { onPlanned }));
    expect(result.rendered).toBe(1);
    expect(result.renderedChoices).toEqual(summarizeUsage(plan.scenes));
    expect(mocks.render).toHaveBeenCalledTimes(1);
    expect(mocks.production).not.toHaveBeenCalled();
    const measureFaces = vi.fn(async () => {
      expect(onPlanned).toHaveBeenCalledTimes(2);
      return [];
    });
    mocks.render.mockImplementation(async () => {
      expect(onPlanned).toHaveBeenCalledTimes(2);
    });
    await applyExplainerScenes(
      options(
        parse({
          scenes: [
            {
              ...rawScene(8, 15, false, 'over'),
              kind: 'stamp',
              word: words[9].text,
              stampWord: 9,
              strikeWord: null,
            },
          ],
        }),
        {
          onPlanned,
          measureFaces,
          framing: { sourceWidth: 1920, sourceHeight: 1080, width: 1080, height: 1920 },
        },
      ),
    );
    expect(measureFaces).toHaveBeenCalledTimes(1);
  });

  it('renders three connected stack scenes once with their palette and SFX intact', async () => {
    const plan = chain();
    const opts = options(plan);
    const result = await applyExplainerScenes(opts);
    expect(mocks.render).toHaveBeenCalledTimes(1);
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        compositionId: 'ExplainerSequence',
        inputProps: expect.objectContaining({ palette: opts.palette }),
      }),
    );
    expect(result.renderedChoices).toEqual(summarizeUsage(plan.scenes));
    expect(result.cues.length).toBeGreaterThan(0);
  });

  it('handles quote-only output without rendering or reserving animation usage', async () => {
    const onPlanned = vi.fn();
    const result = await applyExplainerScenes(
      options(parse({ scenes: [], quotes: [quote()] }), { onPlanned }),
    );
    expect(result.segments.some((s) => s.archetype === 'fullscreen-quote')).toBe(true);
    expect(result.renderedChoices).toEqual([]);
    expect(onPlanned).toHaveBeenCalledExactlyOnceWith([]);
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it('reauthorizes saved quote text against the original words, not invented quote words', async () => {
    const plan = parse({ scenes: [], quotes: [quote()] });
    plan.quotes[0] = { ...plan.quotes[0], text: 'invented words only' };
    const onDiagnostic = vi.fn();
    const result = await applyExplainerScenes(options(plan, { onDiagnostic }));
    expect(result.segments.some((s) => s.archetype === 'fullscreen-quote')).toBe(false);
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'quote-off-source' }),
    );
  });

  it('excludes failed groups from rendered usage and falls back with a diagnostic', async () => {
    const plan = parse({ scenes: [rawScene(8, 15), rawScene(32, 39)] });
    expect(plan.scenes).toHaveLength(2);
    mocks.render.mockRejectedValueOnce(new Error('encode failed'));
    const onDiagnostic = vi.fn();
    const result = await applyExplainerScenes(options(plan, { onDiagnostic }));
    expect(result).toMatchObject({
      rendered: 1,
      failed: 1,
      renderedChoices: summarizeUsage(plan.scenes.slice(1)),
    });
    expect(result.segments.find((s) => s.startTime === plan.scenes[0].startTime)?.archetype).toBe(
      'talking-head',
    );
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'render', action: 'fallback', reason: 'render-failed' }),
    );
  });

  it.each([
    'signal',
    'legacy',
  ] as const)('detects %s cancellation during render and excludes its usage', async (mode) => {
    const controller = new AbortController();
    let cancelled = false;
    mocks.render.mockImplementationOnce(async () => {
      controller.abort();
      cancelled = true;
    });
    const onDiagnostic = vi.fn();
    const result = await applyExplainerScenes(
      options(chain(), {
        onDiagnostic,
        ...(mode === 'signal' ? { signal: controller.signal } : { isCancelled: () => cancelled }),
      }),
    );
    expect(result.renderedChoices).toEqual([]);
    expect(result.rendered).toBe(0);
    expect(result.segments.every((s) => s.archetype === 'talking-head')).toBe(true);
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'render', reason: 'cancelled' }),
    );
  });

  it('passes exact words, profile and signal through the real injected planning path', async () => {
    const signal = new AbortController().signal;
    const generator = vi.fn(async (request: { signal?: AbortSignal; prompt: string }) => {
      expect(request.signal).toBe(signal);
      expect(request.prompt).toContain('0:word0');
      return {
        text: JSON.stringify({ scenes: [], quotes: [quote()] }),
        metadata: { provider: 'offline' as const, model: 'test', configId: 'test', latencyMs: 0 },
      };
    });
    const result = await applyExplainerScenes(
      options(undefined, { precomputedPlan: undefined, noAi: false, generator, signal, profile }),
    );
    expect(result.segments.some((s) => s.archetype === 'fullscreen-quote')).toBe(true);
    expect(generator).toHaveBeenCalledTimes(2);
    expect(mocks.production).not.toHaveBeenCalled();
  });
});
