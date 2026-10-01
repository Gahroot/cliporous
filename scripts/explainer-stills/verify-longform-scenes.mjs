#!/usr/bin/env node
/** Local-only scene-first production export proof. Never builds, installs or invokes AI.
 * --unit needs no browser/bundle/media. Media mode requires an explicitly approved
 * --bundle (or BATCHCLIP_LONGFORM_BUNDLE); an immutable copy is made before rendering.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundleDigest, onBrowserDownload, outputDirectory } from './harness-runtime.mjs';
import { snapshotBundle } from './snapshot-bundle.mjs';
import { ROOT, runBounded, VITEST } from './verify-systems-e2e.mjs';

const require = createRequire(import.meta.url);
export function parseLongformProofArgs(args, env = process.env) {
  const parsed = {
    unit: false,
    cancelAlpha: false,
    repetitions: 1,
    bundle: env.BATCHCLIP_LONGFORM_BUNDLE,
    out: undefined,
    help: false,
  };
  let repetitionOption = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--unit') parsed.unit = true;
    else if (flag === '--cancel-alpha') parsed.cancelAlpha = true;
    else if (flag === '--stress' || flag === '--long-stress' || flag === '--repetitions') {
      if (repetitionOption) throw new Error('Use only one repetition option');
      repetitionOption = true;
      const value = flag === '--repetitions' ? args[++index] : flag === '--stress' ? '4' : '22';
      if (!value || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 24)
        throw new Error('--repetitions requires an integer from 1 to 24');
      parsed.repetitions = Number(value);
    } else if (flag === '--help') parsed.help = true;
    else if (flag === '--bundle' || flag === '--out') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a local directory`);
      parsed[flag === '--bundle' ? 'bundle' : 'out'] = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (parsed.cancelAlpha && (parsed.unit || repetitionOption))
    throw new Error(
      '--cancel-alpha is a separate small media proof; do not combine with unit/stress',
    );
  if (!parsed.unit && !parsed.help && !parsed.bundle)
    throw new Error(
      'Media proof requires --bundle <approved snapshot directory>; no lazy builds are allowed.',
    );
  return parsed;
}

/** This proof exercises checklist, spatial rooms and token attention, not Detroit.
 * Keep all other source freshness checks, and record unrelated Detroit differences
 * rather than claiming that this snapshot proves those unexercised compositions.
 */
export function fixtureBundleEvidence(bundle) {
  const map = JSON.parse(readFileSync(join(bundle, 'bundle.js.map'), 'utf8'));
  const checked = [];
  const formattedEquivalent = [];
  const unexercisedDifferences = [];
  const formatted = (text, file) => {
    const result = spawnSync(
      process.execPath,
      [join(ROOT, 'node_modules/@biomejs/biome/bin/biome'), 'format', `--stdin-file-path=${file}`],
      { input: text, encoding: 'utf8', timeout: 10_000, maxBuffer: 4 * 1024 * 1024 },
    );
    assert.equal(
      result.status,
      0,
      `Cannot verify formatting-only difference in ${file}: ${result.stderr}`,
    );
    assert.ok(result.stdout, 'Formatter returned no source');
    return result.stdout;
  };
  map.sources.forEach((source, index) => {
    const relative = source
      .replaceAll('\\\\', '/')
      .match(/(?:^|\/)(src\/(?:main\/remotion\/.+|shared\/longform-(?:layout|scenes)\.ts))$/)?.[1];
    if (!relative || !/\.[tj]sx?$/.test(relative)) return;
    const current = readFileSync(join(ROOT, relative), 'utf8');
    if (current !== map.sourcesContent[index]) {
      if (relative.startsWith('src/main/remotion/compositions/explainer/detroit/')) {
        unexercisedDifferences.push(relative);
      } else if (formatted(current, relative) === formatted(map.sourcesContent[index], relative)) {
        // `format` only: no lint fixes, source patches, compilation or dependency downloads.
        // Record byte differences explicitly; never discard whitespace inside source literals.
        formattedEquivalent.push(relative);
        checked.push(relative);
      } else throw new Error(`Stale exercised/shared production bundle source: ${relative}`);
    } else checked.push(relative);
  });
  assert.ok(
    checked.some((path) => path.endsWith('/Root.tsx')),
    'Missing current production composition registry',
  );
  assert.ok(
    checked.some((path) => path.endsWith('/SceneFrame.tsx')),
    'Missing current landscape frame',
  );
  return {
    scope:
      'All bundled Remotion and shared longform geometry/types except unexercised Detroit scenes',
    checked,
    formattedEquivalent,
    unexercisedDifferences,
  };
}

/** Packaged Electron path adapter: production render.ts resolves real bundle/binaries.
 * Only a new owned resources tree is populated; installed binaries are never modified.
 */
