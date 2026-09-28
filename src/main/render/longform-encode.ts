// ---------------------------------------------------------------------------
// Long-form (16:9) encode primitives — leaf module.
//
// Shared FFmpeg encode helpers for the Hormozi long-form pipeline. Kept free
// of any dependency on the feature/pipeline modules so both can import it.
//
//   - encodeSpeakerSegment        — crop/scale/zoom/grade a source range → mp4
//   - muxRemotionVisualWithAudio  — Remotion card/header visual + source audio
//   - compositePhraseOverlays     — composite N alpha ProRes phrase overlays
//
// Every produced segment is normalized to the same parameters (yuv420p, CFR
// at the target fps, AAC 48 kHz) so the concat demuxer can stream-copy them.
// ---------------------------------------------------------------------------

import {
  disableGpuEncoderForSession,
  ffmpeg,
  getEncoder,
  getSoftwareEncoder,
  isGpuEncoderDisabled,
  isGpuSessionError,
  type QualityParams,
} from '../ffmpeg';
import type { SegmentLayoutResult } from '../layouts/segment-layouts';
import { toFFmpegPath } from './helpers';
import { xfadeTransitionFor } from './layout-transitions';
import { getIntermediateQuality } from './quality';
import { quantizeToFrames, xfadeOffsetArg } from './transition-easing';

// ---------------------------------------------------------------------------
// Shared output options
// ---------------------------------------------------------------------------

/** Normalized intermediate sink options — keep every segment concat-compatible. */
function intermediateSink(encoder: string, presetFlag: string[], fps: number): string[] {
  return [
    '-c:v',
    encoder,
    ...presetFlag,
    '-r',
    String(fps),
    '-fps_mode',
    'cfr',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-y',
  ];
}

function pickEncoder(qp: QualityParams): { encoder: string; presetFlag: string[] } {
  const detected = getEncoder(qp);
  const useSwFallback = isGpuEncoderDisabled() && detected.encoder !== 'libx264';
  const sw = useSwFallback ? getSoftwareEncoder(qp) : null;
  return sw
    ? { encoder: sw.encoder, presetFlag: sw.presetFlag }
    : { encoder: detected.encoder, presetFlag: detected.presetFlag };
}

// ---------------------------------------------------------------------------
// Speaker segment
// ---------------------------------------------------------------------------

export interface EncodeSpeakerSegmentOptions {
  sourceVideoPath: string;
  outputPath: string;
  /** Absolute source start time (seconds). */
  startTime: number;
  /** Segment duration (seconds). */
  duration: number;
  fps: number;
  /** Layout filter_complex (ends in `[outv]`). */
  layout: SegmentLayoutResult;
  /**
   * Extra filters chained after the layout's `[outv]`, in order (e.g. zoom,
   * color grade). Each entry is a bare filter string (no input/output labels).
   */
  extraFilters?: string[];
  /**
   * Per-encode progress callback. Receives 0–100 within THIS segment, derived
   * from FFmpeg's `time=` against the known `duration` (RF-006). Lets the
   * caller advance the bar smoothly mid-encode instead of jumping once per
   * segment.
   */
  onProgress?: ((percent: number) => void) | undefined;
}

/**
 * Encode a single speaker segment: seek the source to `startTime`, apply the
 * landscape layout + optional zoom/grade, and write a normalized intermediate.
 */
