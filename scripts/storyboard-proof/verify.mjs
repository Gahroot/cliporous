#!/usr/bin/env node
/** STEP20/22: local production-route proof. --unit does not touch media/assets/browser. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bundleDigest, digest } from '../explainer-stills/harness-runtime.mjs';
import { snapshotBundle } from '../explainer-stills/snapshot-bundle.mjs';
import { runBounded, VITEST } from '../explainer-stills/verify-systems-e2e.mjs';
import { validateBusinessRecords } from './business-records.mjs';
import { localPath, ROOT, sourceEvidence, verifyPin } from './gates.mjs';
import { startProcessMetrics } from './process-metrics.mjs';
import { resourceComparisonPlan } from './resource-controls.mjs';

const require = createRequire(import.meta.url);
export function parseArgs(args) {
  const parsed = {
    unit: false,
    bundle: undefined,
    help: false,
    scope: 'full',
    resourcePlan: false,
    resourceCycle: undefined,
  };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === '--unit') parsed.unit = true;
    else if (flag === '--help') parsed.help = true;
    else if (flag === '--bundle') parsed.bundle = localPath(args[++i]);
    else if (flag === '--scope') {
      parsed.scope = args[++i];
      if (!['full', 'business'].includes(parsed.scope))
        throw new Error('--scope must be full or business');
    } else if (flag === '--resource-plan') parsed.resourcePlan = true;
    else if (flag === '--resource-cycle') {
      const value = args[++i];
      if (!/^[1-5]$/u.test(value ?? '')) throw new Error('--resource-cycle must be 1..5');
      parsed.resourceCycle = Number(value);
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (parsed.unit && parsed.bundle) throw new Error('--unit and --bundle are mutually exclusive');
  if (parsed.resourceCycle && (parsed.unit || parsed.resourcePlan))
    throw new Error('Resource cycles require native media');
  if (!parsed.help && !parsed.resourcePlan && !parsed.unit && !parsed.bundle)
    throw new Error('Media requires --bundle <pinned-production-bundle>; no lazy build permitted');
  return parsed;
}
function resourcesForProof(out, pinned) {
  const resources = join(out, 'resources');
  mkdirSync(resources);
  const snapshot = snapshotBundle(pinned.bundle.path, join(resources, 'remotion'));
  assert.equal(snapshot.sha256, pinned.bundle.sha256);
  cpSync(join(ROOT, 'resources/sfx'), join(resources, 'sfx'), { recursive: true });
  const bin = join(resources, 'bin');
  mkdirSync(bin);
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const ffmpeg = require('ffmpeg-static');
  const ffprobe = require('@ffprobe-installer/ffprobe').path;
  assert.ok(
    ffmpeg && existsSync(ffmpeg) && existsSync(ffprobe),
    'Installed FFmpeg and FFprobe required',
  );
  copyFileSync(ffmpeg, join(bin, `ffmpeg${suffix}`));
  copyFileSync(ffprobe, join(bin, `ffprobe${suffix}`));
  const names =
    process.platform === 'win32'
      ? [`compositor-win32-${process.arch}-msvc`]
      : process.platform === 'darwin'
        ? [`compositor-darwin-${process.arch}`]
        : [`compositor-linux-${process.arch}-gnu`, `compositor-linux-${process.arch}-musl`];
  const name = names.find((name) =>
    existsSync(join(ROOT, 'node_modules/@remotion', name, `remotion${suffix}`)),
  );
  assert.ok(name, 'Installed Remotion compositor required; downloads forbidden');
  const destination = join(resources, 'app.asar.unpacked/node_modules/@remotion', name);
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(
    join(ROOT, 'node_modules/@remotion', name),
    destination,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  // Resolve only installed local binaries. Never call ensureBrowser (even as a convenience).
  const browser = [
    process.env.STORYBOARD_PROOF_BROWSER,
    join(ROOT, 'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell.exe'),
    join(ROOT, 'node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell'),
    join(
      ROOT,
      `node_modules/.remotion/chrome-headless-shell/mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}/chrome-headless-shell`,
    ),
  ].find((file) => file && existsSync(file));
  assert.ok(
    browser,
    'No installed Chrome Headless Shell found; set STORYBOARD_PROOF_BROWSER to a local executable (no downloads)',
  );
  localPath(browser, 'STORYBOARD_PROOF_BROWSER');
  return { resources, snapshot, bin, browser: resolve(browser) };
}
/** A fresh config, scoped to one opt-in harness; never edits the global Vitest config. */
export function generatedConfig(out, unit) {
  return `export default ${JSON.stringify(
    {
      root: ROOT,
      cacheDir: join(out, 'vite-cache'),
      esbuild: { jsx: 'automatic' },
      resolve: {
        alias: { '@shared': join(ROOT, 'src/shared'), '@': join(ROOT, 'src/renderer/src') },
      },
      test: {
        environment: 'node',
        pool: 'forks',
        fileParallelism: false,
        maxWorkers: 1,
        include: ['scripts/storyboard-proof/proof.test.ts'],
        testTimeout: unit ? 120_000 : 7_100_000,
        hookTimeout: 60_000,
        watch: false,
        reporters: ['default'],
      },
    },
    null,
    2,
  )};\n`;
}
export async function runProof(args) {
  const options = parseArgs(args);
  if (options.resourcePlan) {
    console.log(JSON.stringify(resourceComparisonPlan(), null, 2));
    return;
  }
  if (options.help) {
    console.log(
      'Usage: node scripts/storyboard-proof/verify.mjs --unit\n       node scripts/storyboard-proof/verify.mjs --bundle <pin.mjs snapshot>\nOptions: --scope business (eight sequences + historical/fault controls); --resource-plan (unexecuted schedule); --resource-cycle 1..5 with --bundle (separate fresh-worker controls).\nSerial bounded media only after coordinator build/pin. No builds, downloads, installs or live AI. See README.md.',
    );
    return;
  }
  const out = mkdtempSync(join(tmpdir(), 'storyboard-production-proof-'));
  const owner = randomUUID();
  writeFileSync(join(out, '.owner'), owner, { flag: 'wx' });
  const report = {
    schemaVersion: 1,
    status: 'running',
    scope: options.scope,
    mode: options.unit ? 'unit' : 'media',
    out,
    invocation: [process.execPath, 'scripts/storyboard-proof/verify.mjs', ...args],
    startedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    commands: [],
    limitations: [
      'Local synthetic fixtures; not live AI quality or ASR.',
      'Media results require human still/contact-sheet inspection.',
      'No UI/native accessibility/GPU portability certification.',
    ],
  };
  const save = () =>
    writeFileSync(join(out, 'runner-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  save();
  console.log(`Storyboard proof artifacts: ${out}`);
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  let media;
  let processes;
  const started = performance.now();
  try {
    report.source = sourceEvidence(ROOT, !options.unit);
    report.harness = Object.fromEntries(
      [
        'verify.mjs',
        'gates.mjs',
        'fixtures.ts',
        'proof.test.ts',
        'media.ts',
        'metrics.mjs',
        'support.ts',
        'process-metrics.mjs',
      ].map((name) => [name, digest(readFileSync(join(ROOT, 'scripts/storyboard-proof', name)))]),
    );
    const pin = options.unit ? null : verifyPin(options.bundle);
    if (pin) {
      report.pin = pin;
      report.bundle = pin.bundle;
      media = resourcesForProof(out, pin);
      report.media = media;
    }
    const config = join(out, 'vitest.config.mjs');
    writeFileSync(config, generatedConfig(out, options.unit), { flag: 'wx' });
    const scratch = join(out, 'scratch');
    mkdirSync(scratch);
    const command = {
      executable: process.execPath,
      args: [VITEST, 'run', '--config', config],
      status: 'running',
    };
    report.commands.push(command);
    save();
    try {
      const result = await runBounded(command.executable, command.args, {
        ownProcessGroup: true,
        timeoutMs: options.unit ? 180_000 : 7_200_000,
        signal: controller.signal,
        onSpawn: (pid) => {
          if (!options.unit) processes = startProcessMetrics(pid, out);
        },
        env: {
          ...process.env,
          STORYBOARD_PROOF_ROOT: ROOT,
          STORYBOARD_PROOF_OUT: out,
          STORYBOARD_PROOF_OWNER: owner,
          STORYBOARD_PROOF_MODE: options.unit ? 'unit' : 'media',
          STORYBOARD_PROOF_SCOPE: options.scope,
          STORYBOARD_PROOF_RESOURCE_CYCLE: options.resourceCycle
            ? String(options.resourceCycle)
            : '',
          STORYBOARD_PROOF_RESOURCES: media?.resources ?? '',
          STORYBOARD_PROOF_BROWSER: media?.browser ?? '',
          TMP: scratch,
          TEMP: scratch,
          TMPDIR: scratch,
          PATH: media ? `${media.bin}${delimiter}${process.env.PATH ?? ''}` : process.env.PATH,
        },
        onStdout: (chunk) => process.stdout.write(chunk),
        onStderr: (chunk) => process.stderr.write(chunk),
      });
      writeFileSync(join(out, 'vitest.stdout.log'), result.stdout);
      writeFileSync(join(out, 'vitest.stderr.log'), result.stderr);
      command.status = 'passed';
      command.exitCode = 0;
    } catch (error) {
      command.status = 'failed';
      command.error = String(error);
      throw error;
    }
    assert.equal(
      sourceEvidence(ROOT, !options.unit).sha256,
      report.source.sha256,
      'Production source changed during proof',
    );
    if (media) {
      verifyPin(options.bundle);
      assert.equal(
        bundleDigest(media.snapshot.path),
        media.snapshot.sha256,
        'Proof mutated its bundle snapshot',
      );
    }
    const result = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    assert.equal(result.status, 'passed');
    report.proof = join(out, 'report.json');
    if (!options.unit && !options.resourceCycle) {
      report.businessSequences = validateBusinessRecords(
        JSON.parse(readFileSync(join(out, 'business-sequences.json'), 'utf8')),
        out,
        { mode: 'media', status: result.status },
      );
    }
    if (options.resourceCycle)
      report.resourceComparisons = JSON.parse(
        readFileSync(join(out, 'resource-comparisons.json'), 'utf8'),
      );
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    delete report.businessSequences;
    delete report.resourceComparisons;
    rmSync(join(out, 'business-sequences.json'), { force: true });
    report.error = String(error);
    throw error;
  } finally {
    if (processes) report.processes = await processes.stop();
    // Resources/cache are owned scratch, not artifacts or the coordinator's pin. Production temp
    // cleanup is asserted by the inner test BEFORE this outer safety cleanup.
    if (media) rmSync(media.resources, { recursive: true, force: true });
    rmSync(join(out, 'vite-cache'), { recursive: true, force: true });
    report.finishedAt = new Date().toISOString();
    report.elapsedMs = performance.now() - started;
    save();
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    console.log(`Storyboard runner report: ${join(out, 'runner-report.json')}`);
  }
  return out;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runProof(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
