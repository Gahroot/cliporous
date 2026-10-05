import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_COMPLETION_BYTES } from '../explainer/planner-generation';
import { runCodexProcess } from './codex-process';
import {
  CODEX_CAPABILITY_POLICY,
  CodexTransportError,
  codexReadiness,
  createCodexGenerator,
  parseCodexCompletion,
  probeCodex,
} from './codex-transport';

class FakeChild extends EventEmitter {
  pid = 4321;
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => true);
  unref = vi.fn();
  close(code: number | null = 0) {
    this.stdout.end();
    this.stderr.end();
    this.emit('exit', code);
    this.emit('close', code);
  }
}
function fake(script: (child: FakeChild, args: string[], options: SpawnOptions) => void) {
  const children: FakeChild[] = [];
  const spawn = vi.fn((_file: string, args: string[], options: SpawnOptions) => {
    const child = new FakeChild();
    child.pid += children.length;
    children.push(child);
    queueMicrotask(() =>
      script(child, args[0]?.endsWith('cli.mjs') ? args.slice(1) : args, options),
    );
    return child as unknown as ChildProcess;
  });
  return { spawn, children };
}
const executable = 'C:\\Program Files\\nodejs\\node.exe';
const base = {
  live: true,
  model: 'test-model',
  reasoning: 'medium',
  platform: 'win32' as const,
  env: { SystemRoot: 'C:\\Windows' },
};
const request = {
  phase: 'draft' as const,
  prompt: 'PRIVATE PROMPT',
  expectation: 'json-object' as const,
};
function nativeMetadata(authMode: unknown = 'chatgpt') {
  return JSON.stringify({
    policyVersion: 'batchclip-gg-chatgpt-v1',
    upstreamRevision: 'd7f3e960f03544554a6dbff3bc1c1ac9cf27c374',
    authMode,
    ordinaryUsageAllowed: null,
    credits: { hasCredits: false, unlimited: false, balance: '0' },
    models: [{ id: 'test-model', reasoningLevels: ['medium'] }],
    toolCount: 0,
    isolation: {
      userConfig: false,
      projectConfig: false,
      instructions: false,
      hooks: false,
      plugins: false,
      mcp: false,
      skills: false,
    },
    serviceTier: 'default',
  });
}
function metadata(child: FakeChild, args: string[]) {
  if (args[0] === '--version') child.stdout.write('batchclip-gg-chatgpt 5.67.1\n');
  else child.stdout.write(nativeMetadata());
  child.close();
}
const events = (items: unknown[]) => `${items.map((item) => JSON.stringify(item)).join('\n')}\n`;
const start = [{ type: 'thread.started', thread_id: 'saved' }, { type: 'turn.started' }];
const message = { type: 'item.completed', item: { type: 'agent_message', text: '{"scenes":[]}' } };
const completed = {
  type: 'turn.completed',
  usage: { input_tokens: 20, cached_input_tokens: 10, output_tokens: 5, reasoning_tokens: 2 },
};
const saved = () => events([...start, message, completed]);
// Match the fixed Node executable to the Windows platform simulated below.
// Spawning remains mocked; production executable validation is unchanged.
beforeEach(() => vi.stubGlobal('process', { ...process, execPath: executable }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Codex fail-closed capability policy', () => {
  it('reports blockers without spawning unless metadata probing is explicitly live', async () => {
    const io = fake(metadata);
    expect(codexReadiness()).toMatchObject({ ready: false, ordinaryUsageAllowed: null });
    expect(await probeCodex({ ...base, live: false, spawn: io.spawn })).toEqual(codexReadiness());
    await expect(createCodexGenerator()(request)).rejects.toMatchObject({
      code: 'blocked',
      readiness: codexReadiness(),
    });
    await expect(
      createCodexGenerator({ executable, spawn: io.spawn })(request),
    ).rejects.toMatchObject({ code: 'blocked' });
    expect(io.spawn).not.toHaveBeenCalled();
  });
  it('rejects browser auth without known included usage and attestation; never sends prompts', async () => {
    const io = fake(metadata);
    const readiness = await probeCodex({ ...base, spawn: io.spawn });
    expect(readiness).toMatchObject({
      ready: false,
      clientVersion: 'gg-ai@5.67.1+gg-core@5.67.1',
      authMode: 'chatgpt',
      ordinaryUsageAllowed: null,
      policyVersion: CODEX_CAPABILITY_POLICY.version,
      blockers: ['ordinary-usage-unavailable', 'automatic-credit-reload-attestation-required'],
    });
    const generate = createCodexGenerator({ ...base, spawn: io.spawn });
    await expect(generate(request)).rejects.toMatchObject({
      code: 'blocked',
      retryable: false,
      readiness,
    });
    expect(io.spawn.mock.calls.map((call) => call[1].slice(1))).toEqual([
      ['--version'],
      ['planner-preflight'],
      ['--version'],
      ['planner-preflight'],
    ]);
    expect(JSON.stringify(io.spawn.mock.calls)).not.toContain(request.prompt);
    expect(Object.isFrozen(CODEX_CAPABILITY_POLICY)).toBe(true);
  });

  it.each([
    '0.159.2',
    '0.159.4',
    '99.0.0',
    'garbage PRIVATE_TOKEN',
  ])('rejects unknown version %s', async (version) => {
    const io = fake((child) => {
      child.stdout.write(`batchclip-gg-chatgpt ${version}\n`);
      child.close();
    });
    const readiness = await probeCodex({ ...base, spawn: io.spawn });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContain('unsupported-version');
    expect(JSON.stringify(readiness)).not.toContain('PRIVATE_TOKEN');
    expect(io.spawn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['apikey', 'chatgpt-auth-required'],
    ['none', 'chatgpt-auth-required'],
    ['Logged in using ChatGPT\nAPI key: PRIVATE', 'invalid-preflight'],
  ])('rejects non-exact ChatGPT auth %s', async (authMode, blocker) => {
    const io = fake((child, args) => {
      child.stdout.write(
        args[0] === '--version' ? 'batchclip-gg-chatgpt 5.67.1' : nativeMetadata(authMode),
      );
      child.close();
    });
    const readiness = await probeCodex({ ...base, spawn: io.spawn });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContain(blocker);
    expect(readiness.authMode).toBeUndefined();
    expect(JSON.stringify(readiness)).not.toContain('PRIVATE');
    expect(io.spawn.mock.calls.some((call) => call[1][1] === 'planner-exec')).toBe(false);
  });
});

describe('bounded metadata-only subprocesses', () => {
  it('uses native argument arrays, empty owned cwd, no shell, and an environment allowlist', async () => {
    const directories: string[] = [];
    const io = fake((child, args, options) => {
      const cwd = String(options.cwd);
      directories.push(cwd);
      expect(cwd).not.toBe(process.cwd());
      expect(readdirSync(cwd)).toEqual([]);
      metadata(child, args);
    });
    await probeCodex({
      ...base,
      spawn: io.spawn,
      env: {
        ...base.env,
        USERPROFILE: 'C:\\Users\\Test',
        OPENAI_API_KEY: 'PRIVATE',
        GEMINI_API_KEY: 'PRIVATE',
        CODEX_HOME: 'PRIVATE',
        OPENAI_BASE_URL: 'PRIVATE',
        NODE_OPTIONS: 'PRIVATE',
        RUST_LOG: 'PRIVATE',
        PATH: 'PRIVATE',
        HTTPS_PROXY: 'PRIVATE',
        RANDOM_SECRET: 'PRIVATE',
      },
    });
    for (const [file, args, options] of io.spawn.mock.calls) {
      expect(file).toBe(executable);
      expect(Array.isArray(args)).toBe(true);
      expect(options).toMatchObject({
        shell: false,
        windowsHide: true,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(options.env).toEqual({
        SystemRoot: 'C:\\Windows',
        USERPROFILE: 'C:\\Users\\Test',
        TMP: options.cwd,
        TEMP: options.cwd,
        TMPDIR: options.cwd,
      });
    }
    expect(directories.every((cwd) => !existsSync(cwd))).toBe(true);
  });

  it.each([
    'codex',
    'codex.cmd',
    'C:\\Tools\\codex.cmd',
    'C:\\Tools\\codex.ps1',
  ])('rejects wrappers/relative executable %s', async (path) => {
    const io = fake(metadata);
    expect(await probeCodex({ ...base, executable: path, spawn: io.spawn })).toMatchObject({
      ready: false,
      blockers: ['legacy-native-config-not-supported'],
    });
    expect(io.spawn).not.toHaveBeenCalled();
  });

  it('cancels before spawn without retrying or exposing abort reasons', async () => {
    const io = fake(metadata);
    const controller = new AbortController();
    controller.abort('PRIVATE');
    await expect(
      createCodexGenerator({ ...base, spawn: io.spawn })({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(io.spawn).not.toHaveBeenCalled();
  });

  it.each([
    'timeout',
    'cancelled',
    'output-limit',
  ])('kills the exact Windows tree on %s and waits for close', async (reason) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let started = () => {};
    const spawned = new Promise<void>((resolve) => {
      started = resolve;
    });
    const io = fake((child, args) => {
      if (args[0] === '/PID') {
        child.close();
        return;
      }
      started();
    });
    const promise = probeCodex({ ...base, spawn: io.spawn }, controller.signal);
    let settled = false;
    const result = promise.catch((error: CodexTransportError) => {
      settled = true;
      return error;
    });
    await spawned;
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(5_000);
    if (reason === 'cancelled') controller.abort();
    if (reason === 'output-limit') {
      io.children[0].stdout.write(Buffer.alloc(10_000));
      io.children[0].stderr.write(Buffer.alloc(10_000));
    }
    expect(io.spawn.mock.calls[1]?.slice(0, 2)).toEqual([
      'C:\\Windows\\System32\\taskkill.exe',
      ['/PID', '4321', '/T', '/F'],
    ]);
    expect(io.spawn.mock.calls[1]?.[2]).toMatchObject({ shell: false, stdio: 'ignore' });
    expect(settled).toBe(false);
    io.children[0].close(null);
    expect(await result).toMatchObject({ code: reason, retryable: false });
    expect(io.spawn).toHaveBeenCalledTimes(2);
    expect(existsSync(String(io.spawn.mock.calls[0][2].cwd))).toBe(false);
  });

  it('kills only the owned POSIX process group', async () => {
    const controller = new AbortController();
    const killGroup = vi.fn(() => {
      queueMicrotask(() => io.children[0].close(null));
    });
    const io = fake(() => controller.abort());
    await expect(
      runCodexProcess({
        executable: '/usr/bin/node',
        platform: 'linux',
        spawn: io.spawn,
        killGroup,
        args: ['--version'],
        cwd: process.cwd(),
        env: {},
        signal: controller.signal,
        timeoutMs: 5_000,
        maxBytes: 16 * 1024,
      }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(io.spawn.mock.calls[0][2].detached).toBe(true);
    expect(killGroup).toHaveBeenCalledExactlyOnceWith(-4321, 'SIGKILL');
    expect(io.spawn).toHaveBeenCalledTimes(1);
  });

  it('bounds missing close and a stuck taskkill, destroys streams and reaps the helper', async () => {
    vi.useFakeTimers();
    let started = () => {};
    const spawned = new Promise<void>((resolve) => {
      started = resolve;
    });
    const io = fake(() => started());
    const result = probeCodex({ ...base, spawn: io.spawn }).catch((error) => error);
    await spawned;
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await result).toMatchObject({ code: 'close-timeout' });
    expect(io.children[0].stdout.destroyed).toBe(true);
    expect(io.children[0].stderr.destroyed).toBe(true);
    expect(io.children[1].kill).toHaveBeenCalledWith('SIGKILL');
    expect(io.children[0].unref).toHaveBeenCalled();
    expect(io.spawn).toHaveBeenCalledTimes(2);
  });

  it('does not resolve on exit before stdio closes', async () => {
    let child: FakeChild | undefined;
    let started = () => {};
    const spawned = new Promise<void>((resolve) => {
      started = resolve;
    });
    const io = fake((process) => {
      child = process;
      process.stdout.write('codex-cli 0.159.4');
      process.emit('exit', 0);
      started();
    });
    let settled = false;
    const result = probeCodex({ ...base, spawn: io.spawn }).then((value) => {
      settled = true;
      return value;
    });
    await spawned;
    expect(settled).toBe(false);
    child?.close();
    expect((await result).blockers).toContain('unsupported-version');
  });

  it.each(['nonzero', 'event', 'throw'])('redacts raw %s errors without retries', async (kind) => {
    const io = fake((child) => {
      child.stderr.write('PRIVATE sk-secret /private/path');
      if (kind === 'event') child.emit('error', new Error('PRIVATE'));
      child.close(1);
    });
    if (kind === 'throw')
      io.spawn.mockImplementation(() => {
        throw new Error('PRIVATE');
      });
    const error = await probeCodex({ ...base, spawn: io.spawn }).catch((error) => error);
    expect(error).toBeInstanceOf(CodexTransportError);
    expect(`${error.message} ${JSON.stringify(error)}`).not.toContain('PRIVATE');
    expect(io.spawn.mock.calls.filter((call) => call[1][1] === '--version')).toHaveLength(1);
    expect(io.spawn.mock.calls.some((call) => call[1].includes('planner-exec'))).toBe(false);
  });
});

describe('saved JSONL completion parsing (never executes)', () => {
  it('extracts a single completed message and bounded token metadata', () => {
    expect(parseCodexCompletion(saved())).toEqual({
      text: '{"scenes":[]}',
      inputTokens: 20,
      cachedInputTokens: 10,
      outputTokens: 5,
      reasoningTokens: 2,
    });
    expect(
      parseCodexCompletion(
        events([
          ...start,
          { type: 'item.completed', item: { type: 'reasoning', text: 'not returned' } },
          message,
          completed,
        ]),
      ).text,
    ).toBe('{"scenes":[]}');
  });

  it.each([
    '',
    saved().trimEnd(),
    events([...start, message]),
    `${saved()}{`,
    events([...start, completed]),
    events([...start, message, message, completed]),
    events([message, completed]),
    `${saved()}${saved()}`,
    'not JSON\n',
    events([...start, { ...message, truncated: true }, completed]),
    events([...start, { ...message, finish_reason: 'length' }, completed]),
    events([...start, message, { ...completed, status: 'incomplete' }]),
  ])('rejects truncated, incomplete, multiple or invalid events', (jsonl) => {
    expect(() => parseCodexCompletion(jsonl)).toThrow(CodexTransportError);
  });

  it.each([
    'command_execution',
    'file_change',
    'mcp_tool_call',
    'web_search',
    'apply_patch',
    'function_call',
    'todo_list',
    'unknown_tool',
  ])('rejects %s in any item lifecycle', (type) => {
    for (const event of ['item.started', 'item.updated', 'item.completed']) {
      expect(() =>
        parseCodexCompletion(
          events([...start, { type: event, item: { type } }, message, completed]),
        ),
      ).toThrow(expect.objectContaining({ code: 'tool-call' }));
    }
  });

  it.each([
    'quota exceeded',
    'rate_limit_exceeded',
    'insufficient credits',
    'billing limit',
    'ordinaryUsageAllowed: null',
  ])('rejects quota/credit/unknown usage signal %s without leaking it', (signal) => {
    expect(() =>
      parseCodexCompletion(events([...start, { type: 'error', message: `${signal} PRIVATE` }])),
    ).toThrow(
      expect.objectContaining({
        code: 'usage-limit',
        message: 'Codex transport refused: usage-limit',
      }),
    );
  });

  it.each([
    { type: 'error', message: 'PRIVATE' },
    { type: 'turn.failed', error: { message: 'PRIVATE' } },
    { type: 'rate_limits.updated', credits: { balance: 10 } },
  ])('rejects errors even after a valid completion', (error) => {
    expect(() => parseCodexCompletion(`${saved()}${events([error])}`)).toThrow(CodexTransportError);
  });

  it('bounds total bytes, completion bytes, and event count', () => {
    expect(() => parseCodexCompletion(' '.repeat(2 * MAX_COMPLETION_BYTES + 1))).toThrow(
      expect.objectContaining({ code: 'output-limit' }),
    );
    expect(() =>
      parseCodexCompletion(
        events([
          ...start,
          {
            ...message,
            item: { type: 'agent_message', text: 'é'.repeat(MAX_COMPLETION_BYTES / 2 + 1) },
          },
          completed,
        ]),
      ),
    ).toThrow(expect.objectContaining({ code: 'output-limit' }));
    expect(() => parseCodexCompletion(events(Array.from({ length: 1025 }, () => ({}))))).toThrow(
      expect.objectContaining({ code: 'output-limit' }),
    );
  });

  it.each([
    -1,
    1.5,
    10_000_001,
    Number.MAX_SAFE_INTEGER,
    null,
    '5',
  ])('rejects unbounded/nonintegral token count %s', (count) => {
    for (const field of [
      'input_tokens',
      'cached_input_tokens',
      'output_tokens',
      'reasoning_tokens',
    ]) {
      expect(() =>
        parseCodexCompletion(
          events([
            ...start,
            message,
            { ...completed, usage: { ...completed.usage, [field]: count } },
          ]),
        ),
      ).toThrow(expect.objectContaining({ code: 'invalid-usage' }));
    }
  });

  it('rejects absent usage and cached counts larger than input', () => {
    expect(() =>
      parseCodexCompletion(events([...start, message, { type: 'turn.completed' }])),
    ).toThrow(CodexTransportError);
    expect(() =>
      parseCodexCompletion(
        events([
          ...start,
          message,
          { ...completed, usage: { ...completed.usage, cached_input_tokens: 21 } },
        ]),
      ),
    ).toThrow(CodexTransportError);
  });
});