export function encodeSpeakerSegment(opts: EncodeSpeakerSegmentOptions): Promise<void> {
  const {
    sourceVideoPath,
    outputPath,
    startTime,
    duration,
    fps,
    layout,
    extraFilters,
    onProgress,
  } = opts;

  // Chain extras after the layout's [outv] → [fx0] → [fx1] … → [finalv].
  let currentLabel = 'outv';
  const extras: string[] = [];
  (extraFilters ?? []).forEach((f, i) => {
    if (!f) return;
    const next = `fx${i}`;
    extras.push(`[${currentLabel}]${f}[${next}]`);
    currentLabel = next;
  });

  let fullFilterComplex = layout.filterComplex;
  if (extras.length > 0) {
    fullFilterComplex += `;${extras.join(';')}`;
    fullFilterComplex += `;[${currentLabel}]format=yuv420p[finalv]`;
    currentLabel = 'finalv';
  }

  const qp = getIntermediateQuality();

  return new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false;

    const run = (encoder: string, presetFlag: string[], useHwAccel: boolean): void => {
      const cmd = ffmpeg(toFFmpegPath(sourceVideoPath));
      let stderr = '';
      if (useHwAccel) cmd.inputOptions(['-hwaccel', 'auto']);
      cmd.seekInput(startTime);
      cmd.duration(duration);
      cmd
        .outputOptions([
          '-filter_complex',
          fullFilterComplex,
          '-map',
          `[${currentLabel}]`,
          '-map',
          '0:a',
          ...intermediateSink(encoder, presetFlag, fps),
        ])
        .on('stderr', (line: string) => {
          stderr += `${line}\n`;
        })
        // FFmpeg's percent here is meaningful because `cmd.duration(duration)`
        // above sets the segment length the wrapper divides `time=` by. Cap at
        // 99 so the band only reaches its ceiling on the `end` event.
        .on('progress', (p: { percent?: number }) => onProgress?.(Math.min(99, p.percent ?? 0)))
        .on('end', () => {
          onProgress?.(100);
          resolve();
        })
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(`${err.message}\n${stderr}`)) {
            fallbackAttempted = true;
            disableGpuEncoderForSession();
            const fb = getSoftwareEncoder(qp);
            run(fb.encoder, fb.presetFlag, false);
          } else {
            const tail = stderr.split('\n').slice(-10).join('\n');
            reject(new Error(`${err.message}\n[stderr tail] ${tail}`));
          }
        })
        .save(toFFmpegPath(outputPath));
    };

    const { encoder, presetFlag } = pickEncoder(qp);
    run(encoder, presetFlag, true);
  });
}

// ---------------------------------------------------------------------------
// Remotion visual + source audio (concept cards / section headers)
// ---------------------------------------------------------------------------

export interface MuxRemotionVisualOptions {
  /** Pre-rendered Remotion clip (opaque mp4, no audio needed). */
  visualPath: string;
  /** Source video — supplies the narration audio under the card. */
  sourceVideoPath: string;
  outputPath: string;
  /** Absolute source start time (seconds) for the audio slice. */
  startTime: number;
  /** Segment duration (seconds). */
  duration: number;
  width: number;
  height: number;
  fps: number;
}

/**
 * Combine a Remotion-rendered card/header visual with the source narration
 * audio for the same time range, normalized for concat.
 */
export function muxRemotionVisualWithAudio(opts: MuxRemotionVisualOptions): Promise<void> {
  const { visualPath, sourceVideoPath, outputPath, startTime, duration, width, height, fps } = opts;
  const qp = getIntermediateQuality();

  // Normalize the visual: lock fps/sar/size and pad/trim to the exact duration.
  const filter =
    `[0:v]scale=${width}:${height}:flags=lanczos+accurate_rnd,setsar=1,fps=${fps},` +
    `format=yuv420p,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[v]`;

  return new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false;

    const run = (encoder: string, presetFlag: string[], useHwAccel: boolean): void => {
      const cmd = ffmpeg(toFFmpegPath(visualPath));
      let stderr = '';
      if (useHwAccel) cmd.inputOptions(['-hwaccel', 'auto']);
      // Input 1: source audio slice.
      cmd.input(toFFmpegPath(sourceVideoPath));
      cmd.inputOptions(['-ss', String(startTime), '-t', String(duration)]);
      cmd
        .outputOptions([
          '-filter_complex',
          filter,
          '-map',
          '[v]',
          '-map',
          '1:a',
          '-shortest',
          ...intermediateSink(encoder, presetFlag, fps),
        ])
        .on('stderr', (line: string) => {
          stderr += `${line}\n`;
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(`${err.message}\n${stderr}`)) {
            fallbackAttempted = true;
            disableGpuEncoderForSession();
            const fb = getSoftwareEncoder(qp);
            run(fb.encoder, fb.presetFlag, false);
          } else {
            const tail = stderr.split('\n').slice(-10).join('\n');
            reject(new Error(`${err.message}\n[stderr tail] ${tail}`));
          }
        })
        .save(toFFmpegPath(outputPath));
    };

    const { encoder, presetFlag } = pickEncoder(qp);
    run(encoder, presetFlag, true);
  });
}