function resourcesForProof(out, bundle) {
  const resources = join(out, 'resources');
  mkdirSync(resources);
  cpSync(join(ROOT, 'resources', 'sfx'), join(resources, 'sfx'), { recursive: true });
  const snapshot = snapshotBundle(bundle, join(resources, 'remotion'));
  const evidence = fixtureBundleEvidence(snapshot.path);
  const ffmpeg = require('ffmpeg-static');
  const ffprobe = require('@ffprobe-installer/ffprobe').path;
  assert.ok(
    ffmpeg && existsSync(ffmpeg) && existsSync(ffprobe),
    'Installed FFmpeg and FFprobe required',
  );
  const bin = join(resources, 'bin');
  mkdirSync(bin);
  const suffix = process.platform === 'win32' ? '.exe' : '';
  copyFileSync(ffmpeg, join(bin, `ffmpeg${suffix}`));
  copyFileSync(ffprobe, join(bin, `ffprobe${suffix}`));
  const names =
    process.platform === 'win32'
      ? [`compositor-win32-${process.arch}-msvc`]
      : process.platform === 'darwin'
        ? [`compositor-darwin-${process.arch}`]
        : [`compositor-linux-${process.arch}-gnu`, `compositor-linux-${process.arch}-musl`];
  const name = names.find((candidate) =>
    existsSync(join(ROOT, 'node_modules/@remotion', candidate, `remotion${suffix}`)),
  );
  assert.ok(name, 'Installed platform Remotion compositor required; no downloads performed');
  const destination = join(resources, 'app.asar.unpacked/node_modules/@remotion', name);
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(
    join(ROOT, 'node_modules/@remotion', name),
    destination,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  return { resources, snapshot, evidence, bin };
}

export async function runLongformProof(args) {
  const options = parseLongformProofArgs(args);
  if (options.help) {
    console.log(
      'Usage: node scripts/explainer-stills/verify-longform-scenes.mjs --unit [--stress | --long-stress | --repetitions N]\n       node scripts/explainer-stills/verify-longform-scenes.mjs --bundle <approved snapshot> [--stress | --long-stress | --repetitions N] [--out <fresh external directory>]\n--stress: 4 x 42s (168s); --long-stress: 22 x 42s (924s); --repetitions: integer 1..24. --cancel-alpha selects the separate small actual-render cancellation/alpha proof. No build/download/AI. Full media awaits owner approval.',
    );
    return;
  }
  const out = outputDirectory(options.out, 'longform-scene-proof-');
  const owner = randomUUID();
  writeFileSync(join(out, '.owner'), owner, { flag: 'wx' });
  const reportPath = join(out, 'runner-report.json');
  const report = {
    status: 'running',
    mode: options.cancelAlpha ? 'cancellation-alpha' : options.unit ? 'unit' : 'media',
    out,
    repetitions: options.repetitions,
    startedAt: new Date().toISOString(),
  };
  const save = () => writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  save();
  console.log(`Long-form proof artifacts: ${out}`);
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const media = options.unit ? null : resourcesForProof(out, options.bundle);
    const browser = options.unit
      ? null
      : await (await import('@remotion/renderer')).ensureBrowser({ onBrowserDownload });
    if (browser && !('path' in browser)) onBrowserDownload();
    if (media) report.bundle = media;
    const config = fileURLToPath(
      new URL(
        options.cancelAlpha
          ? './vitest.longform-scenes-cancel.config.ts'
          : './vitest.longform-scenes.config.ts',
        import.meta.url,
      ),
    );
    await runBounded(process.execPath, [VITEST, 'run', '--config', config], {
      ownProcessGroup: true,
      timeoutMs: options.cancelAlpha ? 1_200_000 : options.unit ? 120_000 : 7_200_000,
      signal: controller.signal,
      env: {
        ...process.env,
        LONGFORM_PROOF_OUT: out,
        LONGFORM_PROOF_OWNER: owner,
        LONGFORM_PROOF_MODE: options.unit ? 'unit' : 'media',
        LONGFORM_PROOF_REPETITIONS: String(options.repetitions),
        LONGFORM_PROOF_RESOURCES: media?.resources ?? '',
        LONGFORM_PROOF_BROWSER: browser && 'path' in browser ? browser.path : '',
        PATH: media ? `${media.bin}${delimiter}${process.env.PATH ?? ''}` : process.env.PATH,
      },
      onStdout: (chunk) => process.stdout.write(chunk),
      onStderr: (chunk) => process.stderr.write(chunk),
    });
    if (media)
      assert.equal(
        bundleDigest(media.snapshot.path),
        media.snapshot.sha256,
        'Render mutated the immutable bundle snapshot',
      );
    const result = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    assert.equal(result.status, 'passed');
    report.status = 'passed';
    report.proof = join(out, 'report.json');
  } catch (error) {
    report.status = 'failed';
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    save();
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    console.log(`Long-form proof report: ${reportPath}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runLongformProof(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
