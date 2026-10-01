import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_COMPLETION_BYTES, type PlannerGenerator } from '../explainer/planner-generation';
import { CODEX_ACCOUNT_POLICY, evaluateCodexAccountPolicy } from './codex-account-policy';
import { CodexProcessError, runCodexProcess } from './codex-process';
import { DEFAULT_RUN_LIMITS } from './limits';

/** The helper imports pinned GG libraries only: no coding agent, tools, project context or API key.
 * Its fixed source path and Node executable cannot be chosen by a model or CLI argument.
 * Readiness is rechecked for every request, never inferred from login or quota percentages. */
export const CODEX_CAPABILITY_POLICY = Object.freeze({
  version: CODEX_ACCOUNT_POLICY.policyVersion,
  helperVersion: '5.67.1',
  transport: 'gg-chatgpt',
  clientVersion: 'gg-ai@5.67.1+gg-core@5.67.1',
  upstreamRevision: CODEX_ACCOUNT_POLICY.upstreamRevision,
  serviceTier: 'default',
  outputEnvelope: 'plan-json-string-v1',
});
export interface CodexReadiness {
  ready: boolean;
  policyVersion: string;
  clientVersion?: string;
  authMode?: 'chatgpt';
  ordinaryUsageAllowed: boolean | null;
  blockers: string[];
}
export interface CodexOptions {
  /** Explicit live permission does not override the executable/account/isolation gates. */
  live?: boolean;
  /** Legacy replay identity only. Live generation refuses native executable overrides. */
  executable?: string;
  executableSha256?: string;
  model?: string;
  reasoning?: string;
  /** Explicit user attestation; never assume this from permission to use ChatGPT. */
  autoReloadDisabled?: boolean;
  spawn?: (file: string, args: string[], options: SpawnOptions) => ChildProcess;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  killGroup?: (pid: number, signal: NodeJS.Signals) => unknown;
}
export class CodexTransportError extends Error {
  readonly retryable = false;
  constructor(
    readonly code: string,
    readonly readiness?: CodexReadiness,
  ) {
    super(`Codex transport refused: ${code}`);
    this.name = 'CodexTransportError';
  }
}
/** Pure dry-run report: no subprocesses, credentials, network or filesystem access. */
export function codexReadiness(): CodexReadiness {
  return {
    ready: false,
    policyVersion: CODEX_CAPABILITY_POLICY.version,
    ordinaryUsageAllowed: null,
    blockers: ['chatgpt-account-preflight-required'],
  };
}
export async function probeCodex(
  options: CodexOptions = {},
  signal?: AbortSignal,
): Promise<CodexReadiness> {
  if (signal?.aborted) throw new CodexTransportError('cancelled');
  const report = codexReadiness();
  if (options.live !== true) return report;
  if (options.executable !== undefined || options.executableSha256 !== undefined)
    return { ...report, blockers: ['legacy-native-config-not-supported'] };
  const version = await codexCommand(options, ['--version'], signal);
  if (version.trim() !== `batchclip-gg-chatgpt ${CODEX_CAPABILITY_POLICY.helperVersion}`)
    return { ...report, blockers: ['unsupported-version'] };
  report.clientVersion = CODEX_CAPABILITY_POLICY.clientVersion;
  const preflight = await codexCommand(options, ['planner-preflight'], signal);
  const policy = evaluateCodexAccountPolicy(preflight, {
    selectedModel: options.model ?? '',
    selectedReasoning: options.reasoning ?? 'medium',
    automaticCreditReloadDisabledAttestation: options.autoReloadDisabled,
  });
  if (
    !policy.blockers.some((code) => code === 'invalid-preflight' || code === 'preflight-size-limit')
  ) {
    // Only allowlisted scalars escape; never retain raw account/diagnostic payloads.
    const metadata = object(JSON.parse(preflight));
    if (metadata.authMode === 'chatgpt') report.authMode = 'chatgpt';
    if (typeof metadata.ordinaryUsageAllowed === 'boolean')
      report.ordinaryUsageAllowed = metadata.ordinaryUsageAllowed;
  }
  return { ...report, ...policy };
}

