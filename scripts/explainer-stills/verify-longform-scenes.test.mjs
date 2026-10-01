import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AUDIO_RATE,
  assertAudioSample,
  assertVideoProbe,
  meanPixelDifference,
  sourceFileDigest,
  TONE_STEP,
} from './longform-scenes-media.mjs';
import { parseLongformProofArgs } from './verify-longform-scenes.mjs';

test('media requires an explicit approved bundle; unit/stress never imply a build', () => {
  assert.throws(() => parseLongformProofArgs([], {}), /requires --bundle/);
  assert.throws(() => parseLongformProofArgs(['--bundle'], {}), /requires a local/);
  assert.throws(() => parseLongformProofArgs(['--unit', '--install'], {}), /Unknown/);
  assert.equal(parseLongformProofArgs(['--unit', '--stress'], {}).repetitions, 4);
  assert.equal(
    parseLongformProofArgs([], { BATCHCLIP_LONGFORM_BUNDLE: 'approved' }).bundle,
    'approved',
  );
});

test('924s stress is explicit and repetition limits never silently truncate', () => {
  assert.equal(parseLongformProofArgs(['--unit', '--long-stress'], {}).repetitions, 22);
  for (const count of [1, 22, 24])
    assert.equal(
      parseLongformProofArgs(['--unit', '--repetitions', String(count)], {}).repetitions,
      count,
    );
  for (const count of ['', '0', '25', '-1', '1.5', 'NaN', '22junk'])
    assert.throws(
      () => parseLongformProofArgs(['--unit', '--repetitions', count], {}),
      /integer from 1 to 24/,
    );
  assert.throws(
    () => parseLongformProofArgs(['--unit', '--stress', '--long-stress'], {}),
    /only one/,
  );
  assert.throws(() => parseLongformProofArgs(['--long-stress'], {}), /requires --bundle/);
});

test('cancellation/alpha is an explicit separate small media proof', () => {
  assert.equal(
    parseLongformProofArgs(['--cancel-alpha', '--bundle', 'approved'], {}).cancelAlpha,
    true,
  );
  assert.throws(() => parseLongformProofArgs(['--cancel-alpha'], {}), /requires --bundle/);
  for (const flag of ['--unit', '--stress', '--long-stress'])
    assert.throws(
      () => parseLongformProofArgs(['--cancel-alpha', flag], {}),
      /separate small media proof/,
    );
});

test('large-source streaming hash preserves SHA-256, detects edits and rejects missing files', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'longform-hash-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'source.bin');
  const bytes = Buffer.alloc(3 * 1024 * 1024 + 17, 0x5a);
  await writeFile(path, bytes);
  const original = createHash('sha256').update(bytes).digest('hex');
  assert.equal(await sourceFileDigest(path), original);
  bytes[bytes.length - 1] = 0;
  await writeFile(path, bytes);
  assert.notEqual(await sourceFileDigest(path), original);
  await assert.rejects(sourceFileDigest(join(directory, 'missing.bin')), { code: 'ENOENT' });
});

function tones({ swap = false, silence = false, shift = 0, time = 0.75 } = {}) {
  const samples = Buffer.alloc(AUDIO_RATE * 0.35 * 8);
  for (let frame = 0; frame < samples.length / 8; frame++) {
    for (let channel = 0; channel < 2; channel++) {
      const frequency =
        ((swap ? 1 - channel : channel) === 0 ? 440 : 880) +
        TONE_STEP * Math.floor(time / 4) +
        shift;
      samples.writeFloatLE(
        silence ? 0 : 0.18 * Math.sin((2 * Math.PI * frequency * frame) / AUDIO_RATE),
        frame * 8 + channel * 4,
      );
    }
  }
  return samples;
}

test('audio proof rejects silence, channel swaps and a displaced tone interval', () => {
  const original = tones();
  assert.equal(assertAudioSample(original, original, 0.75).channels.length, 2);
  assert.throws(() => assertAudioSample(original, tones({ silence: true }), 0.75));
  assert.throws(() => assertAudioSample(original, tones({ swap: true }), 0.75));
  assert.throws(() => assertAudioSample(original, tones({ shift: 110 }), 0.75));
});

test('924s/max-duration audio remains in band and rejects adjacent wrong-time samples', () => {
  for (const time of [0.75, 168.75, 920.75, 1004.75]) {
    const original = tones({ time });
    const sample = assertAudioSample(original, original, time);
    assert.ok(sample.channels.every((channel) => channel.frequency < 5000));
    assert.throws(() => assertAudioSample(original, tones({ time, shift: TONE_STEP }), time));
    assert.throws(() => assertAudioSample(original, tones({ time, swap: true }), time));
  }
});

test('media contract rejects wrong dimensions, frame count, duration and missing audio', () => {
  const probe = {
    streams: [
      {
        codec_type: 'video',
        width: 1920,
        height: 1080,
        avg_frame_rate: '30/1',
        nb_read_frames: '1260',
      },
      { codec_type: 'audio', channels: 2, sample_rate: '48000' },
    ],
    format: { duration: '42' },
  };
  assert.equal(assertVideoProbe(probe, 42).frames, 1260);
  for (const patch of [{ width: 1080 }, { avg_frame_rate: '25/1' }, { nb_read_frames: '1258' }]) {
    assert.throws(() =>
      assertVideoProbe(
        { ...probe, streams: [{ ...probe.streams[0], ...patch }, probe.streams[1]] },
        42,
      ),
    );
  }
  assert.throws(() => assertVideoProbe({ ...probe, format: { duration: '41.9' } }, 42));
  assert.throws(() => assertVideoProbe({ ...probe, streams: [probe.streams[0]] }, 42));
  assert.equal(meanPixelDifference(Buffer.from([0, 10]), Buffer.from([0, 20])), 5);
});
