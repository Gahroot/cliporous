#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBounded, VITEST } from '../explainer-stills/verify-systems-e2e.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OWNER = '.planner-eval-owner';
const HELP =
  'npm run eval:planner -- [--mode dry-run|replay|live] [--corpus FILE] [--run-dir OWNED_DIR] [--repetitions 1|2] [--clip ID] [--split discovery|holdout] [--profile PROFILE_ID] [--fixture authored-responses-v1]\nThe named fixture only replays authored responses offline; it is not model evidence.\nLive preflight requires --model MODEL and uses --transport gg-chatgpt by default (text-only ChatGPT OAuth). Native executable/hash flags are refused in live mode; they remain available only for offline legacy identity. Generation requires a ready preflight and explicit --auto-reload-disabled true attestation. --reasoning low|medium|high|xhigh defaults to medium. No paid provider is supported.';

export function parseArgs(args) {
  const values = new Map();
  const allowed = [
    'mode',
    'corpus',
    'run-dir',
    'repetitions',
    'clip',
    'split',
    'transport',
    'codex-executable',
    'codex-sha256',
    'model',
    'reasoning',
    'auto-reload-disabled',
    'profile',
    'fixture',
  ];
  if (args.length === 1 && args[0] === '--help') return { help: true };
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]?.slice(2);
    const value = args[i + 1];
    if (
      !args[i]?.startsWith('--') ||
      !allowed.includes(name) ||
      values.has(name) ||
      !value ||
      value.startsWith('--') ||
      value.includes('\0')
    )
      throw new Error('Invalid or duplicate option. Use --help.');
    values.set(name, value);
  }
  const mode = values.get('mode') ?? 'dry-run';
  const repetitions = Number(values.get('repetitions') ?? 2);
  if (!['dry-run', 'replay', 'live'].includes(mode) || ![1, 2].includes(repetitions))
    throw new Error('Invalid mode or repetition count');
  const nativeIdentity = values.has('codex-executable') || values.has('codex-sha256');
  const transport =
    values.get('transport') ?? (nativeIdentity ? 'codex-subscription' : 'gg-chatgpt');
  if (!['gg-chatgpt', 'codex-subscription'].includes(transport))
    throw new Error('Only GG ChatGPT or offline legacy subscription identity is supported');
  if (mode === 'live' && (transport !== 'gg-chatgpt' || nativeIdentity || !values.get('model')))
    throw new Error(
      'Live preflight requires GG ChatGPT and a model, without native executable/hash flags',
    );
  const executableSha256 = values.get('codex-sha256');
  if (
    executableSha256 !== undefined &&
    (executableSha256.length !== 64 || !/^[a-f0-9]{64}$/.test(executableSha256))
  )
    throw new Error('Codex SHA-256 must be exactly 64 lowercase hex characters');
  if (
    values.has('reasoning') &&
    !['low', 'medium', 'high', 'xhigh'].includes(values.get('reasoning'))
  )
    throw new Error('Invalid reasoning level');
  if (values.has('auto-reload-disabled') && values.get('auto-reload-disabled') !== 'true')
    throw new Error('Auto-reload attestation must be explicitly true');
  const fixture = values.get('fixture');
  if (
    fixture &&
    (mode !== 'replay' ||
      fixture !== 'authored-responses-v1' ||
      values.has('transport') ||
      values.has('model') ||
      values.has('codex-executable') ||
      values.has('codex-sha256') ||
      values.has('reasoning') ||
      values.has('auto-reload-disabled'))
  )
    throw new Error('Authored fixtures require offline replay with no provider configuration');
  if (mode === 'replay' && !values.has('run-dir') && !fixture)
    throw new Error('Replay requires an owned run directory or named authored fixture');
  if (values.has('split') && !['discovery', 'holdout'].includes(values.get('split')))
    throw new Error('Invalid split');
  for (const name of ['clip', 'model', 'profile'])
    if (values.has(name) && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(values.get(name)))
      throw new Error(`Invalid ${name}`);
  return {
    mode,
    fixture,
    repetitions,
    profiles: values.has('profile') ? [values.get('profile')] : undefined,
    corpus: resolve(
      values.get('corpus') ?? join(ROOT, 'scripts/planner-eval/fixtures/authored-v1.json'),
    ),
    directory: values.get('run-dir'),
    clipId: values.get('clip'),
    split: values.get('split'),
    transport: fixture ? undefined : transport,
    codexExecutable: values.get('codex-executable'),
    executableSha256,
    model: values.get('model'),
    reasoning: values.get('reasoning'),
    autoReloadDisabled: values.has('auto-reload-disabled') ? true : undefined,
  };
}

