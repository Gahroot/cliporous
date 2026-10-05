import { describe, expect, it } from 'vitest';
import {
  isLongformSourceSpec,
  isSceneFirstPlanEnvelope,
  LONGFORM_SCENE_PARSER_VERSION,
  longformSceneId,
  longformSourceFingerprint,
} from '../../../shared/longform-scenes';
import { BUILTIN_PALETTES } from '../../../shared/palettes';
import {
  STORYBOARD_LIMITS,
  STORYBOARD_PANEL_KINDS,
  STORYBOARD_SPEC_VERSION,
} from '../../../shared/storyboards';
import { buildLongformSceneTimeline } from '../../render/longform-scene-timeline';
import { buildLongformStoryboardProps } from '../../render/longform-storyboard-props';
import { parseLongformSceneSpec } from '../explainer-scenes';
import { validateSceneFirstLongformPlan } from '../longform-scene-contract';
import { compileStoryboardSpec } from './compiler';
import { parseStoryboardSpec } from './contract';
import { boardFixture, multiPanelFixture, savedBoardFixture } from './fixtures';

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(freeze);
  Object.freeze(value);
}
function fixture(version: 1 | 2, kind: (typeof STORYBOARD_PANEL_KINDS)[number] = 'statement') {
  const input = boardFixture(kind);
  input.spec.specVersion = version;
  return input;
}
function saved(version: 1 | 2, parser: 1 | 2 | 3, style: 'ink' | 'polish' = 'ink') {
  const input = multiPanelFixture(2, true);
  input.spec.specVersion = version;
  const plan = savedBoardFixture(input);
  plan.parserVersion = parser;
  plan.storyboardStyle = style;
  return { input, plan };
}
function renderable(
  input: ReturnType<typeof multiPanelFixture>,
  plan: ReturnType<typeof savedBoardFixture>,
) {
  const result = validateSceneFirstLongformPlan(plan, input.words, input.duration);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// Version acceptance is exercised through real reconstruction, not an alternative test-only parser.
describe('Step25 storyboard specification and saved parser version compatibility', () => {
  it('advertises only the new current versions, without changing the existing budget contract', () => {
    expect(STORYBOARD_SPEC_VERSION).toBe(2);
    expect(LONGFORM_SCENE_PARSER_VERSION).toBe(3);
    expect(STORYBOARD_PANEL_KINDS).toEqual([
      'statement',
      'comparison',
      'process',
      'notes',
      'quantity',
      'hero',
    ]);
    expect(STORYBOARD_LIMITS).toEqual({
      minPanels: 1,
      maxPanels: 5,
      minDurationSec: 4,
      maxDurationSec: 40,
      maxElements: 48,
      maxProps: 6,
      maxItems: 4,
      maxLabelChars: 96,
      maxLabelWords: 16,
      maxSpecBytes: 24_576,
      maxSpecNodes: 1_500,
      maxSpecDepth: 8,
      minZoom: 0.22,
      maxZoom: 1.15,
      maxWorldWidth: 8_400,
      maxWorldHeight: 1_800,
      maxWorldArea: 12_000_000,
      maxModelMeshes: 180,
      minHoldSec: 0.8,
      minOverviewHoldSec: 1.5,
      maxBoards: 32,
      minSeparationSec: 10,
      longSourceSec: 90,
      maxCoverage: 0.3,
      proposalTimeoutMs: 45_000,
      maxResponseBytes: 32_768,
      maxCues: 12,
    });
  });
  it.each(
    STORYBOARD_PANEL_KINDS,
  )('%s grammar parses/compiles spec1 and spec2 to exactly equal facts, clocks and cues', (kind) => {
    const old = fixture(1, kind);
    const current = fixture(2, kind);
    const originals = [JSON.stringify(old), JSON.stringify(current)];
    freeze(old);
    freeze(current);
    const results = [old, current].map((f) => {
      const context = { clipStart: 0, clipEnd: f.duration };
      const parsed = parseStoryboardSpec(f.spec, f.words, context);
      const compiled = compileStoryboardSpec(f.spec, f.words, context);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
      expect(parsed.value.spec).toEqual(f.spec);
      expect(compiled.value.sourceSpec).toEqual(f.spec);
      return { parsed: parsed.value, compiled: compiled.value };
    });
    expect({ ...results[0].parsed, spec: { ...results[0].parsed.spec, specVersion: 2 } }).toEqual(
      results[1].parsed,
    );
    expect(results[0].compiled.board).toEqual(results[1].compiled.board);
    expect(results[0].compiled.cues).toEqual(results[1].compiled.cues);
    expect(results[0].compiled.startTime).toBe(results[1].compiled.startTime);
    expect(results[0].compiled.endTime).toBe(results[1].compiled.endTime);
    expect([JSON.stringify(old), JSON.stringify(current)]).toEqual(originals);
  });
  it.each([
    'ink',
    'polish',
  ] as const)('rebuilds historical parser2/spec1 and parser3/spec2 identically with approved %s/palette', (style) => {
    const historical = saved(1, 2, style);
    const current = saved(2, 3, style);
    const palette = structuredClone(BUILTIN_PALETTES[0]);
    const before = JSON.stringify({ historical, current, palette });
    freeze(historical);
    freeze(current);
    freeze(palette);
    const old = renderable(historical.input, historical.plan);
    const next = renderable(current.input, current.plan);
    const oldBoard = old.scenes[0],
      nextBoard = next.scenes[0];
    if (oldBoard.kind !== 'storyboard' || nextBoard.kind !== 'storyboard')
      throw new Error('Expected board reconstruction');
    expect(oldBoard.board).toEqual(nextBoard.board);
    expect(oldBoard.cues).toEqual(nextBoard.cues);
    expect(oldBoard.placement.startTime).toBe(nextBoard.placement.startTime);
    expect(oldBoard.placement.endTime).toBe(nextBoard.placement.endTime);
    expect(old.plan).toBe(historical.plan);
    expect(next.plan).toBe(current.plan);
    const props = [old, next].map((result) => {
      const segment = buildLongformSceneTimeline(result.plan, result.scenes).segments.find(
        (entry) => entry.kind === 'scene',
      );
      if (!segment || segment.kind !== 'scene') throw new Error('Missing renderable board');
      return buildLongformStoryboardProps(segment, style, palette);
    });
    expect(props[0]).toEqual(props[1]);
    expect(props[0].style).toBe(style);
    expect(props[0].palette).toEqual(palette);
    expect(JSON.stringify({ historical, current, palette })).toBe(before);
  });
  it.each([
    [1, 1, false],
    [1, 2, false],
    [2, 1, true],
    [2, 2, false],
    [3, 1, true],
    [3, 2, true],
  ] as const)('saved parser%i/spec%i render acceptance is %s, without upgrading stored values', (parser, version, accepted) => {
    const { input, plan } = saved(version, parser);
    const stored = JSON.stringify(plan);
    const restored = JSON.parse(stored);
    expect(isSceneFirstPlanEnvelope(restored)).toBe(accepted);
    expect(validateSceneFirstLongformPlan(restored, input.words, input.duration).ok).toBe(accepted);
    expect(JSON.stringify(restored)).toBe(stored);
    expect(JSON.stringify(plan)).toBe(stored);
  });
  it('keeps parser1 ordinary scenes storyboard-free and unchanged, without inserting a style', () => {
    const words = Array.from({ length: 30 }, (_, i) => ({
      text: i === 6 ? 'battery' : `word${i}`,
      start: i * 0.5,
      end: i * 0.5 + 0.4,
    }));
    const duration = 15;
    const spec = {
      kind: 'hero',
      prop: 'battery',
      label: 'battery',
      startWord: 4,
      endWord: 20,
      word: 6,
      layout: 'takeover',
    };
    const parsed = parseLongformSceneSpec(spec, words, { clipStart: 0, clipEnd: duration });
    if (!parsed) throw new Error('Ordinary source fixture must parse');
    const plan = savedBoardFixture();
    plan.parserVersion = 1;
    delete plan.storyboardStyle;
    plan.sourceFingerprint = longformSourceFingerprint(words, duration);
    plan.sourceDuration = duration;
    plan.sections = [
      {
        id: 'ordinary',
        startWord: 0,
        endWord: 29,
        startTime: 0,
        endTime: duration,
        status: 'planned',
        diagnostics: [],
      },
    ];
    plan.scenes = [
      {
        id: longformSceneId('hero', 4, 20),
        kind: 'hero',
        startWord: 4,
        endWord: 20,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        sectionId: 'ordinary',
        presentation: 'full-frame',
        sourceSpec: spec,
        label: 'battery',
        purpose: 'Source battery',
      },
    ];
    const before = JSON.stringify({ plan, words, spec });
    freeze(plan);
    freeze(words);
    freeze(spec);
    const result = validateSceneFirstLongformPlan(plan, words, duration);
    if (!result.ok) throw new Error(result.error);
    const scene = result.value.scenes[0];
    if (scene.kind !== 'explainer') throw new Error('Parser1 ordinary path changed');
    expect(scene.planned).toEqual(parsed);
    expect(result.value.plan).not.toHaveProperty('storyboardStyle');
    expect(JSON.stringify({ plan, words, spec })).toBe(before);
  });
  it.each([
    3, 99,
  ])('future spec%i stays stored verbatim but rejects parse, compile and rendering', (version) => {
    const { input, plan } = saved(2, 3);
    Reflect.set(input.spec, 'specVersion', version);
    Reflect.set(plan.scenes[0].sourceSpec, 'specVersion', version);
    const stored = JSON.stringify(plan),
      source = JSON.stringify(input.spec);
    const restored = JSON.parse(stored);
    expect(isLongformSourceSpec(restored.scenes[0].sourceSpec)).toBe(true);
    expect(
      parseStoryboardSpec(input.spec, input.words, { clipStart: 0, clipEnd: input.duration }).ok,
    ).toBe(false);
    expect(
      compileStoryboardSpec(input.spec, input.words, { clipStart: 0, clipEnd: input.duration }).ok,
    ).toBe(false);
    expect(validateSceneFirstLongformPlan(restored, input.words, input.duration).ok).toBe(false);
    expect(JSON.stringify(restored)).toBe(stored);
    expect(JSON.stringify(input.spec)).toBe(source);
  });
  it.each([4, 99])('future parser%i is not silently normalized or rendered', (parser) => {
    const { input, plan } = saved(2, 3);
    Reflect.set(plan, 'parserVersion', parser);
    const stored = JSON.stringify(plan),
      restored = JSON.parse(stored);
    expect(validateSceneFirstLongformPlan(restored, input.words, input.duration).ok).toBe(false);
    expect(JSON.stringify(restored)).toBe(stored);
  });
  it.each([
    1, 2,
  ] as const)('spec%i retains rejection of style, presentation and fingerprint drift', (version) => {
    for (const change of ['style', 'missing-style', 'presentation', 'fingerprint']) {
      const { input, plan } = saved(version, version === 1 ? 2 : 3);
      if (change === 'style') Reflect.set(plan, 'storyboardStyle', 'unapproved-material');
      if (change === 'missing-style') delete plan.storyboardStyle;
      if (change === 'presentation') plan.scenes[0].presentation = 'speaker-pip';
      if (change === 'fingerprint') plan.sourceFingerprint = 'different-source';
      const before = JSON.stringify(plan);
      expect(validateSceneFirstLongformPlan(plan, input.words, input.duration).ok, change).toBe(
        false,
      );
      expect(JSON.stringify(plan)).toBe(before);
    }
  });
  it.each([
    1, 2,
  ] as const)('spec%i rejects over-budget boards and unsupported explanation adapters without repairs', (version) => {
    const oversized = multiPanelFixture(6);
    oversized.spec.specVersion = version;
    const context = { clipStart: 0, clipEnd: oversized.duration };
    const before = JSON.stringify(oversized);
    expect(parseStoryboardSpec(oversized.spec, oversized.words, context).ok).toBe(false);
    expect(compileStoryboardSpec(oversized.spec, oversized.words, context).ok).toBe(false);
    expect(JSON.stringify(oversized)).toBe(before);
    const { input, plan } = saved(version, version === 1 ? 2 : 3);
    const panel = input.spec.panels[0];
    Reflect.set(panel, 'kind', 'explanation');
    Reflect.set(panel, 'explanation', { kind: 'possible-futures', adapterVersion: 1 });
    plan.scenes[0].sourceSpec = JSON.parse(JSON.stringify(input.spec));
    const stored = JSON.stringify(plan);
    expect(
      parseStoryboardSpec(input.spec, input.words, { clipStart: 0, clipEnd: input.duration }).ok,
    ).toBe(false);
    expect(
      compileStoryboardSpec(input.spec, input.words, { clipStart: 0, clipEnd: input.duration }).ok,
    ).toBe(false);
    expect(validateSceneFirstLongformPlan(plan, input.words, input.duration).ok).toBe(false);
    expect(JSON.stringify(plan)).toBe(stored);
  });
});
