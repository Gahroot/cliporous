/** Metadata contract for the pinned, tool-free GG ChatGPT helper; never a coding-agent session. */
export const CODEX_ACCOUNT_POLICY = Object.freeze({
  policyVersion: 'batchclip-gg-chatgpt-v1',
  upstreamRevision: 'd7f3e960f03544554a6dbff3bc1c1ac9cf27c374',
  maxPreflightBytes: 16 * 1024,
  maxModels: 64,
  maxReasoningLevels: 16,
});

const ISOLATION_KEYS = [
  'userConfig',
  'projectConfig',
  'instructions',
  'hooks',
  'plugins',
  'mcp',
  'skills',
] as const;

/** A valid shape can still describe an ineligible account/client; it is NOT readiness. */
export interface CodexAccountPreflight {
  policyVersion: string;
  upstreamRevision: string;
  authMode: 'chatgpt' | 'none' | 'apikey';
  /** Backend permission for ordinary included usage; null means unavailable, not a percentage. */
  ordinaryUsageAllowed: boolean | null;
  credits: { hasCredits: boolean | null; unlimited: boolean | null; balance: string | null };
  models: { id: string; reasoningLevels: string[] }[];
  toolCount: number;
  isolation: Record<(typeof ISOLATION_KEYS)[number], boolean>;
  serviceTier: string;
}

export interface CodexAccountPolicyOptions {
  selectedModel: string;
  selectedReasoning: string;
  /** Explicit USER attestation, never inferred from helper metadata or defaulted to true. */
  automaticCreditReloadDisabledAttestation?: boolean;
}

export type CodexAccountBlocker =
  | 'invalid-preflight'
  | 'preflight-size-limit'
  | 'invalid-policy-options'
  | 'unsupported-policy-version'
  | 'unsupported-upstream-revision'
  | 'chatgpt-auth-required'
  | 'ordinary-usage-unavailable'
  | 'ordinary-usage-denied'
  | 'credit-wallet-unavailable'
  | 'credit-wallet-funded'
  | 'credit-wallet-unlimited'
  | 'tools-not-disabled'
  | 'isolation-not-enforced'
  | 'default-service-tier-required'
  | 'selected-model-unavailable'
  | 'selected-reasoning-unavailable'
  | 'automatic-credit-reload-attestation-required';

/** No raw metadata, account identifiers, source paths, or parser diagnostics escape. */
export interface CodexAccountReadiness {
  ready: boolean;
  blockers: CodexAccountBlocker[];
}

class BoundaryError extends Error {
  constructor(readonly blocker: 'invalid-preflight' | 'preflight-size-limit') {
    super(blocker);
  }
}

function invalid(): never {
  throw new BoundaryError('invalid-preflight');
}

function record(
  raw: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(raw);
  if (
    keys.length > required.length + optional.length ||
    required.some((key) => !Object.hasOwn(raw, key))
  )
    invalid();
  for (const key of keys) {
    if (typeof key !== 'string' || (!required.includes(key) && !optional.includes(key))) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
  }
  return raw as Record<string, unknown>;
}

function identifier(raw: unknown, maxLength: number): string {
  if (
    typeof raw !== 'string' ||
    raw.length > maxLength ||
    raw.trim() !== raw ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(raw)
  )
    invalid();
  return raw;
}

function nullableBoolean(raw: unknown): boolean | null {
  if (raw !== null && typeof raw !== 'boolean') invalid();
  return raw;
}

/** JSON.parse alone silently overwrites duplicate keys, including escaped spellings. */
function rejectDuplicateKeys(json: string): void {
  const containers: (Set<string> | null)[] = [];
  for (const token of json.matchAll(/"(?:\\[\s\S]|[^"\\])*"(\s*:)?|[{}[\]]/g)) {
    const text = token[0];
    if (text === '{') containers.push(new Set());
    else if (text === '[') containers.push(null);
    else if (text === '}' || text === ']') containers.pop();
    else if (token[1]) {
      const keys = containers[containers.length - 1];
      const key: string = JSON.parse(text.slice(0, -token[1].length));
      if (!keys || keys.has(key)) invalid();
      keys.add(key);
    }
    // The deepest allowed surface is models[].reasoningLevels[].
    if (containers.length > 4) invalid();
  }
}

