#!/usr/bin/env node
/** Postprocess completed local systems evidence. Never builds, renders scenes, or downloads. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from 'ffmpeg-static';
import { FPS, LIMITS } from './fixture-schema.mjs';
import { bundleDigest, digest, localBundle, outputDirectory, ROOT } from './harness-runtime.mjs';

export const NOTICE = 'AUTHORED EXAMPLES | SILENT | NOT A REAL-USER BENCHMARK';
export const HELP = `Local captioned showcase from completed verify-systems.mjs reports.
  --report FILE       Required; repeatable local report.json (original artifact paths required)
  --select TEXT       Case-insensitive fixture:case substring; repeatable OR, each must match
  --out DIR           Fresh empty directory outside git; default fresh OS temporary directory
  --timeout-ms N      Per FFmpeg/ffprobe deadline, 1000..3600000 (default 600000)
  --dry-run           Validate hashes and probe selected movies; no output or transcode
  --help
All report plans must have passed full-motion MOV + media-decode evidence, not partial windows.
Current local bundle, input props and ALL candidate MOV hashes must still match the reports.
Selected movies sort by fixture:case ID; duplicates and mixed dimensions/fps are rejected.
No scaling/cropping: stack stages remain 1080x960, NOT production 1080x1920 clips.
Alpha is flattened onto cream for MP4. Fixture/case captions and an authored/silent notice
are burned in; existing phase labels remain. Source audio is discarded. No narration or music.
Production SFX is verified separately by verify-systems-e2e.mjs.
Example:
  node scripts/explainer-stills/showcase.mjs --report C:/temp/run/report.json --select vertical-stack --dry-run`;

function localPath(value) {
  assert(
    typeof value === 'string' && value.trim() && ![...value].some((c) => c.charCodeAt(0) < 32),
    'Expected a nonempty local path without control characters',
  );
  const drive = process.platform === 'win32' && /^[a-z]:[\\/]/i.test(value);
  assert(
    !/^[\\/]{2}/.test(value) && (!/^[a-z][a-z0-9+.-]*:/i.test(value) || drive),
    'Local paths only: URLs, protocols, UNC/device paths and drive-relative paths are forbidden',
  );
  return path.resolve(value);
}

function localFile(file) {
  const resolved = realpathSync(localPath(file));
  localPath(resolved); // Also reject symlinks/junctions resolving to network paths.
  assert(statSync(resolved).isFile(), `Not a regular local file: ${file}`);
  return resolved;
}

export function parseShowcaseArgs(args) {
  const { values } = parseArgs({
    args,
    options: {
      report: { type: 'string', multiple: true, default: [] },
      select: { type: 'string', multiple: true, default: [] },
      out: { type: 'string' },
      'timeout-ms': { type: 'string', default: '600000' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  assert(values.help || values.report.length, '--report FILE is required; see --help');
  for (const file of [...values.report, ...(values.out === undefined ? [] : [values.out])])
    localPath(file);
  assert(
    values.select.every((s) => s.trim()),
    '--select must be nonempty',
  );
  assert(/^\d+$/.test(values['timeout-ms']), '--timeout-ms must be an integer');
  values['timeout-ms'] = Number(values['timeout-ms']);
  assert(
    Number.isSafeInteger(values['timeout-ms']) &&
      values['timeout-ms'] >= 1000 &&
      values['timeout-ms'] <= 3600000,
    '--timeout-ms must be 1000..3600000',
  );
  return values;
}

// MOVs can be large; unlike tiny JSON/PNG evidence, never buffer a whole movie in memory.
async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function execute(binary, args, timeout, cwd) {
  return execFileSync(binary, args, {
    cwd,
    timeout,
    killSignal: 'SIGKILL',
    windowsHide: true,
    shell: false,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function probe(file, timeout, requireSilent = false) {
  const { streams } = JSON.parse(
    execute(
      ffprobe.path,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file',
        '-f',
        'mov',
        '-threads',
        '2',
        '-count_frames',
        '-show_streams',
        '-of',
        'json',
        file,
      ],
      timeout,
    ),
  );
  const videos = streams?.filter((stream) => stream.codec_type === 'video');
  assert(videos?.length === 1, 'Expected exactly one video stream');
  // Remotion may mux silent PCM into ProRes. Input audio is always discarded with -an.
  assert(
    !requireSilent || streams.every((stream) => stream.codec_type !== 'audio'),
    'Showcase output must not contain audio',
  );
  return videos[0];
}

function checkVideo(video, expected, codec) {
  assert(video?.codec_name === codec, `Expected ${codec} video`);
  for (const field of ['width', 'height'])
    assert.equal(video[field], expected[field], `Movie ${field} differs from evidence`);
  assert.equal(
    Number(video.nb_read_frames),
    expected.frames,
    'Movie frame count differs from evidence',
  );
  const [n, d] = String(video.avg_frame_rate).split('/').map(Number);
  assert.equal(n / d, expected.fps, 'Movie fps differs from evidence');
  if (codec === 'prores') {
    assert.match(video.profile, /4444/, 'Expected ProRes 4444');
    assert.match(video.pix_fmt, /^yuva444p(?:10|12)le$/, 'Expected ProRes alpha');
  }
}

/** Fail closed on unfinished reports, missing cases, stale inputs/bundles and changed/missing movies.
 * Reports are local provenance, not authenticated attestations of renderer quality or source freshness. */
