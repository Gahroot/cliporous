import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import ffprobe from '@ffprobe-installer/ffprobe';
import { ROOT } from './harness-runtime.mjs';
import { pngEvidence } from './verification-evidence.mjs';

export function boundedJson(file) {
  assert(statSync(file).size <= 32 * 1024 * 1024, 'Report exceeds 32 MiB');
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Canonical containment prevents report-controlled paths reading arbitrary local files. */
export function artifactPath(value, directory) {
  assert(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 4096 &&
      !value.includes('\0') &&
      !/^[a-z][a-z\d+.-]*:\/\//i.test(value),
    'Invalid artifact path',
  );
  const base = realpathSync(directory);
  const file = realpathSync(path.resolve(base, value));
  const relative = path.relative(base, file);
  assert(
    relative &&
      !relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative),
    'Artifact outside report directory',
  );
  const repoRelative = path.relative(realpathSync(ROOT), file);
  assert(
    repoRelative === '..' ||
      repoRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(repoRelative),
    'Media must be outside git',
  );
  assert(statSync(file).isFile(), 'Artifact must be a regular file');
  return file;
}

export function fileSha256(file) {
  const size = statSync(file).size;
  assert(size > 0 && size <= 4 * 1024 ** 3, 'Artifact size outside 1 byte–4 GiB');
  const fd = openSync(file, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    while (true) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

export function validateVideoProbe(probe, expected) {
  assert(Array.isArray(probe.streams) && probe.streams.length <= 16, 'Invalid stream list');
  const video = probe.streams.find((s) => s.codec_type === 'video');
  assert(
    video && video.width === expected.width && video.height === expected.height,
    'Non-native video dimensions',
  );
  assert(video.r_frame_rate === '30/1' && video.avg_frame_rate === '30/1', 'Video must be CFR30');
  const frames = Number(video.nb_read_frames);
  assert(Number.isSafeInteger(frames) && frames > 0, 'Missing decoded frame count');
  assert.equal(frames, expected.frames, 'Incomplete motion');
  const duration = Number(video.duration);
  assert(
    Number.isFinite(duration) && Math.abs(duration - frames / 30) <= 1 / 30,
    'Invalid video duration',
  );
  if (expected.alpha)
    assert(
      video.codec_name === 'prores' &&
        /4444/.test(video.profile) &&
        /^yuva444p/.test(video.pix_fmt),
      'Missing ProRes4444 alpha',
    );
  return { width: video.width, height: video.height, frames };
}

export function probeArtifact(entry, directory, expected) {
  const file = artifactPath(entry.path ?? entry.output, directory);
  assert(
    /^[a-f0-9]{64}$/.test(entry.sha256 ?? '') && fileSha256(file) === entry.sha256,
    'Artifact hash mismatch',
  );
  const probe = JSON.parse(
    execFileSync(
      ffprobe.path,
      ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', file],
      { timeout: 120000, maxBuffer: 1024 * 1024 },
    ).toString(),
  );
  return { path: file, sha256: entry.sha256, ...validateVideoProbe(probe, expected) };
}

export function pngArtifact(entry, directory, expected) {
  const file = artifactPath(entry.output, directory);
  assert(statSync(file).size <= 64 * 1024 * 1024, 'PNG exceeds 64 MiB');
  const evidence = pngEvidence(file, expected.width, expected.height);
  assert.equal(evidence.sha256, entry.sha256, 'PNG hash mismatch');
  const bytes = readFileSync(file);
  let offset = 8;
  const compressed = [];
  let channels;
  let ended = false;
  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, 'Truncated PNG chunk');
    const length = bytes.readUInt32BE(offset);
    assert(length <= bytes.length - offset - 12, 'Invalid PNG chunk length');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    let crc = 0xffffffff;
    for (const value of bytes.subarray(offset + 4, offset + 8 + length)) {
      crc ^= value;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    assert.equal(
      (crc ^ 0xffffffff) >>> 0,
      bytes.readUInt32BE(offset + 8 + length),
      'PNG CRC mismatch',
    );
    if (offset === 8) {
      assert(
        type === 'IHDR' &&
          length === 13 &&
          data[8] === 8 &&
          data[10] === 0 &&
          data[11] === 0 &&
          data[12] === 0,
        'Unsupported native PNG encoding',
      );
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[data[9]];
      assert(channels, 'Unsupported PNG color type');
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') {
      assert(length === 0 && offset + 12 === bytes.length, 'Invalid PNG terminator');
      ended = true;
    }
    offset += 12 + length;
  }
  assert(ended && compressed.length, 'PNG lacks pixels');
  const stride = expected.width * channels + 1;
  const pixels = inflateSync(Buffer.concat(compressed), {
    maxOutputLength: stride * expected.height,
  });
  assert.equal(pixels.length, stride * expected.height, 'Incomplete PNG pixels');
  for (let y = 0; y < expected.height; y++)
    assert(pixels[y * stride] <= 4, 'Invalid PNG row filter');
  return { path: file, ...evidence };
}