// ---------------------------------------------------------------------------
// Timestamp-safe segment concatenation
// ---------------------------------------------------------------------------

export interface NormalizedConcatSegment {
  path: string;
  /** Authoritative timeline duration; media metadata must not extend this span. */
  duration: number;
  /**
   * What the segment shows. Boundaries touching a `graphic` segment get an
   * eased dissolve (when transitions are enabled); speaker→speaker stays a cut.
   */
  visual?: 'speaker' | 'graphic';
}

export interface NormalizedConcatOptions {
  /** Dissolve length at speaker↔graphic boundaries. Omit / 0 = hard cuts. */
  transitionSeconds?: number;
}

/** Seconds → fixed-precision filter arg. */
const s3 = (n: number): string => n.toFixed(3);

interface ConcatBoundary {
  /** Dissolve length in seconds (one frame for a hard cut). */
  duration: number;
  soft: boolean;
  /**
   * Which side is freeze-padded so the dissolve consumes no timeline:
   * `head` clones the incoming segment's first frame before it,
   * `tail` clones the outgoing segment's last frame after it.
   */
  pad: 'head' | 'tail';
}

/**
 * Plan every boundary. The speaker side always stays LIVE (lip-sync and the
 * 1:1 source-time mapping hold); the graphic side is the one frozen for the
 * length of the dissolve.
 */
function planBoundaries(
  segments: readonly NormalizedConcatSegment[],
  fps: number,
  transitionSeconds: number,
): ConcatBoundary[] {
  const frame = 1 / Math.max(1, fps);
  const boundaries: ConcatBoundary[] = [];
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const next = segments[i];
    if (!prev || !next) continue;
    const touchesGraphic = prev.visual === 'graphic' || next.visual === 'graphic';
    const pad = next.visual === 'graphic' ? 'head' : 'tail';
    // A head-padded dissolve starts inside the outgoing segment's live span,
    // so it can never be longer than a third of either neighbour.
    const limit = Math.min(prev.duration, next.duration) / 3;
    const want = quantizeToFrames(Math.min(transitionSeconds, limit), fps);
    const soft = touchesGraphic && transitionSeconds > 0 && want >= 2 * frame;
    boundaries.push({ duration: soft ? want : frame, soft, pad: soft ? pad : 'tail' });
  }
  return boundaries;
}

/**
 * Build an A/V graph that resets timestamps and enforces every planned span.
 *
 * Without transitions this is a plain `concat`. With `transitionSeconds`, the
 * video is chained through `xfade` (eased dissolve at graphic boundaries, a
 * one-frame blend elsewhere) while audio is still concatenated sample-exact.
 * Every dissolve is covered by a freeze-pad on the graphic side, so each
 * segment's LIVE content starts at exactly the same output time as with a
 * plain concat — the final timeline still equals source time.
 */