export function prepareRunDirectory(requested) {
  if (requested && lstatSync(resolve(requested)).isSymbolicLink())
    throw new Error('Symlinked run directories are refused');
  const directory = requested
    ? realpathSync(resolve(requested))
    : mkdtempSync(join(tmpdir(), 'planner-eval-run-'));
  const rel = relative(ROOT, directory);
  if (!rel || (!rel.startsWith(`..`) && !isAbsolute(rel)))
    throw new Error('Evaluation artifacts must remain outside the repository');
  if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory())
    throw new Error('Invalid run directory');
  if (requested) {
    const marker = join(directory, OWNER);
    if (lstatSync(marker).isSymbolicLink() || readFileSync(marker, 'utf8') !== 'planner-eval-v1')
      throw new Error('Unowned run directory');
  } else writeFileSync(join(directory, OWNER), 'planner-eval-v1', { flag: 'wx', mode: 0o600 });
  return directory;
}

/** Content fingerprint, never sent to a model. Only known source/catalog/schema inputs. */
export function codeFingerprint() {
  const hash = createHash('sha256');
  function visit(path) {
    for (const name of readdirSync(path).sort()) {
      // Nested GG dependencies are pinned by their authored manifests/lockfile, not walked.
      if (name === 'node_modules') continue;
      const file = join(path, name);
      const info = lstatSync(file);
      if (info.isSymbolicLink()) throw new Error('Unexpected symlink in fingerprint inputs');
      if (info.isDirectory()) visit(file);
      else if (/\.(?:ts|tsx|mjs|json)$/.test(name) && !name.includes('.test.'))
        hash
          .update(relative(ROOT, file).replaceAll('\\', '/'))
          .update('\0')
          .update(readFileSync(file));
    }
  }
  for (const path of [
    'src/main/ai/explainer',
    'src/main/ai/planner-eval',
    'src/main/remotion/compositions/explainer',
    'src/main/render',
    'scripts/planner-eval',
  ])
    visit(join(ROOT, path));
  for (const file of [
    'src/main/ai/explainer-scenes.ts',
    'src/shared/segments.ts',
    'package-lock.json',
  ])
    hash.update(file).update(readFileSync(join(ROOT, file)));
  return hash.digest('hex');
}

/** Two-hour live wall budget (DEFAULT_RUN_LIMITS), then bounded cleanup grace.
 * Offline commands keep their existing 100s signal / 110s test / 120s process caps. */
export function evaluationTimeouts(mode) {
  const runMs = mode === 'live' ? 2 * 60 * 60 * 1000 : 100_000;
  return { runMs, testMs: runMs + 10_000, outerMs: runMs + 20_000 };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(HELP);
    return;
  }
  if (lstatSync(options.corpus).size > 1024 * 1024) throw new Error('Corpus exceeds 1 MiB');
  const directory = prepareRunDirectory(options.directory);
  const env = {};
  for (const key of [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'TEMP',
    'TMP',
  ])
    if (process.env[key]) env[key] = process.env[key];
  env.PLANNER_EVAL_OPTIONS = JSON.stringify({
    ...options,
    directory,
    codeFingerprint: codeFingerprint(),
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    await runBounded(
      process.execPath,
      [VITEST, 'run', '--config', join(ROOT, 'scripts/planner-eval/vitest.config.ts')],
      {
        env,
        signal: controller.signal,
        timeoutMs: evaluationTimeouts(options.mode).outerMs,
        maxBytes: 2 * 1024 * 1024,
        ownProcessGroup: true,
        onStdout: (chunk) => process.stdout.write(chunk),
        onStderr: (chunk) => process.stderr.write(chunk),
      },
    );
    console.log(`Planner evaluation artifacts: ${directory}`);
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Evaluation failed');
    process.exitCode = 1;
  }
}
