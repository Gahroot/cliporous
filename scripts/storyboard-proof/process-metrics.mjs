import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** Read-only local Windows process observation. No command lines or unrelated process data leave PowerShell. */
export async function sampleOwnedProcesses(rootPids) {
  if (process.platform !== 'win32')
    throw new Error('Child-process sampling is Windows-only on this host.');
  if (
    !Array.isArray(rootPids) ||
    !rootPids.length ||
    rootPids.length > 512 ||
    rootPids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0)
  )
    throw new Error('Invalid bounded process roots.');
  const script = `$ErrorActionPreference='Stop'; $all=@(Get-CimInstance Win32_Process); $ids=[System.Collections.Generic.HashSet[int]]::new(); @(${rootPids.join(',')}) | ForEach-Object { [void]$ids.Add([int]$_) }; do { $changed=$false; foreach($p in $all) { if($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) { [void]$ids.Add([int]$p.ProcessId); $changed=$true } } } while($changed -and $ids.Count -lt 512); @($all | Where-Object { $ids.Contains([int]$_.ProcessId) } | ForEach-Object { [pscustomobject]@{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;name=[string]$_.Name;workingSetBytes=[double]$_.WorkingSetSize;createdAt=$_.CreationDate.ToUniversalTime().ToString('O')} }) | ConvertTo-Json -Compress`;
  const { stdout } = await execute(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 10_000, maxBuffer: 512_000 },
  );
  const parsed = stdout.trim() ? JSON.parse(stdout) : [];
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  if (
    rows.length > 512 ||
    rows.some(
      (row) =>
        !row ||
        !Number.isSafeInteger(row.pid) ||
        !Number.isSafeInteger(row.parent) ||
        typeof row.name !== 'string' ||
        row.name.length > 200 ||
        !Number.isFinite(row.workingSetBytes) ||
        row.workingSetBytes < 0 ||
        typeof row.createdAt !== 'string',
    )
  )
    throw new Error('Invalid process-observation response.');
  return rows;
}

export function startProcessMetrics(rootPid, out, sample = sampleOwnedProcesses) {
  const known = new Map();
  const report = {
    scope:
      'Read-only Windows owned descendant PID/creation-time samples every 5s; sampled working set, not GPU allocation or an exhaustive high-water mark. Observer overhead is included in elapsed time.',
    status: 'running',
    rootPid,
    samples: [],
    peakChildCount: 0,
    peakWorkingSetBytes: 0,
    errors: [],
  };
  let stopped = false;
  let pending;
  const save = () =>
    writeFileSync(join(out, 'process-samples.json'), `${JSON.stringify(report, null, 2)}\n`);
  const take = async () => {
    try {
      const rows = await sample([rootPid, ...known.keys()].slice(0, 512));
      const candidates = rows.filter(
        (row) => !known.has(row.pid) || known.get(row.pid) === row.createdAt,
      );
      const ids = new Set(
        candidates.filter((row) => known.has(row.pid) || row.pid === rootPid).map((row) => row.pid),
      );
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of candidates)
          if (!ids.has(row.pid) && ids.has(row.parent)) {
            ids.add(row.pid);
            changed = true;
          }
      }
      const owned = candidates.filter((row) => ids.has(row.pid));
      for (const row of owned) if (known.size < 512) known.set(row.pid, row.createdAt);
      const children = owned.filter((row) => row.pid !== rootPid);
      const workingSetBytes = children.reduce((sum, row) => sum + row.workingSetBytes, 0);
      report.samples.push({
        at: new Date().toISOString(),
        childCount: children.length,
        workingSetBytes,
        processes: children,
      });
      report.peakChildCount = Math.max(report.peakChildCount, children.length);
      report.peakWorkingSetBytes = Math.max(report.peakWorkingSetBytes, workingSetBytes);
      save();
    } catch (error) {
      report.errors.push(String(error));
      save();
    }
  };
  const tick = () => {
    if (stopped || pending || report.samples.length >= 1500) return;
    pending = take().finally(() => {
      pending = undefined;
    });
  };
  tick();
  const timer = setInterval(tick, 5_000);
  timer.unref();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await pending;
      await take();
      report.status = report.errors.length ? 'partial' : 'measured';
      report.settled = report.samples.at(-1) ?? null;
      save();
      return report;
    },
  };
}
