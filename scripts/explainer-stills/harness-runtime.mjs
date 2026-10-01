/** Local-only verifier plumbing. No downloads, repository output, or user-directory cleanup.
 * Optional POSIX browser proxy uses only a validated executable and literal arguments. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { cpus, hostname, platform, tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const chromiumOptions = { gl: 'angle' };
export const digest = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex');

export function outputDirectory(requested, prefix = 'explainer-stills-') {
  if (requested === undefined) return mkdtempSync(path.join(tmpdir(), prefix));
  const target = path.resolve(requested);
  let ancestor = target;
  const missing = [];
  while (!existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  const resolved = path.join(realpathSync(ancestor), ...missing);
  for (const candidate of [target, resolved]) {
    const relative = path.relative(realpathSync(ROOT), candidate);
    if (
      relative === '' ||
      (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    ) {
      throw new Error(
        '--out must be outside the repository; use a fresh empty temporary directory.',
      );
    }
  }
  mkdirSync(target, { recursive: true });
  if (readdirSync(target).length)
    throw new Error(`--out ${target} is not empty; choose a fresh directory.`);
  return realpathSync(target);
}

export function localBundle(directory) {
  const resolved = path.resolve(directory);
  if (
    !existsSync(path.join(resolved, 'index.html')) ||
    !statSync(path.join(resolved, 'index.html')).isFile()
  ) {
    throw new Error(
      `--bundle ${resolved} must contain index.html; coordinate a production build first.`,
    );
  }
  return resolved;
}

export function bundleDigest(directory) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile())
        files.push([path.relative(directory, file), digest(readFileSync(file))]);
    }
  };
  visit(directory);
  return digest(files);
}

export function onBrowserDownload() {
  throw new Error(
    'Compatible local Remotion Chrome Headless Shell required. Automatic browser downloads are disabled; request explicit provisioning before retrying.',
  );
}

export function rendererConfiguration({ softwareRaster = false } = {}) {
  return {
    chromiumOptions: { ...chromiumOptions },
    softwareRaster,
    additionalBrowserFlags: softwareRaster ? ['--disable-gpu-rasterization'] : [],
    scope: softwareRaster
      ? 'explicit verification-only raster override; NOT production default'
      : 'default browser raster configuration',
  };
}

/** Quote one validated executable as a single POSIX word, never executable shell text. */
export function quotePosixExecutable(executable) {
  if (typeof executable !== 'string' || !path.isAbsolute(executable) || executable.includes('\0')) {
    throw new Error('Browser executable must be an absolute local path without NUL bytes');
  }
  return `'${executable.replaceAll("'", "'\\''")}'`;
}

export function createRasterExecutable(executable, platformName = platform()) {
  if (platformName === 'win32')
    throw new Error('--software-raster is unsupported on Windows; POSIX verification only');
  quotePosixExecutable(executable); // Validate before resolving or creating anything.
  const actualExecutable = realpathSync(executable);
  if (!statSync(actualExecutable).isFile())
    throw new Error('Browser executable must be a regular file');
  accessSync(actualExecutable, constants.X_OK);
  const directory = mkdtempSync(path.join(tmpdir(), 'batchclip-raster-browser-'));
  const browserExecutable = path.join(directory, 'chrome-wrapper');
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    writeFileSync(
      browserExecutable,
      `#!/bin/sh\nexec ${quotePosixExecutable(actualExecutable)} --disable-gpu-rasterization "$@"\n`,
      { mode: 0o700, flag: 'wx' },
    );
    return { browserExecutable, actualExecutable, directory, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

// The optional renderer parameter is a test seam for launch/close failure ownership, not a browser override CLI.
export async function openLocalBrowser({ softwareRaster = false } = {}, renderer = null) {
  if (softwareRaster && platform() === 'win32')
    throw new Error('--software-raster is unsupported on Windows; POSIX verification only');
  const { ensureBrowser, openBrowser } = renderer ?? (await import('@remotion/renderer'));
  const installed = await ensureBrowser({ onBrowserDownload });
  if (!('path' in installed)) onBrowserDownload();
  const proxy = softwareRaster ? createRasterExecutable(installed.path) : null;
  const browserExecutable = proxy?.browserExecutable ?? installed.path;
  try {
    const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions });
    if (proxy) {
      const close = browser.close.bind(browser);
      let closing;
      browser.close = (options) => {
        closing ??= (async () => {
          try {
            return await close(options);
          } finally {
            proxy.cleanup();
          }
        })();
        return closing;
      };
    }
    return {
      browser,
      metadata: {
        ...rendererConfiguration({ softwareRaster }),
        actualExecutable: proxy?.actualExecutable ?? installed.path,
        launchExecutable: browserExecutable,
        ownsTemporaryExecutable: !!proxy,
      },
      shared: {
        puppeteerInstance: browser,
        browserExecutable,
        chromiumOptions,
        onBrowserDownload,
        timeoutInMilliseconds: 60000,
      },
    };
  } catch (error) {
    proxy?.cleanup();
    throw error;
  }
}