export function createCodexGenerator(options: CodexOptions = {}): PlannerGenerator {
  // A generator belongs to one run. Do not overlap requests even when callers misuse it.
  let inFlight = false;
  return async ({ prompt, signal }) => {
    if (inFlight) throw new CodexTransportError('in-flight');
    if (
      typeof prompt !== 'string' ||
      !prompt.trim() ||
      Buffer.byteLength(prompt) > MAX_COMPLETION_BYTES - 1024
    )
      throw new CodexTransportError('input-limit');
    inFlight = true;
    try {
      const started = Date.now();
      const readiness = await probeCodex(options, signal);
      if (!readiness.ready || !options.model) throw new CodexTransportError('blocked', readiness);
      const reasoning = options.reasoning ?? 'medium';
      const jsonl = await codexCommand(
        options,
        [
          'planner-exec',
          '--model',
          options.model,
          '--reasoning',
          reasoning,
          '--auto-reload-disabled',
          'true',
          '-',
        ],
        signal,
        prompt,
      );
      const completion = parseCodexCompletion(jsonl);
      let envelope: Record<string, unknown>;
      try {
        envelope = object(JSON.parse(completion.text));
      } catch {
        throw new CodexTransportError('invalid-envelope');
      }
      if (
        Object.keys(envelope).length !== 1 ||
        typeof envelope.plan_json !== 'string' ||
        !envelope.plan_json.trim()
      )
        throw new CodexTransportError('invalid-envelope');
      return {
        text: envelope.plan_json,
        metadata: {
          provider: 'codex-subscription',
          model: options.model,
          configId: `codex:${createHash('sha256')
            .update(
              JSON.stringify({
                ...CODEX_CAPABILITY_POLICY,
                model: options.model,
                reasoning,
              }),
            )
            .digest('hex')}`,
          latencyMs: Date.now() - started,
          transport: 'gg-chatgpt',
          clientVersion: CODEX_CAPABILITY_POLICY.clientVersion,
          authMode: 'chatgpt',
          inputTokens: completion.inputTokens,
          cachedInputTokens: completion.cachedInputTokens,
          outputTokens: completion.outputTokens,
          ...(completion.reasoningTokens === undefined
            ? {}
            : { reasoningTokens: completion.reasoningTokens }),
        },
      };
    } finally {
      inFlight = false;
    }
  };
}

async function codexCommand(
  options: CodexOptions,
  args: string[],
  signal?: AbortSignal,
  input?: string,
): Promise<string> {
  const executable = process.execPath;
  const entry = fileURLToPath(
    new URL('../../../../scripts/planner-eval/gg-client/cli.mjs', import.meta.url),
  );
  if (signal?.aborted) throw new CodexTransportError('cancelled');
  let cwd: string | undefined;
  let output = '';
  let failure: CodexTransportError | undefined;
  try {
    cwd = await mkdtemp(join(tmpdir(), 'batchcontent-codex-probe-'));
    if (signal?.aborted) throw new CodexTransportError('cancelled');
    const env: NodeJS.ProcessEnv = { TMP: cwd, TEMP: cwd, TMPDIR: cwd };
    const source = options.env ?? process.env;
    for (const key of [
      'SystemRoot',
      'WINDIR',
      'HOME',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'HOMEDRIVE',
      'HOMEPATH',
    ]) {
      if (source[key]) env[key] = source[key];
    }
    const command = [entry, ...args];
    const result = await runCodexProcess({
      ...options,
      executable,
      args: command,
      cwd,
      env,
      input,
      signal,
      timeoutMs: input === undefined ? 5_000 : DEFAULT_RUN_LIMITS.requestMs,
      maxBytes:
        input === undefined
          ? CODEX_ACCOUNT_POLICY.maxPreflightBytes
          : DEFAULT_RUN_LIMITS.maxOutputBytes,
    });
    if (result.exitCode !== 0) {
      // Preserve a structured quota/error outcome without exposing raw stderr.
      if (input !== undefined) parseCodexCompletion(result.stdout);
      throw new CodexTransportError(input === undefined ? 'probe-failed' : 'generation-failed');
    }
    output = result.stdout;
  } catch (error) {
    failure =
      error instanceof CodexTransportError
        ? error
        : new CodexTransportError(
            error instanceof CodexProcessError
              ? error.code
              : input === undefined
                ? 'probe-failed'
                : 'generation-failed',
          );
  } finally {
    if (cwd) {
      try {
        await rm(cwd, { recursive: true, force: true });
      } catch {
        // Preserve the primary cancellation/failure; cleanup failure can never yield success.
        failure ??= new CodexTransportError('cleanup-failed');
      }
    }
  }
  if (failure) throw failure;
  return output;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function token(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 10_000_000
  ) {
    throw new CodexTransportError('invalid-usage');
  }
  return value;
}
function invalid(event: Record<string, unknown>): never {
  const usageSignal = /quota|rate[\s_-]*limit|credit|billing|ordinaryUsageAllowed/i.test(
    JSON.stringify(event),
  );
  throw new CodexTransportError(usageSignal ? 'usage-limit' : 'invalid-events');
}
/** Strict single-turn JSONL reader, shared by live generation and offline replay. Completion remains UNTRUSTED.
 * Requires terminal newline + turn.completed, rejects tools and all unknown event types. */
