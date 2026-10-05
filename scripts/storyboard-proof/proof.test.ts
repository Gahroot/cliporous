import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { it, vi } from 'vitest';
import { validateSceneFirstLongformPlan } from '../../src/main/ai/longform-scene-contract';
import { compileStoryboardSpec } from '../../src/main/ai/storyboards/compiler';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import {
  renderLongformScenePreview,
  renderSceneFirstLongform,
} from '../../src/main/render/longform-scene-render';
import {
  buildLongformStoryboardProps,
  mapStoryboardTimes,
} from '../../src/main/render/longform-storyboard-props';
import { BUILTIN_PALETTES } from '../../src/shared/palettes';
import { resolveStoryboardPalette } from '../../src/shared/storyboard-palette';
import {
  businessFixtures,
  fixtures,
  materialize,
  mixedFixture,
  movingFixture,
  nodeCount,
  PALETTES,
  STYLES,
} from './fixtures';
import { startMetrics } from './metrics.mjs';
import {
  assertTimeRoundTrip,
  type ConcatOptions,
  type EncodeOptions,
  type MixArgs,
  type ProofBoundary,
  type RenderOptions,
  record,
  required,
} from './support';

const boundary = vi.hoisted((): ProofBoundary => {
  if (process.env.STORYBOARD_PROOF_RESOURCES)
    Object.defineProperty(process, 'resourcesPath', {
      value: process.env.STORYBOARD_PROOF_RESOURCES,
      configurable: true,
    });
  return {
    unit: process.env.STORYBOARD_PROOF_MODE === 'unit',
    duration: 0,
    ai: 0,
    builds: 0,
    renders: [],
    encodes: [],
    concats: [],
    mixes: [],
    paths: [] as string[],
    failure: false,
    controller: null as AbortController | null,
    cancelAfterFrames: 0,
    renderedFrames: 0,
    alphaCapture: '',
    encoderStage: null,
    cancelEncoderStage: null,
    encoderStarts: [],
  };
});
vi.mock('electron', () => ({
  app: {
    isPackaged: !boundary.unit,
    getAppPath: () => process.env.STORYBOARD_PROOF_ROOT,
    getPath: () => process.env.STORYBOARD_PROOF_OUT,
  },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      boundary.ai++;
      throw new Error('Live AI forbidden');
    }
  },
  ThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));
