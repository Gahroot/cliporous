/** Opt-in native proof. No stand-alone proof root and no fabricated media output. */
import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { disableGpuEncoderForSession, setupFFmpeg } from '../../src/main/ffmpeg';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import type { ProductionStoryBoardProps } from '../../src/main/remotion/compositions/storyboard/types';
import {
  renderLongformScenePreview,
  renderSceneFirstLongform,
} from '../../src/main/render/longform-scene-render';
import { buildLongformStoryboardProps } from '../../src/main/render/longform-storyboard-props';
import type { LongformSceneRenderResult } from '../../src/shared/longform-scenes';
import {
  assertAudioSample,
  assertVideoProbe,
  meanPixelDifference,
  sourceAudioFilter,
  sourceFileDigest,
} from '../explainer-stills/longform-scenes-media.mjs';
import { runBounded } from '../explainer-stills/verify-systems-e2e.mjs';
import { fixtures, materialize, mixedFixture, PALETTES, STYLES } from './fixtures';
import { array, jsonRecord, type MediaContext, record, required } from './support';

interface CommandEvidence {
  executable: string;
  args: string[];
  startedAt: string;
  status: string;
  exitCode?: number;
  error?: string;
  elapsedMs?: number;
}
interface StillEvidence {
  name: string;
  frame: number;
  output: string;
  style: ProductionStoryBoardProps['style'];
  palette: ProductionStoryBoardProps['palette'];
  sha256: string;
  repeatedExactly: boolean;
}