export async function validateReport(file) {
  const reportPath = localFile(file);
  const bytes = readFileSync(reportPath);
  const report = JSON.parse(bytes);
  assert(
    report.schemaVersion === 1 &&
      report.mode === 'systems' &&
      report.status === 'passed' &&
      report.execution !== 'not-started' &&
      Number.isFinite(Date.parse(report.completedAt)) &&
      Array.isArray(report.errors) &&
      report.errors.length === 0 &&
      !report.failure &&
      report.cleanup?.browserOpened === true &&
      report.cleanup.browserClosed === true,
    `${reportPath}: expected a completed, passed systems report`,
  );
  assert(
    report.requested?.movies === true &&
      Array.isArray(report.plans) &&
      report.plans.length > 0 &&
      report.selectedCases === report.plans.length &&
      Array.isArray(report.entries) &&
      report.entries.length > 0 &&
      report.entries.every((e) => e.status === 'passed'),
    'Report has missing/partial execution evidence',
  );
  assert.equal(
    digest(report.rendererConfiguration),
    report.rendererConfigurationHash,
    'Stale renderer configuration hash',
  );
  const bundle = localBundle(localPath(report.bundle?.path));
  localPath(realpathSync(bundle));
  assert.equal(bundleDigest(bundle), report.bundle.sha256, 'Stale local bundle hash');
  const media = report.entries.filter((e) => e.operation === 'media' && e.control !== true);
  assert.equal(media.length, report.plans.length, 'Missing/duplicate full-motion movies');
  const ids = new Set();
  const outputs = new Set();
  const movies = [];
  for (const plan of report.plans) {
    const hash = digest({ inputProps: plan.inputProps, composition: plan.composition });
    const match = /^([a-z0-9][a-z0-9_-]{0,79}):([a-z0-9][a-z0-9_-]{0,79}):([a-f0-9]{64})$/i.exec(
      plan.id,
    );
    assert(
      match && match[1] === plan.fixtureName && match[3] === hash && plan.inputHash === hash,
      'Stale/invalid plan ID or input hash',
    );
    assert(!ids.has(plan.id), 'Duplicate plan ID');
    ids.add(plan.id);
    const { width, height, fps, durationInFrames: frames } = plan.composition;
    assert(
      [width, height].every((n) => Number.isSafeInteger(n) && n >= 2 && n <= 8192 && n % 2 === 0) &&
        fps === FPS &&
        Number.isSafeInteger(frames) &&
        frames > 1 &&
        frames <= LIMITS.durationSec * FPS,
      'Invalid composition dimensions/fps/full-motion duration',
    );
    const candidates = media.filter((e) => e.planId === plan.id);
    assert.equal(candidates.length, 1, 'Missing/duplicate plan movie');
    const entry = candidates[0];
    assert(
      entry.control === false &&
        entry.fullMotion === true &&
        entry.audio === 'silent' &&
        entry.codec === 'prores-4444' &&
        entry.renderedFrames === frames &&
        entry.requestedFrames === frames &&
        entry.inputHash === hash &&
        entry.rendererConfigurationHash === report.rendererConfigurationHash &&
        entry.width === width &&
        entry.height === height &&
        entry.fps === fps,
      'Movie is partial or has mismatched execution metadata',
    );
    assert.deepEqual(entry.frameRange, [0, frames - 1], 'Movie must cover the entire composition');
    assert(path.isAbsolute(entry.output), 'Artifact must use its original absolute local path');
    const output = localFile(entry.output);
    const relative = path.relative(path.dirname(reportPath), output);
    assert(
      relative &&
        !relative.startsWith('..') &&
        !path.isAbsolute(relative) &&
        path.extname(output).toLowerCase() === '.mov',
      'MOV must be inside its report directory',
    );
    assert(!outputs.has(output), 'Duplicate movie artifact');
    outputs.add(output);
    assert.equal(statSync(output).size, entry.bytes, 'Movie bytes changed');
    assert.equal(await fileHash(output), entry.sha256, 'Movie hash changed');
    const decodes = report.entries.filter(
      (e) =>
        e.operation === 'media-decode' &&
        e.planId === plan.id &&
        e.output === entry.output &&
        e.control === false,
    );
    assert.equal(decodes.length, 1, 'Missing/duplicate successful media-decode evidence');
    const movie = {
      report: reportPath,
      planId: plan.id,
      fixtureName: plan.fixtureName,
      caseName: match[2],
      inputHash: hash,
      file: output,
      sha256: entry.sha256,
      bytes: entry.bytes,
      width,
      height,
      fps,
      frames,
    };
    checkVideo(decodes[0].video, movie, 'prores');
    movies.push(movie);
  }
  return { report: { path: reportPath, sha256: digest(bytes), bundle: report.bundle }, movies };
}

