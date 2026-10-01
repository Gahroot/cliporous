import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assignArchetypesDeterministic, splitIntoSegments } from '../../../shared/segments';
import {
  type GenerationMetadata,
  MAX_COMPLETION_BYTES,
  type PlannerGenerator,
  type PlannerPhase,
} from '../explainer/planner-generation';
import {
  EVALUATION_PROFILES,
  getPlannerProfile,
  type PlannerProfileId,
} from '../explainer/planner-profiles';
import {
  clipIdentity,
  isUsageRecord,
  recentSnapshot,
  type UsageRecord,
} from '../explainer/recent-usage';
import {
  buildExplainerPrompt,
  buildReviewPrompt,
  type EditPlanResult,
  planExplainerEditPlan,
} from '../explainer-scenes';
import {
  CODEX_CAPABILITY_POLICY,
  CodexTransportError,
  createCodexGenerator,
  probeCodex,
} from './codex-transport';
import { type CorpusClip, type CorpusManifest, type CorpusSplit, parseCorpus } from './corpus';
import { createRunLimits, DEFAULT_RUN_LIMITS, type LimitsState, type RunLimits } from './limits';
import {
  type CollectionEntry,
  type CollectionMeasurements,
  measureCollection,
  measurePlan,
  type PlanMeasurements,
} from './metrics';

export interface EvaluationOptions {
  mode: 'dry-run' | 'replay' | 'live';
  corpus: CorpusManifest;
  directory: string;
  codeFingerprint: string;
  model?: string;
  reasoning?: string;
  /** Explicit user attestation; absence is never permission to generate. */
  autoReloadDisabled?: boolean;
  transport?: 'gg-chatgpt' | 'codex-subscription';
  /** Legacy native identity is retained only for offline artifact comparison. */
  codexExecutable?: string;
  executableSha256?: string;
  fixture?: 'authored-responses-v1';
  /** Isolated, declared seed; never load production usage history for comparisons. */
  historySeed?: readonly UsageRecord[];
  repetitions?: number;
  profiles?: readonly PlannerProfileId[];
  signal?: AbortSignal;
  clipId?: string;
  split?: CorpusSplit;
}
export type EvaluationFingerprints = Record<
  'corpus' | 'config' | 'profile' | 'prompt' | 'code' | 'tool' | 'model' | 'historySeed' | 'run',
  string
>;
export interface TrialSpec {
  id: string;
  clipId: string;
  profileId: PlannerProfileId;
  repetition: number;
  split: CorpusSplit;
}
export interface TrialAttempt {
  phase: PlannerPhase;
  promptFingerprint: string;
  status: 'inflight' | 'completed' | 'unknown';
  text?: string;
  metadata?: GenerationMetadata;
}
export interface TrialArtifact {
  version: 1;
  fingerprint: string;
  trial: TrialSpec;
  status: TrialAttempt['status'];
  attempts: TrialAttempt[];
  result?: EditPlanResult;
  error?: string;
}
export interface TrialSummary {
  id: string;
  status: TrialArtifact['status'] | 'scheduled' | 'blocked';
  attempts: Record<PlannerPhase, number>;
  observed: GenerationMetadata[];
  planMetrics?: PlanMeasurements;
  /** Deterministic rotation proposals; animation splicing may replace these windows. */
  automaticLayout?: {
    brollEnabled: false;
    quoteWindowsBeforeSplicing: { startTime: number; endTime: number }[];
  };
  result?: EditPlanResult;
  error?: string;
}
export interface EvaluationReport {
  version: 1;
  mode: EvaluationOptions['mode'];
  fingerprints: EvaluationFingerprints;
  schedule: TrialSpec[];
  trials: TrialSummary[];
  limits: LimitsState;
  blockers: string[];
  collections: {
    profileId: PlannerProfileId;
    repetition: number;
    split: CorpusSplit;
    planMetrics: CollectionMeasurements;
  }[];
}
const SHARED_CONFIG = { aspect: '9:16', review: true } as const;
const DEFAULT_REASONING = 'medium';
const REASONING_LEVELS = ['low', 'medium', 'high', 'xhigh'];
const GG_IDENTITY = {
  transport: CODEX_CAPABILITY_POLICY.transport,
  clientVersion: CODEX_CAPABILITY_POLICY.clientVersion,
} as const;
const LEGACY_CLI_VERSION = '0.159.3';
const selectedTransport = (options: EvaluationOptions) =>
  options.transport ??
  (options.codexExecutable !== undefined || options.executableSha256 !== undefined
    ? 'codex-subscription'
    : GG_IDENTITY.transport);