export function buildNormalizedConcatFilter(
  segments: readonly NormalizedConcatSegment[],
  fps: number,
  options: NormalizedConcatOptions = {},
): string {
  const steps: string[] = [];
  const inputs: string[] = [];
  const boundaries = planBoundaries(segments, fps, options.transitionSeconds ?? 0);
  const useXfade = segments.length > 1 && boundaries.some((b) => b.soft);

  segments.forEach((segment, index) => {
    const duration = s3(Math.max(0.001, segment.duration));
    let pads = '';
    if (useXfade) {
      const incoming = boundaries[index - 1];
      const outgoing = boundaries[index];
      const headFrames = incoming?.pad === 'head' ? Math.round(incoming.duration * fps) : 0;
      const tailFrames = outgoing?.pad === 'tail' ? Math.round(outgoing.duration * fps) : 0;
      if (headFrames > 0 || tailFrames > 0) {
        // Pad in whole frames, then renumber timestamps by frame index and cut
        // to an exact frame count. On FFmpeg 6.0, duration-based `tpad` leaves
        // a timestamp hole and chained pads overshoot by a frame, which shifts
        // every later xfade offset.
        const total = Math.round(Math.max(0.001, segment.duration) * fps) + headFrames + tailFrames;
        pads +=
          `,tpad=start_mode=clone:start=${headFrames}:stop_mode=clone:stop=${tailFrames}` +
          `,setpts=N/${fps}/TB,trim=end_frame=${total}`;
      }
    }
    steps.push(
      `[${index}:v]fps=${fps},tpad=stop_mode=clone:stop_duration=${duration},` +
        `trim=duration=${duration},setpts=PTS-STARTPTS${pads},format=yuv420p[v${index}]`,
    );
    steps.push(
      `[${index}:a]aresample=48000,apad=pad_dur=${duration},` +
        `atrim=duration=${duration},asetpts=PTS-STARTPTS[a${index}]`,
    );
    inputs.push(`[v${index}][a${index}]`);
  });

  if (!useXfade) {
    steps.push(`${inputs.join('')}concat=n=${segments.length}:v=1:a=1[outv][outa]`);
    return steps.join(';');
  }

  // Video: xfade chain. `cumulative` is the plain-concat start of segment i.
  const dissolve = xfadeTransitionFor('smooth-dissolve') ?? 'fade';
  let label = 'v0';
  let cumulative = 0;
  boundaries.forEach((b, k) => {
    const i = k + 1;
    cumulative += segments[k]?.duration ?? 0;
    const offset = b.pad === 'head' ? cumulative - b.duration : cumulative;
    const out = i === segments.length - 1 ? 'outv' : `vx${i}`;
    steps.push(
      `[${label}][v${i}]xfade=transition=${b.soft ? dissolve : 'fade'}:` +
        `duration=${s3(b.duration)}:offset=${xfadeOffsetArg(offset, fps)}` +
        `${out === 'outv' ? ',format=yuv420p' : ''}[${out}]`,
    );
    label = out;
  });

  // Audio: sample-exact concat, untouched by the video transitions.
  steps.push(
    `${segments.map((_, i) => `[a${i}]`).join('')}concat=n=${segments.length}:v=0:a=1[outa]`,
  );
  return steps.join(';');
}

/**
 * Decode and rebuild segment timestamps before the overlay passes. Stream-copying
 * mixed Remotion/hardware/software H.264 segments can preserve a stale frame for
 * minutes at a codec or timestamp boundary, so this seam is intentionally encoded.
 */
export function concatNormalizedSegments(
  segments: readonly NormalizedConcatSegment[],
  outputPath: string,
  fps: number,
  options: NormalizedConcatOptions = {},
): Promise<void> {
  if (segments.length === 0) {
    return Promise.reject(new Error('Cannot concatenate an empty segment list.'));
  }

  const filterComplex = buildNormalizedConcatFilter(segments, fps, options);
  const qp = getIntermediateQuality();

  return new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false;

    const run = (encoder: string, presetFlag: string[], useHwAccel: boolean): void => {
      const cmd = ffmpeg();
      let stderr = '';
      for (const segment of segments) {
        cmd.input(toFFmpegPath(segment.path));
        if (useHwAccel) cmd.inputOptions(['-hwaccel', 'auto']);
      }

      cmd
        .outputOptions([
          '-filter_complex',
          filterComplex,
          '-map',
          '[outv]',
          '-map',
          '[outa]',
          ...intermediateSink(encoder, presetFlag, fps),
        ])
        .on('stderr', (line: string) => {
          stderr += `${line}\n`;
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(`${err.message}\n${stderr}`)) {
            fallbackAttempted = true;
            disableGpuEncoderForSession();
            const fallback = getSoftwareEncoder(qp);
            run(fallback.encoder, fallback.presetFlag, false);
          } else {
            const tail = stderr.split('\n').slice(-10).join('\n');
            reject(new Error(`${err.message}\n[stderr tail] ${tail}`));
          }
        })
        .save(toFFmpegPath(outputPath));
    };

    const gpuDisabled = isGpuEncoderDisabled();
    const selected = gpuDisabled ? getSoftwareEncoder(qp) : getEncoder(qp);
    run(selected.encoder, selected.presetFlag, !gpuDisabled && selected.encoder !== 'libx264');
  });
}

