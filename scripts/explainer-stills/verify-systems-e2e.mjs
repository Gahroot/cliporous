#!/usr/bin/env node
/** Opt-in, local-only pipeline smoke. Does not build, install, or download anything.
 * Run --unit before coordinating a rebuilt out/remotion bundle; omit it for native renders.
 * Artifacts are retained in a new mkdtemp directory, including reports on failure.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CONFIG = join(ROOT, 'scripts/explainer-stills/vitest.e2e.config.ts');
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
    detached: ownProcessGroup,
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
      if (ownProcessGroup && child.pid) process.kill(-child.pid, sig);
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

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/explainer-stills/verify-systems-e2e.mjs [--unit]');
    return;
  }
  if (args.some((arg) => arg !== '--unit')) throw new Error('Only --unit or --help is supported.');
  if (process.platform === 'win32') {
    throw new Error('This local smoke requires POSIX process-group cleanup; run on macOS/Linux.');
  }
  const mode = args.includes('--unit') ? 'unit' : 'render';
  const out = mkdtempSync(join(tmpdir(), 'explainer-systems-e2e-'));
  const owner = randomUUID();
  writeFileSync(join(out, '.owner'), owner, { flag: 'wx' });
  const reportPath = join(out, 'runner-report.json');
  const report = { mode, out, startedAt: new Date().toISOString(), status: 'running' };
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
    const bundle = join(ROOT, 'out/remotion');
    if (mode === 'render' && !existsSync(join(bundle, 'index.html'))) {
      throw new Error('Missing out/remotion/index.html. Coordinate a production rebuild first.');
    }
    await runBounded(process.execPath, [VITEST, 'run', '--config', CONFIG], {
      ownProcessGroup: true,
      timeoutMs: mode === 'unit' ? 120_000 : 3_600_000,
      signal: controller.signal,
      env: {
        ...process.env,
        PATH: [dirname(ffmpeg), dirname(ffprobe), process.env.PATH].join(delimiter),
        SYSTEMS_E2E_MODE: mode,
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
    report.ownedProcessGroupCleaned = true;
    save();
    console.log(`Runner report: ${reportPath}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