/** Persist stable transport codes, never raw subprocess/account diagnostics. */
const safeCode = (code: unknown, fallback: string): string =>
  typeof code === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(code) ? code : fallback;
const failureCode = (error: unknown, fallback: string): string =>
  error instanceof CodexTransportError
    ? safeCode(error.code, fallback)
    : error instanceof Error && ['output-limit', 'invalid-metadata'].includes(error.message)
      ? error.message
      : fallback;
const failureOutcome = (code: string): 'quota' | 'billing' | 'auth' | 'cancelled' | 'unknown' => {
  if (['quota', 'usage-limit', 'rate-limit', 'included-usage-exhausted'].includes(code))
    return 'quota';
  if (['billing', 'billing-limit', 'credits-required'].includes(code)) return 'billing';
  if (['auth', 'chatgpt-auth-required', 'auth-required'].includes(code)) return 'auth';
  return code === 'cancelled' ? 'cancelled' : 'unknown';
};
const CAP = DEFAULT_RUN_LIMITS.maxOutputBytes;
const PHASES: PlannerPhase[] = ['outline', 'draft', 'review'];
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key: string, item: unknown): unknown =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, (item as Record<string, unknown>)[key]]),
        )
      : item,
  );
const hash = (value: unknown): string =>
  createHash('sha256').update(canonical(value)).digest('hex');
const bounds = (clip: CorpusClip) => ({
  minStart: clip.bounds.start + Math.max(1.5, clip.hookLeadSec ?? 0),
  maxEnd: clip.bounds.end,
});
const filename = (trial: TrialSpec) => `trial-${trial.id}.json`;
const absent = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT';
function bounded(text: string, cap = CAP): string {
  if (typeof text !== 'string' || Buffer.byteLength(text) > cap) throw new Error('output-limit');
  return text;
}
/** No arbitrary child paths, links, device files, or unbounded reads. */
async function read(directory: string, name: string): Promise<string | undefined> {
  if (
    !/^(?:\.planner-eval-owner|checkpoint\.json|report\.(?:json|md)|profile-map\.json|blinded\.json|trial-[a-f0-9]{64}\.json)(?:\.tmp)?$/.test(
      name,
    )
  )
    throw new Error('Invalid child file');
  const path = join(directory, name);
  const info = await lstat(path).catch((error: unknown) => {
    if (!absent(error)) throw error;
  });
  if (!info) return undefined;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
    throw new Error('Unsafe file or symlink');
  if (info.size > CAP) throw new Error('output-limit');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const current = await handle.stat();
    if (current.ino !== info.ino || current.dev !== info.dev)
      throw new Error('File changed during read');
    const data = Buffer.alloc(CAP + 1);
    let size = 0;
    while (size < data.length) {
      const chunk = await handle.read(data, size, data.length - size, size);
      if (!chunk.bytesRead) break;
      size += chunk.bytesRead;
    }
    if (size > CAP) throw new Error('output-limit');
    return data.subarray(0, size).toString('utf8');
  } finally {
    await handle.close();
  }
}
async function owned(directory: string): Promise<void> {
  if (!isAbsolute(directory)) throw new Error('Owned directory must be absolute');
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe directory symlink');
  const actual = await realpath(directory);
  if (resolve(actual).toLowerCase() !== resolve(directory).toLowerCase())
    throw new Error('Unsafe directory symlink');
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const fromRepo = relative(await realpath(repository), actual);
  if (!fromRepo || (!fromRepo.startsWith('..') && !isAbsolute(fromRepo)))
    throw new Error('Output must be outside repository');
  if ((await read(directory, '.planner-eval-owner')) !== 'planner-eval-v1')
    throw new Error('Directory is not owned by planner-eval');
}
async function atomic(directory: string, name: string, text: string): Promise<void> {
  bounded(text);
  await owned(directory);
  await read(directory, name);
  await read(directory, `${name}.tmp`);
  const temporary = join(directory, `${name}.tmp`);
  await writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
  try {
    await owned(directory);
    await read(directory, name);
    await rename(temporary, join(directory, name));
  } finally {
    await rm(temporary, { force: true });
  }
}
interface Context {
  options: EvaluationOptions;
  fingerprints: EvaluationFingerprints;
  schedule: TrialSpec[];
  limits: RunLimits;
  deadline?: AbortSignal;
}
const checkpoint = (ctx: Context) =>
  atomic(
    ctx.options.directory,
    'checkpoint.json',
    canonical({ version: 1, fingerprint: ctx.fingerprints.run, limits: ctx.limits.snapshot() }),
  );
