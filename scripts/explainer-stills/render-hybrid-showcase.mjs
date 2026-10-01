#!/usr/bin/env node
/** Animation-only authored reels. Production captions/alpha evidence belongs to --hybrid E2E. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeFixtures } from './fixture-schema.mjs';
import {
  bundleDigest,
  digest,
  localBundle,
  openLocalBrowser,
  outputDirectory,
  ROOT,
} from './harness-runtime.mjs';
import { runBounded } from './verify-systems-e2e.mjs';

const KINDS = [
  'detroit-place',
  'fund-flow',
  'ownership-change',
  'portfolio-exposure',
  'cash-timing',
  'token-attention',
  'inference-tradeoff',
];
export function hybridSequencePlan(rows, aspect) {
  if (!['9:16', '16:9'].includes(aspect)) throw new Error('Unsupported aspect');
  const fixtures = normalizeFixtures(rows);
  if (fixtures.length < 2 || fixtures.length > 18)
    throw new Error('Reel needs 2–18 bounded authored chapters');
  let cursor = 0;
  const transitions = [],
    frames = [],
    checks = [];
  const scenes = fixtures.map((fixture, i) => {
    const { scene, durationSec } = fixture;
    if (
      !KINDS.includes(scene.kind) ||
      !['diagram', 'hybrid'].includes(scene.visualMode) ||
      durationSec < 5 ||
      durationSec > 12
    )
      throw new Error('Only complete authored hybrid-library fixtures can enter the reel');
    const beats = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'].map(
      (key) => scene[key],
    );
    if (
      beats.some(
        (at, j) => !Number.isFinite(at) || at < 0 || (j > 0 && at - beats[j - 1] < 0.35),
      ) ||
      beats[4] > durationSec - 0.8
    )
      throw new Error('Five ordered beats and final hold required');
    frames.push(
      cursor + Math.round(scene.actionAt * 30) + 12,
      cursor + Math.round((scene.resolveAt + 0.4) * 30),
    );
    checks.push(cursor / 30 + scene.checkAt);
    const durationInFrames = Math.round(durationSec * 30);
    cursor += durationInFrames;
    if (i < fixtures.length - 1) {
      // A one-frame fade is a clean cut: no sampled intermediate opacity can merge facts.
      transitions.push({ kind: 'fade', durationInFrames: 1 });
      frames.push(cursor, cursor + 1);
    }
    return { scene, durationInFrames: durationInFrames + (i < fixtures.length - 1 ? 1 : 9) };
  });
  return {
    inputProps: {
      scenes,
      transitions,
      palette: fixtures[0].palette,
      aspect,
      layout: 'takeover',
      enter: true,
      exit: true,
      visibleSec: cursor / 30,
    },
    width: aspect === '9:16' ? 1080 : 1920,
    height: aspect === '9:16' ? 1920 : 1080,
    durationInFrames: cursor + 9,
    frames: [...new Set(frames)].sort((a, b) => a - b),
    checks,
  };
}
export function parseHybridShowcaseArgs(args) {
  const { values } = parseArgs({
    args,
    options: {
      bundle: { type: 'string', default: path.join(ROOT, 'out/remotion') },
      out: { type: 'string' },
      media: { type: 'boolean', default: false },
    },
  });
  for (const value of [values.bundle, values.out].filter((v) => v !== undefined))
    if (!value.trim() || /^[a-z][a-z0-9+.-]*:\/\//i.test(value))
      throw new Error('Local paths only');
  return values;
}
async function mixExistingSfx(raw, output, checks, duration, signal) {
  const require = createRequire(import.meta.url),
    ffmpeg = require('ffmpeg-static');
  const n = checks.length;
  const split = checks.map((_, i) => `[cue${i}]`).join('');
  const filters = [
    `[1:a]aresample=48000,lowpass=f=2600,volume=0.22,asplit=${n}${split}`,
    ...checks.map((at, i) => `[cue${i}]adelay=${Math.round(at * 1000)}:all=1[delayed${i}]`),
    `${checks.map((_, i) => `[delayed${i}]`).join('')}amix=inputs=${n}:normalize=0,apad=whole_dur=${duration}[sound]`,
  ].join(';');
  await runBounded(
    ffmpeg,
    [
      '-nostdin',
      '-n',
      '-i',
      raw,
      '-i',
      path.join(ROOT, 'resources/sfx/scene/tick-1.mp3'),
      '-filter_complex',
      filters,
      '-map',
      '0:v:0',
      '-map',
      '[sound]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-t',
      String(duration),
      output,
    ],
    { timeoutMs: 180_000, signal, ownProcessGroup: true, maxBytes: 4 * 1024 * 1024 },
  );
}
async function main() {
  const args = parseHybridShowcaseArgs(process.argv.slice(2));
  const serveUrl = localBundle(args.bundle),
    out = outputDirectory(args.out, 'hybrid-showcase-');
  const load = (name) =>
    JSON.parse(readFileSync(path.join(ROOT, 'scripts/explainer-stills/fixtures', name), 'utf8'));
  const reels = {
    showcase: load('hybrid-showcase.json'),
    gallery: load('detroit-landmarks.json').filter(
      (row) => row.scene.visualMode === 'hybrid' && row.scene.preset === 'landmark-focus',
    ),
  };
  const report = {
    status: 'running',
    bundle: { path: serveUrl, sha256: bundleDigest(serveUrl) },
    reels: [],
    limits: [
      'Authored educational animation reels, not live AI or real Detroit financial/model data.',
      'No human narration or music. Existing CC0 scene ticks only. Gallery excludes the rights-blocked Spirit sculpture.',
      'Production-route caption/alpha proofs are separate.',
    ],
  };
  const started = performance.now(),
    controller = new AbortController();
  let browser,
    cancelCurrent = () => {};
  const stop = () => {
    controller.abort();
    cancelCurrent();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const { selectComposition, renderStill, renderMedia, makeCancelSignal } = await import(
      '@remotion/renderer'
    );
    const opened = await openLocalBrowser();
    browser = opened.browser;
    for (const [name, rows] of Object.entries(reels))
      for (const aspect of ['9:16', '16:9']) {
        controller.signal.throwIfAborted();
        const plan = hybridSequencePlan(rows, aspect),
          stem = `${name}-${aspect.replace(':', 'x')}`;
        const shared = { ...opened.shared, serveUrl, inputProps: plan.inputProps };
        const selected = await selectComposition({ ...shared, id: 'ExplainerSequence' });
        const composition = {
          ...selected,
          width: plan.width,
          height: plan.height,
          fps: 30,
          durationInFrames: plan.durationInFrames,
        };
        const result = {
          name,
          aspect,
          frames: [],
          media: null,
          durationSec: plan.durationInFrames / 30,
          width: plan.width,
          height: plan.height,
          fps: 30,
        };
        report.reels.push(result);
        const cancellation = makeCancelSignal();
        cancelCurrent = cancellation.cancel;
        const timer = setTimeout(cancelCurrent, 90 * 60 * 1000);
        try {
          for (const frame of plan.frames) {
            controller.signal.throwIfAborted();
            const output = path.join(out, `${stem}-f${frame}.png`),
              start = performance.now();
            await renderStill({
              ...shared,
              composition,
              frame,
              output,
              cancelSignal: cancellation.cancelSignal,
            });
            result.frames.push({
              frame,
              output,
              elapsedMs: performance.now() - start,
              sha256: digest(readFileSync(output)),
            });
            console.log(`${stem}: frame ${frame}`);
          }
          if (args.media) {
            const raw = path.join(out, `${stem}-silent.mp4`),
              output = path.join(out, `${stem}.mp4`),
              start = performance.now();
            await renderMedia({
              ...shared,
              composition,
              outputLocation: raw,
              codec: 'h264',
              concurrency: 1,
              cancelSignal: cancellation.cancelSignal,
            });
            await mixExistingSfx(raw, output, plan.checks, result.durationSec, controller.signal);
            result.media = {
              output,
              silentIntermediate: raw,
              elapsedMs: performance.now() - start,
              sfxCues: plan.checks,
            };
            console.log(`${stem}: media ${output}`);
          }
        } finally {
          clearTimeout(timer);
          cancelCurrent = () => {};
        }
      }
    if (bundleDigest(serveUrl) !== report.bundle.sha256)
      throw new Error('Pinned bundle changed during rendering');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    try {
      if (browser) await browser.close({ silent: true });
    } finally {
      report.elapsedMs = performance.now() - started;
      writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Hybrid showcase report: ${path.join(out, 'report.json')}`);
    }
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  await main();
