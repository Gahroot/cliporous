#!/usr/bin/env node
/** Native production-bundle evidence. No builds, browser downloads, or paid/model calls. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ffprobe from '@ffprobe-installer/ffprobe';
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import ffmpeg from 'ffmpeg-static';
import {
  assertBusinessSourceUnchanged,
  captureBusinessLineage,
} from './business-source-lineage.mjs';
import { REQUIRED_TARGET_COUNT } from './fixture-manifest.mjs';
import {
  bundleDigest,
  digest,
  localBundle,
  openLocalBrowser,
  outputDirectory,
  rendererConfiguration,
  startReport,
  withDeadline,
} from './harness-runtime.mjs';
import {
  TECHNOLOGY_POSE_EXPORTS,
  verifyTechnologyPose,
  withTechnologyPoses,
} from './system-poses.mjs';
import {
  alphaStats,
  compareCosts,
  executionCoverage,
  pngEvidence,
} from './verification-evidence.mjs';
import {
  HELP,
  parseVerificationArgs,
  selectVerificationPlan,
  shuffledSamples,
} from './verification-options.mjs';

function probeMovie(file) {
  return JSON.parse(
    execFileSync(
      ffprobe.path,
      ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', file],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
    ),
  ).streams.find((s) => s.codec_type === 'video');
}

function decodeAlpha(file, frame, width, height) {
  const bytes = execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-i',
      file,
      '-vf',
      `select=eq(n\\,${frame}),alphaextract`,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-',
    ],
    { timeout: 60000, maxBuffer: width * height + 1024 * 1024 },
  );
  assert.equal(bytes.length, width * height, 'Decoded alpha dimensions');
  return {
    ...alphaStats(bytes),
    corners: [bytes[0], bytes[width - 1], bytes[(height - 1) * width], bytes[bytes.length - 1]],
  };
}

export function movieRange(plan, requested) {
  const count = plan.composition.durationInFrames;
  const length = requested === 0 ? count : Math.min(count, requested);
  const center = plan.samples[Math.floor(plan.samples.length * 0.65)].frame;
  const start =
    requested === 0 ? 0 : Math.max(0, Math.min(count - length, center - Math.floor(length / 2)));
  return [start, start + length - 1];
}

/** renderMedia/renderStill serialize composition.props separately from inputProps. Keep both in sync, including controls. */
export function resolvedComposition(selected, dimensions, inputProps) {
  return { ...selected, ...dimensions, props: { ...selected.props, ...inputProps } };
}

async function renderWithDeadline(operation, timeoutMs) {
  const signal = makeCancelSignal();
  return withDeadline(() => operation(signal.cancelSignal), signal.cancel, timeoutMs);
}

/** Remotion's cancellation rejects before its async page cleanup completes. Observe actual target teardown. */
async function waitForPageCleanup(browser, maximum, timeoutMs) {
  let check;
  try {
    return await withDeadline(
      () =>
        new Promise((resolve, reject) => {
          check = () => {
            browser.pages().then((pages) => {
              if (pages.length <= maximum) resolve(pages.length);
            }, reject);
          };
          browser.on('targetdestroyed', check);
          check();
        }),
      () => {},
      timeoutMs,
    );
  } finally {
    if (check) browser.off('targetdestroyed', check);
  }
}