// ---------------------------------------------------------------------------
// Phrase overlay compositing
// ---------------------------------------------------------------------------

export interface PhraseOverlayInput {
  /** Alpha ProRes (.mov) clip for this phrase. */
  overlayPath: string;
  /** Absolute timeline start (seconds) on the concatenated video. */
  startTime: number;
  /** Absolute timeline end (seconds). */
  endTime: number;
}

export interface CompositePhraseOverlaysOptions {
  inputPath: string;
  outputPath: string;
  overlays: PhraseOverlayInput[];
  /** Final encode quality (the user's selected preset). */
  qualityParams: QualityParams;
}

/**
 * Composite N alpha phrase overlays onto the base video in a single encode.
 * Each overlay input is time-shifted with `-itsoffset` so its first frame
 * lands at the phrase start, and gated with `enable='between(t,start,end)'`.
 */
export function compositePhraseOverlays(opts: CompositePhraseOverlaysOptions): Promise<void> {
  const { inputPath, outputPath, overlays, qualityParams } = opts;

  return new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false;

    const run = (encoder: string, presetFlag: string[], useHwAccel: boolean): void => {
      const cmd = ffmpeg(toFFmpegPath(inputPath));
      let stderr = '';
      if (useHwAccel) cmd.inputOptions(['-hwaccel', 'auto']);

      // Each overlay is an input shifted to its phrase start.
      for (const ov of overlays) {
        cmd.input(toFFmpegPath(ov.overlayPath));
        cmd.inputOptions(['-itsoffset', ov.startTime.toFixed(3)]);
      }

      // Build the overlay chain: [0:v][1:v]overlay…[v1];[v1][2:v]overlay…[v2]…
      const steps: string[] = [];
      let prev = '0:v';
      overlays.forEach((ov, i) => {
        const inIdx = i + 1;
        const outLabel = `v${i + 1}`;
        const enable = `between(t\\,${ov.startTime.toFixed(3)}\\,${ov.endTime.toFixed(3)})`;
        steps.push(
          `[${prev}][${inIdx}:v]overlay=(W-w)/2:(H-h)/2:eof_action=pass:enable='${enable}'[${outLabel}]`,
        );
        prev = outLabel;
      });
      // Normalize pixel format on a separate node — appending a filter after a
      // labelled pad ([outv]) is invalid filtergraph syntax.
      steps.push(`[${prev}]format=yuv420p[outv]`);
      const filterComplex = steps.join(';');

      cmd
        .outputOptions([
          '-filter_complex',
          filterComplex,
          '-map',
          '[outv]',
          '-map',
          '0:a',
          '-c:v',
          encoder,
          ...presetFlag,
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'copy',
          '-movflags',
          '+faststart',
          '-y',
        ])
        .on('stderr', (line: string) => {
          stderr += `${line}\n`;
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(`${err.message}\n${stderr}`)) {
            fallbackAttempted = true;
            disableGpuEncoderForSession();
            const fb = getSoftwareEncoder(qualityParams);
            run(fb.encoder, fb.presetFlag, false);
          } else {
            const tail = stderr.split('\n').slice(-10).join('\n');
            reject(new Error(`${err.message}\n[stderr tail] ${tail}`));
          }
        })
        .save(toFFmpegPath(outputPath));
    };

    const gpuDisabled = isGpuEncoderDisabled();
    const { encoder, presetFlag } = gpuDisabled
      ? getSoftwareEncoder(qualityParams)
      : getEncoder(qualityParams);
    run(encoder, presetFlag, true);
  });
}

