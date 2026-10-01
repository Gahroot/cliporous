import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClientError, ENDPOINTS } from './network.mjs';

export const POLICY = Object.freeze({
  policyVersion: 'batchclip-gg-chatgpt-v1',
  upstreamRevision: 'd7f3e960f03544554a6dbff3bc1c1ac9cf27c374',
});
export const REASONING_LEVELS = Object.freeze([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);
export function identifier(value, limit = 128) {
  return (
    typeof value === 'string' && value.length <= limit && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
  );
}

export function dedicatedAuthPath(home = homedir()) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const path = resolve(home, '.batchclip', 'planner-eval', 'gg-chatgpt-v1', 'auth.json');
  const fromRoot = relative(root, path);
  const outside = fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
  if (!isAbsolute(home) || !outside) throw new ClientError('isolated-auth-path-required');
  return path;
}
export async function createAuthStore() {
  // Explicit public path option. Never consult/copy Codex, GG, project or other
  // provider auth/config files. GG logging stays unopened (its default).
  const { AuthStorage } = await import('@kenkaiiii/gg-core');
  return new AuthStorage(dedicatedAuthPath());
}
export function requireOAuth(credentials, { allowExpired = false } = {}) {
  if (
    !credentials ||
    typeof credentials.accessToken !== 'string' ||
    !credentials.accessToken ||
    credentials.accessToken.length > 24 * 1024 ||
    /\s/.test(credentials.accessToken) ||
    credentials.accessToken.startsWith('sk-') ||
    typeof credentials.refreshToken !== 'string' ||
    !credentials.refreshToken ||
    credentials.refreshToken.length > 24 * 1024 ||
    /\s/.test(credentials.refreshToken) ||
    typeof credentials.accountId !== 'string' ||
    !credentials.accountId.trim() ||
    credentials.accountId.length > 256 ||
    /[^\x21-\x7e]/.test(credentials.accountId) ||
    !Number.isFinite(credentials.expiresAt) ||
    (!allowExpired && credentials.expiresAt <= Date.now()) ||
    credentials.baseUrl !== undefined ||
    credentials.projectId !== undefined
  )
    throw new ClientError('chatgpt-oauth-required');
  if (
    credentials.usageExhaustedUntil !== undefined &&
    (!Number.isFinite(credentials.usageExhaustedUntil) ||
      credentials.usageExhaustedUntil > Date.now())
  )
    throw new ClientError('usage-limit');
  return credentials;
}
export async function resolveOAuth(store) {
  const current = await store.getCredentials('openai');
  if (current === undefined) return undefined;
  // Validate BEFORE refresh: an API key or custom endpoint must never be tried.
  requireOAuth(current, { allowExpired: true });
  return requireOAuth(await store.resolveCredentials('openai', { storageKeys: ['openai'] }));
}
function headers(credentials) {
  requireOAuth(credentials);
  return {
    Authorization: `Bearer ${credentials.accessToken}`,
    'ChatGPT-Account-Id': credentials.accountId,
    Accept: 'application/json',
    originator: 'ggcoder',
    'User-Agent': 'ggcoder',
  };
}
async function fetchMetadata(url, credentials, network, signal) {
  const response = await network.fetch(url, {
    method: 'GET',
    headers: headers(credentials),
    signal,
  });
  try {
    return await response.json();
  } catch (error) {
    throw error instanceof ClientError ? error : new ClientError('invalid-metadata');
  }
}
const booleanOrNull = (value) => (typeof value === 'boolean' ? value : null);
export function normalizeUsage(raw) {
  // Explicit backend permission only; never derive permission from percentages,
  // remaining-window arithmetic, subscription names or the absence of errors.
  const allowed = booleanOrNull(raw?.rate_limit?.allowed);
  const balance = raw?.credits?.balance;
  return {
    ordinaryUsageAllowed: allowed,
    credits: {
      hasCredits: booleanOrNull(raw?.credits?.has_credits),
      unlimited: booleanOrNull(raw?.credits?.unlimited),
      // No Number(): decimal rounding/underflow cannot turn funded into empty.
      balance:
        typeof balance === 'string' &&
        balance.length <= 64 &&
        /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(balance)
          ? balance
          : null,
    },
  };
}
export function normalizeModels(raw) {
  if (!Array.isArray(raw?.models) || raw.models.length > 64)
    throw new ClientError('invalid-models');
  const models = raw.models.map((model) => {
    if (
      !identifier(model?.slug) ||
      !Array.isArray(model.supported_reasoning_levels) ||
      model.supported_reasoning_levels.length > 16
    )
      throw new ClientError('invalid-models');
    const reasoningLevels = model.supported_reasoning_levels.map((level) => {
      if (!REASONING_LEVELS.includes(level?.effort)) throw new ClientError('invalid-models');
      return level.effort;
    });
    if (new Set(reasoningLevels).size !== reasoningLevels.length)
      throw new ClientError('invalid-models');
    return { id: model.slug, reasoningLevels };
  });
  if (new Set(models.map((model) => model.id)).size !== models.length)
    throw new ClientError('invalid-models');
  return models;
}
function metadata(authMode, usage, models) {
  return {
    ...POLICY,
    authMode,
    ...usage,
    models,
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
    // The pinned Codex provider omits service_tier (the backend default). We
    // never pass a priority/flex tier and reject non-default response tiers.
    serviceTier: 'default',
  };
}
export function requireAccount(metadata, model, reasoning, autoReloadDisabled) {
  if (autoReloadDisabled !== true)
    throw new ClientError('automatic-credit-reload-attestation-required');
  if (metadata.authMode !== 'chatgpt') throw new ClientError('chatgpt-oauth-required');
  if (metadata.ordinaryUsageAllowed !== true) throw new ClientError('ordinary-usage-unavailable');
  if (
    metadata.credits.hasCredits !== false ||
    metadata.credits.unlimited !== false ||
    typeof metadata.credits.balance !== 'string' ||
    !/^0(?:\.0+)?$/.test(metadata.credits.balance)
  )
    throw new ClientError('credit-wallet-not-empty');
  const selected = metadata.models.find((entry) => entry.id === model);
  if (!selected) throw new ClientError('selected-model-unavailable');
  if (!selected.reasoningLevels.includes(reasoning))
    throw new ClientError('selected-reasoning-unavailable');
}

