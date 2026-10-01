import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from 'ffmpeg-static';
import { bundleDigest, digest, ROOT } from './harness-runtime.mjs';
import { NOTICE, parseShowcaseArgs, runShowcase, validateReport } from './showcase.mjs';

const processOptions = {
  timeout: 10000,
  killSignal: 'SIGKILL',
  windowsHide: true,
  maxBuffer: 4 * 1024 * 1024,
};
function temporary(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'batchclip-showcase-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function probe(file) {
  return JSON.parse(
    execFileSync(
      ffprobe.path,
      ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', file],
      processOptions,
    ),
  ).streams[0];
}
function save(report, file) {
  writeFileSync(file, JSON.stringify(report));
}

// Tiny real ProRes files + synthetic report metadata test the postprocessor, NOT scene rendering.
function evidence(t, variants = [{ name: 'alpha', color: 'red', caseName: 'stack' }]) {
  const dir = temporary(t);
  const bundle = path.join(dir, 'bundle');
  mkdirSync(bundle);
  writeFileSync(path.join(bundle, 'index.html'), 'synthetic test bundle, not a Remotion render');
  const rendererConfiguration = { testOnly: true };
  const report = {
    schemaVersion: 1,
    mode: 'systems',
    status: 'passed',
    completedAt: new Date().toISOString(),
    errors: [],
    cleanup: { browserOpened: true, browserClosed: true },
    requested: { movies: true, mediaFrames: 0 },
    selectedCases: variants.length,
    bundle: { path: bundle, sha256: bundleDigest(bundle) },
    rendererConfiguration,
    rendererConfigurationHash: digest(rendererConfiguration),
    plans: [],
    entries: [],
  };
  for (const [
    i,
    { name, color, caseName, width = 320, height = 180, withAudio = false },
  ] of variants.entries()) {
    const output = path.join(dir, `movie ${i} ' [x];.mov`);
    execFileSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-nostdin',
        '-n',
        '-f',
        'lavfi',
        '-i',
        `color=c=${color}@0.5:s=${width}x${height}:r=30,format=yuva444p10le`,
        ...(withAudio ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : []),
        '-frames:v',
        '3',
        ...(withAudio ? ['-c:a', 'pcm_s16le', '-t', '0.1'] : ['-an']),
        '-c:v',
        'prores_ks',
        '-profile:v',
        '4',
        '-threads',
        '1',
        output,
      ],
      processOptions,
    );
    const composition = { width, height, fps: 30, durationInFrames: 3 };
    const inputProps = {
      scene: { kind: 'test-only', label: name },
      layout: 'stack',
      aspect: '9:16',
    };
    const inputHash = digest({ inputProps, composition });
    const id = `${name}:${caseName}:${inputHash}`;
    report.plans.push({ id, fixtureName: name, inputProps, composition, inputHash });
    const bytes = readFileSync(output);
    report.entries.push(
      {
        operation: 'media',
        status: 'passed',
        planId: id,
        output,
        control: false,
        inputHash,
        rendererConfigurationHash: report.rendererConfigurationHash,
        width,
        height,
        fps: 30,
        codec: 'prores-4444',
        fullMotion: true,
        audio: 'silent',
        renderedFrames: 3,
        requestedFrames: 3,
        frameRange: [0, 2],
        bytes: bytes.length,
        sha256: digest(bytes),
      },
      {
        operation: 'media-decode',
        status: 'passed',
        planId: id,
        output,
        control: false,
        video: probe(output),
      },
    );
  }
  const file = path.join(dir, 'report.json');
  save(report, file);
  return { dir, file, report };
}

function sample(file, frame) {
  return execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-nostdin',
      '-i',
      file,
      '-vf',
      `select=eq(n\\,${frame})`,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    processOptions,
  );
}

test('CLI options are strict, local-only and bounded', () => {
  assert(parseShowcaseArgs(['--help']).help);
  const options = parseShowcaseArgs([
    '--report',
    'run/report.json',
    '--report',
    'other/report.json',
    '--select',
    'STACK',
    '--dry-run',
  ]);
  assert.equal(options.report.length, 2);
  assert.deepEqual(options.select, ['STACK']);
  assert.equal(options['timeout-ms'], 600000);
  assert(options['dry-run']);
  for (const args of [[], ['report.json'], ['--download'], ['--report', '']])
    assert.throws(() => parseShowcaseArgs(args));
  for (const value of ['0', '999', '3600001', 'NaN', 'Infinity', '1.2', '1e4'])
    assert.throws(
      () => parseShowcaseArgs(['--report', 'report.json', '--timeout-ms', value]),
      /timeout-ms/,
    );
  assert.throws(() => parseShowcaseArgs(['--report', 'report.json', '--select', ' ']), /select/);
  for (const value of [
    'https://host/run',
    'file:/tmp/run',
    'pipe:0',
    '//server/run',
    '\\\\server\\run',
    '\\\\?\\C:\\run',
    'C:relative',
    'bad\npath',
    'bad\0path',
  ]) {
    for (const flag of ['--report', '--out'])
      assert.throws(
        () => parseShowcaseArgs(['--report', 'report.json', flag, value]),
        /local path|Local paths/,
      );
  }
});