function parsePreflight(json: unknown): CodexAccountPreflight {
  if (typeof json !== 'string') invalid();
  if (
    json.length > CODEX_ACCOUNT_POLICY.maxPreflightBytes ||
    Buffer.byteLength(json, 'utf8') > CODEX_ACCOUNT_POLICY.maxPreflightBytes
  )
    throw new BoundaryError('preflight-size-limit');
  const parsed: unknown = JSON.parse(json);
  rejectDuplicateKeys(json);
  const raw = record(parsed, [
    'policyVersion',
    'upstreamRevision',
    'authMode',
    'ordinaryUsageAllowed',
    'credits',
    'models',
    'toolCount',
    'isolation',
    'serviceTier',
  ]);
  const policyVersion = identifier(raw.policyVersion, 64);
  const upstreamRevision = identifier(raw.upstreamRevision, 40);
  if (!/^[a-f0-9]{40}$/.test(upstreamRevision)) invalid();
  const authMode = raw.authMode;
  if (authMode !== 'chatgpt' && authMode !== 'none' && authMode !== 'apikey') invalid();
  const ordinaryUsageAllowed = nullableBoolean(raw.ordinaryUsageAllowed);
  const credits = record(raw.credits, ['hasCredits', 'unlimited', 'balance']);
  const hasCredits = nullableBoolean(credits.hasCredits);
  const unlimited = nullableBoolean(credits.unlimited);
  const balance = credits.balance;
  if (
    balance !== null &&
    (typeof balance !== 'string' ||
      balance.length > 64 ||
      balance.trim() !== balance ||
      !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(balance))
  )
    invalid();
  if (!Array.isArray(raw.models) || raw.models.length > CODEX_ACCOUNT_POLICY.maxModels) invalid();
  const models = raw.models.map((item: unknown) => {
    const model = record(item, ['id', 'reasoningLevels']);
    const id = identifier(model.id, 128);
    if (
      !Array.isArray(model.reasoningLevels) ||
      model.reasoningLevels.length > CODEX_ACCOUNT_POLICY.maxReasoningLevels
    )
      invalid();
    const reasoningLevels = model.reasoningLevels.map((level: unknown) => identifier(level, 32));
    if (new Set(reasoningLevels).size !== reasoningLevels.length) invalid();
    return { id, reasoningLevels };
  });
  if (new Set(models.map((model) => model.id)).size !== models.length) invalid();
  const toolCount = raw.toolCount;
  if (
    typeof toolCount !== 'number' ||
    !Number.isInteger(toolCount) ||
    toolCount < 0 ||
    toolCount > 1024
  )
    invalid();
  const isolationRecord = record(raw.isolation, ISOLATION_KEYS);
  const isolation = {} as CodexAccountPreflight['isolation'];
  for (const key of ISOLATION_KEYS) {
    const value = isolationRecord[key];
    if (typeof value !== 'boolean') invalid();
    isolation[key] = value;
  }
  return {
    policyVersion,
    upstreamRevision,
    authMode,
    ordinaryUsageAllowed,
    credits: { hasCredits, unlimited, balance },
    models,
    toolCount,
    isolation,
    serviceTier: identifier(raw.serviceTier, 32),
  };
}

function parseOptions(options: unknown): CodexAccountPolicyOptions {
  const raw = record(
    options,
    ['selectedModel', 'selectedReasoning'],
    ['automaticCreditReloadDisabledAttestation'],
  );
  const attestation = Object.hasOwn(raw, 'automaticCreditReloadDisabledAttestation')
    ? raw.automaticCreditReloadDisabledAttestation
    : undefined;
  if (attestation !== undefined && typeof attestation !== 'boolean') invalid();
  return {
    selectedModel: identifier(raw.selectedModel, 128),
    selectedReasoning: identifier(raw.selectedReasoning, 32),
    automaticCreditReloadDisabledAttestation: attestation,
  };
}

/**
 * Pure, fail-closed evaluation of ONE helper metadata JSON message; no I/O or generation.
 * Credits are automatically used after included limits: ChatGPT auth + default tier alone
 * do not contain billing. Require backend ordinary permission, a known empty non-unlimited
 * wallet AND the separate user attestation that automatic credit reload is disabled.
 * Readiness is only this snapshot, not client verification or a future billing guarantee.
 * The transport owns helper selection, fresh preflights, and stopping on limit changes.
 */
export function evaluateCodexAccountPolicy(
  preflightJson: unknown,
  options?: CodexAccountPolicyOptions,
): CodexAccountReadiness {
  let metadata: CodexAccountPreflight;
  try {
    metadata = parsePreflight(preflightJson);
  } catch (error) {
    return {
      ready: false,
      blockers: [error instanceof BoundaryError ? error.blocker : 'invalid-preflight'],
    };
  }
  let selection: CodexAccountPolicyOptions;
  try {
    selection = parseOptions(options);
  } catch {
    return { ready: false, blockers: ['invalid-policy-options'] };
  }
  const blockers: CodexAccountBlocker[] = [];
  if (metadata.policyVersion !== CODEX_ACCOUNT_POLICY.policyVersion)
    blockers.push('unsupported-policy-version');
  if (metadata.upstreamRevision !== CODEX_ACCOUNT_POLICY.upstreamRevision)
    blockers.push('unsupported-upstream-revision');
  if (metadata.authMode !== 'chatgpt') blockers.push('chatgpt-auth-required');
  if (metadata.ordinaryUsageAllowed === null) blockers.push('ordinary-usage-unavailable');
  else if (!metadata.ordinaryUsageAllowed) blockers.push('ordinary-usage-denied');
  const { hasCredits, unlimited, balance } = metadata.credits;
  if (hasCredits === null || unlimited === null || balance === null)
    blockers.push('credit-wallet-unavailable');
  // Never use Number(balance): rounding/underflow must not turn a funded wallet into zero.
  if (hasCredits === true || (balance !== null && !/^0(?:\.0+)?$/.test(balance)))
    blockers.push('credit-wallet-funded');
  if (unlimited === true) blockers.push('credit-wallet-unlimited');
  if (metadata.toolCount !== 0) blockers.push('tools-not-disabled');
  if (ISOLATION_KEYS.some((key) => metadata.isolation[key] !== false))
    blockers.push('isolation-not-enforced');
  if (metadata.serviceTier !== 'default') blockers.push('default-service-tier-required');
  const model = metadata.models.find((item) => item.id === selection.selectedModel);
  if (!model) blockers.push('selected-model-unavailable');
  else if (!model.reasoningLevels.includes(selection.selectedReasoning))
    blockers.push('selected-reasoning-unavailable');
  if (selection.automaticCreditReloadDisabledAttestation !== true)
    blockers.push('automatic-credit-reload-attestation-required');
  return { ready: blockers.length === 0, blockers };
}
