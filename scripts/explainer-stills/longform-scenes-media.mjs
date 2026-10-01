import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const PROOF_FPS = 30;
export const AUDIO_RATE = 48_000;
// Unique four-second intervals through the maximum 1008s fixture, all below 5kHz.
// The old 110Hz increment exceeded AAC's passband/Nyquist during a 15-minute source.
export const TONE_STEP = 16;

/** Hash large source media with bounded buffers instead of allocating the whole video. */
export async function sourceFileDigest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path, { highWaterMark: 1024 * 1024 }))
    hash.update(chunk);
  return hash.digest('hex');
}

/** Distinct stereo tones change every four seconds, so cuts/channel swaps are detectable. */
export function sourceAudioFilter(duration) {
  return `aevalsrc=0.18*sin(2*PI*(440+${TONE_STEP}*floor(t/4))*t)|0.18*sin(2*PI*(880+${TONE_STEP}*floor(t/4))*t):s=${AUDIO_RATE}:d=${duration}`;
}

export function assertVideoProbe(probe, seconds) {
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  assert.ok(video && audio, 'Both source picture and audio must survive');
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.avg_frame_rate, '30/1');
  assert.equal(Number(video.nb_read_frames), Math.round(seconds * PROOF_FPS));
  assert.ok(
    Math.abs(Number(probe.format.duration) - seconds) <= 1 / PROOF_FPS,
    'Output duration differs by more than one frame',
  );
  assert.equal(audio.channels, 2);
  assert.equal(Number(audio.sample_rate), AUDIO_RATE);
  return {
    width: video.width,
    height: video.height,
    fps: video.avg_frame_rate,
    frames: Number(video.nb_read_frames),
    duration: Number(probe.format.duration),
    audioChannels: audio.channels,
  };
}

/** f32le stereo, sampled away from tone transitions. Compare original and export,
 * not just presence of an audio stream; silence, channel swaps and wrong-time tones fail. */
export function assertAudioSample(reference, output, absoluteTime) {
  assert.ok(
    reference.length > 8_000 && output.length === reference.length,
    'Audio sample missing or truncated',
  );
  const frames = output.length / 8;
  const result = [];
  for (let channel = 0; channel < 2; channel++) {
    const frequency = (channel === 0 ? 440 : 880) + TONE_STEP * Math.floor(absoluteTime / 4);
    const otherFrequency = (channel === 0 ? 880 : 440) + TONE_STEP * Math.floor(absoluteTime / 4);
    let energy = 0;
    let originalEnergy = 0;
    let dot = 0;
    let re = 0;
    let im = 0;
    let otherRe = 0;
    let otherIm = 0;
    for (let frame = 0; frame < frames; frame++) {
      const value = output.readFloatLE(frame * 8 + channel * 4);
      const original = reference.readFloatLE(frame * 8 + channel * 4);
      const phase = (2 * Math.PI * frame) / AUDIO_RATE;
      energy += value * value;
      originalEnergy += original * original;
      dot += value * original;
      re += value * Math.cos(phase * frequency);
      im += value * Math.sin(phase * frequency);
      otherRe += value * Math.cos(phase * otherFrequency);
      otherIm += value * Math.sin(phase * otherFrequency);
    }
    const amplitude = (2 * Math.hypot(re, im)) / frames;
    const crosstalk = (2 * Math.hypot(otherRe, otherIm)) / frames;
    const correlation = dot / Math.sqrt(energy * originalEnergy);
    assert.ok(
      amplitude > 0.12 && crosstalk < 0.015,
      `Original channel ${channel} tone lost/swapped at ${absoluteTime}s`,
    );
    assert.ok(
      correlation > 0.95,
      `Source audio timing/content changed at ${absoluteTime}s: ${correlation}`,
    );
    const rmsRatio = Math.sqrt(energy / originalEnergy);
    assert.ok(rmsRatio > 0.9 && rmsRatio < 1.1, 'Original audio level changed');
    result.push({ channel, frequency, amplitude, crosstalk, correlation, rmsRatio });
  }
  return { absoluteTime, frames, channels: result };
}

export function meanPixelDifference(first, second) {
  assert.ok(first.length > 0 && first.length === second.length);
  let sum = 0;
  for (let index = 0; index < first.length; index++) sum += Math.abs(first[index] - second[index]);
  return sum / first.length;
}
