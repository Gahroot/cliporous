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
  buildGroupRenderPlan,
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
  kind: 'stack',
  startWord,
  endWord,
  layout,
  continues,
  transition: 'slide',
  layers: [
    { label: words[startWord + 1].text, word: startWord + 1 },
    { label: words[endWord - 1].text, word: endWord - 1 },
  ],
});
const parse = (raw: unknown): PlannerEditPlan =>
  parseExplainerEditPlan(raw, words, bounds, { profile });
const chain = () =>
  parse({ scenes: [rawScene(8, 15), rawScene(16, 23, true), rawScene(24, 31, true)] });
// Old precomputed payloads must not depend on today's short-form parser allowing decorative text.
const quotePlan = (): PlannerEditPlan => ({
  ...parse({ scenes: [] }),
  quotes: [{ ...quote(), startTime: words[40].start, endTime: words[43].end }],
});
const statementPlan = (): PlannerEditPlan => ({
  ...parse({ scenes: [] }),
  scenes: [
    {
      startTime: 14,
      endTime: 18,
      layout: 'takeover',
      chained: false,
      transition: 'slide',
      cues: [{ kind: 'thump', at: 15 }],
      scene: { kind: 'statement', words: [{ text: words[10].text, at: 15 }] },
    },
  ],
});
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

  it('omits old source-exact optional quotes without splitting the speaker timeline', () => {
    const plan = quotePlan();
    const segments = [speaker()];
    const before = structuredClone({ plan, segments });
    const timeline = prepareExplainerTimeline(segments, plan, bounds);
    expect(timeline.segments).toEqual(segments);
    expect(timeline.segments[0]).toBe(segments[0]);
    expect(timeline.pieces).toEqual([{ segment: segments[0] }]);
    expect(timeline.quotes).toEqual([]);
    expect(timeline.captionWindows).toEqual([]);
    expect(timeline.choices).toEqual([]);
    expect({ plan, segments }).toEqual(before);
  });

  it('omits optional quotes at source gaps or over final snapped scenes with diagnostics', () => {
    const observe = vi.fn();
    const plan = quotePlan();
    const segments = [speaker(10, 31), speaker(31.5, 55)];
    const timeline = prepareExplainerTimeline(segments, plan, bounds, observe);
    expect(timeline.quotes).toEqual([]);
    expect(timeline.segments).toEqual(segments);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'quote',
        action: 'rejected',
        reason: 'short-form-redundant-text',
      }),
    );
    const scenePlan = { ...parse({ scenes: [rawScene(32, 38)] }), quotes: plan.quotes };
    expect(scenePlan.quotes).toHaveLength(1);
    const final = prepareExplainerTimeline(
      [speaker(10, 30.2), speaker(30.2, 55)],
      scenePlan,
      bounds,
      observe,
    );
    expect(final.quotes).toEqual([]);
    expect(final.pieces.filter((p) => p.group)).toHaveLength(1);
    expect(final.pieces.find((p) => p.group)?.segment.endTime).toBe(30.2);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'quote',
        action: 'rejected',
        reason: 'short-form-redundant-text',
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
    const final = prepareExplainerTimeline(segments, quotePlan(), bounds, observe);
    expect(final.quotes).toEqual([]);
    expect(final.segments).toEqual(segments);
    expect(final.segments[1]).toBe(manual);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'quote',
        action: 'rejected',
        reason: 'short-form-redundant-text',
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

  it('renders three useful connected stack scenes unchanged with their palette and SFX intact', async () => {
    const plan = chain();
    const opts = options(plan);
    const before = structuredClone({ plan, segments: opts.segments });
    const timeline = prepareExplainerTimeline(opts.segments, plan, bounds);
    const piece = timeline.pieces.find((p) => p.group);
    if (!piece?.group) throw new Error('Expected stack diagram group');
    const renderPlan = buildGroupRenderPlan(piece.group, piece.segment, opts.palette);
    const result = await applyExplainerScenes(opts);
    expect(mocks.render).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        compositionId: 'ExplainerSequence',
        inputProps: renderPlan.props,
        durationSec: renderPlan.durationSec,
        fps: 30,
        width: 1080,
        height: 960,
        transparent: false,
      }),
    );
    expect(result.rendered).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.renderedChoices).toEqual(summarizeUsage(plan.scenes));
    expect(renderPlan.props).toMatchObject({ palette: opts.palette });
    expect(result.cues.length).toBeGreaterThan(0);
    expect(result.cues).toEqual(renderPlan.cues);
    expect(result.segments).toEqual(
      timeline.segments.map((s) =>
        s.explainerLayout ? { ...s, videoPath: mocks.render.mock.calls[0][0].outputPath } : s,
      ),
    );
    expect({ plan, segments: opts.segments }).toEqual(before);
  });

  it.each([
    'statement-only',
    'quote-only',
    'combined',
  ] as const)('returns an old precomputed %s plan to the speaker without graphics or animation usage', async (kind) => {
    const plan = kind === 'quote-only' ? quotePlan() : statementPlan();
    if (kind === 'combined') plan.quotes = quotePlan().quotes;
    const before = structuredClone(plan);
    const onPlanned = vi.fn();
    const onDiagnostic = vi.fn();
    const measureFaces = vi.fn();
    const opts = options(plan, {
      segments: [speaker(10, 30), speaker(30, 55, { archetype: 'tight-punch' })],
      onPlanned,
      onDiagnostic,
      measureFaces,
    });
    const result = await applyExplainerScenes(opts);
    expect(result).toEqual({
      segments: opts.segments,
      tempFiles: [],
      cues: [],
      rendered: 0,
      failed: 0,
      renderedChoices: [],
    });
    for (const [index, segment] of result.segments.entries()) {
      expect(segment).toBe(opts.segments[index]);
    }
    expect(onPlanned).toHaveBeenCalledExactlyOnceWith([]);
    expect(onDiagnostic).toHaveBeenCalledTimes(kind === 'combined' ? 2 : 1);
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'short-form-redundant-text' }),
    );
    expect(measureFaces).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.production).not.toHaveBeenCalled();
    expect(plan).toEqual(before);
  });

  it('omits off-source saved optional quotes without reauthorization or rewriting saved text', async () => {
    const plan = quotePlan();
    plan.quotes[0] = { ...plan.quotes[0], text: 'invented words only' };
    const before = structuredClone(plan);
    const onDiagnostic = vi.fn();
    const opts = options(plan, { onDiagnostic });
    const result = await applyExplainerScenes(opts);
    expect(result.segments).toEqual(opts.segments);
    expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({
      stage: 'quote',
      action: 'rejected',
      reason: 'short-form-redundant-text',
      index: 0,
    });
    expect(mocks.render).not.toHaveBeenCalled();
    expect(plan).toEqual(before);
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
        text: JSON.stringify({ scenes: [rawScene(8, 15)] }),
        metadata: { provider: 'offline' as const, model: 'test', configId: 'test', latencyMs: 0 },
      };
    });
    const result = await applyExplainerScenes(
      options(undefined, { precomputedPlan: undefined, noAi: false, generator, signal, profile }),
    );
    expect(result.segments.map((s) => [s.startTime, s.endTime, s.archetype])).toEqual([
      [10, 13.75, 'talking-head'],
      [13.75, 18.35, 'split-image'],
      [18.35, 55, 'talking-head'],
    ]);
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(generator).toHaveBeenCalledTimes(2);
    expect(mocks.production).not.toHaveBeenCalled();
  });
});