export async function runVerification(args = process.argv.slice(2), mode = 'motion') {
  const options = parseVerificationArgs(args, mode);
  if (options.help) {
    console.log(HELP);
    return;
  }
  const { plan, fixtureFiles } = selectVerificationPlan(options, mode);
  const serveUrl = localBundle(options.bundle);
  const lineage = captureBusinessLineage(plan, serveUrl);
  const out = outputDirectory(options.out, `batchclip-${mode}-check-`);
  const configuration = rendererConfiguration({ softwareRaster: options['software-raster'] });
  const configurationHash = digest(configuration);
  const stats = startReport(out, mode, {
    command: [process.execPath, `scripts/explainer-stills/verify-${mode}.mjs`, ...args],
    bundle: lineage?.bundle ?? { path: serveUrl, sha256: bundleDigest(serveUrl) },
    ...(lineage ? { source: lineage.source } : {}),
    fixtureFiles,
    rendererConfiguration: configuration,
    rendererConfigurationHash: configurationHash,
    selectedCases: plan.length,
    selectedFixtures: [...new Set(plan.map((p) => p.fixtureName))],
    requested: {
      determinism: !options['no-determinism'],
      movies: !options['no-media'],
      mediaFrames: options['media-frames'],
      matrix: !options['native-cases'],
      controls: !options['no-controls'],
      cleanupProbe: options['probe-cleanup'],
    },
    plannedCriticalFrames: plan.reduce((n, p) => n + p.samples.length, 0),
    plans: plan.map((p) => ({
      id: p.id,
      fixtureName: p.fixtureName,
      covers: p.covers,
      inputHash: p.inputHash,
      composition: p.composition,
      samples: p.samples,
      inputProps: p.inputProps,
    })),
    checks: [],
    comparisons: [],
    cleanup: { browserOpened: false, browserClosed: false },
    audio: {
      status: 'not-tested',
      reason:
        'Explainer visuals are silent; production cue mixing belongs to verify-systems-e2e.mjs.',
    },
  });
  stats.report.limits.push(
    'Critical PNG execution does not establish semantic implementation, visual quality, safe bounds at unsampled frames, or current-source/bundle correspondence. Bundle SHA256 is pinned.',
    'Serial/shuffled/parallel tests use public renderStill: each seek gets a fresh Remotion page in the same browser, not a persistent React instance.',
    'Cost ratios are measured, not a budget approval threshold. No audio is synthesized here.',
  );
  let browser;
  let failure;
  const cleanupSignals = [];
  try {
    if (options['dry-run']) {
      stats.report.execution = 'not-started';
      console.log(
        `Planned only: ${plan.length} cases, ${stats.report.plannedCriticalFrames} critical frames. No evidence rendered.`,
      );
      return;
    }
    const technologyPlans = [
      ...new Map(
        plan
          .filter((p) => Object.hasOwn(TECHNOLOGY_POSE_EXPORTS, p.inputProps.scene.kind))
          .map((p) => [p.fixtureName, p]),
      ).values(),
    ];
    if (technologyPlans.length) {
      await stats.measure({ operation: 'source-poses' }, async (entry) => {
        await withTechnologyPoses((poses, metadata) => {
          entry.source = metadata;
          entry.results = technologyPlans.map((p) =>
            verifyTechnologyPose(
              {
                scene: p.inputProps.scene,
                durationSec: p.composition.durationInFrames / p.composition.fps,
              },
              poses,
            ),
          );
        });
      });
    }
    assert(ffmpeg && existsSync(ffmpeg), 'Local ffmpeg-static required');
    const opened = await openLocalBrowser({ softwareRaster: options['software-raster'] });
    browser = opened.browser;
    stats.report.browser = opened.metadata;
    stats.report.cleanup.browserOpened = true;
    const shared = { ...opened.shared, serveUrl, logLevel: 'error' };
    const abort = () => {
      failure ??= new Error('Interrupted');
      void browser.close({ silent: true }).catch(() => {});
    };
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, abort);
      cleanupSignals.push([signal, abort]);
    }
    const controls = new Map();

    async function renderMovie(p, composition, frameRange, label, control = false) {
      const output = path.join(out, `${label}.mov`);
      const resolved = resolvedComposition(composition, p.composition, p.inputProps);
      const requestedFrames = frameRange[1] - frameRange[0] + 1;
      let metric;
      await stats.measure(
        {
          operation: 'media',
          rendererConfigurationHash: configurationHash,
          planId: p.id,
          inputHash: p.inputHash,
          output,
          width: composition.width,
          height: composition.height,
          fps: composition.fps,
          codec: 'prores-4444',
          paletteHash: digest(p.inputProps.palette ?? 'default'),
          layout: p.inputProps.layout,
          aspect: p.inputProps.aspect,
          frameRange,
          requestedFrames,
          fullMotion: requestedFrames === composition.durationInFrames,
          control,
          audio: 'silent',
          concurrency: 1,
          scene: p.inputProps.scene,
          resolvedPropsHash: digest(resolved.props),
        },
        async (entry) => {
          metric = entry;
          await renderWithDeadline(
            (cancelSignal) =>
              renderMedia({
                ...shared,
                inputProps: p.inputProps,
                composition: resolved,
                outputLocation: output,
                codec: 'prores',
                proResProfile: '4444',
                pixelFormat: 'yuva444p10le',
                imageFormat: 'png',
                concurrency: 1,
                frameRange,
                overwrite: false,
                cancelSignal,
                onProgress: ({ renderedFrames }) => {
                  entry.renderedFrames = Math.max(entry.renderedFrames, renderedFrames);
                },
              }),
            options['timeout-ms'],
          );
          assert.equal(
            entry.renderedFrames,
            requestedFrames,
            'Render progress must account for every requested frame',
          );
          entry.bytes = statSync(output).size;
          entry.sha256 = digest(readFileSync(output));
        },
      );
      await stats.measure(
        { operation: 'media-decode', planId: p.id, output, control },
        async (entry) => {
          const video = probeMovie(output);
          entry.video = video;
          assert(video, 'No video stream');
          assert.equal(video.codec_name, 'prores');
          assert.match(video.profile, /4444/);
          assert.match(video.pix_fmt, /^yuva444p(?:10|12)le$/);
          assert.equal(video.width, composition.width);
          assert.equal(video.height, composition.height);
          assert.equal(Number(video.nb_read_frames), requestedFrames);
          const candidates = [
            ...new Set([Math.floor(requestedFrames * 0.65), requestedFrames - 1]),
          ];
          entry.alpha = candidates.map((frame) => ({
            frame,
            ...decodeAlpha(output, frame, video.width, video.height),
          }));
          if (p.transparent) {
            for (const a of entry.alpha) {
              assert(
                a.hasTransparentAndVisible,
                'Over layout must contain both transparent and visible pixels',
              );
              assert(
                a.corners.every((v) => v === 0),
                'Native over-layout corners must be transparent',
              );
            }
          } else {
            for (const a of entry.alpha)
              assert.equal(a.min, 255, 'Opaque stage layouts must fill their canvas');
          }
        },
      );
      return metric;
    }

    for (let index = 0; index < plan.length; index++) {
      if (failure) throw failure;
      const p = plan[index];
      console.log(
        `[${index + 1}/${plan.length}] ${p.label} ${p.composition.width}x${p.composition.height}: ${p.samples.length} critical frames`,
      );
      const selected = await withDeadline(
        () => selectComposition({ ...shared, id: 'ExplainerScene', inputProps: p.inputProps }),
        () => {
          void browser.close({ silent: true }).catch(() => {});
        },
        options['timeout-ms'],
      );
      const composition = resolvedComposition(selected, p.composition, p.inputProps); // stageCanvasFor, never a thumbnail width
      const references = new Map();
      async function still(sample, pass) {
        const output = path.join(out, `${index}-${pass}-${sample.name}.png`);
        return stats.measure(
          {
            operation: 'still',
            rendererConfigurationHash: configurationHash,
            planId: p.id,
            inputHash: p.inputHash,
            frame: sample.frame,
            pass,
            output,
            width: composition.width,
            height: composition.height,
            fps: composition.fps,
            layout: p.inputProps.layout,
            aspect: p.inputProps.aspect,
            scene: p.inputProps.scene,
            reasons: sample.reasons,
          },
          async (entry) => {
            await renderWithDeadline(
              (cancelSignal) =>
                renderStill({
                  ...shared,
                  inputProps: p.inputProps,
                  composition,
                  frame: sample.frame,
                  output,
                  imageFormat: 'png',
                  overwrite: false,
                  cancelSignal,
                }),
              options['timeout-ms'],
            );
            entry.renderedFrames = 1;
            Object.assign(entry, pngEvidence(output, composition.width, composition.height));
            if (pass !== 'serial')
              assert.equal(
                entry.sha256,
                references.get(sample.frame),
                `${p.label} frame ${sample.frame} differs on ${pass} seek`,
              );
            return entry.sha256;
          },
        );
      }
      for (const sample of p.samples) references.set(sample.frame, await still(sample, 'serial'));
      if (!options['no-determinism']) {
        const shuffled = shuffledSamples(p.samples);
        for (const sample of shuffled) await still(sample, 'shuffled');
        // Two pages at a time; allSettled prevents early rejection racing browser cleanup.
        for (let i = 0; i < shuffled.length; i += 2) {
          const results = await Promise.allSettled(
            shuffled.slice(i, i + 2).map((s) => still(s, 'parallel')),
          );
          const rejected = results.find((r) => r.status === 'rejected');
          if (rejected) throw rejected.reason;
        }
        stats.report.checks.push({
          planId: p.id,
          check: 'serial-shuffled-parallel-byte-equality',
          frames: p.samples.map((s) => s.frame),
          status: 'passed',
        });
      }
      if (!options['no-media']) {
        const range = movieRange(p, options['media-frames']);
        const candidate = await renderMovie(p, composition, range, `${index}-motion`);
        if (!options['no-controls']) {
          const controlScene =
            p.inputProps.scene.kind === 'hero' ||
            mode === 'systems' ||
            p.covers.some((c) => c.category === 'kind')
              ? { kind: 'hero', prop: 'gears', label: 'Working system', at: 0.4 }
              : {
                  kind: 'statement',
                  words: [
                    { text: 'Small', at: 0.2 },
                    { text: 'steps', at: 0.6 },
                  ],
                  accentIndex: 1,
                };
          const inputProps = { ...p.inputProps, scene: controlScene };
          const key = digest({
            inputProps,
            composition: p.composition,
            range,
            rendererConfigurationHash: configurationHash,
          });
          if (!controls.has(key))
            controls.set(
              key,
              await renderMovie(
                { ...p, id: `control:${key}`, inputProps, inputHash: key },
                composition,
                range,
                `${index}-control`,
                true,
              ),
            );
          stats.report.comparisons.push({
            planId: p.id,
            controlOutput: controls.get(key).output,
            ...compareCosts(candidate, controls.get(key)),
          });
        }
      }
      stats.save();
    }
    if (options['probe-cleanup']) {
      const p = plan[0];
      const selected = await selectComposition({
        ...shared,
        id: 'ExplainerScene',
        inputProps: p.inputProps,
      });
      const composition = resolvedComposition(selected, p.composition, p.inputProps);
      const pagesBefore = (await browser.pages()).length;
      await stats.measure(
        { operation: 'probe-invalid-frame', expectedFailure: true },
        async (entry) => {
          const output = path.join(out, 'expected-invalid-frame.png');
          // Installed Remotion deliberately accepts negative indices (-1 = final frame).
          await assert.rejects(
            () =>
              renderWithDeadline(
                (cancelSignal) =>
                  renderStill({
                    ...shared,
                    composition,
                    inputProps: p.inputProps,
                    frame: composition.durationInFrames,
                    imageFormat: 'png',
                    output,
                    cancelSignal,
                  }),
                options['timeout-ms'],
              ),
            (error) => {
              entry.observedError = error.message;
              return /frame/i.test(error.message);
            },
          );
          assert(!existsSync(output), 'Invalid-frame render must not produce a success artifact');
          entry.pagesAfter = await waitForPageCleanup(browser, pagesBefore, options['timeout-ms']);
        },
      );
      await stats.measure(
        { operation: 'probe-browser-error', expectedFailure: true },
        async (entry) => {
          const output = path.join(out, 'expected-render-error.png');
          let pagesCreated = 0;
          const created = () => {
            pagesCreated++;
          };
          browser.on('targetcreated', created);
          try {
            // Valid composition, deliberately invalid runtime props: exercises browser JS error handling, not CLI validation.
            await assert.rejects(
              () =>
                renderWithDeadline(
                  (cancelSignal) =>
                    renderStill({
                      ...shared,
                      composition: resolvedComposition(composition, p.composition, {
                        ...p.inputProps,
                        scene: null,
                      }),
                      inputProps: { ...p.inputProps, scene: null },
                      frame: 0,
                      imageFormat: 'png',
                      output,
                      cancelSignal,
                    }),
                  options['timeout-ms'],
                ),
              (error) => {
                entry.observedError = error.message;
                return /null|kind|scene/i.test(error.message);
              },
            );
          } finally {
            browser.off('targetcreated', created);
          }
          entry.pagesCreated = pagesCreated;
          assert(pagesCreated > 0, 'Failure must occur after creating an actual browser page');
          assert(!existsSync(output), 'Failed browser render must not produce a success artifact');
          entry.pagesAfter = await waitForPageCleanup(browser, pagesBefore, options['timeout-ms']);
        },
      );
      await stats.measure(
        {
          operation: 'probe-live-cancellation',
          expectedFailure: true,
          fps: composition.fps,
          output: path.join(out, 'expected-cancelled.mov'),
        },
        async (entry) => {
          const signal = makeCancelSignal();
          let requestedCancellation = false;
          await assert.rejects(
            () =>
              withDeadline(
                () =>
                  renderMedia({
                    ...shared,
                    composition,
                    inputProps: p.inputProps,
                    codec: 'prores',
                    proResProfile: '4444',
                    pixelFormat: 'yuva444p10le',
                    imageFormat: 'png',
                    concurrency: 1,
                    outputLocation: entry.output,
                    overwrite: false,
                    cancelSignal: signal.cancelSignal,
                    onStart: () => {
                      entry.renderStarted = true;
                    },
                    onProgress: ({ renderedFrames }) => {
                      entry.renderedFrames = Math.max(entry.renderedFrames, renderedFrames);
                      if (renderedFrames > 0 && !requestedCancellation) {
                        requestedCancellation = true;
                        stats.save();
                        signal.cancel();
                      }
                    },
                  }),
                signal.cancel,
                options['timeout-ms'],
              ),
            (error) => {
              entry.observedError = error.message;
              return /^render(?:Media|Frames)\(\) got cancelled$/.test(error.message);
            },
          );
          assert(
            entry.renderStarted && requestedCancellation && entry.renderedFrames > 0,
            'Cancellation must interrupt a live render after a rendered frame',
          );
          entry.partialOutputBytes = existsSync(entry.output) ? statSync(entry.output).size : 0;
          entry.pagesAfter = await waitForPageCleanup(browser, pagesBefore, options['timeout-ms']);
        },
      );
      // A successful native render after both failure paths proves the shared browser is still usable.
      await stats.measure({ operation: 'probe-recovery', fps: composition.fps }, async (entry) => {
        const output = path.join(out, 'cleanup-recovery.png');
        await renderWithDeadline(
          (cancelSignal) =>
            renderStill({
              ...shared,
              composition,
              inputProps: p.inputProps,
              frame: 0,
              imageFormat: 'png',
              output,
              overwrite: false,
              cancelSignal,
            }),
          options['timeout-ms'],
        );
        entry.renderedFrames = 1;
        Object.assign(entry, {
          output,
          ...pngEvidence(output, composition.width, composition.height),
        });
        entry.pagesAfter = await waitForPageCleanup(browser, pagesBefore, options['timeout-ms']);
      });
      stats.report.checks.push({
        check: 'invalid-frame-browser-error-live-cancellation-and-recovery',
        status: 'passed',
        pagesBefore,
        note: 'Cancelled partial output is retained as evidence and never counted as a successful movie.',
      });
    }
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    for (const [signal, listener] of cleanupSignals) process.removeListener(signal, listener);
    try {
      if (browser) {
        await browser.close({ silent: true });
        stats.report.cleanup.browserClosed = true;
      }
    } catch (error) {
      failure ??= error;
      stats.report.cleanup.error = error.message;
    }
    if (options['dry-run']) stats.report.execution = 'not-started';
    try {
      assertBusinessSourceUnchanged(lineage);
      stats.report.coverage = executionCoverage(plan, [stats.report]);
      stats.report.coverageScope = `Selected fixture plans only. Run coverage.mjs against ALL fixture plans for a ${REQUIRED_TARGET_COUNT}-item audit.`;
    } catch (error) {
      failure ??= error;
      stats.report.coverageError = error.message;
    } finally {
      stats.finish(failure);
    }
    if (failure) process.exitCode = 1;
  }
  console.log(
    `Selected checks finished; no full-library or visual approval implied. Evidence: ${out}`,
  );
  return stats.reportPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runVerification().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
