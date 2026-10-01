#!/usr/bin/env node
/** Local, opt-in proof of the real ExplainerSequence composition. No downloads or installs. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { normalizeFixtures } from './fixture-schema.mjs';
import {
  bundleDigest,
  localBundle,
  openLocalBrowser,
  outputDirectory,
  ROOT,
} from './harness-runtime.mjs';

export function continuityPlan(rows) {
  const fixtures = normalizeFixtures(rows);
  if (fixtures.length < 2 || fixtures.length > 5)
    throw new Error('Continuity needs two to five authored scenes');
  const first = fixtures[0];
  const subject = first.scene.subject;
  if (typeof subject !== 'string' || !subject.trim())
    throw new Error('Continuity needs a named source subject');
  const allowed = [
    'house-cutaway',
    'house-build',
    'house-renovation',
    'property-access',
    'neighborhood',
    'floorplan-fit',
    'house-options',
    'property-lifecycle',
    'agent-team',
  ];
  for (const fixture of fixtures) {
    if (!allowed.includes(fixture.scene.kind))
      throw new Error('Continuity only supports authored house-world scenes');
    if (fixture.scene.subject !== subject || !isDeepStrictEqual(fixture.palette, first.palette))
      throw new Error('Continuity scenes must preserve their subject and palette');
    if (fixture.durationSec < 5 || fixture.durationSec > 12)
      throw new Error('Continuity scenes must be 5–12 seconds');
    const times = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'].map(
      (field) => fixture.scene[field],
    );
    if (
      times.some(
        (time, index) =>
          !Number.isFinite(time) ||
          time < 0 ||
          time >= fixture.durationSec ||
          (index > 0 && time - times[index - 1] < 0.35),
      )
    )
      throw new Error('Continuity needs five finite ordered beats');
    if (fixture.scene.resolveAt > fixture.durationSec - 0.8)
      throw new Error('Continuity needs a readable final hold');
  }
  const transitionFrames = 14;
  const durations = fixtures.map((fixture) => Math.round(fixture.durationSec * 30));
  const boundaries = [];
  let elapsed = 0;
  for (const duration of durations.slice(0, -1)) {
    elapsed += duration;
    boundaries.push(elapsed);
  }
  const frames = [];
  let start = 0;
  for (const [index, fixture] of fixtures.entries()) {
    frames.push(
      start + Math.round(fixture.scene.responseAt * 30),
      start + Math.round(fixture.scene.resolveAt * 30),
    );
    start += durations[index];
  }
  for (const boundary of boundaries) frames.push(boundary - 1, boundary + 7, boundary + 15);
  const durationInFrames = durations.reduce((sum, duration) => sum + duration, 0) + 9;
  return {
    inputProps: {
      scenes: fixtures.map((fixture, index) => ({
        scene: fixture.scene,
        durationInFrames: durations[index] + (index === fixtures.length - 1 ? 9 : transitionFrames),
      })),
      transitions: boundaries.map(() => ({ kind: 'fade', durationInFrames: transitionFrames })),
      layout: 'stack',
      aspect: '9:16',
      ...(first.palette ? { palette: first.palette } : {}),
      enter: true,
      exit: true,
      visibleSec: durations.reduce((sum, duration) => sum + duration, 0) / 30,
    },
    durationInFrames,
    frames: [...new Set(frames)].sort((a, b) => a - b),
    mediaRange: [boundaries[0] - 15, boundaries[0] + 44],
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      bundle: { type: 'string', default: path.join(ROOT, 'out/remotion') },
      out: { type: 'string' },
      media: { type: 'boolean', default: false },
    },
  });
  const source = path.join(ROOT, 'scripts/explainer-stills/fixtures/clay-continuity.json');
  const plan = continuityPlan(JSON.parse(readFileSync(source, 'utf8')));
  const serveUrl = localBundle(values.bundle);
  const out = outputDirectory(values.out, 'clay-continuity-');
  const report = {
    status: 'running',
    bundle: { path: serveUrl, sha256: bundleDigest(serveUrl) },
    frames: [],
    media: null,
    limits: [
      'Authored fixtures, not live AI output. Movie is a silent two-second transition excerpt, not a complete clip export.',
    ],
  };
  const started = performance.now();
  let browser;
  try {
    const { selectComposition, renderStill, renderMedia, makeCancelSignal } = await import(
      '@remotion/renderer'
    );
    const opened = await openLocalBrowser();
    browser = opened.browser;
    const shared = { ...opened.shared, serveUrl, inputProps: plan.inputProps };
    const selected = await selectComposition({ ...shared, id: 'ExplainerSequence' });
    const composition = { ...selected, durationInFrames: plan.durationInFrames };
    for (const frame of plan.frames) {
      const output = path.join(out, `sequence-f${frame}.png`);
      await renderStill({ ...shared, composition, frame, output });
      report.frames.push({ frame, output });
      console.log(`Continuity frame ${frame}: ${output}`);
    }
    if (values.media) {
      const output = path.join(out, 'house-transition.mp4');
      const { cancel, cancelSignal } = makeCancelSignal();
      const deadline = setTimeout(cancel, 180_000);
      try {
        await renderMedia({
          ...shared,
          composition,
          outputLocation: output,
          codec: 'h264',
          concurrency: 1,
          frameRange: plan.mediaRange,
          cancelSignal,
        });
        report.media = { output, frames: 60, fps: 30, range: plan.mediaRange };
      } finally {
        clearTimeout(deadline);
      }
    }
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    try {
      if (browser) await browser.close({ silent: true });
    } finally {
      report.elapsedMs = performance.now() - started;
      const destination = path.join(out, 'report.json');
      writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Continuity report: ${destination}`);
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
