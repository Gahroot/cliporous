import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Sample owned disk, never follow symlinks or inspect/delete another job's temp tree. */
export function diskSnapshot(directory) {
  let bytes = 0,
    files = 0,
    directories = 0;
  const visit = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          directories++;
          visit(file);
        } else if (entry.isFile()) {
          bytes += statSync(file).size;
          files++;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  };
  visit(directory);
  return { bytes, files, directories };
}
/** @param {string} out @param {string} mode */
export function startMetrics(out, mode) {
  const start = performance.now();
  /** @type {{status: string, mode: string, startedAt: string, cases: object[], metrics: {scope: string, nodePeakRssBytes: number, nodeMaxRssBytes: number | null, tempPeakBytes: number, tempPeakFiles: number, samples: number, nodeSettledRssBytes?: number}, limitations: string[], boundaries?: {aiCalls: number, lazyBuilds: number, mediaExecuted: boolean, runtimeMocked: boolean}, tempBefore?: object, tempAfter?: object, elapsedMs?: number, finishedAt?: string, error?: string}} */
  const report = {
    status: 'running',
    mode,
    startedAt: new Date().toISOString(),
    cases: [],
    metrics: {
      scope:
        'Vitest Node worker only; sampled RSS every 500ms, OS Node maxRSS high-water; owned scratch disk only',
      nodePeakRssBytes: process.memoryUsage().rss,
      nodeMaxRssBytes: null,
      tempPeakBytes: 0,
      tempPeakFiles: 0,
      samples: 0,
    },
    limitations: [
      'This Node-worker report does not measure GPU memory. Separate media-run files record sampled live canvas and owned Windows child-process counts/working sets.',
      'Disk is sampled, not an exhaustive high-water measurement; final media/bundle artifacts excluded.',
      'No constant-resource assertion or cross-GPU byte determinism claim.',
      'Human visual/readability and listening approval required; authored words are not ASR of the synthetic tone source.',
    ],
  };
  const scratch = join(out, 'scratch');
  const sample = () => {
    const disk = diskSnapshot(scratch);
    report.metrics.nodePeakRssBytes = Math.max(
      report.metrics.nodePeakRssBytes,
      process.memoryUsage().rss,
    );
    report.metrics.tempPeakBytes = Math.max(report.metrics.tempPeakBytes, disk.bytes);
    report.metrics.tempPeakFiles = Math.max(report.metrics.tempPeakFiles, disk.files);
    report.metrics.samples++;
    return disk;
  };
  const save = () =>
    writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const timer = setInterval(sample, 500);
  timer.unref();
  report.tempBefore = sample();
  save();
  return {
    report,
    save,
    /** @template T @param {string} label @param {() => Promise<T>} body @returns {Promise<T>} */
    async measure(label, body) {
      const started = performance.now();
      /** @type {{label: string, status: string, tempBefore: object, nodeRssBefore: number, evidence?: T, error?: string, elapsedMs?: number, tempAfter?: object, nodeRssAfter?: number}} */
      const entry = {
        label,
        status: 'running',
        tempBefore: sample(),
        nodeRssBefore: process.memoryUsage().rss,
      };
      report.cases.push(entry);
      save();
      try {
        const value = await body();
        entry.evidence = value;
        entry.status = 'passed';
        return value;
      } catch (error) {
        entry.status = 'failed';
        entry.error = String(error);
        throw error;
      } finally {
        entry.elapsedMs = performance.now() - started;
        entry.tempAfter = sample();
        entry.nodeRssAfter = process.memoryUsage().rss;
        save();
      }
    },
    /** @param {unknown} [error] */
    finish(error) {
      clearInterval(timer);
      report.tempAfter = sample();
      report.metrics.nodeMaxRssBytes = process.resourceUsage().maxRSS * 1024;
      report.metrics.nodeSettledRssBytes = process.memoryUsage().rss;
      report.elapsedMs = performance.now() - start;
      report.finishedAt = new Date().toISOString();
      report.status = error ? 'failed' : 'passed';
      if (error) report.error = String(error);
      save();
    },
  };
}