test('accepts real full-motion ProRes bytes and their matching executed report metadata', async (t) => {
  const { file, report } = evidence(t);
  const result = await validateReport(file);
  assert.equal(result.movies.length, 1);
  assert.equal(result.movies[0].sha256, report.entries[0].sha256);
  assert.equal(result.movies[0].frames, 3);
  assert.equal(result.report.sha256, digest(readFileSync(file)));
});

test('declarations, failed/in-flight reports and incomplete execution never become movies', async (t) => {
  const { file, report } = evidence(t);
  const mutations = [
    (r) => {
      r.mode = 'motion';
    },
    ...['planned', 'running', 'failed', 'no-evidence'].map((status) => (r) => {
      r.status = status;
    }),
    (r) => {
      r.execution = 'not-started';
    },
    (r) => {
      delete r.completedAt;
    },
    (r) => {
      r.cleanup.browserClosed = false;
    },
    (r) => {
      r.errors.push('render error');
    },
    (r) => {
      r.entries = [];
    },
    (r) => {
      r.requested.movies = false;
    },
    (r) => {
      r.selectedCases++;
    },
    (r) => {
      r.entries[0].status = 'running';
    },
    (r) => {
      r.entries[0].fullMotion = false;
    },
    (r) => {
      r.entries[0].renderedFrames--;
    },
    (r) => {
      r.entries[0].requestedFrames--;
    },
    (r) => {
      r.entries[0].frameRange = [1, 3];
    },
    (r) => {
      r.entries[0].control = true;
    },
    (r) => {
      r.entries[0].inputHash = digest('stale props');
    },
    (r) => {
      r.plans[0].inputProps.scene.label = 'changed';
    },
    (r) => {
      r.rendererConfiguration.testOnly = false;
    },
    (r) => {
      r.entries.pop();
    },
    (r) => {
      r.entries[1].status = 'failed';
    },
    (r) => {
      r.entries[1].video.nb_read_frames = '2';
    },
    (r) => {
      r.entries.push({ ...r.entries[0] });
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(report);
    mutate(changed);
    save(changed, file);
    await assert.rejects(() => validateReport(file), undefined, mutate.toString());
  }
});

test('rejects stale bundle/movie hashes, missing artifacts, path escapes and remote paths', async (t) => {
  const { file, dir, report } = evidence(t);
  const movie = report.entries[0].output;
  const bytes = readFileSync(movie);
  const changed = Buffer.from(bytes);
  changed[changed.length - 1] ^= 1;
  writeFileSync(movie, changed);
  await assert.rejects(() => validateReport(file), /Movie hash changed/);
  writeFileSync(movie, bytes);
  const index = path.join(report.bundle.path, 'index.html');
  writeFileSync(index, 'changed bundle');
  await assert.rejects(() => validateReport(file), /Stale local bundle hash/);
  report.bundle.sha256 = bundleDigest(report.bundle.path);
  const external = path.join(temporary(t), 'external.mov');
  copyFileSync(movie, external);
  for (const output of [
    external,
    path.join(dir, 'missing.mov'),
    'https://host/movie.mov',
    'file:/tmp/movie.mov',
    'relative.mov',
  ]) {
    const other = structuredClone(report);
    other.entries[0].output = output;
    other.entries[1].output = output;
    save(other, file);
    await assert.rejects(() => validateReport(file));
  }
});

test('selection is deterministic, mixed sizes/duplicates/empty matches fail, dry-run writes nothing', async (t) => {
  const { file, dir } = evidence(t, [
    { name: 'zeta', color: 'blue', caseName: 'landscape' },
    { name: 'alpha', color: 'red', caseName: 'square', height: 320 },
  ]);
  const out = path.join(dir, 'must-not-exist');
  await assert.rejects(() => runShowcase(['--report', file, '--dry-run']), /Mixed dimensions/);
  await assert.rejects(
    () => runShowcase(['--report', file, '--select', 'missing', '--dry-run']),
    /no fixture\/case matches/,
  );
  const planned = await runShowcase([
    '--report',
    file,
    '--select',
    'SQUARE',
    '--out',
    out,
    '--dry-run',
  ]);
  assert.equal(planned.status, 'planned');
  assert.deepEqual(
    planned.inputs.map((m) => m.fixtureName),
    ['alpha'],
  );
  assert.equal(planned.output, undefined);
  assert(!existsSync(out));
  await assert.rejects(
    () => runShowcase(['--report', file, '--report', file, '--select', 'square', '--dry-run']),
    /Duplicate fixture\/case/,
  );
});

test('fresh probe rejects fake MOV bytes even if someone rewrites the report hash', async (t) => {
  const { file, dir, report } = evidence(t);
  const entry = report.entries[0];
  const fake = Buffer.from('Not a video; declaration and hash alone are not execution.');
  writeFileSync(entry.output, fake);
  entry.bytes = fake.length;
  entry.sha256 = digest(fake);
  save(report, file);
  const out = path.join(dir, 'must-not-exist');
  await assert.rejects(() => runShowcase(['--report', file, '--out', out, '--dry-run']));
  assert(!existsSync(out));
});

test('real tiny encode/concat burns notices, flattens alpha, retains dimensions, orders every frame and discards source audio', async (t) => {
  const { file, dir, report } = evidence(t, [
    { name: 'zeta-example', color: 'blue', caseName: 'vertical-stack', withAudio: true },
    { name: 'alpha-example', color: 'red', caseName: 'vertical-stack' },
  ]);
  const sourceStreams = JSON.parse(
    execFileSync(
      ffprobe.path,
      ['-v', 'error', '-show_streams', '-of', 'json', report.entries[0].output],
      processOptions,
    ),
  ).streams;
  assert(
    sourceStreams.some(
      (stream) => stream.codec_type === 'audio' && stream.codec_name === 'pcm_s16le',
    ),
  );
  const out = path.join(dir, "show case ' ; [x]");
  const result = await runShowcase(['--report', file, '--out', out, '--timeout-ms', '10000']);
  assert.equal(result.status, 'passed');
  assert.equal(result.notice, NOTICE);
  assert.match(result.audio, /Silent/);
  assert.deepEqual(
    result.inputs.map((m) => m.fixtureName),
    ['alpha-example', 'zeta-example'],
  );
  assert.deepEqual(
    result.inputs.map((m) => m.caption),
    ['alpha example\nvertical stack', 'zeta example\nvertical stack'],
  );
  assert.deepEqual(
    result.inputs.map((m) => m.planId),
    report.plans.map((p) => p.id).sort(),
  );
  assert(result.inputs.every((m) => m.caseName === 'vertical-stack'));
  assert.deepEqual(
    result.inputs.map((m) => [m.startFrame, m.endFrameExclusive]),
    [
      [0, 3],
      [3, 6],
    ],
  );
  const output = result.output.path;
  const video = probe(output);
  assert.equal(video.width, 320);
  assert.equal(video.height, 180);
  assert.equal(video.nb_read_frames, '6');
  assert.equal(video.pix_fmt, 'yuv420p');
  assert.equal(result.output.sha256, digest(readFileSync(output)));
  const streams = JSON.parse(
    execFileSync(
      ffprobe.path,
      ['-v', 'error', '-show_streams', '-of', 'json', output],
      processOptions,
    ),
  ).streams;
  assert.equal(streams.length, 1);
  const first = sample(output, 0);
  const second = sample(output, 3);
  const center = (90 * 320 + 160) * 3;
  assert(first[center] > first[center + 2] + 60, 'alpha/red fixture must be first');
  assert(second[center + 2] > second[center] + 60, 'zeta/blue fixture must be second');
  assert(first[center + 1] > 60, 'transparent red is composited onto cream, not black');
  const darkPixels = (y0, y1) => {
    let count = 0;
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < 320; x++) {
        const p = (y * 320 + x) * 3;
        if (first[p] < 80 && first[p + 1] < 80 && first[p + 2] < 80) count++;
      }
    return count;
  };
  assert(darkPixels(0, 20) > 50, 'notice backing actually burned into pixels');
  assert(darkPixels(155, 180) > 20, 'fixture/case caption backing actually burned into pixels');
  assert.equal(readFileSync(path.join(out, 'notice.txt'), 'utf8'), NOTICE);
  assert.equal(
    readFileSync(path.join(out, 'caption-0.txt'), 'utf8'),
    'alpha example\nvertical stack',
  );
  const saved = JSON.parse(readFileSync(path.join(out, 'manifest.json')));
  assert.equal(saved.status, 'passed');
  assert.deepEqual(saved.inputs, result.inputs);
  for (const entry of report.entries.filter((e) => e.operation === 'media'))
    assert.equal(digest(readFileSync(entry.output)), entry.sha256, 'inputs stay untouched');
  assert(!existsSync(path.join(out, 'showcase.partial.mp4')));
  await assert.rejects(() => runShowcase(['--report', file, '--out', out]), /not empty/);
  await assert.rejects(
    () => runShowcase(['--report', file, '--out', ROOT]),
    /outside the repository/,
  );
  assert(readdirSync(out).includes('manifest.json'));
});