export function processTreeRss(text, pid) {
  const rows = text
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter((r) => r.length === 3 && r.every(Number.isFinite));
  const pids = new Set([pid]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const [child, parent] of rows)
      if (pids.has(parent) && !pids.has(child)) {
        pids.add(child);
        changed = true;
      }
  }
  const own = rows.find(([id]) => id === pid);
  return own
    ? rows.filter(([id]) => pids.has(id)).reduce((sum, [, , rss]) => sum + rss * 1024, 0)
    : null;
}

export function cost(elapsedMs, renderedFrames, fps = 30) {
  const renderedSeconds = renderedFrames / fps;
  return {
    elapsedMs,
    renderedFrames,
    renderedSeconds,
    msPerRenderedSecond: renderedSeconds > 0 ? elapsedMs / renderedSeconds : null,
  };
}

/** Sampled RSS: coordinator only on Windows, process tree on POSIX; never GPU memory or an OS high-water mark. */
export function startReport(out, mode, metadata = {}) {
  const start = performance.now();
  const windows = platform() === 'win32';
  const report = {
    schemaVersion: 1,
    mode,
    status: 'running',
    startedAt: new Date().toISOString(),
    environment: {
      hostname: hostname(),
      platform: platform(),
      arch: process.arch,
      cpu: cpus()[0]?.model,
      node: process.version,
      remotion: JSON.parse(
        readFileSync(path.join(ROOT, 'node_modules/@remotion/renderer/package.json'), 'utf8'),
      ).version,
      gl: 'angle',
    },
    ...metadata,
    entries: [],
    errors: [],
    rss: {
      scope: windows
        ? 'Node coordinator only; Chrome/FFmpeg descendants unmeasured on Windows'
        : 'node plus descendants; ps RSS sum sampled every 1000ms (shared pages may double count)',
      peakBytes: null,
      samples: 0,
      unavailable: null,
    },
    limits: [
      'No GPU memory / draw-call instrumentation',
      'No visual or audio perceptual approval implied',
      'Byte equality is local to the recorded environment',
    ],
  };
  const reportPath = path.join(out, 'report.json');
  const sample = () => {
    try {
      const bytes = windows
        ? process.memoryUsage().rss
        : processTreeRss(
            execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], {
              encoding: 'utf8',
              timeout: 3000,
              maxBuffer: 8 * 1024 * 1024,
            }),
            process.pid,
          );
      if (bytes === null) throw new Error('current PID absent from ps');
      if (!Number.isFinite(bytes) || bytes <= 0)
        throw new Error('RSS sample must be finite and positive');
      report.rss.peakBytes =
        report.rss.peakBytes === null ? bytes : Math.max(report.rss.peakBytes, bytes);
      report.rss.samples++;
    } catch (error) {
      report.rss.unavailable = error.message;
    }
  };
  const active = new Map();
  const save = () => {
    const now = performance.now();
    for (const [entry, began] of active)
      Object.assign(entry, cost(now - began, entry.renderedFrames, entry.fps ?? 30));
    report.metrics = cost(
      now - start,
      report.entries.reduce((n, e) => n + e.renderedFrames, 0),
    );
    report.updatedAt = new Date().toISOString();
    // Atomic snapshots retain finished and in-flight entries even on failure or interruption.
    const temporary = `${reportPath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
    renameSync(temporary, reportPath);
  };
  sample();
  const timer = setInterval(() => {
    sample();
    save();
  }, 1000);
  timer.unref();
  save();
  return {
    report,
    reportPath,
    save,
    async measure(meta, operation) {
      const entry = { ...meta, status: 'running', renderedFrames: 0 };
      report.entries.push(entry);
      const began = performance.now();
      active.set(entry, began);
      save();
      try {
        const value = await operation(entry);
        entry.status = 'passed';
        return value;
      } catch (error) {
        entry.status = 'failed';
        entry.error = error.message;
        entry.errorStack = error.stack;
        throw error;
      } finally {
        active.delete(entry);
        Object.assign(
          entry,
          cost(performance.now() - began, entry.renderedFrames, entry.fps ?? 30),
        );
        sample();
        save();
      }
    },
    finish(error) {
      clearInterval(timer);
      sample();
      if (error) {
        report.errors.push(error.message);
        report.failure = { message: error.message, stack: error.stack };
      }
      report.status =
        error || report.entries.some((e) => e.status !== 'passed')
          ? 'failed'
          : report.execution === 'not-started'
            ? 'planned'
            : report.entries.length === 0
              ? 'no-evidence'
              : 'passed';
      report.metrics = cost(
        performance.now() - start,
        report.entries.reduce((n, e) => n + e.renderedFrames, 0),
      );
      report.completedAt = new Date().toISOString();
      save();
      console.log(`Report: ${reportPath}`);
    },
  };
}

/** Kill neither broad PID patterns nor user servers. Remotion cancellation/close is owned by the caller. */
export async function withDeadline(operation, cancel, milliseconds = 600000) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          let cause;
          try {
            Promise.resolve(cancel()).catch(() => {});
          } catch (error) {
            cause = error;
          }
          reject(new Error(`Operation exceeded ${milliseconds}ms`, { cause }));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
