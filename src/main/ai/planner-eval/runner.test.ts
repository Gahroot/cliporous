import {
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationMetadata, PlannerGenerator } from '../explainer/planner-generation';
import { CodexTransportError } from './codex-transport';
import type { CorpusManifest } from './corpus';
import { DEFAULT_RUN_LIMITS } from './limits';
import { type EvaluationOptions, runEvaluation, runTrial } from './runner';

const external = vi.hoisted(() => ({
  probe: vi.fn(),
  generator: vi.fn(),
  generate: vi.fn<PlannerGenerator>(),
  construct: vi.fn(),
  paid: vi.fn(),
}));
vi.mock('@google/genai', () => ({ GoogleGenAI: external.construct, ThinkingLevel: {} }));
vi.mock('../gemini-client', () => ({
  MODELS: { BALANCED: ['paid'] },
  callGeminiWithRetry: external.paid,
}));
vi.mock('../../logger', () => ({ log: vi.fn() }));
vi.mock('./codex-transport', async (original) => ({
  ...(await original<typeof import('./codex-transport')>()),
  probeCodex: external.probe,
  createCodexGenerator: external.generator,
}));

const corpus: CorpusManifest = {
  version: 1,
  id: 'synthetic',
  description: 'Public synthetic runner fixture',
  clips: [
    {
      id: 'clip-a',
      provenance: 'synthetic',
      sourceGroup: 'source-a',
      topicGroup: 'topic-a',
      split: 'discovery',
      bounds: { start: 10, end: 22 },
      words: 'We can Stop guessing and test each small change today'
        .split(' ')
        .map((text, i) => ({ text, start: 10 + i, end: 10.8 + i })),
      expectations: {
        animation: 'optional',
        quote: 'allowed',
        takeaway: 'allowed',
        requiredKinds: [],
        forbiddenKinds: [],
        notes: 'Human review only.',
      },
    },
  ],
};
const valid = JSON.stringify({
  scenes: [
    {
      kind: 'stack',
      startWord: 2,
      endWord: 5,
      layout: 'stack',
      layers: [
        { label: 'Stop', word: 2 },
        { label: 'guessing', word: 3 },
      ],
    },
    { kind: 'not-a-real-kind', startWord: 6, endWord: 9, layout: 'stack' },
  ],
});
const completion = (text: string) => ({
  text,
  metadata: {
    provider: 'offline' as const,
    model: 'fixture',
    configId: 'baseline-policy-codex-v1',
    latencyMs: 1,
    inputTokens: 5,
    outputTokens: 7,
  },
});
const ggIdentity = {
  transport: 'gg-chatgpt' as const,
  clientVersion: 'gg-ai@5.67.1+gg-core@5.67.1',
};
// Authored legacy replay identity only; never used with a real executable.
const executableSha256 = 'a'.repeat(64);
const generate = () => vi.fn<PlannerGenerator>(async () => completion(valid));
let directory: string;
let options: EvaluationOptions;
const artifactPath = (id: string) => join(directory, `trial-${id}.json`);

