#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleDigest, localBundle } from '../explainer-stills/harness-runtime.mjs';
import { runBounded, VITEST } from '../explainer-stills/verify-systems-e2e.mjs';
import { codeFingerprint, parseArgs, prepareRunDirectory, ROOT } from './run.mjs';

export function proofFrames(duration, windows, frameCount) {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 120.12 ||
    !Array.isArray(windows) ||
    windows.length > 16 ||
    !Number.isInteger(frameCount) ||
    frameCount < 1 ||
    frameCount > 3605
  )
    throw new Error('Invalid render evidence');
  const maxFrame = frameCount - 1;
  const frames = new Set([0, Math.min(44, maxFrame), maxFrame]);
  for (const window of windows) {
    if (
      !Number.isFinite(window.startTime) ||
      !Number.isFinite(window.endTime) ||
      window.startTime < 0 ||
      window.endTime > duration + 0.12 ||
      window.endTime <= window.startTime
    )
      throw new Error('Invalid proof window');
    for (const time of [
      window.startTime - 1 / 30,
      window.startTime + 1 / 30,
      (window.startTime + window.endTime) / 2,
      window.endTime - 1 / 30,
      window.endTime + 1 / 30,
    ])
      frames.add(Math.max(0, Math.min(maxFrame, Math.round(time * 30))));
  }
  return [...frames].sort((a, b) => a - b);
}