export async function runMedia({ out, report, boundary }: MediaContext): Promise<void> {
  assert.equal(boundary.unit, false, 'Media must never run with the unit dispatcher');
  setupFFmpeg();
  disableGpuEncoderForSession();
  const require = createRequire(import.meta.url);
  const ffmpeg: unknown = require('ffmpeg-static');
  const ffprobe = record(require('@ffprobe-installer/ffprobe')).path;
  assert.ok(
    typeof ffmpeg === 'string' && typeof ffprobe === 'string',
    'Installed local binaries required',
  );
  const json = (name: string, value: unknown) =>
    writeFileSync(join(out, name), `${JSON.stringify(value, null, 2)}\n`);
  const commands: CommandEvidence[] = [];
  const command = async (exe: string, args: string[]) => {
    const item: CommandEvidence = {
      executable: exe,
      args,
      startedAt: new Date().toISOString(),
      status: 'running',
    };
    commands.push(item);
    json('media-commands.json', commands);
    const started = performance.now();
    try {
      const result = await runBounded(exe, args, { timeoutMs: 180_000 });
      item.status = 'passed';
      item.exitCode = 0;
      return result;
    } catch (error) {
      item.status = 'failed';
      item.error = String(error);
      throw error;
    } finally {
      item.elapsedMs = performance.now() - started;
      json('media-commands.json', commands);
    }
  };
  const ff = (args: string[]) =>
    command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  const probe = async (path: string, seconds: number, label: string) => {
    const raw = await command(ffprobe, [
      '-v',
      'error',
      '-count_frames',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      path,
    ]);
    const result = jsonRecord(raw.stdout.toString());
    array(result.streams).forEach(record);
    record(result.format);
    json(`${label}-probe.json`, result);
    const checked = assertVideoProbe(result, seconds);
    const frames = await command(ffprobe, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_frames',
      '-show_entries',
      'frame=best_effort_timestamp_time',
      '-of',
      'json',
      path,
    ]);
    const times = array(jsonRecord(frames.stdout.toString()).frames).map((frame) => {
      const time = record(frame).best_effort_timestamp_time;
      assert.ok(typeof time === 'string' || typeof time === 'number', 'Missing frame timestamp');
      const value = Number(time);
      assert.ok(Number.isFinite(value));
      return value;
    });
    assert.equal(times.length, Math.round(seconds * 30));
    times.slice(1).forEach((t: number, i: number) => {
      assert.ok(Math.abs(t - times[i] - 1 / 30) < 0.000003, `Non-CFR frame ${i}`);
    });
    json(`${label}-timestamps.json`, times);
    return checked;
  };
  const pixels = async (path: string, time: number) =>
    (
      await ff([
        '-ss',
        String(time),
        '-i',
        path,
        '-frames:v',
        '1',
        '-vf',
        'scale=320:180',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        'pipe:1',
      ])
    ).stdout;
  const audio = async (path: string, time: number, seconds = 0.35) =>
    (
      await ff([
        '-ss',
        String(time),
        '-i',
        path,
        '-t',
        String(seconds),
        '-vn',
        '-ac',
        '2',
        '-ar',
        '48000',
        '-c:a',
        'pcm_f32le',
        '-f',
        'f32le',
        'pipe:1',
      ])
    ).stdout;
  const source = async (path: string, duration: number) => {
    await ff([
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=1920x1080:rate=30:duration=${duration}`,
      '-f',
      'lavfi',
      '-i',
      sourceAudioFilter(duration),
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '18',
      '-threads',
      '2',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-t',
      String(duration),
      path,
    ]);
    return { path, duration, sha256: await sourceFileDigest(path) };
  };
  const palette = PALETTES[0];
  const base = mixedFixture(); // source bookends + TWO-PANEL board with recurring battery + ordinary checklist
  const segment = base.timeline.segments.find(
    (s) => s.kind === 'scene' && s.compiled.kind === 'storyboard',
  );
  assert.ok(segment?.kind === 'scene' && segment.compiled.kind === 'storyboard');
  const boardCompiled = segment.compiled;
  const src = join(out, 'source.mp4');
  const sourceEvidence = await report.measure('synthetic-local-source', () =>
    source(src, base.duration),
  );
  const qualityParams = { crf: 28, preset: 'veryfast' } as const;
  const exportDir = join(out, 'exports');
  mkdirSync(exportDir);
  const previewDir = join(out, 'previews');
  mkdirSync(previewDir);
  // Keep all per-render alpha/segment scratch on the sampled owned volume; final results copied out.
  const scratch = join(out, 'scratch');
  const encode = async (
    f: typeof base,
    sourcePath: string,
    style: 'ink' | 'polish',
    name: string,
    enabled = false,
    signal?: AbortSignal,
  ) => {
    const path = join(scratch, `${name}.mp4`);
    const plan = structuredClone({ ...f.plan, storyboardStyle: style });
    const before = JSON.stringify(plan);
    const result = await renderSceneFirstLongform({
      plan,
      words: f.words,
      sourceVideoPath: sourcePath,
      outputPath: path,
      palette: deriveExplainerPalette(),
      storyboardPalette: { ...palette },
      qualityParams,
      sceneSfxEnabled: enabled,
      signal,
    });
    assert.equal(JSON.stringify(plan), before, 'Export changed the saved raw plan');
    const retained = join(exportDir, `${name}.mp4`);
    copyFileSync(path, retained);
    rmSync(path);
    json(`${name}-reconciliation.json`, result);
    return { path: retained, result };
  };
  const preview = async (
    style: 'ink' | 'polish',
    name: string,
    enabled = false,
    signal?: AbortSignal,
  ) => {
    const path = await renderLongformScenePreview(
      {
        requestId: name,
        sourceVideoPath: src,
        wordTimestamps: base.words,
        plan: { ...base.plan, storyboardStyle: style },
        sceneId: segment.compiled.placement.id,
        paletteId: palette.id,
        customPalettes: [],
        sceneSfxEnabled: enabled,
      },
      signal,
    );
    try {
      const retained = join(previewDir, `${name}.mp4`);
      copyFileSync(path, retained);
      return retained;
    } finally {
      rmSync(dirname(path), { recursive: true, force: true });
    }
  };
  const offPreviews = new Map<string, string>();
  const tolerance = {
    meanAbsoluteRGB255: 5,
    scaledProbe: '320x180',
    scope: 'preview CRF28 vs export CRF28, never exact encoded-byte equality',
  };
  for (const style of STYLES)
    await report.measure(`production-export-preview-${style}`, async () => {
      const firstCall = boundary.renders.length;
      if (style === 'ink') boundary.alphaCapture = join(out, 'alpha-ink.mov');
      const mixBefore = boundary.mixes.length;
      const result = await encode(base, src, style, `mixed-${style}`);
      assert.equal(result.result.scenes?.rendered, 2);
      assert.equal(result.result.fallbacks.length, 0, 'A fallback is NOT a visual proof pass');
      await probe(result.path, base.duration, `mixed-${style}`);
      const exported = boundary.renders
        .slice(firstCall)
        .find((r) => r.compositionId === 'StoryBoard');
      assert.ok(exported);
      assert.equal(exported.transparent, true);
      const path = await preview(style, style);
      offPreviews.set(style, path);
      const previewed = required(boundary.renders.at(-1), 'preview invocation');
      assert.deepEqual(
        previewed.inputProps,
        exported.inputProps,
        'Same raw saved spec and one props builder for preview/export',
      );
      assert.equal(boundary.mixes.length, mixBefore, 'SFX disabled must not mix any cues');
      await probe(path, segment.endTime - segment.startTime, `preview-${style}`);
      const props = buildLongformStoryboardProps(segment, style, palette);
      const samples = [
        0,
        ...props.spec.shots.map((s) => Math.min(props.spec.durationSec - 0.4, s.at + s.dur + 0.8)),
        props.spec.durationSec - 1 / 30,
      ];
      const diffs = [];
      for (const local of samples) {
        const frame = Math.max(
          0,
          Math.min(Math.round(props.spec.durationSec * 30) - 1, Math.round(local * 30)),
        );
        const time = frame / 30;
        const delta = meanPixelDifference(
          await pixels(path, time),
          await pixels(result.path, segment.startTime + time),
        );
        assert.ok(
          delta <= tolerance.meanAbsoluteRGB255,
          `Preview/export ${style} frame ${frame}: MAE ${delta}`,
        );
        diffs.push({ frame, delta });
      }
      const narration = [];
      for (let t = 0.5; t + 0.35 < base.duration; t += 4)
        narration.push(assertAudioSample(await audio(src, t), await audio(result.path, t), t));
      // Check continuity through EVERY timeline seam, including the board/ordinary intervals.
      const seams = [];
      for (const s of base.timeline.segments.slice(1)) {
        const t = Math.max(0, s.startTime - 0.15);
        const a = await audio(src, t, 0.3),
          b = await audio(result.path, t, 0.3);
        assert.equal(a.length, b.length);
        let dot = 0,
          aa = 0,
          bb = 0;
        for (let i = 0; i < a.length; i += 4) {
          const x = a.readFloatLE(i),
            y = b.readFloatLE(i);
          dot += x * y;
          aa += x * x;
          bb += y * y;
        }
        const correlation = dot / Math.sqrt(aa * bb);
        assert.ok(correlation > 0.95, `Narration discontinuity at ${t}: ${correlation}`);
        seams.push({ at: s.startTime, correlation });
      }
      const bookends = [];
      for (const time of [0.25, base.duration - 0.3]) {
        const delta = meanPixelDifference(await pixels(src, time), await pixels(result.path, time));
        assert.ok(delta < 8, `Source bookend replaced: ${delta}`);
        bookends.push({ time, delta });
      }
      return { reconciliation: result.result, tolerance, diffs, narration, seams, bookends };
    });
  await report.measure('actual-prores-alpha-bookends-and-opaque-interior', async () => {
    const path = join(out, 'alpha-ink.mov');
    const info = jsonRecord(
      (
        await command(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', path])
      ).stdout.toString(),
    );
    const stream = required(
      array(info.streams)
        .map(record)
        .find((s) => s.codec_type === 'video'),
      'alpha video stream',
    );
    assert.equal(stream.codec_name, 'prores');
    assert.ok(typeof stream.pix_fmt === 'string');
    assert.match(stream.pix_fmt, /^yuva/);
    const duration = segment.endTime - segment.startTime;
    const stats = [];
    for (const [label, time] of [
      ['in', 0],
      ['opaque', 4],
      ['out', duration - 1 / 30],
    ] as const) {
      const rgba = (
        await ff([
          '-ss',
          String(time),
          '-i',
          path,
          '-frames:v',
          '1',
          '-pix_fmt',
          'rgba',
          '-f',
          'rawvideo',
          'pipe:1',
        ])
      ).stdout;
      assert.equal(rgba.length, 1920 * 1080 * 4);
      let min = 255,
        max = 0,
        sum = 0;
      for (let i = 3; i < rgba.length; i += 4) {
        min = Math.min(min, rgba[i]);
        max = Math.max(max, rgba[i]);
        sum += rgba[i];
      }
      const mean = sum / (1920 * 1080);
      if (label === 'opaque') assert.ok(min >= 254, `Board did not cover full frame: ${min}`);
      else assert.ok(mean <= 40, `Board alpha bookend not transparent enough: ${mean}`);
      stats.push({ label, time, min, max, mean });
    }
    return { stream, stats, scope: 'Full-resolution alpha samples, not every frame' };
  });
  await report.measure('real-SFX-on-preview-single-cue-list', async () => {
    const before = boundary.mixes.length;
    const path = await preview('ink', 'ink-sfx-on', true);
    assert.equal(boundary.mixes.length - before, 1);
    assert.deepEqual(
      required(boundary.mixes.at(-1), 'SFX invocation').cues,
      boardCompiled.cues.map((c) => ({ ...c, at: c.at - segment.startTime })),
    );
    assert.ok(boardCompiled.cues.length > 0);
    const off = required(offPreviews.get('ink'), 'SFX-off preview');
    let delta = 0;
    // Compare actual on/off PCM near each cue; no duplicate mix invocation or fabricated waveform.
    for (const cue of required(boundary.mixes.at(-1), 'SFX invocation').cues) {
      const a = await audio(off, Math.max(0, cue.at)),
        b = await audio(path, Math.max(0, cue.at));
      assert.equal(a.length, b.length);
      for (let i = 0; i < a.length; i += 4) delta += Math.abs(a.readFloatLE(i) - b.readFloatLE(i));
    }
    assert.ok(delta > 0.01, 'SFX enabled produced no measured audio difference');
    const visual = meanPixelDifference(await pixels(off, 4), await pixels(path, 4));
    assert.ok(visual <= 1, 'SFX altered video');
    return {
      cues: required(boundary.mixes.at(-1), 'SFX invocation').cues,
      pcmAbsoluteDifferenceSum: delta,
      visualMAE: visual,
    };
  });

  await report.measure('stills-production-StoryBoard-matrix-and-exact-repeat', async () => {
    const serveUrl = join(
      required(process.env.STORYBOARD_PROOF_RESOURCES, 'STORYBOARD_PROOF_RESOURCES'),
      'remotion',
    );
    const browserExecutable = required(
      process.env.STORYBOARD_PROOF_BROWSER,
      'STORYBOARD_PROOF_BROWSER',
    );
    const chromiumOptions = { gl: 'angle' as const };
    const onBrowserDownload = () => {
      throw new Error('Downloads forbidden');
    };
    const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions });
    const stillDir = join(out, 'stills');
    mkdirSync(stillDir);
    const thumbs = join(out, 'thumbs');
    mkdirSync(thumbs);
    const index: StillEvidence[] = [];
    const canvasEvidence = new Map<
      string,
      { hasProps: boolean; observations: number; maximumCanvases: number }
    >();
    const canvasErrors: string[] = [];
    let canvasPhase: { name: string; hasProps: boolean } | null = null;
    let sampling: Promise<void> | null = null;
    const sampleCanvases = async (): Promise<void> => {
      const phase = canvasPhase;
      if (!phase) return;
      try {
        for (const page of await browser.pages()) {
          if (page.closed) continue;
          const counts = await page.evaluate(() => {
            const scan = (document: Document): number[] => {
              const counts = Array.from(document.querySelectorAll('[data-storyboard-canvas]')).map(
                (root) => root.querySelectorAll('canvas').length,
              );
              for (const frame of document.querySelectorAll('iframe'))
                if (frame.contentDocument) counts.push(...scan(frame.contentDocument));
              return counts;
            };
            return scan(document);
          });
          if (counts.length) {
            const observation = canvasEvidence.get(phase.name) ?? {
              hasProps: phase.hasProps,
              observations: 0,
              maximumCanvases: 0,
            };
            observation.observations += counts.length;
            observation.maximumCanvases = Math.max(observation.maximumCanvases, ...counts);
            canvasEvidence.set(phase.name, observation);
          }
        }
      } catch (error) {
        // RenderStill owns and closes pages; a sample may race its legitimate teardown.
        if (!/closed|destroyed|detached|Cannot find context/i.test(String(error)))
          canvasErrors.push(String(error));
      }
    };
    const canvasTimer = setInterval(() => {
      if (!sampling)
        sampling = sampleCanvases().finally(() => {
          sampling = null;
        });
    }, 50);
    const still = async (
      name: string,
      props: ProductionStoryBoardProps,
      frame: number,
      repeat = false,
    ) => {
      const composition = await selectComposition({
        serveUrl,
        id: 'StoryBoard',
        inputProps: props,
        browserExecutable,
        puppeteerInstance: browser,
        chromiumOptions,
        onBrowserDownload,
      });
      const output = join(stillDir, `${name}.png`);
      const config = {
        serveUrl,
        composition: {
          ...composition,
          durationInFrames: Math.round(props.spec.durationSec * 30),
          width: 1920,
          height: 1080,
          fps: 30,
        },
        inputProps: props,
        frame,
        output,
        imageFormat: 'png' as const,
        browserExecutable,
        puppeteerInstance: browser,
        chromiumOptions,
        onBrowserDownload,
      };
      canvasPhase = { name, hasProps: props.spec.props.length > 0 };
      try {
        await renderStill(config);
        if (repeat) {
          const bytes = readFileSync(output);
          await renderStill(config); // IDENTICAL config including output path/browser/frame, no seed/config changes.
          assert.deepEqual(readFileSync(output), bytes, `Non-deterministic still: ${name}`);
        }
      } finally {
        canvasPhase = null;
      }
      await ff([
        '-i',
        output,
        '-vf',
        'scale=384:216',
        '-frames:v',
        '1',
        join(thumbs, `${String(index.length).padStart(4, '0')}.png`),
      ]);
      index.push({
        name,
        frame,
        output,
        style: props.style,
        palette: props.palette,
        sha256: await sourceFileDigest(output),
        repeatedExactly: repeat,
      });
      json('still-index.json', index);
    };
    try {
      // All eight shared presets plus custom light and adversarial low-contrast inputs, BOTH styles.
      for (const style of STYLES)
        for (const selected of PALETTES) {
          const props = buildLongformStoryboardProps(segment, style, selected);
          const completedAt = Math.max(
            ...props.spec.elements.map((element) => element.at ?? 0),
            ...props.spec.props.map((prop) => prop.actionEndAt ?? prop.at),
          );
          const frame = Math.round((completedAt + 0.6) * 30);
          const overview = required(props.spec.shots.at(-1), 'matrix overview');
          assert.ok(
            frame < overview.at * 30,
            'Palette capture must show the completed panel before overview',
          );
          assert.ok(
            props.spec.props.length > 0,
            'Palette matrix must exercise clay as well as text and cards',
          );
          await still(`matrix-${style}-${selected.id}`, props, frame, selected.id === palette.id);
        }
      // Every authored kind, longest labels, maximum 45 elements/5 props and 210-node source.
      for (const f of fixtures())
        for (const style of STYLES) {
          const saved = materialize(f);
          const seg = saved.timeline.segments.find((s) => s.kind === 'scene');
          assert.ok(seg?.kind === 'scene');
          const props = buildLongformStoryboardProps(seg, style, palette);
          const shots = props.spec.shots;
          await still(
            `${f.name}-${style}-hold`,
            props,
            Math.round(Math.min(props.spec.durationSec - 0.4, shots[0].at + shots[0].dur + 4) * 30),
          );
          if (f.name === 'moving-recurring') {
            for (const [shotIndex, shot] of shots.entries()) {
              if (shotIndex === 0) continue;
              for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
                await still(
                  `${f.name}-${style}-shot-${shotIndex}-${Math.round(fraction * 100)}`,
                  props,
                  Math.round((shot.at + shot.dur * fraction) * 30),
                );
              }
            }
          }
          if (shots.length > 1) {
            const pan = shots[1];
            const finalShot = required(shots.at(-1), 'final shot');
            await still(
              `${f.name}-${style}-dense-pan`,
              props,
              Math.round((pan.at + pan.dur / 2) * 30),
            );
            await still(
              `${f.name}-${style}-${f.spec.overview ? 'overview' : 'final-hold'}`,
              props,
              Math.round(
                Math.min(props.spec.durationSec - 0.4, finalShot.at + finalShot.dur + 4) * 30,
              ),
            );
          }
        }
    } finally {
      clearInterval(canvasTimer);
      await sampling;
      await browser.close({ silent: true });
      json('live-canvas-counts.json', {
        scope:
          'Actual production still composition DOM, sampled every 50ms; not the browser-internal GPU allocation count.',
        samples: Object.fromEntries([...canvasEvidence].sort(([a], [b]) => a.localeCompare(b))),
        errors: canvasErrors,
      });
    }
    assert.deepEqual(canvasErrors, [], 'Unexpected DOM observation failure');
    for (const style of STYLES)
      for (const selected of PALETTES)
        assert.equal(
          canvasEvidence.get(`matrix-${style}-${selected.id}`)?.maximumCanvases,
          1,
          'Every palette capture must contain the live clay stage',
        );
    const observed = [...canvasEvidence.values()];
    assert.ok(
      observed.some((entry) => entry.hasProps && entry.maximumCanvases === 1),
      'No live 3D stage observed',
    );
    assert.ok(
      observed.some((entry) => !entry.hasProps),
      'No live 2D board observed',
    );
    for (const entry of observed)
      assert.ok(
        entry.maximumCanvases <= (entry.hasProps ? 1 : 0),
        'Storyboard exceeded its live canvas budget',
      );
    await ff([
      '-framerate',
      '1',
      '-i',
      join(thumbs, '%04d.png'),
      '-vf',
      `tile=5x${Math.ceil(index.length / 5)}`,
      '-frames:v',
      '1',
      join(out, 'contact-sheet.png'),
    ]);
    return {
      stills: index.length,
      matrixCells: STYLES.length * PALETTES.length,
      exactRepeatCases: index.filter((i) => i.repeatedExactly).length,
      composition: 'StoryBoard from pinned production Root; buildLongformStoryboardProps',
      visualApproval:
        'NOT automatic: inspect still-index.json/contact-sheet.png at full resolution',
    };
  });

  await report.measure('bounded-two-board-export-stress-SFX-on', async () => {
    const f = mixedFixture(2, false);
    const path = join(out, 'stress-source.mp4');
    const srcEvidence = await source(path, f.duration);
    const start = boundary.mixes.length;
    const result = await encode(f, path, 'polish', 'repeat-two-boards', true);
    assert.equal(result.result.scenes?.rendered, 2);
    assert.equal(result.result.fallbacks.length, 0);
    assert.equal(
      boundary.mixes.length - start,
      1,
      'Exactly one full-source cue mix, not one per board plus final',
    );
    const expected = f.compiled.flatMap((c) => (c.kind === 'storyboard' ? c.cues : c.planned.cues));
    assert.deepEqual(required(boundary.mixes.at(-1), 'SFX invocation').cues, expected);
    await probe(result.path, f.duration, 'stress');
    return {
      source: srcEvidence,
      boardCount: 2,
      duration: f.duration,
      cues: expected,
      scope: 'Bounded repeated two-panel boards; NOT a multi-hour soak or max-board movie',
    };
  });
  for (let attempt = 0; attempt < 2; attempt++)
    await report.measure(`real-preview-alpha-cancel-${attempt + 1}`, async () => {
      const controller = new AbortController();
      boundary.controller = controller;
      boundary.cancelAfterFrames = 2;
      boundary.renderedFrames = 0;
      const pathStart = boundary.paths.length;
      const before = readdirSync(scratch).sort();
      try {
        await assert.rejects(
          preview(attempt ? 'polish' : 'ink', `cancel-${attempt}`, false, controller.signal),
          /abort|cancel/i,
        );
        assert.equal(controller.signal.aborted, true);
        assert.ok(boundary.renderedFrames >= 2, 'Cancellation never reached REAL alpha rendering');
        const paths = boundary.paths.slice(pathStart);
        assert.ok(paths.length > 0);
        for (const path of paths) {
          assert.equal(existsSync(path), false);
          assert.equal(
            existsSync(dirname(dirname(path))),
            false,
            'Preview request directory survived',
          );
        }
        assert.deepEqual(
          readdirSync(scratch).sort(),
          before,
          'Cancelled preview leaked an owned temp directory',
        );
        return { renderedFramesAtAbort: boundary.renderedFrames, removedPaths: paths };
      } finally {
        boundary.controller = null;
        boundary.cancelAfterFrames = 0;
      }
    });
  for (const stage of ['segment', 'concat'] as const) {
    await report.measure(`real-${stage}-encode-cancel`, async () => {
      const controller = new AbortController();
      boundary.controller = controller;
      boundary.cancelEncoderStage = stage;
      const before = readdirSync(scratch).sort();
      const completed = readdirSync(exportDir).sort();
      const starts = boundary.encoderStarts.length;
      // Source-only plan reaches the same encoders without repeating an expensive graphics job.
      const sourceOnly = { ...base, plan: { ...base.plan, scenes: [] } };
      try {
        await assert.rejects(
          encode(sourceOnly, src, 'polish', `cancel-${stage}`, false, controller.signal),
          /abort|cancel/i,
        );
        assert.equal(controller.signal.aborted, true);
        const actualStarts = boundary.encoderStarts.slice(starts);
        assert.ok(
          actualStarts.includes(stage),
          'Cancellation must follow actual FFmpeg process start',
        );
        assert.deepEqual(
          readdirSync(scratch).sort(),
          before,
          'Encoder cancellation leaked owned scratch',
        );
        assert.deepEqual(
          readdirSync(exportDir).sort(),
          completed,
          'Encoder cancellation altered completed exports',
        );
        return { stage, actualStarts, scratchRemoved: true, completedExportsPreserved: completed };
      } finally {
        boundary.controller = null;
        boundary.cancelEncoderStage = null;
      }
    });
  }
  await report.measure(
    'REAL-visual-failure-preview-rejects-export-full-window-fallback',
    async () => {
      // Invalid elements are sent only at the renderMedia boundary. The production browser must throw.
      // The saved plan, compiler and dispatcher are unchanged, and fallback is encoded by real FFmpeg.
      boundary.failure = true;
      try {
        const before = readdirSync(scratch).sort();
        await assert.rejects(preview('ink', 'real-invalid-visual'), /null|length|map|elements/i);
        assert.deepEqual(readdirSync(scratch).sort(), before);
        const failed = await encode(base, src, 'ink', 'visual-failure-fallback');
        const scene = failed.result.sceneResults?.find(
          (s: LongformSceneRenderResult) => s.id === segment.compiled.placement.id,
        );
        assert.ok(scene);
        assert.equal(scene.status, 'failed');
        assert.equal(scene.startTime, segment.compiled.placement.startTime);
        assert.equal(scene.endTime, segment.compiled.placement.endTime);
        assert.equal(failed.result.fallbacks.length, 1);
        await probe(failed.path, base.duration, 'fallback');
        const difference = meanPixelDifference(
          await pixels(src, segment.startTime + 4),
          await pixels(failed.path, segment.startTime + 4),
        );
        assert.ok(difference < 8, 'Failed full interval did not return the actual source');
        return {
          injectedFault: 'null elements at REAL StoryBoard renderMedia input',
          reconciliation: failed.result,
          speakerMAE: difference,
        };
      } finally {
        boundary.failure = false;
      }
    },
  );
  assert.equal(await sourceFileDigest(src), sourceEvidence.sha256, 'Proof mutated original source');
  for (const path of boundary.paths)
    assert.equal(existsSync(path), false, 'Production alpha temp survived');
  json('media-dispatch.json', {
    renders: boundary.renders.map((r) => ({
      compositionId: r.compositionId,
      outputPath: r.outputPath,
      durationSec: r.durationSec,
      width: r.width,
      height: r.height,
      fps: r.fps,
      transparent: r.transparent,
    })),
    mixes: boundary.mixes,
    alphaPathsRemoved: boundary.paths,
  });
  report.report.limitations.push(
    'Cancellation measured during real alpha frames and after real segment/final-encode process start; sub-frame atomic-publication races are not exhaustively scheduled.',
    'SFX cue duplication checked through actual mixer input plus waveform delta; not a psychoacoustic quality certification.',
    'Production temp cleanup asserted for observed alpha/request paths; owned Windows child-process samples are recorded separately by the runner.',
  );
}