beforeEach(async () => {
  vi.resetAllMocks();
  external.generator.mockReturnValue(external.generate);
  external.generate.mockImplementation(async () => ({
    ...completion(valid),
    metadata: {
      ...completion(valid).metadata,
      provider: 'codex-subscription',
      ...ggIdentity,
      authMode: 'chatgpt',
    },
  }));
  directory = await realpath(await mkdtemp(join(tmpdir(), 'planner-eval-runner-test-')));
  await writeFile(join(directory, '.planner-eval-owner'), 'planner-eval-v1');
  options = {
    mode: 'dry-run',
    corpus,
    directory,
    codeFingerprint: 'test-code-v1',
    model: 'fixture',
    repetitions: 1,
    profiles: ['baseline-policy-codex-v1'],
  };
  external.probe.mockResolvedValue({
    ready: false,
    ...ggIdentity,
    authMode: 'chatgpt',
    ordinaryUsageAllowed: null,
    blockers: ['included-usage-unknown', 'auto-reload-attestation-required'],
  });
});
afterEach(async () => {
  expect(external.construct).not.toHaveBeenCalled();
  expect(external.paid).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

async function seed(text = valid) {
  const report = await runEvaluation(options);
  const generator = vi.fn<PlannerGenerator>(async () => completion(text));
  const artifact = await runTrial({ ...options, mode: 'replay' }, report.schedule[0], generator);
  return { report, artifact, generator };
}

describe('step 6 evaluation runner', () => {
  it('schedules all three versioned setups without implying a Gemini measurement', async () => {
    const report = await runEvaluation({ ...options, profiles: undefined });
    expect(report.schedule.map((trial) => trial.profileId)).toEqual([
      'baseline-policy-codex-v1',
      'content-led-codex-v1',
      'semantic-variety-codex-v1',
    ]);
    expect(report.trials.every((trial) => trial.status === 'scheduled')).toBe(true);
  });
  it('dry-run writes a deterministic schedule and skeleton without probe, generator or credentials', async () => {
    const report = await runEvaluation(options);
    expect(external.probe).not.toHaveBeenCalled();
    expect(report.schedule).toHaveLength(1);
    expect(report.schedule[0]).toMatchObject({
      clipId: 'clip-a',
      profileId: 'baseline-policy-codex-v1',
      repetition: 1,
    });
    expect(report.schedule[0].id).toMatch(/^[a-f0-9]{64}$/);
    expect(report.trials[0]).toMatchObject({
      status: 'scheduled',
      attempts: { outline: 0, draft: 0, review: 0 },
    });
    expect(report.trials[0]).not.toHaveProperty('result');
    expect(report.limits.attempts).toBe(0);
    expect((await readdir(directory)).filter((name) => name.startsWith('trial-'))).toEqual([]);
    expect(JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'))).toEqual(report);
    expect(await readFile(join(directory, 'report.md'), 'utf8')).toContain('No scores or winner');
    const blinded = await readFile(join(directory, 'blinded.json'), 'utf8');
    expect(blinded).not.toContain('baseline-policy-codex-v1');
    expect(blinded).not.toContain('"result"');
    expect(await readFile(join(directory, 'profile-map.json'), 'utf8')).toContain(
      'baseline-policy-codex-v1',
    );
    expect((await runEvaluation(options)).fingerprints).toEqual(report.fingerprints);
  });

  it('bounds and fingerprints isolated history seeds without reading app history', async () => {
    const historySeed = [
      {
        clipHash: 'b'.repeat(64),
        order: 0,
        choices: [
          {
            signature: { kind: 'hero' as const, prop: 'battery' as const, tone: 'up' as const },
            count: 1,
          },
        ],
      },
    ];
    const seeded = { ...options, historySeed };
    const report = await runEvaluation(seeded);
    expect(report.fingerprints.historySeed).toMatch(/^[a-f0-9]{64}$/);
    await expect(runEvaluation(options)).rejects.toThrow('fingerprint');
    await expect(
      runEvaluation({ ...seeded, historySeed: Array.from({ length: 21 }, () => historySeed[0]) }),
    ).rejects.toThrow('history seed');
    await expect(
      runEvaluation({ ...seeded, historySeed: [{ ...historySeed[0], clipHash: '/private/path' }] }),
    ).rejects.toThrow('history seed');
  });

  it('fingerprints whole corpus, canonical key order and config, not filters or repetition count', async () => {
    const second = {
      ...corpus.clips[0],
      id: 'clip-b',
      sourceGroup: 'source-b',
      topicGroup: 'topic-b',
      split: 'holdout' as const,
    };
    options.corpus = { ...corpus, clips: [...corpus.clips, second] };
    const pilot = await runEvaluation({ ...options, clipId: 'clip-a' });
    const matrix = await runEvaluation({ ...options, repetitions: 2 });
    expect(matrix.fingerprints).toEqual(pilot.fingerprints);
    expect(matrix.schedule).toHaveLength(4);
    expect(matrix.schedule[0]).toEqual(pilot.schedule[0]);
    const reversedKeys = {
      clips: options.corpus.clips,
      description: corpus.description,
      id: corpus.id,
      version: 1 as const,
    };
    expect(
      (await runEvaluation({ ...options, corpus: reversedKeys, split: 'holdout' })).fingerprints,
    ).toEqual(pilot.fingerprints);
    for (const changed of [
      { codeFingerprint: 'changed' },
      { model: 'changed' },
      { codexExecutable: 'changed' },
      { executableSha256 },
      { transport: 'codex-subscription' as const },
      { reasoning: 'high' },
      { autoReloadDisabled: true },
      { corpus: { ...options.corpus, clips: [corpus.clips[0], { ...second, hookLeadSec: 3 }] } },
    ])
      await expect(runEvaluation({ ...options, ...changed })).rejects.toThrow(/fingerprint/i);
  });

  it('replays saved phase texts through actual admission and review without paid providers', async () => {
    const { report, artifact, generator } = await seed();
    expect(generator.mock.calls.map(([request]) => request.phase)).toEqual(['draft', 'review']);
    expect(
      artifact.result?.ok && artifact.result.value.scenes.map((scene) => scene.scene.kind),
    ).toEqual(['stack']);
    expect(artifact.result?.ok && artifact.result.value.scenes[0].startTime).toBeGreaterThanOrEqual(
      11.5,
    );
    expect(artifact.attempts.every((attempt) => attempt.metadata?.inputTokens === 5)).toBe(true);
    const before = await readFile(artifactPath(report.schedule[0].id), 'utf8');
    await utimes(artifactPath(report.schedule[0].id), 1, 1);
    const replay = await runEvaluation({ ...options, mode: 'replay', repetitions: 2 });
    expect(replay.trials[0].result).toEqual(artifact.result);
    expect(replay.trials[0].attempts).toEqual({ outline: 0, draft: 1, review: 1 });
    expect(replay.trials[0].planMetrics).toMatchObject({ sceneCount: 1, quoteCount: 0 });
    expect(replay.collections).toHaveLength(1);
    expect(replay.collections[0].planMetrics.distinctClipCount).toBe(1);
    expect(replay.trials[0].observed).toHaveLength(2);
    const blinded = await readFile(join(directory, 'blinded.json'), 'utf8');
    expect(blinded).not.toContain('baseline-policy-codex-v1');
    expect(blinded).not.toContain('diagnostics');
    expect(blinded).not.toContain('model');
    expect(replay.trials[1].status).toBe('scheduled');
    expect(replay.limits.attempts).toBe(2);
    expect(await readFile(artifactPath(report.schedule[0].id), 'utf8')).toBe(before);
    expect((await stat(artifactPath(report.schedule[0].id))).mtimeMs).toBe(1000);
    expect(external.probe).not.toHaveBeenCalled();
  });

  it('loads a complete render artifact using the schedule identity, not a report summary', async () => {
    const { report, artifact } = await seed(JSON.stringify({ scenes: [], quotes: [] }));
    const replay = await runEvaluation({ ...options, mode: 'replay' });
    const summary = replay.trials[0];
    expect(summary).not.toHaveProperty('clipId');
    expect(summary).not.toHaveProperty('profileId');
    const spec = replay.schedule.find((trial) => trial.id === summary.id);
    expect(spec).toEqual(report.schedule[0]);
    if (!spec) throw new Error('Missing scheduled trial');
    const saved = await runTrial({ ...options, mode: 'replay' }, spec);
    expect(saved).toEqual(artifact);
    expect(saved.trial).toMatchObject({ clipId: 'clip-a', profileId: 'baseline-policy-codex-v1' });
    expect(saved.result).toMatchObject({ ok: true, value: { scenes: [], quotes: [] } });
  });

  it('resuming a completed trial never calls an injected generator again', async () => {
    const { report, artifact } = await seed();
    const generator = generate();
    expect(await runTrial({ ...options, mode: 'replay' }, report.schedule[0], generator)).toEqual(
      artifact,
    );
    expect(generator).not.toHaveBeenCalled();
  });

  it('rejects tampered artifact fingerprints and phase prompt hashes, never falling back', async () => {
    const { report, artifact } = await seed();
    await writeFile(
      artifactPath(report.schedule[0].id),
      JSON.stringify({ ...artifact, fingerprint: 'wrong' }),
    );
    await expect(runEvaluation({ ...options, mode: 'replay' })).rejects.toThrow(/fingerprint/i);
    artifact.attempts[0].promptFingerprint = '0'.repeat(64);
    await writeFile(artifactPath(report.schedule[0].id), JSON.stringify(artifact));
    await expect(runEvaluation({ ...options, mode: 'replay' })).rejects.toThrow(/replay|prompt/i);
  });

  it('keeps invalid/truncated JSON as a failed actual planner result, not a fabricated plan', async () => {
    const { artifact } = await seed('{"scenes":[');
    expect(artifact.status).toBe('completed');
    expect(artifact.result).toMatchObject({
      ok: false,
      error: expect.stringContaining('unparseable JSON'),
    });
    const replay = await runEvaluation({ ...options, mode: 'replay' });
    expect(replay.trials[0].result).toEqual(artifact.result);
    expect(replay.limits.attempts).toBe(1);
  });

  it('oversized completion becomes unknown, never truncated or regenerated', async () => {
    const { report, artifact } = await seed('x'.repeat(DEFAULT_RUN_LIMITS.maxOutputBytes + 1));
    expect(artifact.status).toBe('unknown');
    expect(artifact.error).toBe('output-limit');
    expect(artifact.attempts[0]).not.toHaveProperty('text');
    expect((await stat(artifactPath(report.schedule[0].id))).size).toBeLessThan(4096);
    const generator = generate();
    const resumed = await runTrial({ ...options, mode: 'replay' }, report.schedule[0], generator);
    expect(resumed.status).toBe('unknown');
    expect(generator).not.toHaveBeenCalled();
  });

  it('leaves interrupted/inflight artifacts visible and does not retry them', async () => {
    const { report, artifact } = await seed();
    const interrupted = {
      ...artifact,
      status: 'inflight',
      result: undefined,
      attempts: [
        { ...artifact.attempts[0], status: 'inflight', text: undefined, metadata: undefined },
      ],
    };
    await writeFile(artifactPath(report.schedule[0].id), JSON.stringify(interrupted));
    const generator = generate();
    await runTrial({ ...options, mode: 'replay' }, report.schedule[0], generator);
    expect(generator).not.toHaveBeenCalled();
    expect((await runEvaluation({ ...options, mode: 'replay' })).trials[0].status).toBe('inflight');
  });

  it('live probes once and remains blocked without proven readiness; never generates', async () => {
    const report = await runEvaluation({
      ...options,
      mode: 'live',
    });
    expect(external.probe).toHaveBeenCalledExactlyOnceWith(
      {
        live: true,
        model: 'fixture',
        reasoning: 'medium',
        autoReloadDisabled: false,
      },
      expect.any(AbortSignal),
    );
    expect(report.blockers).toContain('included-usage-unknown');
    expect(report.trials[0].status).toBe('blocked');
    expect(report.limits.attempts).toBe(0);
    expect((await readdir(directory)).some((name) => name.startsWith('trial-'))).toBe(false);
  });

  describe('bounded live wiring (mock transport only)', () => {
    beforeEach(() => {
      options = {
        ...options,
        mode: 'live',
        reasoning: 'high',
        autoReloadDisabled: true,
      };
      external.probe.mockResolvedValue({
        ready: true,
        blockers: [],
        ...ggIdentity,
        authMode: 'chatgpt',
        ordinaryUsageAllowed: true,
      });
    });

    it('requires ready preflight, reserves every phase before calling, and replays live metrics offline', async () => {
      let calls = 0;
      let active = 0;
      const complete = external.generate.getMockImplementation();
      if (!complete) throw new Error('Missing mock');
      external.generate.mockImplementation(async (request) => {
        expect(external.probe).toHaveBeenCalledTimes(1);
        expect(++active).toBe(1);
        const checkpoint = JSON.parse(await readFile(join(directory, 'checkpoint.json'), 'utf8'));
        expect(checkpoint.limits).toMatchObject({ attempts: ++calls, stop: 'unknown' });
        const files = (await readdir(directory)).filter((name) => name.startsWith('trial-'));
        const artifacts = await Promise.all(
          files.map(async (name) => JSON.parse(await readFile(join(directory, name), 'utf8'))),
        );
        expect(artifacts.some((artifact) => artifact.attempts.at(-1)?.status === 'inflight')).toBe(
          true,
        );
        expect(request.signal).toBeInstanceOf(AbortSignal);
        const result = await complete(request);
        active--;
        return result;
      });
      const live = await runEvaluation({ ...options, repetitions: 2 });
      expect(external.generator).toHaveBeenCalledExactlyOnceWith({
        live: true,
        model: 'fixture',
        reasoning: 'high',
        autoReloadDisabled: true,
      });
      expect(external.probe).toHaveBeenCalledExactlyOnceWith(
        { live: true, model: 'fixture', reasoning: 'high', autoReloadDisabled: true },
        expect.any(AbortSignal),
      );
      expect(calls).toBe(4);
      expect(live.blockers).toEqual([]);
      expect(live.trials.every((trial) => trial.status === 'completed')).toBe(true);
      expect(live.trials[0].planMetrics).toMatchObject({ sceneCount: 1 });
      expect(live.collections).toHaveLength(2);
      expect(live.limits).toMatchObject({ attempts: 4, stop: null });
      expect(live.trials[0].observed).toHaveLength(2);
      for (const metadata of live.trials.flatMap((trial) => trial.observed)) {
        expect(metadata).toMatchObject({
          ...ggIdentity,
          provider: 'codex-subscription',
          authMode: 'chatgpt',
          model: 'fixture',
          configId: 'baseline-policy-codex-v1',
          inputTokens: 5,
          outputTokens: 7,
        });
        expect(metadata).not.toHaveProperty('cliVersion');
      }
      const before = await readFile(artifactPath(live.schedule[0].id), 'utf8');
      await utimes(artifactPath(live.schedule[0].id), 1, 1);
      external.probe.mockClear();
      external.generator.mockClear();
      external.generate.mockClear();
      for (const changed of [
        { transport: 'codex-subscription' as const },
        { codexExecutable: 'legacy-native-binary', executableSha256 },
      ])
        await expect(runEvaluation({ ...options, ...changed, mode: 'replay' })).rejects.toThrow(
          /fingerprint/i,
        );
      const replay = await runEvaluation({
        ...options,
        transport: 'gg-chatgpt',
        mode: 'replay',
        repetitions: 2,
      });
      expect(replay.trials).toEqual(live.trials);
      expect(replay.collections).toEqual(live.collections);
      expect(replay.fingerprints).toEqual(live.fingerprints);
      expect(replay.limits).toEqual(live.limits);
      expect(external.probe).not.toHaveBeenCalled();
      expect(external.generator).not.toHaveBeenCalled();
      expect(external.generate).not.toHaveBeenCalled();
      expect(await readFile(artifactPath(live.schedule[0].id), 'utf8')).toBe(before);
      expect((await stat(artifactPath(live.schedule[0].id))).mtimeMs).toBe(1000);
      await runEvaluation({ ...options, repetitions: 2 });
      expect(external.generate).not.toHaveBeenCalled();
      const artifact = JSON.parse(before);
      artifact.attempts[0].promptFingerprint = '0'.repeat(64);
      await writeFile(artifactPath(live.schedule[0].id), JSON.stringify(artifact));
      external.probe.mockClear();
      await expect(runEvaluation({ ...options, mode: 'replay' })).rejects.toThrow(/prompt/i);
      expect(external.probe).not.toHaveBeenCalled();
      expect(external.generate).not.toHaveBeenCalled();
    });

    it.each([
      { transport: 'codex-subscription' as const },
      { codexExecutable: 'legacy-native-binary' },
      { executableSha256 },
    ])('rejects native live configuration before preflight: %j', async (changed) => {
      await expect(runEvaluation({ ...options, ...changed })).rejects.toThrow(/options/i);
      expect(external.probe).not.toHaveBeenCalled();
      expect(external.generator).not.toHaveBeenCalled();
    });

    it.each([
      '',
      'a'.repeat(63),
      'A'.repeat(64),
      `${'a'.repeat(64)}\n`,
    ])('still rejects invalid legacy replay pins without preflight: %j', async (pin) => {
      await expect(
        runEvaluation({ ...options, mode: 'replay', executableSha256: pin }),
      ).rejects.toThrow(/options/i);
      expect(external.probe).not.toHaveBeenCalled();
      expect(external.generator).not.toHaveBeenCalled();
    });

    it.each([
      { ready: false },
      { ordinaryUsageAllowed: null },
      { ordinaryUsageAllowed: false },
      { clientVersion: undefined },
      { clientVersion: 'gg-ai@0.0.0+gg-core@0.0.0' },
      { authMode: undefined },
      { blockers: ['unsupported-model'] },
    ])('fails closed on incomplete readiness: %j', async (changed) => {
      external.probe.mockResolvedValue({
        ready: true,
        blockers: [],
        ...ggIdentity,
        authMode: 'chatgpt',
        ordinaryUsageAllowed: true,
        ...changed,
      });
      const report = await runEvaluation(options);
      expect(report.blockers.length).toBeGreaterThan(0);
      expect(report.limits.attempts).toBe(0);
      expect(external.generator).not.toHaveBeenCalled();
      expect(external.generate).not.toHaveBeenCalled();
    });

    it.each([
      undefined,
      false,
    ])('never infers an auto-reload attestation from readiness: %s', async (attestation) => {
      const report = await runEvaluation({ ...options, autoReloadDisabled: attestation });
      expect(external.probe).toHaveBeenCalledTimes(1);
      expect(report.blockers).toContain('auto-reload-attestation-required');
      expect(report.limits.attempts).toBe(0);
      expect(external.generator).not.toHaveBeenCalled();
    });

    it.each([
      ['usage-limit', 'quota'],
      ['quota', 'quota'],
      ['billing', 'billing'],
      ['auth', 'auth'],
      ['cancelled', 'cancelled'],
      ['tool-call', 'unknown'],
      ['timeout', 'unknown'],
    ])('preserves safe %s codes, stops subsequent trials and never retries', async (code, stop) => {
      external.generate.mockRejectedValue(new CodexTransportError(code));
      const report = await runEvaluation({ ...options, repetitions: 2 });
      expect(external.generate).toHaveBeenCalledTimes(1);
      expect(report.trials[0]).toMatchObject({ status: 'unknown', error: code });
      expect(report.trials[1].status).toBe('blocked');
      expect(report.limits).toMatchObject({ attempts: 1, stop });
      external.generate.mockClear();
      await runEvaluation({ ...options, repetitions: 2 });
      expect(external.generate).not.toHaveBeenCalled();
    });

    it('never records raw provider/credential errors', async () => {
      external.generate.mockRejectedValue(new Error('private credential /private/path'));
      const report = await runEvaluation({ ...options, repetitions: 2 });
      expect(report.trials[0].error).toBe('generation-failed');
      expect(report.limits.stop).toBe('unknown');
      for (const file of await readdir(directory))
        expect(await readFile(join(directory, file), 'utf8')).not.toContain('private');
      expect(external.generate).toHaveBeenCalledTimes(1);
    });

    it.each([
      { provider: 'offline' as const },
      { transport: undefined },
      { transport: 'codex-subscription' },
      { clientVersion: undefined },
      { clientVersion: 'gg-ai@0.0.0+gg-core@0.0.0' },
      { cliVersion: '0.159.3' },
      { authMode: undefined },
    ])('requires actual subscription, ChatGPT auth and GG metadata without a CLI claim: %j', async (changed) => {
      external.generate.mockResolvedValue({
        ...completion(valid),
        metadata: {
          ...completion(valid).metadata,
          provider: 'codex-subscription',
          ...ggIdentity,
          authMode: 'chatgpt',
          ...changed,
        } as GenerationMetadata, // Deliberately invalid data at the untrusted transport boundary.
      });
      const report = await runEvaluation({ ...options, repetitions: 2 });
      expect(report.trials[0]).toMatchObject({ status: 'unknown', error: 'invalid-metadata' });
      expect(external.generate).toHaveBeenCalledTimes(1);
      expect(report.trials[0].observed).toEqual([]);
    });

    it('rejects tampered saved GG identity during offline replay without any preflight', async () => {
      const live = await runEvaluation(options);
      const file = artifactPath(live.schedule[0].id);
      const artifact = JSON.parse(await readFile(file, 'utf8'));
      for (const changed of [
        { transport: undefined },
        { clientVersion: 'gg-ai@0.0.0+gg-core@0.0.0' },
        { cliVersion: '0.159.3' },
      ]) {
        const tampered = structuredClone(artifact);
        Object.assign(tampered.attempts[0].metadata, changed);
        await writeFile(file, JSON.stringify(tampered));
        external.probe.mockClear();
        external.generate.mockClear();
        await expect(runEvaluation({ ...options, mode: 'replay' })).rejects.toThrow(
          /replay artifact/i,
        );
        expect(external.probe).not.toHaveBeenCalled();
        expect(external.generate).not.toHaveBeenCalled();
      }
    });

    it.each(['unknown', 'inflight'])('never regenerates a saved %s live trial', async (status) => {
      const report = await runEvaluation(options);
      const file = artifactPath(report.schedule[0].id);
      const artifact = JSON.parse(await readFile(file, 'utf8'));
      await writeFile(file, JSON.stringify({ ...artifact, status, result: undefined }));
      external.generate.mockClear();
      const resumed = await runEvaluation(options);
      expect(resumed.trials[0].status).toBe(status);
      expect(external.generate).not.toHaveBeenCalled();
    });

    it('retains the 20-attempt holdout reserve and 120-attempt global ceiling', async () => {
      options.corpus = {
        ...corpus,
        clips: [
          corpus.clips[0],
          {
            ...corpus.clips[0],
            id: 'clip-b',
            sourceGroup: 'source-b',
            topicGroup: 'topic-b',
            split: 'holdout',
          },
        ],
      };
      await runEvaluation({ ...options, mode: 'dry-run' });
      const path = join(directory, 'checkpoint.json');
      const checkpoint = JSON.parse(await readFile(path, 'utf8'));
      checkpoint.limits.attempts = 100;
      await writeFile(path, JSON.stringify(checkpoint));
      const report = await runEvaluation(options);
      expect(report.trials[0].error).toBe('holdout-reserve');
      expect(report.trials[1].status).toBe('completed');
      expect(report.limits.attempts).toBe(102);
      expect(external.generate).toHaveBeenCalledTimes(2);
      external.generate.mockClear();
      checkpoint.limits.attempts = 120;
      await writeFile(path, JSON.stringify(checkpoint));
      const full = await runEvaluation({ ...options, repetitions: 2, split: 'holdout' });
      expect(full.trials[1].error).toBe('attempt-limit');
      expect(full.limits.attempts).toBe(120);
      expect(external.generate).not.toHaveBeenCalled();
    });

    it('enforces the persisted two-hour wall before any resumed generation', async () => {
      await runEvaluation({ ...options, mode: 'dry-run' });
      const path = join(directory, 'checkpoint.json');
      const checkpoint = JSON.parse(await readFile(path, 'utf8'));
      checkpoint.limits.startedAt = Date.now() - DEFAULT_RUN_LIMITS.wallMs;
      await writeFile(path, JSON.stringify(checkpoint));
      const report = await runEvaluation(options);
      expect(report.trials[0].error).toBe('wall-limit');
      expect(report.limits.attempts).toBe(0);
      expect(external.generate).not.toHaveBeenCalled();
    });
  });

  it('retains native identity solely for offline replay, including pin fingerprint checks', async () => {
    options = {
      ...options,
      mode: 'replay',
      transport: 'codex-subscription',
      codexExecutable: 'legacy-native-binary',
      executableSha256,
    };
    const report = await runEvaluation(options);
    const generator = vi.fn<PlannerGenerator>(async () => ({
      ...completion(valid),
      metadata: {
        ...completion(valid).metadata,
        provider: 'codex-subscription',
        authMode: 'chatgpt',
        cliVersion: '0.159.3',
      },
    }));
    const saved = await runTrial(options, report.schedule[0], generator);
    expect(saved.status).toBe('completed');
    expect((await runEvaluation(options)).trials[0].observed[0]).toMatchObject({
      cliVersion: '0.159.3',
    });
    for (const changedPin of [undefined, 'b'.repeat(64)])
      await expect(runEvaluation({ ...options, executableSha256: changedPin })).rejects.toThrow(
        /fingerprint/i,
      );
    expect(external.probe).not.toHaveBeenCalled();
    expect(external.generator).not.toHaveBeenCalled();
  });

  it('refuses unowned/repository/symlink destinations and oversized input artifacts', async () => {
    await writeFile(join(directory, '.planner-eval-owner'), 'someone-else');
    await expect(runEvaluation(options)).rejects.toThrow(/owner|owned/i);
    await writeFile(join(directory, '.planner-eval-owner'), 'planner-eval-v1');
    await expect(runEvaluation({ ...options, directory: process.cwd() })).rejects.toThrow(
      /repository/i,
    );
    const link = `${directory}-link`;
    try {
      await symlink(directory, link, 'junction');
      await expect(runEvaluation({ ...options, directory: link })).rejects.toThrow(
        /symlink|directory/i,
      );
    } finally {
      await rm(link, { force: true });
    }
    const report = await runEvaluation(options);
    await writeFile(
      artifactPath(report.schedule[0].id),
      'x'.repeat(DEFAULT_RUN_LIMITS.maxOutputBytes + 1),
    );
    await expect(runEvaluation({ ...options, mode: 'replay' })).rejects.toThrow(/limit/i);
  });

  it('refuses linked output children and never writes through them', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'planner-eval-target-'));
    try {
      await symlink(outside, join(directory, 'report.json'), 'junction');
      await expect(runEvaluation(options)).rejects.toThrow(/symlink|file/i);
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('enforces checkpoint attempt limits before invoking a generator', async () => {
    const report = await runEvaluation(options);
    const checkpointPath = join(directory, 'checkpoint.json');
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
    checkpoint.limits.attempts = DEFAULT_RUN_LIMITS.maxAttempts - DEFAULT_RUN_LIMITS.holdoutReserve;
    await writeFile(checkpointPath, JSON.stringify(checkpoint));
    const generator = generate();
    const result = await runTrial({ ...options, mode: 'replay' }, report.schedule[0], generator);
    expect(result.error).toBe('holdout-reserve');
    expect(generator).not.toHaveBeenCalled();
  });

  it('pre-abort writes nothing; mid-attempt abort records unknown/cancelled without retry', async () => {
    await expect(runEvaluation({ ...options, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(await readdir(directory)).toEqual(['.planner-eval-owner']);
    const report = await runEvaluation(options);
    const controller = new AbortController();
    const generator: PlannerGenerator = async () => {
      controller.abort();
      return completion(valid);
    };
    await expect(
      runTrial(
        { ...options, mode: 'replay', signal: controller.signal },
        report.schedule[0],
        generator,
      ),
    ).rejects.toThrow();
    const saved = JSON.parse(await readFile(artifactPath(report.schedule[0].id), 'utf8'));
    expect(saved).toMatchObject({ status: 'unknown', error: 'cancelled' });
    const checkpoint = JSON.parse(await readFile(join(directory, 'checkpoint.json'), 'utf8'));
    expect(checkpoint.limits).toMatchObject({ attempts: 1, stop: 'cancelled' });
  });
});
