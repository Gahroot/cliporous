import { type ChildProcess, type SpawnOptions, spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { runCodexProcess } from './codex-process';

describe('bounded native Codex process boundary', () => {
  it('sends untrusted input through stdin without interpreting it or merging stderr', async () => {
    const input = 'private prompt; $(echo NEVER_EXECUTE)\n{"text":"literal"}';
    const result = await runCodexProcess({
      executable: process.execPath,
      args: ['-e', 'process.stdin.pipe(process.stdout); process.stderr.write("diagnostic");'],
      cwd: process.cwd(),
      env: { SystemRoot: process.env.SystemRoot },
      input,
      timeoutMs: 5_000,
      maxBytes: 4_096,
    });
    expect(result).toEqual({ stdout: input, stderr: 'diagnostic', exitCode: 0 });
  });

  it.each(['cancelled', 'output-limit'])('reaps a real owned process on %s', async (reason) => {
    const controller = new AbortController();
    let owned: ChildProcess | undefined;
    const launch = vi.fn((file: string, args: string[], options: SpawnOptions) => {
      const child = spawn(file, args, options);
      if (file === process.execPath) {
        owned = child;
        if (reason === 'cancelled') child.once('spawn', () => controller.abort('PRIVATE REASON'));
      }
      return child;
    });
    try {
      await expect(
        runCodexProcess({
          executable: process.execPath,
          args: [
            '-e',
            reason === 'output-limit'
              ? 'process.stdout.write("x".repeat(16384)); setInterval(()=>{},1000);'
              : 'process.stdin.resume(); setInterval(()=>{},1000);',
          ],
          cwd: process.cwd(),
          env: { SystemRoot: process.env.SystemRoot },
          input: 'bounded input',
          signal: controller.signal,
          timeoutMs: 5_000,
          maxBytes: 1024,
          spawn: launch,
        }),
      ).rejects.toMatchObject({ code: reason });
      expect(owned).toBeDefined();
      expect(owned?.exitCode !== null || owned?.signalCode !== null).toBe(true);
      expect(owned?.stdin?.destroyed).toBe(true);
      if (process.platform === 'win32') {
        expect(launch.mock.calls[1]?.[1]).toEqual(['/PID', String(owned?.pid), '/T', '/F']);
      }
    } finally {
      owned?.kill('SIGKILL');
    }
  });

  it('rejects oversized input before launching anything', async () => {
    const launch = vi.fn();
    await expect(
      runCodexProcess({
        executable: process.execPath,
        args: [],
        cwd: process.cwd(),
        env: {},
        input: 'x'.repeat(512 * 1024 + 1),
        timeoutMs: 1000,
        maxBytes: 1024,
        spawn: launch,
      }),
    ).rejects.toMatchObject({ code: 'invalid-process-options' });
    expect(launch).not.toHaveBeenCalled();
  });
});
