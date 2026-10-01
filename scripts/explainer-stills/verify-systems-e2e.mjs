#!/usr/bin/env node
/** Opt-in, local-only pipeline smoke. Does not build, install, or download anything.
 * Run --unit before coordinating a rebuilt out/remotion bundle; omit it for native renders.
 * --technology and --concepts are additive: validate their full catalogs and render representatives.
 * Artifacts are retained in a new mkdtemp directory, including reports on failure.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleDigest, digest, localBundle } from './harness-runtime.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CONFIG = join(ROOT, 'scripts/explainer-stills/vitest.e2e.config.ts');
export const CONCEPT_PACKS = [
  'information',
  'inference',
  'business-operations',
  'business-populations',
  'perspective',
  'adaptive',
];
export const HYBRID_BUNDLE_FILES = [
  'diagrams/DiagramStage.tsx',
  'diagrams/HybridStage.tsx',
  'diagrams/primitives.tsx',
  'diagrams/symbols.tsx',
  'diagrams/layout.ts',
  'diagrams/motion.ts',
  'detroit/DetroitPlaceScene.tsx',
  'detroit/RenaissanceCenter.tsx',
  'detroit/rencen-geometry.ts',
  'detroit/MichiganCentral.tsx',
  'detroit/FoxTheatre.tsx',
  'detroit/ClassicLandmarks.tsx',
  'detroit/poses.ts',
  'detroit/catalog.ts',
  'finance/FundFlowScene.tsx',
  'finance/OwnershipChangeScene.tsx',
  'finance/PortfolioExposureScene.tsx',
  'finance/poses.ts',
  'business-systems/CashTimingScene.tsx',
  'business-systems/poses.ts',
  'ai-systems/TokenAttentionScene.tsx',
  'ai-systems/InferenceTradeoffScene.tsx',
  'ai-systems/poses.ts',
].map((file) => `src/main/remotion/compositions/explainer/${file}`);
const require = createRequire(import.meta.url);
export const VITEST = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

/**
 * No shell. The CLI owns one POSIX process group, including Vitest, Chrome and FFmpeg.
 * Its finally block also kills orphaned descendants of failed/unresponsive workers.
 * Inner commands inherit that group; never kill an arbitrary process-name pattern.
 * @param {string} executable
 * @param {string[]} args
 * @param {{timeoutMs?: number, signal?: AbortSignal, env?: NodeJS.ProcessEnv,
 *   maxBytes?: number, onStdout?: (chunk: Buffer) => void,
 *   onStderr?: (chunk: Buffer) => void, onSpawn?: (pid: number) => void,
 *   ownProcessGroup?: boolean}} options
 */
