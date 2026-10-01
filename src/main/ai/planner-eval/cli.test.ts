import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  proofFrames,
  renderFinalists,
} from '../../../../scripts/planner-eval/render-finalists.mjs';
import {
  codeFingerprint,
  evaluationTimeouts,
  main,
  parseArgs,
  prepareRunDirectory,
} from '../../../../scripts/planner-eval/run.mjs';
import { DEFAULT_RUN_LIMITS } from './limits';

const external = vi.hoisted(() => ({
  runBounded: vi.fn(async () => undefined),
  readDirectory: vi.fn(),
}));
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  external.readDirectory.mockImplementation(fs.readdirSync);
  return { ...fs, readdirSync: external.readDirectory };
});
vi.mock('../../../../scripts/explainer-stills/verify-systems-e2e.mjs', async (original) => ({
  ...(await original<
    typeof import('../../../../scripts/explainer-stills/verify-systems-e2e.mjs')
  >()),
  runBounded: external.runBounded,
}));
// Authored test pin only; runBounded is mocked and no executable is launched.
const executableSha256 = 'a'.repeat(64);
const liveArgs = ['--mode', 'live', '--model', 'example-model'];

describe('planner evaluation CLI', () => {
  it.each([
    'gg-chatgpt',
    'codex-subscription',
  ] as const)('forwards saved %s identity to the no-AI render adapter without invoking a model', async (transport) => {
    const directory = prepareRunDirectory();
    const output = prepareRunDirectory();
    const bundle = mkdtempSync(join(tmpdir(), 'saved-plan-identity-'));
    const corpus = join(bundle, 'corpus.json');
    const media = join(bundle, 'source.mp4');
    writeFileSync(join(bundle, 'index.html'), '<html>authored harness stub</html>');
    writeFileSync(corpus, '{}');
    writeFileSync(media, 'authored harness stub; no decoder is invoked');
    external.runBounded.mockClear();
    external.runBounded.mockRejectedValueOnce(new Error('stop-before-render'));
    try {
      await expect(
        renderFinalists([
          '--run-dir',
          directory,
          '--out-dir',
          output,
          '--trial',
          'b'.repeat(64),
          '--corpus',
          corpus,
          '--media',
          media,
          '--bundle',
          bundle,
          '--model',
          'example-model',
          '--transport',
          transport,
          ...(transport === 'codex-subscription'
            ? ['--codex-executable', 'C:/tools/restricted.exe', '--codex-sha256', executableSha256]
            : []),
          '--reasoning',
          'high',
          '--auto-reload-disabled',
          'true',
        ]),
      ).rejects.toThrow('stop-before-render');
      expect(external.runBounded).toHaveBeenCalledTimes(1);
      const call = external.runBounded.mock.calls[0] as unknown as [
        string,
        string[],
        { env: Record<string, string> },
      ];
      const identity = JSON.parse(call[2].env.PLANNER_EVAL_RENDER);
      expect(identity).toMatchObject({
        model: 'example-model',
        transport,
        ...(transport === 'codex-subscription' ? { executableSha256 } : {}),
        reasoning: 'high',
        autoReloadDisabled: true,
      });
      if (transport === 'gg-chatgpt') {
        expect(identity).not.toHaveProperty('codexExecutable');
        expect(identity).not.toHaveProperty('executableSha256');
      }
      expect(call[1]).toContain('--config');
    } finally {
      external.runBounded.mockReset();
      rmSync(directory, { recursive: true, force: true });
      rmSync(output, { recursive: true, force: true });
      rmSync(bundle, { recursive: true, force: true });
    }
  });
  it('samples the last real video frame, not an audio-padding frame', () => {
    const frames = proofFrames(24.041, [{ startTime: 2.75, endTime: 23.15 }], 721);
    expect(frames[frames.length - 1]).toBe(720);
    expect(
      frames.every((frame: number) => Number.isInteger(frame) && frame >= 0 && frame < 721),
    ).toBe(true);
    expect(() => proofFrames(24, [], 0)).toThrow();
    expect(() => proofFrames(24, [{ startTime: 0, endTime: Infinity }], 720)).toThrow();
  });
  it('defaults to offline dry-run and rejects paid/fallback flags', () => {
    expect(parseArgs([])).toMatchObject({
      mode: 'dry-run',
      repetitions: 2,
      transport: 'gg-chatgpt',
    });
    for (const args of [
      ['--provider', 'gemini'],
      ['--transport', 'api-key'],
      ['--api-key', 'secret'],
      ['--mode', 'live'],
    ])
      expect(() => parseArgs(args)).toThrow();
  });
  it('defaults new live preflights to GG with a model, refusing native configuration', () => {
    expect(parseArgs(liveArgs)).toMatchObject({
      mode: 'live',
      transport: 'gg-chatgpt',
      model: 'example-model',
    });
    expect(parseArgs([...liveArgs, '--transport', 'gg-chatgpt'])).toEqual(parseArgs(liveArgs));
    expect(parseArgs(liveArgs).codexExecutable).toBeUndefined();
    expect(parseArgs(liveArgs).executableSha256).toBeUndefined();
    for (const extra of [
      ['--transport', 'codex-subscription'],
      ['--codex-executable', 'C:/tools/codex.exe'],
      ['--codex-sha256', executableSha256],
      ['--helper-path', 'C:/untrusted/helper.mjs'],
      ['--client-version', 'invented'],
    ])
      expect(() => parseArgs([...liveArgs, ...extra])).toThrow();
    expect(
      parseArgs([
        ...liveArgs,
        '--profile',
        'semantic-variety-codex-v1',
        '--split',
        'holdout',
        '--clip',
        'clip-a',
      ]),
    ).toMatchObject({
      profiles: ['semantic-variety-codex-v1'],
      split: 'holdout',
      clipId: 'clip-a',
    });
    for (const pin of [
      '',
      'a'.repeat(63),
      'a'.repeat(65),
      'A'.repeat(64),
      'g'.repeat(64),
      `${executableSha256}\n`,
    ]) {
      expect(() =>
        parseArgs(['--mode', 'replay', '--run-dir', 'owned', '--codex-sha256', pin]),
      ).toThrow();
      expect(() => parseArgs(['--codex-sha256', pin])).toThrow();
    }
    expect(parseArgs([]).executableSha256).toBeUndefined();
    expect(() => parseArgs(['--repetitions', '1000'])).toThrow();
    expect(() => parseArgs(['--mode', 'replay'])).toThrow();
    expect(() => parseArgs(['--mode', 'dry-run', '--mode', 'live'])).toThrow();
  });
  it('bounds reasoning and requires explicit true attestation for generation, not metadata preflight', () => {
    expect(parseArgs(liveArgs).autoReloadDisabled).not.toBe(true);
    for (const reasoning of ['low', 'medium', 'high', 'xhigh'])
      expect(
        parseArgs([...liveArgs, '--reasoning', reasoning, '--auto-reload-disabled', 'true']),
      ).toMatchObject({ reasoning, autoReloadDisabled: true });
    for (const extra of [
      ['--reasoning', 'unbounded'],
      ['--reasoning', 'high; run-tools'],
      ['--auto-reload-disabled', 'false'],
      ['--auto-reload-disabled', '1'],
      ['--spawn', 'fake'],
      ['--skip-preflight', 'true'],
    ])
      expect(() => parseArgs([...liveArgs, ...extra])).toThrow();
    expect(
      parseArgs([
        '--mode',
        'replay',
        '--run-dir',
        'owned',
        '--model',
        'example-model',
        '--codex-executable',
        'C:/tools/codex.exe',
        '--codex-sha256',
        executableSha256,
        '--reasoning',
        'high',
        '--auto-reload-disabled',
        'true',
      ]),
    ).toMatchObject({
      mode: 'replay',
      transport: 'codex-subscription',
      reasoning: 'high',
      autoReloadDisabled: true,
      executableSha256,
    });
  });

  it.each([
    'dry-run',
    'replay',
    'live',
  ])('bounds the %s CLI and opt-in test without spawning a model', async (mode) => {
    const timeouts = evaluationTimeouts(mode);
    const runMs = mode === 'live' ? DEFAULT_RUN_LIMITS.wallMs : 100_000;
    expect(timeouts).toEqual({ runMs, testMs: runMs + 10_000, outerMs: runMs + 20_000 });
    const directory = prepareRunDirectory();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    external.runBounded.mockClear();
    try {
      await main([
        ...(mode === 'live'
          ? [...liveArgs, '--reasoning', 'high', '--auto-reload-disabled', 'true']
          : ['--mode', mode]),
        '--run-dir',
        directory,
      ]);
      expect(external.runBounded).toHaveBeenCalledTimes(1);
      expect(external.runBounded).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['run', '--config']),
        expect.objectContaining({ timeoutMs: timeouts.outerMs, ownProcessGroup: true }),
      );
      const call = vi.mocked(external.runBounded).mock.calls[0] as unknown as [
        string,
        string[],
        { env: Record<string, string> },
      ];
      const options = JSON.parse(call[2].env.PLANNER_EVAL_OPTIONS);
      expect(options.mode).toBe(mode);
      if (mode === 'live')
        expect(options).toMatchObject({
          reasoning: 'high',
          autoReloadDisabled: true,
          transport: 'gg-chatgpt',
        });
      expect(options).not.toHaveProperty('codexExecutable');
      expect(options).not.toHaveProperty('executableSha256');
      expect(options).not.toHaveProperty('helperPath');
      expect(Object.keys(call[2].env)).not.toContain('OPENAI_API_KEY');
    } finally {
      log.mockRestore();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('fingerprints authored inputs without walking the nested GG dependency tree', () => {
    external.readDirectory.mockClear();
    expect(codeFingerprint()).toMatch(/^[a-f0-9]{64}$/);
    expect(
      external.readDirectory.mock.calls.some(([path]) =>
        /(?:^|[/\\])node_modules(?:[/\\]|$)/.test(String(path)),
      ),
    ).toBe(false);
  });

  it('only admits the named authored response fixture on offline replay', () => {
    expect(
      parseArgs([
        '--mode',
        'replay',
        '--fixture',
        'authored-responses-v1',
        '--clip',
        'three-processes',
      ]),
    ).toMatchObject({ mode: 'replay', fixture: 'authored-responses-v1' });
    expect(() => parseArgs(['--fixture', 'authored-responses-v1'])).toThrow();
    expect(() => parseArgs(['--mode', 'replay', '--fixture', '../../private'])).toThrow();
    for (const extra of [
      ['--reasoning', 'high'],
      ['--auto-reload-disabled', 'true'],
      ['--codex-sha256', executableSha256],
      ['--transport', 'gg-chatgpt'],
    ])
      expect(() =>
        parseArgs(['--mode', 'replay', '--fixture', 'authored-responses-v1', ...extra]),
      ).toThrow();
  });
  it('creates an outside-repository owned directory and refuses unrelated output directories', () => {
    const dir = prepareRunDirectory();
    try {
      expect(readFileSync(join(dir, '.planner-eval-owner'), 'utf8')).toBe('planner-eval-v1');
      expect(prepareRunDirectory(dir)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const unrelated = mkdtempSync(join(tmpdir(), 'unowned-eval-test-'));
    try {
      expect(() => prepareRunDirectory(unrelated)).toThrow();
    } finally {
      rmSync(unrelated, { recursive: true, force: true });
    }
    expect(() => prepareRunDirectory(process.cwd())).toThrow();
  });
});