async function prepare(options: EvaluationOptions): Promise<Context> {
  options.signal?.throwIfAborted();
  await owned(options.directory);
  const parsed = parseCorpus(options.corpus);
  if (!parsed.ok) throw new Error(parsed.error);
  const repetitions = options.repetitions ?? 2;
  if (
    !['dry-run', 'replay', 'live'].includes(options.mode) ||
    !Number.isInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > DEFAULT_RUN_LIMITS.maxAttempts ||
    !options.codeFingerprint ||
    options.codeFingerprint.length > 1024 ||
    (options.reasoning !== undefined && !REASONING_LEVELS.includes(options.reasoning)) ||
    (options.autoReloadDisabled !== undefined && typeof options.autoReloadDisabled !== 'boolean') ||
    (options.transport !== undefined &&
      !['gg-chatgpt', 'codex-subscription'].includes(options.transport)) ||
    (options.mode === 'live' &&
      (selectedTransport(options) !== GG_IDENTITY.transport ||
        options.codexExecutable !== undefined ||
        options.executableSha256 !== undefined)) ||
    (options.executableSha256 !== undefined &&
      (typeof options.executableSha256 !== 'string' ||
        options.executableSha256.length !== 64 ||
        !/^[a-f0-9]{64}$/.test(options.executableSha256))) ||
    (options.split !== undefined && !['discovery', 'holdout'].includes(options.split))
  )
    throw new Error('Invalid evaluation options');
  for (const value of [options.model, options.codexExecutable])
    if (value !== undefined && (typeof value !== 'string' || !value || value.length > 4096))
      throw new Error('Invalid evaluation options');
  if (
    options.fixture !== undefined &&
    (options.fixture !== 'authored-responses-v1' ||
      options.mode !== 'replay' ||
      options.model ||
      options.transport !== undefined ||
      options.codexExecutable ||
      options.executableSha256 !== undefined ||
      options.reasoning !== undefined ||
      options.autoReloadDisabled !== undefined)
  )
    throw new Error('Invalid offline fixture configuration');
  if (
    options.historySeed !== undefined &&
    (!Array.isArray(options.historySeed) ||
      options.historySeed.length > 20 ||
      !options.historySeed.every(isUsageRecord))
  )
    throw new Error('Invalid isolated history seed');
  const clips = parsed.value.clips;
  const profiles = options.profiles ?? EVALUATION_PROFILES.map((profile) => profile.id);
  if (
    !profiles.length ||
    profiles.length > 3 ||
    new Set(profiles).size !== profiles.length ||
    profiles.some((id) => !getPlannerProfile(id))
  )
    throw new Error('Unknown evaluation profile');
  const selected = clips.filter(
    (clip) =>
      (!options.clipId || clip.id === options.clipId) &&
      (!options.split || clip.split === options.split),
  );
  if (!selected.length) throw new Error('No selected clips');
  const parts = {
    corpus: hash(parsed.value),
    config: hash({
      version: 1,
      fixture: options.fixture ?? null,
      reasoning: options.reasoning ?? DEFAULT_REASONING,
      autoReloadDisabled: options.autoReloadDisabled === true,
      limits: DEFAULT_RUN_LIMITS,
      speakerLead: 1.5,
      ...SHARED_CONFIG,
    }),
    profile: hash(EVALUATION_PROFILES),
    code: hash(options.codeFingerprint),
    prompt: hash(
      clips.map((clip) => [
        buildExplainerPrompt(clip.words, bounds(clip)),
        buildReviewPrompt(clip.words, [], bounds(clip)),
      ]),
    ),
    tool: hash({
      policy: CODEX_CAPABILITY_POLICY,
      transport: selectedTransport(options),
      clientVersion:
        selectedTransport(options) === GG_IDENTITY.transport ? GG_IDENTITY.clientVersion : null,
      executable: options.codexExecutable ?? null,
      executableSha256: options.executableSha256 ?? null,
    }),
    model: hash(options.model ?? 'cli-default-unresolved'),
    historySeed: hash(options.historySeed ?? []),
  };
  const fingerprints = { ...parts, run: hash(parts) };
  const schedule = selected.flatMap((clip) =>
    profiles.flatMap((profileId) =>
      Array.from(
        { length: repetitions },
        (_, index): TrialSpec => ({
          id: hash([clip.id, profileId, index + 1]),
          clipId: clip.id,
          profileId,
          repetition: index + 1,
          split: clip.split,
        }),
      ),
    ),
  );
  bounded(canonical(schedule));
  const previous = await read(options.directory, 'checkpoint.json');
  const saved = previous === undefined ? undefined : JSON.parse(previous);
  if (saved && (saved.version !== 1 || saved.fingerprint !== fingerprints.run))
    throw new Error('Checkpoint fingerprint mismatch');
  const ctx = {
    options: { ...options, corpus: parsed.value },
    fingerprints,
    schedule,
    limits: createRunLimits({ state: saved?.limits }),
  };
  if (!saved) await checkpoint(ctx);
  return ctx;
}
function metadataValid(
  metadata: GenerationMetadata | undefined,
  options: EvaluationOptions,
): boolean {
  if (
    !metadata ||
    !['offline', 'codex-subscription'].includes(metadata.provider) ||
    (options.mode === 'live' && metadata.provider !== 'codex-subscription') ||
    (options.fixture !== undefined && metadata.provider !== 'offline') ||
    (metadata.provider === 'codex-subscription' &&
      (metadata.authMode !== 'chatgpt' ||
        (selectedTransport(options) === GG_IDENTITY.transport
          ? metadata.transport !== GG_IDENTITY.transport ||
            metadata.clientVersion !== GG_IDENTITY.clientVersion ||
            metadata.cliVersion !== undefined
          : metadata.cliVersion !== LEGACY_CLI_VERSION ||
            metadata.transport !== undefined ||
            metadata.clientVersion !== undefined))) ||
    (metadata.provider === 'offline' &&
      (metadata.transport !== undefined || metadata.clientVersion !== undefined)) ||
    typeof metadata.model !== 'string' ||
    !metadata.model ||
    metadata.model.length > 256 ||
    typeof metadata.configId !== 'string' ||
    !metadata.configId ||
    metadata.configId.length > 256 ||
    !Number.isFinite(metadata.latencyMs) ||
    metadata.latencyMs < 0 ||
    (options.model !== undefined && metadata.model !== options.model) ||
    (metadata.cliVersion !== undefined && metadata.cliVersion !== LEGACY_CLI_VERSION) ||
    (metadata.authMode !== undefined && metadata.authMode !== 'chatgpt')
  )
    return false;
  const keys = [
    'provider',
    'model',
    'configId',
    'latencyMs',
    'cliVersion',
    'authMode',
    'transport',
    'clientVersion',
    'inputTokens',
    'outputTokens',
    'cachedInputTokens',
    'reasoningTokens',
  ];
  return (
    Object.keys(metadata).every((key) => keys.includes(key)) &&
    [
      metadata.inputTokens,
      metadata.outputTokens,
      metadata.cachedInputTokens,
      metadata.reasoningTokens,
    ].every((value) => value === undefined || (Number.isSafeInteger(value) && value >= 0))
  );
}
async function load(ctx: Context, trial: TrialSpec): Promise<TrialArtifact | undefined> {
  const text = await read(ctx.options.directory, filename(trial));
  if (text === undefined) return undefined;
  const artifact = JSON.parse(text) as TrialArtifact;
  if (
    artifact.version !== 1 ||
    artifact.fingerprint !== ctx.fingerprints.run ||
    hash(artifact.trial) !== hash(trial)
  )
    throw new Error('Trial fingerprint mismatch');
  if (
    !['inflight', 'unknown', 'completed'].includes(artifact.status) ||
    !Array.isArray(artifact.attempts) ||
    artifact.attempts.length > DEFAULT_RUN_LIMITS.maxAttempts
  )
    throw new Error('Invalid trial artifact');
  for (const attempt of artifact.attempts) {
    if (
      !PHASES.includes(attempt.phase) ||
      !/^[a-f0-9]{64}$/.test(attempt.promptFingerprint) ||
      !['inflight', 'unknown', 'completed'].includes(attempt.status)
    )
      throw new Error('Invalid phase artifact');
    if (attempt.text !== undefined) bounded(attempt.text, MAX_COMPLETION_BYTES);
    if (
      artifact.status === 'completed' &&
      (attempt.status !== 'completed' ||
        typeof attempt.text !== 'string' ||
        !metadataValid(attempt.metadata, ctx.options))
    )
      throw new Error('Incomplete replay artifact');
  }
  return artifact;
}
async function save(ctx: Context, artifact: TrialArtifact): Promise<void> {
  const existing = await load(ctx, artifact.trial);
  if (existing?.status === 'completed') throw new Error('Completed artifacts are immutable');
  await atomic(ctx.options.directory, filename(artifact.trial), canonical(artifact));
}
async function execute(
  ctx: Context,
  trial: TrialSpec,
  sourceGenerator?: PlannerGenerator,
): Promise<TrialArtifact> {
  const existing = await load(ctx, trial);
  if (existing && existing.status !== 'completed') return existing; // Unknown/inflight are never retried.
  if (!existing && !sourceGenerator) throw new Error('Missing completed replay artifact');
  const clip = ctx.options.corpus.clips.find((item) => item.id === trial.clipId);
  if (!clip) throw new Error('Invalid trial');
  const artifact: TrialArtifact = existing ?? {
    version: 1,
    fingerprint: ctx.fingerprints.run,
    trial,
    status: 'inflight',
    attempts: [],
  };
  let index = 0;
  let failure: string | undefined;
  const generator: PlannerGenerator = async (request) => {
    if (failure) throw new Error(failure); // No transport retries or fallback after any failure.
    ctx.options.signal?.throwIfAborted();
    if (existing) {
      const saved = existing.attempts[index++];
      if (
        !saved ||
        saved.phase !== request.phase ||
        saved.promptFingerprint !== hash(request.prompt)
      ) {
        failure = 'Replay phase/prompt mismatch';
        throw new Error(failure);
      }
      return { text: saved.text as string, metadata: saved.metadata as GenerationMetadata };
    }
    const admission = ctx.limits.begin(trial.split);
    if (!admission.ok) {
      failure = admission.reason;
      throw new Error(failure);
    }
    const attempt: TrialAttempt = {
      phase: request.phase,
      promptFingerprint: hash(request.prompt),
      status: 'inflight',
    };
    artifact.attempts.push(attempt);
    try {
      await save(ctx, artifact);
      await checkpoint(ctx); // Persist reservation before any call; crash means unknown, never retry.
      ctx.options.signal?.throwIfAborted();
      if (!sourceGenerator) throw new Error('Missing generator');
      const completion = await sourceGenerator(request);
      ctx.options.signal?.throwIfAborted();
      bounded(completion.text, MAX_COMPLETION_BYTES);
      if (!metadataValid(completion.metadata, ctx.options)) throw new Error('invalid-metadata');
      bounded(
        canonical({
          ...artifact,
          attempts: [...artifact.attempts.slice(0, -1), { ...attempt, ...completion }],
        }),
      );
      Object.assign(attempt, completion, { status: 'completed' });
      ctx.limits.finish('completed');
      return completion;
    } catch (error) {
      failure = ctx.deadline?.aborted
        ? 'wall-limit'
        : ctx.options.signal?.aborted
          ? 'cancelled'
          : failureCode(error, 'generation-failed');
      attempt.status = 'unknown';
      ctx.limits.finish(failureOutcome(failure));
      throw new Error(failure);
    }
  };
  const result = await planExplainerEditPlan('', clip.words, bounds(clip), {
    generator,
    signal: ctx.options.signal,
    ...SHARED_CONFIG,
    profile: trial.profileId,
    recentUse: recentSnapshot(
      ctx.options.historySeed ?? [],
      clipIdentity(clip.id, clip.bounds.start, clip.bounds.end),
    ),
    onGeneration: (metadata, phase) => {
      if (!existing) {
        const attempt = artifact.attempts[artifact.attempts.length - 1];
        if (attempt?.phase === phase) attempt.metadata = { ...metadata };
      }
    },
  });
  if (existing) {
    ctx.options.signal?.throwIfAborted();
    if (failure || index !== existing.attempts.length || hash(result) !== hash(existing.result))
      throw new Error(failure ?? 'Replay result mismatch');
    return existing;
  }
  if (ctx.options.signal?.aborted) failure = ctx.deadline?.aborted ? 'wall-limit' : 'cancelled';
  if (!failure) {
    artifact.result = result;
    try {
      bounded(canonical(artifact));
    } catch {
      delete artifact.result;
      failure = 'output-limit';
    }
  }
  artifact.status = failure ? 'unknown' : 'completed';
  if (failure) artifact.error = failure;
  await save(ctx, artifact);
  await checkpoint(ctx);
  ctx.options.signal?.throwIfAborted();
  return artifact;
}
/** Offline authored-fixture seam only. Live evaluation has no generator injection. */
export async function runTrial(
  options: EvaluationOptions,
  trial: TrialSpec,
  fixtureGenerator?: PlannerGenerator,
): Promise<TrialArtifact> {
  if (options.mode !== 'replay') throw new Error('runTrial is replay-only');
  const ctx = await prepare(options);
  if (!ctx.schedule.some((item) => hash(item) === hash(trial)))
    throw new Error('Trial is not in schedule');
  return execute(ctx, trial, fixtureGenerator);
}
export async function runEvaluation(options: EvaluationOptions): Promise<EvaluationReport> {
  const ctx = await prepare(options);
  const blockers: string[] = [];
  let liveGenerator: PlannerGenerator | undefined;
  if (options.mode === 'live') {
    const remainingMs = ctx.limits.snapshot().startedAt + DEFAULT_RUN_LIMITS.wallMs - Date.now();
    if (remainingMs > 0) {
      ctx.deadline = AbortSignal.timeout(remainingMs);
      options = {
        ...ctx.options,
        signal: options.signal ? AbortSignal.any([options.signal, ctx.deadline]) : ctx.deadline,
      };
      ctx.options = options;
    }
    const transport = {
      live: true,
      model: options.model ?? '',
      reasoning: options.reasoning ?? DEFAULT_REASONING,
      autoReloadDisabled: options.autoReloadDisabled === true,
    };
    if (!transport.autoReloadDisabled) blockers.push('auto-reload-attestation-required');
    if (!transport.model) blockers.push('model-required');
    try {
      const readiness = await probeCodex(transport, options.signal);
      blockers.push(...readiness.blockers.map((code) => safeCode(code, 'codex-not-ready')));
      if (!readiness.ready) blockers.push('codex-not-ready');
      if (readiness.ordinaryUsageAllowed !== true)
        blockers.push(
          readiness.ordinaryUsageAllowed === false ? 'usage-limit' : 'included-usage-unknown',
        );
      if (readiness.clientVersion !== GG_IDENTITY.clientVersion)
        blockers.push('unsupported-version');
      if (readiness.authMode !== 'chatgpt') blockers.push('chatgpt-auth-required');
      // The GG transport owns helper isolation and rechecks auth/allowance before EVERY request.
      if (!blockers.length) liveGenerator = createCodexGenerator(transport);
    } catch (error) {
      options.signal?.throwIfAborted();
      blockers.push(failureCode(error, 'codex-probe-failed'));
    }
  }
  const trials: TrialSummary[] = [];
  const collections = new Map<
    string,
    {
      profileId: PlannerProfileId;
      repetition: number;
      split: CorpusSplit;
      entries: CollectionEntry[];
    }
  >();
  for (const trial of ctx.schedule) {
    options.signal?.throwIfAborted();
    let artifact = await load(ctx, trial);
    if (options.mode !== 'dry-run' && artifact?.status === 'completed')
      artifact = await execute(ctx, trial); // Re-admit saved text; never regenerate a completed trial.
    else if (!artifact && liveGenerator && !ctx.limits.snapshot().stop)
      artifact = await execute(ctx, trial, liveGenerator);
    const attempts = { outline: 0, draft: 0, review: 0 };
    for (const attempt of artifact?.attempts ?? []) attempts[attempt.phase]++;
    const summary: TrialSummary = {
      id: trial.id,
      status: artifact?.status ?? (options.mode === 'live' ? 'blocked' : 'scheduled'),
      attempts,
      observed:
        artifact?.attempts.flatMap((attempt) =>
          attempt.metadata && metadataValid(attempt.metadata, options)
            ? [{ ...attempt.metadata }]
            : [],
        ) ?? [],
    };
    if (options.mode !== 'dry-run' && artifact?.status === 'completed' && artifact.result) {
      summary.result = artifact.result;
      const clip = ctx.options.corpus.clips.find((clip) => clip.id === trial.clipId);
      if (clip && artifact.result.ok) {
        summary.planMetrics = measurePlan(artifact.result.value, clip);
        summary.automaticLayout = {
          brollEnabled: false,
          quoteWindowsBeforeSplicing: assignArchetypesDeterministic(
            splitIntoSegments(
              clip.id,
              clip.words.map((word) => ({ ...word })),
            ),
            false,
            trial.profileId === 'baseline-policy-codex-v1' ? 'baseline' : 'content-led',
          )
            .filter((segment) => segment.archetype === 'fullscreen-quote')
            .map((segment) => ({ startTime: segment.startTime, endTime: segment.endTime })),
        };
        const key = `${trial.split}/${trial.profileId}/${trial.repetition}`;
        const collection = collections.get(key) ?? {
          profileId: trial.profileId,
          repetition: trial.repetition,
          split: trial.split,
          entries: [],
        };
        collection.entries.push({ clipId: clip.id, clip, plan: artifact.result.value });
        collections.set(key, collection);
      }
    }
    if (artifact?.error) summary.error = artifact.error;
    if (artifact && artifact.status !== 'completed') {
      blockers.push(`${trial.id}:${artifact.error ?? artifact.status}`);
      // A reserve denial is not a failed request: holdout trials may still use their reserve.
      if (artifact.error !== 'holdout-reserve') liveGenerator = undefined;
    }
    trials.push(summary);
  }
  const report: EvaluationReport = {
    version: 1,
    mode: options.mode,
    fingerprints: ctx.fingerprints,
    schedule: ctx.schedule,
    trials,
    limits: ctx.limits.snapshot(),
    blockers,
    collections: [...collections.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, entry]) => ({
        profileId: entry.profileId,
        repetition: entry.repetition,
        split: entry.split,
        planMetrics: measureCollection(entry.entries),
      })),
  };
  const sheets = trials.map((trial, index) => ({
    id: hash(['blind-v1', trial.id]),
    clipId: ctx.schedule[index].clipId,
    status: trial.status,
    ...(trial.result?.ok
      ? {
          plan: { scenes: trial.result.value.scenes, quotes: trial.result.value.quotes },
          rubric: trial.planMetrics?.rubric,
          automaticLayout: trial.automaticLayout,
        }
      : {}),
  }));
  const outputs = {
    'report.json': canonical(report),
    'report.md': `# Planner evaluation\n\nMode: ${options.mode}\nFingerprint: ${ctx.fingerprints.run}\nPlan metrics are mechanical proxies, not semantic or rendered-quality scores.\nNo scores or winner have been assigned. Unknown token categories remain absent; no dollar costs are inferred.\n\n${blockers.map((blocker) => `- Blocked: ${blocker}\n`).join('')}\n| Trial | Status | Attempts | Scenes | Optional quotes | Longest stack (s) | Expectations |\n| --- | --- | --- | --- | --- | --- | --- |\n${trials.map((trial) => `| ${trial.id} | ${trial.status} | ${Object.values(trial.attempts).reduce((sum, count) => sum + count, 0)} | ${trial.planMetrics?.sceneCount ?? '—'} | ${trial.planMetrics?.quoteCount ?? '—'} | ${trial.planMetrics?.longestStableSplitScreenRun.durationSec.toFixed(2) ?? '—'} | ${trial.planMetrics?.expectations.status ?? 'unmeasured'} |`).join('\n')}\n`,
    'profile-map.json': canonical({
      version: 1,
      fingerprint: ctx.fingerprints.run,
      profiles: ctx.schedule.map((trial, index) => ({ blindId: sheets[index].id, ...trial })),
    }),
    'blinded.json': canonical({ version: 1, sheets }),
  };
  for (const text of Object.values(outputs)) bounded(text);
  for (const [name, text] of Object.entries(outputs)) {
    options.signal?.throwIfAborted();
    await atomic(options.directory, name, text);
  }
  return report;
}