export async function runBounded(executable, args, options = {}) {
  const { timeoutMs = 120_000, signal, ownProcessGroup = false } = options;
  if (signal?.aborted) throw new Error('aborted before spawn');
  const child = spawn(executable, args, {
    cwd: ROOT,
    env: options.env ?? process.env,
    shell: false,
    detached: ownProcessGroup && process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  let bytes = 0;
  let failure;
  let closed = false;
  let escalation;
  const kill = (sig) => {
    try {
      if (ownProcessGroup && child.pid && process.platform === 'win32') {
        if (!closed) {
          const killed = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            timeout: 10_000,
          });
          if (killed.error) throw killed.error;
          if (killed.status !== 0) {
            try {
              process.kill(child.pid, 0);
            } catch (error) {
              if (error.code === 'ESRCH') return;
              throw error;
            }
            throw new Error(`Owned task tree cleanup failed: ${killed.stderr}`);
          }
        }
      } else if (ownProcessGroup && child.pid) process.kill(-child.pid, sig);
      else if (!closed) child.kill(sig);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const stop = (reason) => {
    if (failure) return;
    failure = reason;
    kill('SIGTERM');
    escalation = setTimeout(() => kill('SIGKILL'), 2_000);
  };
  const abort = () => stop(new Error('aborted: child cancellation requested'));
  const timer = setTimeout(() => stop(new Error(`Child exceeded ${timeoutMs}ms`)), timeoutMs);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const collect = (chunks, callback) => (chunk) => {
    bytes += chunk.length;
    if (bytes > (options.maxBytes ?? 64 * 1024 * 1024)) {
      stop(new Error('Child output exceeded the capture limit'));
      return;
    }
    chunks.push(chunk);
    try {
      callback?.(chunk);
    } catch (error) {
      stop(error);
    }
  };
  child.stdout.on('data', collect(stdout, options.onStdout));
  child.stderr.on('data', collect(stderr, options.onStderr));
  try {
    const code = await new Promise((resolveCode) => {
      child.once('error', (error) => {
        failure = error;
      });
      child.once('close', (exitCode) => {
        closed = true;
        resolveCode(exitCode);
      });
      child.once('spawn', () => {
        try {
          options.onSpawn?.(child.pid);
        } catch (error) {
          stop(error);
        }
      });
    });
    const result = { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), pid: child.pid };
    if (failure) throw failure;
    if (code !== 0) {
      throw new Error(`${executable} exited ${code}: ${result.stderr.toString().slice(-6000)}`);
    }
    return result;
  } finally {
    clearTimeout(timer);
    clearTimeout(escalation);
    signal?.removeEventListener('abort', abort);
    // Includes descendants left behind by an interrupted production helper with no cancel API.
    kill('SIGKILL');
  }
}

export function parseE2EArgs(args) {
  let bundle;
  const flags = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--bundle') {
      const directory = args[++i];
      if (bundle || !directory || directory.startsWith('--')) {
        throw new Error('--bundle requires exactly one local directory.');
      }
      if (
        directory.length > 4096 ||
        directory.includes('\0') ||
        /^[\\/]{2}/u.test(directory) ||
        (/^[a-z][a-z\d+.-]*:/iu.test(directory) && !/^[a-z]:[\\/]/iu.test(directory))
      ) {
        throw new Error('--bundle must be a local directory, not a URL or network share.');
      }
      bundle = localBundle(directory);
    } else if (['--unit', '--technology', '--concepts', '--hybrid', '--help'].includes(arg)) {
      flags.push(arg);
    } else {
      throw new Error(
        'Only --unit, --technology, --concepts, --hybrid, --bundle or --help is supported.',
      );
    }
  }
  return {
    mode: flags.includes('--unit') ? 'unit' : 'render',
    technology: flags.includes('--technology'),
    concepts: flags.includes('--concepts'),
    hybrid: flags.includes('--hybrid'),
    help: flags.includes('--help'),
    ...(bundle ? { bundle } : {}),
  };
}

