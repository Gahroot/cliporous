import { type ChildProcess, type SpawnOptions, spawn } from 'node:child_process';
import { posix, win32 } from 'node:path';
import { MAX_COMPLETION_BYTES } from '../explainer/planner-generation';
import { DEFAULT_RUN_LIMITS } from './limits';

export interface CodexProcessOptions {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  input?: string;
  signal?: AbortSignal;
  timeoutMs: number;
  maxBytes: number;
  platform?: NodeJS.Platform;
  spawn?: (file: string, args: string[], options: SpawnOptions) => ChildProcess;
  killGroup?: (pid: number, signal: NodeJS.Signals) => unknown;
}
export class CodexProcessError extends Error {
  constructor(readonly code: string) {
    super(`Codex process refused: ${code}`);
    this.name = 'CodexProcessError';
  }
}
export interface CodexProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/** Native argv only. The caller owns/pins the executable and the empty working directory. */
export async function runCodexProcess(options: CodexProcessOptions): Promise<CodexProcessOutput> {
  const windows = (options.platform ?? process.platform) === 'win32';
  if (
    !(windows ? win32 : posix).isAbsolute(options.executable) ||
    (windows
      ? !/\.exe$/i.test(options.executable)
      : /\.(?:cmd|bat|ps1|js|mjs|cjs|sh)$/i.test(options.executable))
  )
    throw new CodexProcessError('native-executable-required');
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > DEFAULT_RUN_LIMITS.requestMs ||
    !Number.isSafeInteger(options.maxBytes) ||
    options.maxBytes < 1 ||
    options.maxBytes > DEFAULT_RUN_LIMITS.maxOutputBytes ||
    options.args.length > 64 ||
    options.args.some(
      (arg) => typeof arg !== 'string' || arg.includes('\0') || arg.length > 4096,
    ) ||
    (options.input !== undefined &&
      (typeof options.input !== 'string' ||
        Buffer.byteLength(options.input) > MAX_COMPLETION_BYTES))
  )
    throw new CodexProcessError('invalid-process-options');
  if (options.signal?.aborted) throw new CodexProcessError('cancelled');
  const launch = options.spawn ?? spawn;
  return await new Promise<CodexProcessOutput>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = launch(options.executable, options.args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true,
        detached: !windows,
        stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
    } catch {
      reject(new CodexProcessError('spawn-failed'));
      return;
    }
    let helper: ChildProcess | undefined;
    let grace: ReturnType<typeof setTimeout> | undefined;
    let failure: CodexProcessError | undefined;
    let closed = false;
    let helperClosed = true;
    let settled = false;
    let exitCode: number | null = null;
    let bytes = 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => stop('timeout'), options.timeoutMs);
    const abort = () => stop('cancelled');
    const inputError = () => stop('stdin-failed');
    function finish() {
      if (settled || !closed || !helperClosed) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      options.signal?.removeEventListener('abort', abort);
      child.stdout?.removeListener('data', receiveStdout);
      child.stderr?.removeListener('data', receiveStderr);
      child.stdin?.destroy();
      if (failure) reject(failure);
      else
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          exitCode,
        });
    }
    function stop(code: string) {
      if (settled || failure) return;
      failure = new CodexProcessError(code);
      // Reap the exact owned tree. A broken helper cannot leave pipes/timers open forever.
      grace = setTimeout(() => {
        failure = new CodexProcessError('close-timeout');
        try {
          child.kill('SIGKILL');
          helper?.kill('SIGKILL');
        } catch {
          // Report the cleanup failure without exposing OS diagnostics or child output.
        }
        helper?.unref();
        child.unref();
        child.stdin?.destroy();
        child.stdout?.destroy();
        child.stderr?.destroy();
        closed = helperClosed = true;
        finish();
      }, 1_000);
      if (!child.pid || child.pid <= 1) return;
      try {
        if (windows) {
          helperClosed = false;
          helper = launch(
            win32.join(options.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
            ['/PID', String(child.pid), '/T', '/F'],
            {
              cwd: options.cwd,
              env: options.env,
              shell: false,
              windowsHide: true,
              stdio: 'ignore',
            },
          );
          helper.on('error', () => {
            // The close event or bounded grace handles spawn failure.
          });
          helper.once('close', () => {
            helperClosed = true;
            finish();
          });
        } else (options.killGroup ?? process.kill)(-child.pid, 'SIGKILL');
      } catch {
        helperClosed = true;
      }
    }
    function receive(chunk: Buffer | string, destination: Buffer[]) {
      if (settled || failure) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > options.maxBytes) stop('output-limit');
      else destination.push(Buffer.from(chunk));
    }
    function receiveStdout(chunk: Buffer | string) {
      receive(chunk, stdout);
    }
    function receiveStderr(chunk: Buffer | string) {
      receive(chunk, stderr);
    }
    child.stdout?.on('data', receiveStdout);
    child.stderr?.on('data', receiveStderr);
    child.stdin?.on('error', inputError);
    // Keep error listeners through late close. Never expose raw subprocess diagnostics.
    child.on('error', () => stop('spawn-failed'));
    child.once('close', (code) => {
      exitCode = code;
      closed = true;
      finish();
    });
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    if (options.input !== undefined && !failure) {
      if (!child.stdin) stop('stdin-unavailable');
      else child.stdin.end(options.input, 'utf8');
    }
  });
}