export function parseCodexCompletion(jsonl: string): {
  text: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
} {
  if (Buffer.byteLength(jsonl) > DEFAULT_RUN_LIMITS.maxOutputBytes)
    throw new CodexTransportError('output-limit');
  if (!jsonl.endsWith('\n')) throw new CodexTransportError('invalid-events');
  const lines = jsonl.trimEnd().split('\n');
  if (lines.length > 1024) throw new CodexTransportError('output-limit');
  let thread = false;
  let turn = false;
  let text: string | undefined;
  let usage:
    | {
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        reasoningTokens?: number;
      }
    | undefined;
  for (const line of lines) {
    let event: Record<string, unknown>;
    try {
      event = object(JSON.parse(line));
    } catch {
      throw new CodexTransportError('invalid-events');
    }
    if (
      event.error ||
      event.truncated ||
      event.status === 'incomplete' ||
      event.status === 'failed' ||
      (event.finish_reason !== undefined && event.finish_reason !== 'stop')
    )
      invalid(event);
    if (usage) invalid(event);
    if (event.type === 'thread.started' && !thread && !turn) {
      thread = true;
      continue;
    }
    if (event.type === 'turn.started' && thread && !turn) {
      turn = true;
      continue;
    }
    if (typeof event.type === 'string' && event.type.startsWith('item.')) {
      const item = object(event.item);
      if (item.type !== 'agent_message' && item.type !== 'reasoning')
        throw new CodexTransportError('tool-call');
      if (
        !turn ||
        event.type !== 'item.completed' ||
        item.error ||
        item.truncated ||
        (item.status !== undefined && item.status !== 'completed') ||
        (item.finish_reason !== undefined && item.finish_reason !== 'stop')
      )
        invalid(event);
      if (item.type === 'reasoning') continue;
      if (text !== undefined || typeof item.text !== 'string' || !item.text.trim()) invalid(event);
      if (Buffer.byteLength(item.text) > MAX_COMPLETION_BYTES)
        throw new CodexTransportError('output-limit');
      text = item.text;
      continue;
    }
    if (event.type !== 'turn.completed' || !turn || text === undefined) invalid(event);
    const counts = object(event.usage);
    usage = {
      inputTokens: token(counts.input_tokens),
      cachedInputTokens: token(counts.cached_input_tokens),
      outputTokens: token(counts.output_tokens),
      ...(counts.reasoning_tokens === undefined
        ? {}
        : { reasoningTokens: token(counts.reasoning_tokens) }),
    };
    if (usage.cachedInputTokens > usage.inputTokens) throw new CodexTransportError('invalid-usage');
  }
  if (text === undefined || !usage) throw new CodexTransportError('invalid-events');
  return { text, ...usage };
}