async function captureEvidence(output, env, signal) {
  const require = createRequire(import.meta.url);
  const ffmpeg = require('ffmpeg-static');
  const ffprobe = require('@ffprobe-installer/ffprobe').path;
  const proofPath = join(output, 'render-proof.json');
  if (lstatSync(proofPath).size > 1024 * 1024) throw new Error('Render proof exceeds size limit');
  const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
  const video = join(output, 'preview.mp4');
  const options = { env, signal, timeoutMs: 120_000, maxBytes: 1024 * 1024, ownProcessGroup: true };
  const info = await runBounded(
    ffprobe,
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,width,height,r_frame_rate,duration,nb_frames:format=duration',
      '-of',
      'json',
      video,
    ],
    options,
  );
  const streams = JSON.parse(info.stdout.toString()).streams;
  const picture = streams?.find((stream) => stream.codec_type === 'video');
  const audio = streams?.find((stream) => stream.codec_type === 'audio');
  if (
    picture?.width !== 1080 ||
    picture?.height !== 1920 ||
    picture?.r_frame_rate !== '30/1' ||
    !Number.isFinite(Number(audio?.duration)) ||
    !Number.isFinite(Number(picture?.duration)) ||
    Math.abs(Number(audio.duration) - Number(picture.duration)) > 0.12
  )
    throw new Error('Audio/video timing or output invariant failed');
  const selected = proofFrames(proof.metadata?.duration, proof.windows, Number(picture.nb_frames));
  const select = `select=${selected.map((frame) => `eq(n\\,${frame})`).join('+')}`;
  await runBounded(
    ffmpeg,
    [
      '-hide_banner',
      '-nostdin',
      '-n',
      '-i',
      video,
      '-vf',
      select,
      '-fps_mode',
      'vfr',
      '-frames:v',
      String(selected.length),
      join(output, 'boundary-%02d.png'),
    ],
    options,
  );
  await runBounded(
    ffmpeg,
    [
      '-hide_banner',
      '-nostdin',
      '-n',
      '-i',
      video,
      '-vf',
      `${select},scale=270:480,tile=4x${Math.ceil(selected.length / 4)}:nb_frames=${selected.length}`,
      '-frames:v',
      '1',
      join(output, 'contact-sheet.png'),
    ],
    options,
  );
  if (
    selected.some(
      (_, index) => !existsSync(join(output, `boundary-${String(index + 1).padStart(2, '0')}.png`)),
    )
  )
    throw new Error('A requested boundary frame was not produced');
  const black = await runBounded(
    ffmpeg,
    [
      '-hide_banner',
      '-nostdin',
      '-i',
      video,
      '-vf',
      'blackdetect=d=0.05:pix_th=0.04',
      '-an',
      '-f',
      'null',
      '-',
    ],
    options,
  );
  const blackIntervals = black.stderr
    .toString()
    .split(/\r?\n/)
    .filter((line) => line.includes('black_start:'));
  writeFileSync(
    join(output, 'media-check.json'),
    JSON.stringify(
      {
        version: 1,
        streams,
        frameSeconds: selected.map((frame) => frame / 30),
        blackIntervals,
        visualInspection: 'not yet performed',
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  if (blackIntervals.length)
    throw new Error('Black intervals detected; inspect retained render evidence');
}

export async function renderFinalists(args = process.argv.slice(2)) {
  const values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (
      ![
        '--run-dir',
        '--trial',
        '--corpus',
        '--media',
        '--bundle',
        '--out-dir',
        '--model',
        '--transport',
        '--codex-executable',
        '--codex-sha256',
        '--reasoning',
        '--auto-reload-disabled',
        '--fixture',
      ].includes(key) ||
      values.has(key) ||
      !value ||
      value.includes('\0')
    )
      throw new Error(
        'Use --run-dir DIR --trial SHA256 --corpus FILE --media FILE --bundle SNAPSHOT [--out-dir OWNED_DIR] [--model SAVED_MODEL] [--transport SAVED_TRANSPORT] [--codex-executable SAVED_EXE]',
      );
    values.set(key, value);
  }
  for (const key of ['--run-dir', '--trial', '--corpus', '--media', '--bundle'])
    if (!values.has(key)) throw new Error(`Missing ${key}`);
  if (!/^[a-f0-9]{64}$/.test(values.get('--trial'))) throw new Error('Invalid saved trial ID');
  // Reuse the evaluation CLI's identity validation, but force replay: never authenticate/replan.
  const identity = parseArgs([
    '--mode',
    'replay',
    ...[
      '--run-dir',
      '--fixture',
      '--model',
      '--transport',
      '--codex-executable',
      '--codex-sha256',
      '--reasoning',
      '--auto-reload-disabled',
    ].flatMap((key) => (values.has(key) ? [key, values.get(key)] : [])),
  ]);
  const fixture = identity.fixture;
  const directory = prepareRunDirectory(values.get('--run-dir'));
  const output = prepareRunDirectory(values.get('--out-dir'));
  const corpus = resolve(values.get('--corpus'));
  const media = resolve(values.get('--media'));
  const bundle = localBundle(values.get('--bundle'));
  const bundleSha256 = bundleDigest(bundle);
  if (
    lstatSync(corpus).size > 1024 * 1024 ||
    !lstatSync(media).isFile() ||
    !existsSync(join(bundle, 'index.html'))
  )
    throw new Error('Invalid corpus, media or bundle snapshot');
  if (existsSync(join(output, 'preview.mp4')) || existsSync(join(output, 'render-proof.json')))
    throw new Error('Preview output already exists; refusing overwrite');
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
  env.PLANNER_EVAL_RENDER = JSON.stringify({
    directory,
    output,
    corpus,
    media,
    bundle,
    fixture,
    trial: values.get('--trial'),
    model: identity.model,
    transport: identity.transport,
    codexExecutable: identity.codexExecutable,
    executableSha256: identity.executableSha256,
    reasoning: identity.reasoning,
    autoReloadDisabled: identity.autoReloadDisabled,
    codeFingerprint: codeFingerprint(),
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    await runBounded(
      process.execPath,
      [VITEST, 'run', '--config', join(ROOT, 'scripts/planner-eval/vitest.render.config.ts')],
      {
        env,
        signal: controller.signal,
        timeoutMs: 20 * 60 * 1000,
        maxBytes: 4 * 1024 * 1024,
        ownProcessGroup: true,
        onStdout: (chunk) => process.stdout.write(chunk),
        onStderr: (chunk) => process.stderr.write(chunk),
      },
    );
    if (bundleDigest(bundle) !== bundleSha256) throw new Error('Bundle changed during render');
    writeFileSync(
      join(output, 'bundle-identity.json'),
      JSON.stringify({ path: bundle, sha256: bundleSha256 }),
      { flag: 'wx' },
    );
    await captureEvidence(output, env, controller.signal);
    console.log(`Saved-plan render proof: ${output}`);
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await renderFinalists();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Saved-plan render failed');
    process.exitCode = 1;
  }
}
