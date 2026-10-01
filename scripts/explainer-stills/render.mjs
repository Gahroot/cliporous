#!/usr/bin/env node
/**
 * Render explainer PNGs + optional ffmpeg contact sheets using ANGLE.
 * Usage: render.mjs <fixtures.json> [filter] [--out directory] [--bundle local-directory] [--software-raster]
 * Schema/limits/filenames: fixture-schema.mjs. Bare fixture filenames resolve under fixtures/.
 * Default output: a fresh $TMPDIR/explainer-stills-* directory, printed at startup.
 * --out must be new/empty and outside the repository (including symlink targets).
 * --bundle reuses a local Remotion bundle with index.html and public/fonts; it is never deleted.
 * A compatible Remotion Chrome Headless Shell must already be provisioned; no auto-downloads.
 * Browser and throwaway bundle/public resources are cleaned in finally; PNGs are retained.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { stageCanvasFor } from '../../src/main/remotion/compositions/explainer/types.ts';
import { createRenderPlan, normalizeFixtures } from './fixture-schema.mjs';
import {
  bundleDigest,
  digest,
  openLocalBrowser,
  rendererConfiguration,
  startReport,
} from './harness-runtime.mjs';
import { parseStillsArgs } from './verification-options.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
function outputDirectory(requested) {
  if (requested === undefined) return mkdtempSync(path.join(tmpdir(), 'explainer-stills-'));
  const target = path.resolve(requested);
  // Resolve the existing ancestor too: /outside/link-to-repo/new must not bypass the check.
  let ancestor = target;
  const missing = [];
  while (!existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  const resolved = path.join(realpathSync(ancestor), ...missing);
  for (const candidate of [target, resolved]) {
    const relative = path.relative(realpathSync(root), candidate);
    if (
      relative === '' ||
      (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    ) {
      throw new Error(
        '--out must be outside the repository; use an empty directory under the OS temp directory.',
      );
    }
  }
  mkdirSync(target, { recursive: true });
  if (readdirSync(target).length > 0) {
    throw new Error(`--out ${target} is not empty; choose a fresh directory for this run.`);
  }
  return realpathSync(target);
}

function localBundle(directory) {
  const resolved = path.resolve(directory);
  try {
    if (statSync(resolved).isDirectory() && statSync(path.join(resolved, 'index.html')).isFile()) {
      return resolved;
    }
  } catch {
    // Give the same actionable prerequisite for a missing directory or index.
  }
  throw new Error(
    `--bundle ${resolved} must be an existing local Remotion bundle directory containing index.html; omit --bundle to build once for this run.`,
  );
}

function contactSheet(files, sheet, label) {
  if (files.length < 2) return;
  const inputs = files.flatMap((file) => ['-i', file]);
  const filterGraph = `${files.map((_, i) => `[${i}:v]scale=540:-1[s${i}]`).join(';')};${files
    .map((_, i) => `[s${i}]`)
    .join('')}hstack=inputs=${files.length}`;
  try {
    execFileSync(
      ffmpegPath ?? 'ffmpeg',
      [
        '-n',
        '-loglevel',
        'error',
        ...inputs,
        '-filter_complex',
        filterGraph,
        '-frames:v',
        '1',
        sheet,
      ],
      { stdio: 'pipe', timeout: 60000 },
    );
    console.log(`✓ ${label} → ${sheet}`);
  } catch (error) {
    rmSync(sheet, { force: true });
    console.warn(
      `${label}: contact sheet skipped (bundled FFmpeg or FFmpeg on PATH required): ${error.message}`,
    );
  }
}

async function main() {
  const args = parseStillsArgs(process.argv.slice(2));
  const fixturesPath =
    path.isAbsolute(args.fixturesArg) || existsSync(args.fixturesArg)
      ? path.resolve(args.fixturesArg)
      : path.join(root, 'scripts', 'explainer-stills', 'fixtures', args.fixturesArg);
  let fixtures;
  try {
    fixtures = normalizeFixtures(JSON.parse(readFileSync(fixturesPath, 'utf8')));
  } catch (error) {
    throw new Error(`${fixturesPath}: ${error.message}`, { cause: error });
  }
  const plan = createRenderPlan(
    fixtures.filter((fx) => !args.filter || fx.name.includes(args.filter)),
  );
  if (plan.length === 0)
    throw new Error(`No fixtures match ${JSON.stringify(args.filter ?? '')} in ${fixturesPath}`);
  let serveUrl = args.bundle === undefined ? undefined : localBundle(args.bundle);
  const outDir = outputDirectory(args.out);
  console.log(`Output: ${outDir}`);

  const { renderStill, selectComposition } = await import('@remotion/renderer');
  const configuration = rendererConfiguration({ softwareRaster: args.softwareRaster });
  const configurationHash = digest(configuration);
  const stats = startReport(outDir, 'stills', {
    fixturesPath,
    plannedCases: plan.length,
    rendererConfiguration: configuration,
    rendererConfigurationHash: configurationHash,
  });
  let browser;
  let workDir;
  let failure;
  try {
    const opened = await openLocalBrowser({ softwareRaster: args.softwareRaster });
    browser = opened.browser;
    stats.report.browser = opened.metadata;
    if (!serveUrl) {
      workDir = mkdtempSync(path.join(tmpdir(), 'explainer-stills-work-'));
      const publicDir = path.join(workDir, 'public');
      cpSync(path.join(root, 'resources', 'fonts'), path.join(publicDir, 'fonts'), {
        recursive: true,
      });
      const { bundle } = await import('@remotion/bundler');
      const { enableTailwind } = await import('@remotion/tailwind');
      serveUrl = await bundle({
        entryPoint: path.join(root, 'src', 'main', 'remotion', 'index.ts'),
        rootDir: root,
        outDir: path.join(workDir, 'bundle'),
        publicDir,
        webpackOverride: (config) => {
          const tw = enableTailwind(config, {
            configLocation: path.join(root, 'tailwind.config.js'),
          });
          return {
            ...tw,
            resolve: {
              ...tw.resolve,
              alias: {
                ...(tw.resolve?.alias ?? {}),
                '@': path.join(root, 'src', 'renderer', 'src'),
                '@shared': path.join(root, 'src', 'shared'),
              },
            },
          };
        },
      });
    }
    stats.report.bundle = { path: serveUrl, sha256: bundleDigest(serveUrl) };
    const shared = { ...opened.shared, serveUrl };
    for (const entry of plan) {
      try {
        const inputProps = entry.inputProps;
        const selected = await selectComposition({ ...shared, id: 'ExplainerScene', inputProps });
        const native = stageCanvasFor(inputProps.layout, inputProps.aspect);
        const composition = {
          ...selected,
          ...entry.composition,
          width: native.width,
          height: native.height,
        };
        const files = [];
        for (const sample of entry.samples) {
          const output = path.join(outDir, sample.file);
          try {
            await stats.measure(
              {
                operation: 'still',
                rendererConfigurationHash: configurationHash,
                label: entry.label,
                frame: sample.frame,
                sample: sample.name,
                output,
                fps: composition.fps,
                width: composition.width,
                height: composition.height,
                inputHash: digest({ inputProps, composition: entry.composition }),
                layout: inputProps.layout,
                aspect: inputProps.aspect,
                scene: inputProps.scene,
              },
              async (metric) => {
                await renderStill({
                  ...shared,
                  composition,
                  inputProps,
                  frame: sample.frame,
                  output,
                  imageFormat: 'png',
                  overwrite: false,
                });
                metric.renderedFrames = 1;
                metric.bytes = statSync(output).size;
                metric.sha256 = digest(readFileSync(output));
              },
            );
          } catch (error) {
            throw new Error(
              `sample ${JSON.stringify(sample.name)} (frame ${sample.frame}): ${error.message}`,
              { cause: error },
            );
          }
          files.push(output);
        }
        console.log(`✓ ${entry.label} → ${files.join(', ')}`);
        contactSheet(files, path.join(outDir, entry.sheet), entry.label);
      } catch (error) {
        throw new Error(`${entry.label}: ${error.message}`, { cause: error });
      }
    }
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (browser) await browser.close({ silent: true });
    } catch (error) {
      failure ??= error;
      stats.report.cleanupError = error.message;
    } finally {
      try {
        if (workDir) rmSync(workDir, { recursive: true, force: true });
      } catch (error) {
        failure ??= error;
        stats.report.workDirectoryCleanupError = error.message;
      } finally {
        stats.finish(failure);
      }
    }
  }
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