// ---------------------------------------------------------------------------
// Delos pop-up card compositing (upper-left, additive overlay layer)
// ---------------------------------------------------------------------------

export interface DelosCardOverlayInput {
  /** Alpha ProRes (.mov) clip for this card (authored portrait, card-centered). */
  overlayPath: string;
  /** Absolute timeline start (seconds) on the concatenated video. */
  startTime: number;
  /** Absolute timeline end (seconds). */
  endTime: number;
}

export interface CompositeDelosCardsOptions {
  inputPath: string;
  outputPath: string;
  overlays: DelosCardOverlayInput[];
  /** Output frame width (landscape, e.g. 1920). */
  width: number;
  /** Output frame height (landscape, e.g. 1080). */
  height: number;
  /** Final encode quality (the user's selected preset). */
  qualityParams: QualityParams;
}

/**
 * Composite N alpha Delos cards onto the base video in a single encode.
 *
 * Each card's transparent Remotion canvas matches the 16:9 output and places
 * the card in the upper-left. The lower-third therefore remains clear for a
 * simultaneous phrase overlay. Each input is time-shifted with `-itsoffset`
 * and gated with `enable=between`.
 */
export function compositeDelosCards(opts: CompositeDelosCardsOptions): Promise<void> {
  const { inputPath, outputPath, overlays, width, height, qualityParams } = opts;

  return new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false;

    const run = (encoder: string, presetFlag: string[], useHwAccel: boolean): void => {
      const cmd = ffmpeg(toFFmpegPath(inputPath));
      let stderr = '';
      if (useHwAccel) cmd.inputOptions(['-hwaccel', 'auto']);

      for (const ov of overlays) {
        cmd.input(toFFmpegPath(ov.overlayPath));
        cmd.inputOptions(['-itsoffset', ov.startTime.toFixed(3)]);
      }

      // Normalize each transparent canvas to the frame, preserving its authored
      // upper-left placement, then layer it without an extra positional drift.
      const steps: string[] = [];
      let prev = '0:v';
      overlays.forEach((ov, i) => {
        const inIdx = i + 1;
        const scaled = `c${i}`;
        const outLabel = `v${i + 1}`;
        const enable = `between(t,${ov.startTime.toFixed(3)},${ov.endTime.toFixed(3)})`;
        steps.push(`[${inIdx}:v]scale=${width}:${height}[${scaled}]`);
        steps.push(
          `[${prev}][${scaled}]overlay=0:0:eof_action=pass:enable='${enable}'[${outLabel}]`,
        );
        prev = outLabel;
      });
      steps.push(`[${prev}]format=yuv420p[outv]`);
      const filterComplex = steps.join(';');

      cmd
        .outputOptions([
          '-filter_complex',
          filterComplex,
          '-map',
          '[outv]',
          '-map',
          '0:a',
          '-c:v',
          encoder,
          ...presetFlag,
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'copy',
          '-movflags',
          '+faststart',
          '-y',
        ])
        .on('stderr', (line: string) => {
          stderr += `${line}\n`;
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(`${err.message}\n${stderr}`)) {
            fallbackAttempted = true;
            disableGpuEncoderForSession();
            const fb = getSoftwareEncoder(qualityParams);
            run(fb.encoder, fb.presetFlag, false);
          } else {
            const tail = stderr.split('\n').slice(-10).join('\n');
            reject(new Error(`${err.message}\n[stderr tail] ${tail}`));
          }
        })
        .save(toFFmpegPath(outputPath));
    };

    const gpuDisabled = isGpuEncoderDisabled();
    const { encoder, presetFlag } = gpuDisabled
      ? getSoftwareEncoder(qualityParams)
      : getEncoder(qualityParams);
    run(encoder, presetFlag, true);
  });
}