export async function preflight({ store, network, signal }) {
  const initial = await resolveOAuth(store);
  if (!initial) return { metadata: metadata('none', normalizeUsage(null), []) };
  const models = normalizeModels(await fetchMetadata(ENDPOINTS.models, initial, network, signal));
  // Re-read managed credentials immediately before usage; no cached account
  // readiness or previous CLI preflight can authorize a generation.
  const credentials = await resolveOAuth(store);
  if (!credentials || credentials.accountId !== initial.accountId)
    throw new ClientError('account-changed');
  const usage = normalizeUsage(await fetchMetadata(ENDPOINTS.usage, credentials, network, signal));
  requireOAuth(credentials);
  return { metadata: metadata('chatgpt', usage, models), credentials };
}

function openBrowser(url) {
  const parsed = new URL(url);
  if (
    parsed.origin !== 'https://auth.openai.com' ||
    parsed.pathname !== '/oauth/authorize' ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.searchParams.get('redirect_uri') !== 'http://localhost:1455/auth/callback'
  )
    throw new ClientError('login-url-refused');
  let executable;
  let args;
  if (process.platform === 'win32') {
    if (!process.env.SystemRoot || !isAbsolute(process.env.SystemRoot))
      throw new ClientError('browser-unavailable');
    executable = join(process.env.SystemRoot, 'System32', 'rundll32.exe');
    args = ['url.dll,FileProtocolHandler', url];
  } else {
    executable = process.platform === 'darwin' ? '/usr/bin/open' : '/usr/bin/xdg-open';
    args = [url];
  }
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      { shell: false, timeout: 5_000, maxBuffer: 1024, windowsHide: true },
      (error) => {
        if (error) reject(new ClientError('browser-unavailable'));
        else resolve();
      },
    );
  });
}
/** Parent invokes this only after review. No stdin code/token paste path exists. */
export async function login({ store, status, browser = openBrowser }) {
  const { loginOpenAI } = await import('@kenkaiiii/gg-core');
  let opened;
  const credentials = await loginOpenAI({
    onOpenUrl(url) {
      opened = browser(url);
      // Attach immediately: callback acquisition continues while the browser opens.
      void opened.catch(() => {});
      status('waiting-for-browser');
    },
    onPromptCode: async () => {
      throw new ClientError('browser-loopback-only');
    },
    onStatus: () => {},
  });
  await opened;
  requireOAuth(credentials);
  await store.setCredentials('openai', credentials);
  status('signed-in');
}