/** Require current source contents in production source maps, not just a recently touched index.html. */
export function currentBundleEvidence(
  directory,
  technology = false,
  concepts = false,
  hybrid = false,
) {
  const bundle = localBundle(directory);
  const sources = new Map();
  for (const file of readdirSync(bundle).filter((name) => name.endsWith('.js.map'))) {
    const map = JSON.parse(readFileSync(join(bundle, file), 'utf8'));
    map.sources.forEach((source, index) => {
      const match = source.match(/(?:^|\/)(src\/main\/remotion\/[^?]+\.tsx?)(?:\?.*)?$/);
      if (!match) return;
      const relative = match[1];
      if (relative.split('/').includes('..')) throw new Error('Unsafe source-map path');
      const content = readFileSync(join(ROOT, relative), 'utf8');
      if (map.sourcesContent?.[index] !== content)
        throw new Error(`Stale production bundle source: ${relative}`);
      sources.set(relative, digest(content));
    });
  }
  const required = ['src/main/remotion/Root.tsx'];
  if (technology)
    for (const kind of [
      'agent-workflow',
      'retrieval-grounding',
      'context-window',
      'software-release',
      'request-routing',
    ])
      required.push(`src/main/remotion/compositions/explainer/technology/${kind}.ts`);
  if (concepts)
    for (const pack of CONCEPT_PACKS)
      for (const file of ['Scene.tsx', 'poses.ts', 'models.tsx'])
        required.push(`src/main/remotion/compositions/explainer/concepts/${pack}/${file}`);
  if (hybrid) required.push(...HYBRID_BUNDLE_FILES);
  for (const file of required)
    if (!sources.has(file)) throw new Error(`Current bundle source-map evidence missing: ${file}`);
  return {
    path: bundle,
    sha256: bundleDigest(bundle),
    sources: Object.fromEntries([...sources].sort()),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const { mode, technology, concepts, hybrid, help, bundle: pinnedBundle } = parseE2EArgs(args);
  if (help) {
    console.log(
      'Usage: node scripts/explainer-stills/verify-systems-e2e.mjs [--unit] [--technology] [--concepts] [--hybrid] [--bundle DIRECTORY]\n' +
        '  --unit: planning/child-lifecycle checks only; omit for local native media.\n' +
        '  --concepts: all 42 presets plus a mixed AI/business/concept export chain in both aspects.\n' +
        '  --hybrid: all 15 presets / both modes and seven enabled landmarks, plus seven mixed chapters in both production aspects.\n' +
        '  --bundle: use an immutable local snapshot; current-source and hash checks still apply.\n' +
        '  Catalog flags may be combined; missing fixtures fail, never skip.',
    );
    return;
  }

  const out = mkdtempSync(join(tmpdir(), 'explainer-systems-e2e-'));
  const owner = randomUUID();
  writeFileSync(join(out, '.owner'), owner, { flag: 'wx' });
  const reportPath = join(out, 'runner-report.json');
  const report = {
    mode,
    technology,
    concepts,
    hybrid,
    out,
    startedAt: new Date().toISOString(),
    status: 'running',
  };
  const save = () => writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  save();
  console.log(`Systems E2E artifacts: ${out}`);
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const ffmpeg = require('ffmpeg-static');
    const ffprobe = require('@ffprobe-installer/ffprobe').path;
    if (!ffmpeg || !existsSync(ffmpeg) || !existsSync(ffprobe)) {
      throw new Error(
        'Installed ffmpeg-static and ffprobe-installer binaries are required; no installs performed.',
      );
    }
    const bundle = pinnedBundle ?? join(ROOT, 'out/remotion');
    if (mode === 'render')
      report.bundle = currentBundleEvidence(bundle, technology, concepts, hybrid);
    await runBounded(process.execPath, [VITEST, 'run', '--config', CONFIG], {
      ownProcessGroup: true,
      timeoutMs: mode === 'unit' ? 120_000 : 3_600_000,
      signal: controller.signal,
      env: {
        ...process.env,
        PATH: [dirname(ffmpeg), dirname(ffprobe), process.env.PATH].join(delimiter),
        SYSTEMS_E2E_MODE: mode,
        SYSTEMS_E2E_TECHNOLOGY: technology ? '1' : '0',
        SYSTEMS_E2E_CONCEPTS: concepts ? '1' : '0',
        SYSTEMS_E2E_HYBRID: hybrid ? '1' : '0',
        SYSTEMS_E2E_OUT: out,
        SYSTEMS_E2E_OWNER: owner,
        SYSTEMS_E2E_BUNDLE: bundle,
      },
      onStdout: (chunk) => process.stdout.write(chunk),
      onStderr: (chunk) => process.stderr.write(chunk),
    });
    const smoke = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    if (smoke.status !== 'passed') throw new Error('Smoke did not write a passing report.');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
    console.error(report.error);
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    report.completedAt = new Date().toISOString();
    report.cleanupScope =
      process.platform === 'win32'
        ? 'Exact spawned PID/task tree on cancellation; successful worker owns browser/FFmpeg teardown.'
        : 'Owned POSIX process group reaped.';
    save();
    console.log(`Runner report: ${reportPath}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