vi.mock('@remotion/bundler', () => ({
  bundle: () => {
    boundary.builds++;
    throw new Error('Lazy builds forbidden; supply production pin');
  },
}));
vi.mock('../../src/main/ffmpeg', async (original) => {
  if (!boundary.unit) {
    const actual = await original<typeof import('../../src/main/ffmpeg')>();
    return {
      ...actual,
      ffmpeg: (inputPath?: string) => {
        const command = actual.ffmpeg(inputPath);
        command.on('start', () => {
          const stage = boundary.encoderStage;
          if (stage) boundary.encoderStarts.push(stage);
          if (stage && stage === boundary.cancelEncoderStage) {
            boundary.cancelEncoderStage = null;
            boundary.controller?.abort();
          }
        });
        return command;
      },
    };
  }
  return {
    getVideoMetadata: async () => ({
      width: 1920,
      height: 1080,
      duration: boundary.duration,
      audioCodec: 'aac',
    }),
  };
});
vi.mock('../../src/main/render/longform-encode', async (original) => {
  const actual = boundary.unit
    ? null
    : await original<typeof import('../../src/main/render/longform-encode')>();
  return {
    encodeLongformSceneSegment: async (opts: EncodeOptions) => {
      boundary.encodes.push(opts);
      if (actual) {
        boundary.encoderStage = 'segment';
        try {
          return await actual.encodeLongformSceneSegment(opts);
        } finally {
          boundary.encoderStage = null;
        }
      }
      opts.signal?.throwIfAborted();
      writeFileSync(opts.outputPath, 'UNIT dispatcher marker, NOT media');
    },
    concatLongformSceneSegments: async (opts: ConcatOptions) => {
      boundary.concats.push(opts);
      if (actual) {
        boundary.encoderStage = 'concat';
        try {
          return await actual.concatLongformSceneSegments(opts);
        } finally {
          boundary.encoderStage = null;
        }
      }
      opts.signal?.throwIfAborted();
      writeFileSync(opts.outputPath, 'UNIT dispatcher marker, NOT media');
    },
  };
});
vi.mock('../../src/main/render/scene-sfx', async (original) => {
  const actual = boundary.unit
    ? null
    : await original<typeof import('../../src/main/render/scene-sfx')>();
  return {
    mixSceneSfx: async (...[path, cues, opts]: MixArgs) => {
      boundary.mixes.push({ path, cues: structuredClone(cues), opts });
      if (actual) return actual.mixSceneSfx(path, cues, opts);
      copyFileSync(path, opts.outputPath);
      return { ok: true, outputPath: opts.outputPath };
    },
  };
});
vi.mock('../../src/main/remotion/render', async (original) => {
  const actual = boundary.unit
    ? null
    : await original<typeof import('../../src/main/remotion/render')>();
  return {
    renderRemotionSegment: async (opts: RenderOptions) => {
      boundary.renders.push(opts);
      if (actual) return actual.renderRemotionSegment(opts);
      if (boundary.failure) throw new Error('UNIT deliberately failing renderer');
      opts.signal?.throwIfAborted();
      const outputPath = required(opts.outputPath, 'production alpha path');
      writeFileSync(outputPath, 'UNIT alpha marker, NOT media');
      return outputPath;
    },
  };
});
// Media: installed local browser and instrumentation only. ALL frames/encodes are real.
// Fault injection passes invalid props to the REAL renderer, not a fabricated failure/output.
vi.mock('@remotion/renderer', async (original) => {
  if (boundary.unit) return {};
  const actual = await original<typeof import('@remotion/renderer')>();
  const local = () => {
    assert.ok(process.env.STORYBOARD_PROOF_BROWSER, 'Explicit installed browser required');
    return {
      browserExecutable: process.env.STORYBOARD_PROOF_BROWSER,
      onBrowserDownload: () => {
        throw new Error('Browser downloads forbidden');
      },
    };
  };
  return {
    ...actual,
    selectComposition: (opts: Parameters<typeof actual.selectComposition>[0]) =>
      actual.selectComposition({ ...opts, ...local() }),
    renderMedia: async (opts: Parameters<typeof actual.renderMedia>[0]) => {
      if (typeof opts.outputLocation === 'string') boundary.paths.push(opts.outputLocation);
      const result = await actual.renderMedia({
        ...opts,
        ...local(),
        ...(boundary.failure && opts.composition.id === 'StoryBoard'
          ? {
              inputProps: {
                ...record(opts.inputProps),
                spec: { ...record(record(opts.inputProps).spec), elements: null },
              },
              // Remotion renders resolved composition.props, not inputProps alone.
              composition: {
                ...opts.composition,
                props: {
                  ...record(opts.composition.props),
                  spec: { ...record(record(opts.composition.props).spec), elements: null },
                },
              },
            }
          : {}),
        onProgress: (progress) => {
          boundary.renderedFrames = Math.max(boundary.renderedFrames, progress.renderedFrames);
          opts.onProgress?.(progress);
          if (
            boundary.cancelAfterFrames > 0 &&
            progress.renderedFrames >= boundary.cancelAfterFrames
          )
            boundary.controller?.abort();
        },
      });
      if (boundary.alphaCapture && opts.composition.id === 'StoryBoard') {
        copyFileSync(required(opts.outputLocation, 'real alpha output'), boundary.alphaCapture);
        boundary.alphaCapture = '';
      }
      return result;
    },
  };
});

const out = required(process.env.STORYBOARD_PROOF_OUT, 'STORYBOARD_PROOF_OUT');
assert.ok(
  out && readFileSync(join(out, '.owner'), 'utf8') === process.env.STORYBOARD_PROOF_OWNER,
  'Launch using verify.mjs',
);
const json = (name: string, value: unknown) =>
  writeFileSync(join(out, name), `${JSON.stringify(value, null, 2)}\n`);