function filterFor(movie, captionFile) {
  const { width, height, fps, fixtureName, caseName } = movie;
  const margin = Math.max(2, Math.round(height / 96));
  const noticeSize = Math.max(2, Math.floor(Math.min(width / 60, height / 40)));
  const captionSize = Math.max(
    2,
    Math.floor(
      Math.min(height / 40, width / (Math.max(fixtureName.length, caseName.length) * 0.75 + 4)),
    ),
  );
  const text = (file, size, y) =>
    `drawtext=fontfile=font.ttf:textfile=${file}:expansion=none:fontsize=${size}:fontcolor=white:box=1:boxcolor=0x23100c@0.85:boxborderw=${margin}:x=(w-text_w)/2:y=${y}`;
  return `color=c=0xf6ecd9:s=${width}x${height}:r=${fps}[bg];[0:v]setpts=PTS-STARTPTS[fg];[bg][fg]overlay=shortest=1:format=auto,format=yuv420p,setsar=1,${text('notice.txt', noticeSize, margin * 2)},${text(captionFile, captionSize, `h-text_h-${margin * 2}`)}[v]`;
}

export async function runShowcase(args = process.argv.slice(2)) {
  const options = parseShowcaseArgs(args);
  if (options.help) {
    console.log(HELP);
    return;
  }
  assert(!process.env.FFMPEG_BIN, 'Unset FFMPEG_BIN: only installed ffmpeg-static is supported');
  localFile(ffmpeg);
  localFile(ffprobe.path);
  const reports = [];
  let movies = [];
  for (const file of options.report) {
    const validated = await validateReport(file);
    reports.push(validated.report);
    movies.push(...validated.movies);
  }
  const key = (m) => `${m.fixtureName}:${m.caseName}`.toLowerCase();
  for (const q of options.select)
    assert(
      movies.some((m) => key(m).includes(q.toLowerCase())),
      `--select ${q}: no fixture/case matches`,
    );
  if (options.select.length)
    movies = movies.filter((m) => options.select.some((q) => key(m).includes(q.toLowerCase())));
  movies.sort((a, b) => (a.planId < b.planId ? -1 : a.planId > b.planId ? 1 : 0));
  assert(
    new Set(movies.map(key)).size === movies.length,
    'Duplicate fixture/case selection across reports',
  );
  const dimensions = new Set(movies.map((m) => `${m.width}x${m.height}@${m.fps}`));
  assert(
    dimensions.size === 1,
    `Mixed dimensions/fps (${[...dimensions].join(', ')}); use --select to choose one size`,
  );
  for (const movie of movies) checkVideo(probe(movie.file, options['timeout-ms']), movie, 'prores');
  let frames = 0;
  const inputs = movies.map((m) => {
    const startFrame = frames;
    frames += m.frames;
    return {
      ...m,
      startFrame,
      endFrameExclusive: frames,
      caption: `${m.fixtureName}\n${m.caseName}`.replaceAll('-', ' '),
    };
  });
  const manifest = {
    schemaVersion: 1,
    status: options['dry-run'] ? 'planned' : 'running',
    notice: NOTICE,
    audio:
      'Silent; source audio discarded, no narration/music. Production SFX: verify-systems-e2e.mjs (separate).',
    limits:
      'Authored fixture material, not a real-user recording or benchmark. Hashes pin local evidence, not current source/bundle correspondence or visual approval. Alpha flattened onto cream; dimensions retained. Caption placement needs visual review.',
    reports,
    inputs,
  };
  if (options['dry-run']) {
    console.log(JSON.stringify(manifest, null, 2));
    return manifest;
  }
  const out = outputDirectory(options.out, 'batchclip-showcase-');
  const manifestPath = path.join(out, 'manifest.json');
  const save = () => writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  save();
  try {
    copyFileSync(
      localFile(path.join(ROOT, 'resources/fonts/Inter-Bold.ttf')),
      path.join(out, 'font.ttf'),
    );
    writeFileSync(path.join(out, 'notice.txt'), NOTICE, { flag: 'wx' });
    const parts = [];
    for (const [i, movie] of inputs.entries()) {
      // Only generated basenames enter FFmpeg filter/concat syntax, never user paths or text.
      const captionFile = `caption-${i}.txt`;
      const part = `part-${i}.mp4`;
      writeFileSync(path.join(out, captionFile), movie.caption, { flag: 'wx' });
      assert.equal(await fileHash(movie.file), movie.sha256, 'Movie changed after validation');
      execute(
        ffmpeg,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-n',
          '-xerror',
          '-protocol_whitelist',
          'file',
          '-f',
          'mov',
          '-noautorotate',
          '-threads',
          '2',
          '-i',
          movie.file,
          '-filter_complex_threads',
          '1',
          '-filter_complex',
          filterFor(movie, captionFile),
          '-map',
          '[v]',
          '-an',
          '-map_metadata',
          '-1',
          '-map_chapters',
          '-1',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-threads',
          '2',
          part,
        ],
        options['timeout-ms'],
        out,
      );
      checkVideo(probe(path.join(out, part), options['timeout-ms'], true), movie, 'h264');
      parts.push(part);
    }
    writeFileSync(path.join(out, 'concat.txt'), parts.map((p) => `file '${p}'\n`).join(''), {
      flag: 'wx',
    });
    const partial = path.join(out, 'showcase.partial.mp4');
    execute(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-n',
        '-xerror',
        '-protocol_whitelist',
        'file',
        '-f',
        'concat',
        '-safe',
        '1',
        '-i',
        'concat.txt',
        '-map',
        '0:v:0',
        '-an',
        '-c:v',
        'copy',
        '-map_metadata',
        '-1',
        '-map_chapters',
        '-1',
        '-metadata',
        `comment=${NOTICE}`,
        '-movflags',
        '+faststart',
        partial,
      ],
      options['timeout-ms'],
      out,
    );
    const video = probe(partial, options['timeout-ms'], true);
    checkVideo(video, { ...movies[0], frames }, 'h264');
    const sha256 = await fileHash(partial);
    const output = path.join(out, 'showcase.mp4');
    renameSync(partial, output);
    manifest.output = { path: output, sha256, bytes: statSync(output).size, video };
    manifest.status = 'passed';
    console.log(`Silent authored showcase: ${output}\nManifest: ${manifestPath}`);
  } catch (error) {
    manifest.status = 'failed';
    manifest.error = error.message;
    throw error;
  } finally {
    save();
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runShowcase().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
