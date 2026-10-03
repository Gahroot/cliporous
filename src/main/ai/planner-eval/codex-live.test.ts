import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCodexGenerator, probeCodex } from './codex-transport';

const preflight = {
  policyVersion: 'batchclip-gg-chatgpt-v1',
  upstreamRevision: 'd7f3e960f03544554a6dbff3bc1c1ac9cf27c374',
  authMode: 'chatgpt',
  ordinaryUsageAllowed: true,
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
};
const options = {
  live: true,
  model: 'test-model',
  reasoning: 'medium',
  autoReloadDisabled: true,
  platform: 'win32' as const,
  env: { SystemRoot: 'C:\\Windows' },
};
// The mocked Windows helper needs a Windows Node path even on macOS/Linux.
beforeEach(() =>
  vi.stubGlobal('process', { ...process, execPath: 'C:\\Program Files\\nodejs\\node.exe' }),
);
afterEach(() => vi.unstubAllGlobals());

const request = {
  phase: 'draft' as const,
  prompt: 'PRIVATE TRANSCRIPT',
  expectation: 'json-object' as const,
};
class Child extends EventEmitter {
  pid = 4321;
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => true);
  unref = vi.fn();
  close(code = 0) {
    this.stdout.end();
    this.stderr.end();
    this.emit('close', code);
  }
}
function harness(settings: { nextPreflight?: unknown; text?: string; exitCode?: number } = {}) {
  const inputs: string[] = [];
  let reads = 0;
  const spawn = vi.fn((_file: string, argv: string[], _options: SpawnOptions) => {
    const args = argv.slice(1);
    const child = new Child();
    child.stdin.on('data', (chunk) => inputs.push(String(chunk)));
    queueMicrotask(() => {
      if (args[0] === '--version') child.stdout.write('batchclip-gg-chatgpt 5.67.1\n');
      else if (args[0] === 'planner-preflight') {
        child.stdout.write(
          JSON.stringify(
            reads++ > 0 && settings.nextPreflight !== undefined
              ? settings.nextPreflight
              : preflight,
          ),
        );
      } else if (args[0] === 'planner-exec') {
        child.stdout.write(
          `${[
            { type: 'thread.started', thread_id: 'fresh' },
            { type: 'turn.started' },
            {
              type: 'item.completed',
              item: {
                type: 'agent_message',
                text: settings.text ?? JSON.stringify({ plan_json: '{"scenes":[],"quotes":[]}' }),
              },
            },
            {
              type: 'turn.completed',
              usage: { input_tokens: 20, cached_input_tokens: 5, output_tokens: 10 },
            },
          ]
            .map((event) => JSON.stringify(event))
            .join('\n')}\n`,
        );
      }
      child.close(args[0] === 'planner-exec' ? settings.exitCode : 0);
    });
    return child as unknown as ChildProcess;
  });
  return { spawn, inputs };
}

describe('restricted subscription generation', () => {
  it('uses validated account readiness and stdin before returning untrusted plan text', async () => {
    const io = harness();
    const result = await createCodexGenerator({ ...options, spawn: io.spawn })(request);
    expect(result.text).toBe('{"scenes":[],"quotes":[]}');
    expect(result.metadata).toMatchObject({
      provider: 'codex-subscription',
      model: 'test-model',
      authMode: 'chatgpt',
      transport: 'gg-chatgpt',
      clientVersion: 'gg-ai@5.67.1+gg-core@5.67.1',
      inputTokens: 20,
      cachedInputTokens: 5,
      outputTokens: 10,
    });
    expect(io.spawn.mock.calls.map((call) => call[1][1])).toEqual([
      '--version',
      'planner-preflight',
      'planner-exec',
    ]);
    expect(JSON.stringify(io.spawn.mock.calls)).not.toContain('PRIVATE TRANSCRIPT');
    expect(io.inputs.join('')).toContain('PRIVATE TRANSCRIPT');
    expect(io.spawn.mock.calls[2][2]).toMatchObject({
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });

  it.each([
    { executable: 'C:\\Tools\\codex.exe' },
    { executableSha256: 'a'.repeat(64) },
    { executable: process.execPath, executableSha256: 'a'.repeat(64) },
  ])('refuses native overrides before reading credentials or spawning', async (legacy) => {
    const io = harness();
    const readiness = await probeCodex({ ...options, ...legacy, spawn: io.spawn });
    expect(readiness).toMatchObject({
      ready: false,
      blockers: ['legacy-native-config-not-supported'],
    });
    expect(io.spawn).not.toHaveBeenCalled();
  });

  it('launches only the fixed Node helper, never a model-selected executable or script', async () => {
    const io = harness();
    await createCodexGenerator({ ...options, spawn: io.spawn })(request);
    for (const [file, args] of io.spawn.mock.calls) {
      expect(file).toBe(process.execPath);
      expect(args[0].replaceAll('\\', '/')).toMatch(
        /\/scripts\/planner-eval\/gg-client\/cli\.mjs$/,
      );
    }
    expect(io.spawn.mock.calls[2][1]).toEqual([
      io.spawn.mock.calls[0][1][0],
      'planner-exec',
      '--model',
      'test-model',
      '--reasoning',
      'medium',
      '--auto-reload-disabled',
      'true',
      '-',
    ]);
    expect(io.inputs).toEqual(['PRIVATE TRANSCRIPT']);
  });

  it('does not turn permission to use ChatGPT into an automatic-reload attestation', async () => {
    const io = harness();
    await expect(
      createCodexGenerator({ ...options, autoReloadDisabled: undefined, spawn: io.spawn })(request),
    ).rejects.toMatchObject({
      code: 'blocked',
      readiness: { blockers: ['automatic-credit-reload-attestation-required'] },
    });
    expect(io.inputs).toEqual([]);
    expect(io.spawn.mock.calls).toHaveLength(2);
  });

  it('rechecks usage before each phase and does not generate when allowance changes', async () => {
    const io = harness({ nextPreflight: { ...preflight, ordinaryUsageAllowed: false } });
    const generate = createCodexGenerator({ ...options, spawn: io.spawn });
    await generate(request);
    await expect(generate({ ...request, phase: 'review' })).rejects.toMatchObject({
      code: 'blocked',
      readiness: { blockers: ['ordinary-usage-denied'] },
    });
    expect(io.spawn.mock.calls.filter((call) => call[1][1] === 'planner-exec')).toHaveLength(1);
    expect(io.inputs).toHaveLength(1);
  });

  it('rejects overlapping requests without launching a second generation', async () => {
    const io = harness();
    const generate = createCodexGenerator({ ...options, spawn: io.spawn });
    const first = generate(request);
    await expect(generate(request)).rejects.toMatchObject({ code: 'in-flight' });
    await first;
    expect(io.spawn.mock.calls.filter((call) => call[1][1] === 'planner-exec')).toHaveLength(1);
  });

  it.each([
    'not-json',
    'null',
    '{"plan_json":42}',
    '{"plan_json":"{}","extra":true}',
  ])('rejects malformed completion envelopes %s', async (text) => {
    const io = harness({ text });
    await expect(
      createCodexGenerator({ ...options, spawn: io.spawn })(request),
    ).rejects.toMatchObject({ code: 'invalid-envelope' });
  });

  it('rejects a nonzero native exit even with a completed message', async () => {
    const io = harness({ exitCode: 1 });
    await expect(
      createCodexGenerator({ ...options, spawn: io.spawn })(request),
    ).rejects.toMatchObject({ code: 'generation-failed' });
    expect(io.spawn.mock.calls.filter((call) => call[1][1] === 'planner-exec')).toHaveLength(1);
  });
});