it('raw source -> saved plan -> production props/dispatcher; optional real production media', async () => {
  const report = startMetrics(
    out,
    boundary.unit ? 'unit (render/encode mocked, NOT media evidence)' : 'media',
  );
  let failure: unknown;
  try {
    await report.measure('raw-contract-and-production-props', async () => {
      assert.equal(BUILTIN_PALETTES.length, 8);
      assertTimeRoundTrip({ at: 13 }, { at: 12.999999999999998 });
      assert.throws(() => assertTimeRoundTrip({ at: 13 + 2e-9 }, { at: 13 }));
      for (const key of ['x', 'zoom', 'dur', 'durationSec', 'text']) {
        assert.throws(() => assertTimeRoundTrip({ [key]: 13 }, { [key]: 12.999999999999998 }));
      }
      const contracts = [];
      for (const f of fixtures()) {
        const raw: unknown = JSON.parse(JSON.stringify(f.spec));
        const compiled = compileStoryboardSpec(raw, f.words, { clipStart: 0, clipEnd: f.duration });
        assert.ok(compiled.ok, JSON.stringify(compiled));
        const saved = materialize(f);
        const segment = saved.timeline.segments.find((s) => s.kind === 'scene');
        assert.ok(segment?.kind === 'scene' && segment.compiled.kind === 'storyboard');
        assert.deepEqual(saved.plan.scenes[0].sourceSpec, raw);
        assert.ok(!('board' in saved.plan.scenes[0].sourceSpec), 'Never persist compiled geometry');
        assert.deepEqual(segment.compiled.board, compiled.value.board);
        let cursor = 0;
        for (const s of saved.timeline.segments) {
          assert.equal(s.startFrame, cursor);
          cursor = s.endFrame;
        }
        assert.equal(cursor, Math.round(f.duration * 30));
        const propMatrix = [];
        for (const style of STYLES)
          for (const palette of PALETTES) {
            const props = buildLongformStoryboardProps(segment, style, palette);
            assert.deepEqual(props.palette, palette);
            assert.notEqual(props.palette, palette);
            const restored = mapStoryboardTimes(props.spec, (t) => t + segment.startTime);
            assertTimeRoundTrip(
              { ...restored, durationSec: compiled.value.board.durationSec },
              compiled.value.board,
            );
            assert.equal(props.spec.durationSec, (segment.endFrame - segment.startFrame) / 30);
            propMatrix.push({
              style,
              palette: palette.id,
              resolved: resolveStoryboardPalette(style, palette),
            });
          }
        if (f.name === 'maximum-five-panels') {
          assert.equal(compiled.value.board.elements.length, 45);
          assert.equal(compiled.value.board.props.length, 5);
        }
        if (f.name === 'maximum-source-210-nodes') assert.equal(nodeCount(raw), 210);
        if (f.name === 'moving-recurring') {
          assert.equal(compiled.value.board.panels?.length, 2);
          assert.equal(new Set(compiled.value.board.props.map((p) => p.semanticId)).size, 1);
          assert.ok(
            compiled.value.board.shots.length >= 3,
            'Two panels and overview must move the camera',
          );
        }
        contracts.push({
          name: f.name,
          parserVersion: saved.plan.parserVersion,
          specVersion: f.spec.specVersion,
          words: f.words,
          plan: saved.plan,
          timeline: saved.timeline,
          nodes: nodeCount(raw),
          elements: compiled.value.board.elements.length,
          props: compiled.value.board.props.length,
          propMatrix,
        });
      }
      // Exact label grounding: punctuation or signed quantity cannot be normalized away.
      const label = required(
        fixtures().find((f) => f.name === 'long-punctuated-label'),
        'punctuated fixture',
      );
      const panel = label.spec.panels[0];
      assert.ok(panel.kind === 'statement');
      panel.body.text = panel.body.text.replace(',', '');
      assert.equal(
        compileStoryboardSpec(label.spec, label.words, { clipStart: 0, clipEnd: label.duration })
          .ok,
        false,
      );
      const quantity = required(
        fixtures().find((f) => f.name === 'quantity'),
        'quantity fixture',
      );
      const q = quantity.spec.panels[0];
      assert.ok(q.kind === 'quantity');
      quantity.words[q.evidence.startWord].text = '-12';
      assert.equal(
        compileStoryboardSpec(quantity.spec, quantity.words, {
          clipStart: 0,
          clipEnd: quantity.duration,
        }).ok,
        false,
      );
      const mixed = mixedFixture(2);
      assert.deepEqual([...new Set(mixed.compiled.map((s) => s.kind))].sort(), [
        'explainer',
        'storyboard',
      ]);
      assert.equal(mixed.plan.scenes.length, 3);
      json('contracts.json', contracts);
      json('mixed-plan.json', mixed);
      return {
        fixtures: contracts.length,
        stylePaletteCases: contracts.length * STYLES.length * PALETTES.length,
        maxRawNodes: Math.max(...contracts.map((c) => c.nodes)),
        mixedScenes: mixed.plan.scenes.length,
      };
    });
    if (boundary.unit)
      await report.measure(
        'UNIT real dispatcher with explicit fake runtime boundaries',
        async () => {
          const f = materialize(movingFixture());
          boundary.duration = f.duration;
          const source = join(out, 'unit-source.txt');
          writeFileSync(source, 'NOT media');
          const selected = f.timeline.segments.find((s) => s.kind === 'scene');
          assert.ok(selected?.kind === 'scene' && selected.compiled.kind === 'storyboard');
          const targets = join(out, 'unit-dispatch');
          mkdirSync(targets);
          for (const style of STYLES) {
            const plan = structuredClone({ ...f.plan, storyboardStyle: style });
            const before = JSON.stringify(plan);
            for (const enabled of [false, true]) {
              const mixes = boundary.mixes.length,
                renders = boundary.renders.length;
              const reconciliation = await renderSceneFirstLongform({
                plan,
                words: f.words,
                sourceVideoPath: source,
                outputPath: join(targets, `${style}-${enabled}.marker`),
                palette: deriveExplainerPalette(),
                storyboardPalette: PALETTES[0],
                qualityParams: { crf: 28, preset: 'veryfast' },
                sceneSfxEnabled: enabled,
              });
              assert.equal(reconciliation.scenes?.rendered, 1);
              assert.equal(reconciliation.fallbacks.length, 0);
              const exportCall = boundary.renders[renders];
              assert.equal(exportCall.compositionId, 'StoryBoard');
              assert.equal(exportCall.transparent, true);
              assert.equal(exportCall.width, 1920);
              assert.equal(exportCall.height, 1080);
              assert.equal(exportCall.fps, 30);
              assert.deepEqual(
                exportCall.inputProps,
                buildLongformStoryboardProps(selected, style, PALETTES[0]),
              );
              assert.equal(boundary.mixes.length - mixes, enabled ? 1 : 0);
              if (enabled)
                assert.deepEqual(
                  required(boundary.mixes.at(-1), 'SFX invocation').cues,
                  selected.compiled.cues,
                );
              const preview = await renderLongformScenePreview({
                requestId: 'unit',
                sourceVideoPath: source,
                wordTimestamps: f.words,
                plan,
                sceneId: plan.scenes[0].id,
                paletteId: PALETTES[0].id,
                sceneSfxEnabled: enabled,
              });
              assert.deepEqual(
                required(boundary.renders.at(-1), 'preview render invocation').inputProps,
                exportCall.inputProps,
              );
              assert.equal(boundary.mixes.length - mixes, enabled ? 2 : 0);
              if (enabled)
                assert.deepEqual(
                  required(boundary.mixes.at(-1), 'SFX invocation').cues,
                  selected.compiled.cues.map((c) => ({ ...c, at: c.at - selected.startTime })),
                );
              rmSync(dirname(preview), { recursive: true, force: true });
            }
            assert.equal(JSON.stringify(plan), before);
          }
          for (const raw of businessFixtures()) {
            const saved = materialize(raw);
            assert.equal(saved.plan.parserVersion, 3);
            assert.equal(raw.spec.specVersion, 2);
            const seg = saved.timeline.segments.find((s) => s.kind === 'scene');
            assert.ok(seg?.kind === 'scene' && seg.compiled.kind === 'storyboard');
            boundary.duration = saved.duration;
            for (const style of STYLES)
              for (const selectedPalette of PALETTES) {
                const plan = structuredClone({ ...saved.plan, storyboardStyle: style });
                const before = JSON.stringify(plan);
                const renders = boundary.renders.length;
                const result = await renderSceneFirstLongform({
                  plan,
                  words: saved.words,
                  sourceVideoPath: source,
                  outputPath: join(targets, `${raw.name}-${style}-${selectedPalette.id}.marker`),
                  palette: deriveExplainerPalette(),
                  storyboardPalette: selectedPalette,
                  qualityParams: { crf: 28, preset: 'veryfast' },
                  sceneSfxEnabled: true,
                });
                assert.equal(result.scenes?.rendered, 1);
                assert.equal(result.fallbacks.length, 0);
                assert.deepEqual(
                  boundary.renders[renders].inputProps,
                  buildLongformStoryboardProps(seg, style, selectedPalette),
                );
                const preview = await renderLongformScenePreview({
                  requestId: `unit-${raw.name}`,
                  sourceVideoPath: source,
                  wordTimestamps: saved.words,
                  plan,
                  sceneId: plan.scenes[0].id,
                  paletteId: selectedPalette.id,
                  customPalettes: selectedPalette.builtin ? [] : [selectedPalette],
                  sceneSfxEnabled: true,
                });
                assert.deepEqual(
                  required(boundary.renders.at(-1), 'business preview').inputProps,
                  boundary.renders[renders].inputProps,
                );
                assert.equal(JSON.stringify(plan), before);
                rmSync(dirname(preview), { recursive: true, force: true });
              }
          }
          boundary.duration = f.duration;
          assert.ok(boundary.encodes.some((e) => e.sourceUnderlay === true));
          boundary.failure = true;
          await assert.rejects(
            renderLongformScenePreview({
              requestId: 'unit-failure',
              sourceVideoPath: source,
              wordTimestamps: f.words,
              plan: f.plan,
              sceneId: f.plan.scenes[0].id,
              sceneSfxEnabled: false,
            }),
            /UNIT deliberately failing/,
          );
          const recovered = await renderSceneFirstLongform({
            plan: f.plan,
            words: f.words,
            sourceVideoPath: source,
            outputPath: join(targets, 'fallback.marker'),
            palette: deriveExplainerPalette(),
            storyboardPalette: PALETTES[0],
            qualityParams: { crf: 28, preset: 'veryfast' },
            sceneSfxEnabled: false,
          });
          assert.equal(recovered.scenes?.rendered, 0);
          assert.equal(recovered.sceneResults?.[0].status, 'failed');
          assert.equal(recovered.sceneResults?.[0].startTime, f.plan.scenes[0].startTime);
          assert.equal(recovered.sceneResults?.[0].endTime, f.plan.scenes[0].endTime);
          assert.equal(recovered.fallbacks.length, 1);
          boundary.failure = false;
          for (const r of boundary.renders)
            assert.equal(
              existsSync(required(r.outputPath, 'alpha path')),
              false,
              'Production removes all alpha markers',
            );
          assert.equal(validateSceneFirstLongformPlan(f.plan, f.words, f.duration).ok, true);
          json('unit-dispatch.json', {
            scope: 'MOCKED runtime, not media',
            renders: boundary.renders,
            encodes: boundary.encodes,
            concats: boundary.concats,
            mixes: boundary.mixes,
            recovered,
          });
          return {
            renders: boundary.renders.length,
            encodes: boundary.encodes.length,
            mixes: boundary.mixes.length,
          };
        },
      );
    else {
      const { runMedia } = await import('./media');
      await runMedia({ out, report, boundary });
    }
    assert.equal(boundary.ai, 0);
    assert.equal(boundary.builds, 0);
    report.report.boundaries = {
      aiCalls: boundary.ai,
      lazyBuilds: boundary.builds,
      mediaExecuted: !boundary.unit,
      runtimeMocked: boundary.unit,
    };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    report.finish(failure);
  }
});
