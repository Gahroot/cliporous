#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAuthStore, identifier, login, preflight, REASONING_LEVELS } from './auth.mjs';
import { generate } from './generation.mjs';
import { ClientError, errorCode, installBoundedFetch, LIMITS } from './network.mjs';

export const VERSION = 'batchclip-gg-chatgpt 5.67.1';
export function parseArguments(args) {
  if (args.length === 1 && ['--version', 'planner-preflight', 'login'].includes(args[0]))
    return { command: args[0] };
  if (args.length !== 8 || args[0] !== 'planner-exec' || args.at(-1) !== '-')
    throw new ClientError('invalid-arguments');
  const flags = new Map();
  for (let index = 1; index < args.length - 1; index += 2) {
    const flag = args[index];
    if (!['--model', '--reasoning', '--auto-reload-disabled'].includes(flag) || flags.has(flag))
      throw new ClientError('invalid-arguments');
    flags.set(flag, args[index + 1]);
  }
  if (
    !identifier(flags.get('--model')) ||
    !REASONING_LEVELS.includes(flags.get('--reasoning')) ||
    flags.get('--auto-reload-disabled') !== 'true'
  )
    throw new ClientError('invalid-arguments');
  return {
    command: 'planner-exec',
    model: flags.get('--model'),
    reasoning: flags.get('--reasoning'),
    autoReloadDisabled: true,
  };
}
export async function readPrompt(input) {
  const chunks = [];
  let size = 0;
  for await (const chunk of input) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > LIMITS.textBytes) throw new ClientError('input-limit');
    chunks.push(bytes);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new ClientError('invalid-input');
  }
}

function isolateEnvironment() {
  // Node may consume these before main starts; don't silently attest isolation
  // in such a process. Parent starts Node with a separate allowlisted environment.
  if (
    ['NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED'].some(
      (key) => process.env[key],
    )
  )
    throw new ClientError('unsafe-environment');
  const allowed = new Set(
    [
      'SystemRoot',
      'WINDIR',
      'HOME',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'HOMEDRIVE',
      'HOMEPATH',
      'TMP',
      'TEMP',
      'TMPDIR',
      // Needed only by the fixed OS browser opener on Linux/macOS, never by SDKs.
      'DISPLAY',
      'WAYLAND_DISPLAY',
      'XDG_RUNTIME_DIR',
      'DBUS_SESSION_BUS_ADDRESS',
    ].map((key) => key.toUpperCase()),
  );
  for (const key of Object.keys(process.env))
    if (!allowed.has(key.toUpperCase())) delete process.env[key];
}
function output(text) {
  return new Promise((resolve, reject) => {
    process.stdout.write(text, (error) =>
      error ? reject(new ClientError('output-failed')) : resolve(),
    );
  });
}
async function main() {
  let network;
  let timer;
  const controller = new AbortController();
  const fail = (error) => output(`${JSON.stringify({ type: 'error', code: errorCode(error) })}\n`);
  // No SDK diagnostics, raw provider exceptions, identities, URLs or tokens may
  // leak through Node's console/unhandled-error paths. Only protocol uses stdout.
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'])
    console[method] = () => {};
  process.on('uncaughtException', () => {
    void fail(new ClientError('client-failed')).finally(() => process.exit(1));
  });
  process.on('unhandledRejection', () => {
    void fail(new ClientError('client-failed')).finally(() => process.exit(1));
  });
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.command === '--version') {
      await output(`${VERSION}\n`);
      return;
    }
    isolateEnvironment();
    // Absolute child deadline also bounds OAuth's listener (public loginOpenAI
    // has no AbortSignal argument). Exiting closes its loopback server/sockets.
    timer = setTimeout(
      () => {
        controller.abort();
        void fail(new ClientError('request-timeout')).finally(() => process.exit(1));
      },
      options.command === 'login' ? LIMITS.loginMs : LIMITS.requestMs,
    );
    network = installBoundedFetch({ signal: controller.signal });
    const prompt = options.command === 'planner-exec' ? await readPrompt(process.stdin) : undefined;
    const store = await createAuthStore();
    if (options.command === 'login') {
      await login({
        store,
        status: (status) => {
          void output(`${JSON.stringify({ type: 'login.status', status })}\n`);
        },
      });
    } else if (options.command === 'planner-preflight') {
      const checked = await preflight({ store, network, signal: controller.signal });
      const json = JSON.stringify(checked.metadata);
      if (Buffer.byteLength(json) > 16 * 1024) throw new ClientError('metadata-limit');
      await output(`${json}\n`);
    } else {
      const jsonl = await generate({
        ...options,
        prompt,
        store,
        network,
        signal: controller.signal,
      });
      await output(jsonl);
    }
  } catch (error) {
    process.exitCode = 1;
    await fail(error);
  } finally {
    clearTimeout(timer);
    controller.abort();
    await network?.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
  // All protocol writes have flushed. Especially important for the SDK's login
  // listener: no lingering loopback, keep-alive socket or browser child lifetime.
  process.exit(process.exitCode ?? 0);
}
