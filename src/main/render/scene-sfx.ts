// ---------------------------------------------------------------------------
// Scene SFX — tasteful sound layer for animated explainer scenes
// ---------------------------------------------------------------------------
//
// Explainer scenes emit `SceneCue`s (tick, slide, thump, …). This module turns
// them into a mixed audio track:
//
//   planSceneSfx     PURE  cues → placements (guardrails, levels, rotation)
//   buildSfxMixArgs  PURE  placements → ffmpeg argv (video stream copied)
//   mixSceneSfx      I/O   resolve files, run ffmpeg, cancellable
//
// Sound files live in `resources/sfx/scene/` (see README.md there for sources
// and licences). Every file is pre-mastered soft, low and ≤ 1.5 s, lowpassed
// and loudness-matched (~-20 LUFS), so the per-kind levels below are the only
// balance control needed.
//
// The caller must only mix when the video HAS an audio stream: the filter
// graph reads `[0:a]`, so a silent (no audio stream) video makes ffmpeg fail
// and `mixSceneSfx` returns `{ ok: false }`.
// ---------------------------------------------------------------------------

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { ffmpeg } from '../ffmpeg';
import { log } from '../logger';
import {
  SCENE_CUE_KINDS,
  type SceneCue,
  type SceneCueKind,
} from '../remotion/compositions/explainer/types';
import { toFFmpegPath } from './helpers';
import { activeCommands } from './overlay-runner';

// ---------------------------------------------------------------------------
// Library + tuning
// ---------------------------------------------------------------------------

/** Files per cue kind, relative to `resources/sfx/scene/`. Rotated in order. */
export const SCENE_SFX_FILES: Readonly<Record<SceneCueKind, readonly string[]>> = {
  tick: ['tick-1.mp3', 'tick-2.mp3', 'tick-3.mp3', 'tick-4.mp3'],
  slide: ['slide-1.mp3', 'slide-2.mp3', 'slide-3.mp3'],
  thump: ['thump-1.mp3', 'thump-2.mp3', 'thump-3.mp3'],
  pop: ['pop-1.mp3', 'pop-2.mp3'],
  flip: ['flip-1.mp3', 'flip-2.mp3'],
  whoosh: ['whoosh-1.mp3'],
  rise: ['rise-1.mp3'],
};

/** Base level per kind in dB relative to the voice (before gain / master). */
export const SCENE_SFX_BASE_DB: Readonly<Record<SceneCueKind, number>> = {
  tick: -26,
  slide: -24,
  pop: -24,
  flip: -23,
  whoosh: -27,
  thump: -20,
  rise: -28,
};

/** Higher wins when two cues collide. */
const PRIORITY: Readonly<Record<SceneCueKind, number>> = {
  thump: 7,
  flip: 6,
  pop: 5,
  slide: 4,
  tick: 3,
  whoosh: 2,
  rise: 1,
};

/** Minimum gap between any two placed cues (s). */
export const SCENE_SFX_MIN_GAP = 0.22;
/** Cues later than `clipDuration - TAIL_GUARD` are dropped (s). */
const TAIL_GUARD = 0.05;
/** Float tolerance for the spacing rules (1.22 - 1 < 0.22 in IEEE-754). */
const EPS = 1e-6;
/** Minimum spacing between two cues of a rate-limited kind (s). */
const KIND_MIN_SPACING: Partial<Record<SceneCueKind, number>> = {
  thump: 6,
  rise: 10,
};

// ---------------------------------------------------------------------------
// Planning (pure)
// ---------------------------------------------------------------------------

export interface SfxPlacement {
  /** File name in `resources/sfx/scene/` (plan) or an absolute path (mix). */
  file: string;
  /** Seconds from clip start. */
  at: number;
  /** Volume applied to the file, dB. */
  gainDb: number;
}

interface Candidate {
  kind: SceneCueKind;
  at: number;
  gain: number;
  index: number;
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function isCueKind(kind: unknown): kind is SceneCueKind {
  return (SCENE_CUE_KINDS as readonly unknown[]).includes(kind);
}

/**
 * Turn scene cues into SFX placements. Pure and deterministic.
 *
 * Guardrails: cues outside `[0, clipDuration - 0.05]` (or with gain ≤ 0) are
 * dropped; any two placed cues are ≥ 0.22 s apart, collisions resolved by a
 * fixed priority (thump > flip > pop > slide > tick > whoosh > rise, then the
 * earlier cue); at most one `thump` per 6 s and one `rise` per 10 s. Level =
 * per-kind base + 20·log10(gain) + masterDb. Repeated kinds rotate through
 * their files in time order.
 */
export function planSceneSfx(
  cues: SceneCue[],
  opts: { clipDuration: number; masterDb?: number },
): SfxPlacement[] {
  const masterDb = Number.isFinite(opts.masterDb) ? (opts.masterDb as number) : 0;
  const lastAt = opts.clipDuration - TAIL_GUARD;

  const candidates: Candidate[] = [];
  cues.forEach((cue, index) => {
    if (!cue || !isCueKind(cue.kind)) return;
    if (!Number.isFinite(cue.at) || cue.at < 0 || cue.at > lastAt + EPS) return;
    const gain = cue.gain === undefined ? 1 : Math.min(1, cue.gain);
    if (!Number.isFinite(gain) || gain <= 0) return;
    candidates.push({ kind: cue.kind, at: cue.at, gain, index });
  });

  // Strongest first, then earliest, then input order — a greedy pass in this
  // order keeps the stronger (or earlier, on a tie) of any colliding pair.
  const byStrength = [...candidates].sort(
    (a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || a.at - b.at || a.index - b.index,
  );

  const accepted: Candidate[] = [];
  for (const c of byStrength) {
    const tooClose = accepted.some((a) => Math.abs(a.at - c.at) < SCENE_SFX_MIN_GAP - EPS);
    if (tooClose) continue;
    const kindGap = KIND_MIN_SPACING[c.kind];
    if (
      kindGap !== undefined &&
      accepted.some((a) => a.kind === c.kind && Math.abs(a.at - c.at) < kindGap - EPS)
    ) {
      continue;
    }
    accepted.push(c);
  }

  accepted.sort((a, b) => a.at - b.at || a.index - b.index);

  const rotation: Partial<Record<SceneCueKind, number>> = {};
  const placements: SfxPlacement[] = [];
  for (const c of accepted) {
    const files = SCENE_SFX_FILES[c.kind];
    if (files.length === 0) continue;
    const n = rotation[c.kind] ?? 0;
    rotation[c.kind] = n + 1;
    placements.push({
      file: files[n % files.length],
      at: c.at,
      gainDb: roundTo(SCENE_SFX_BASE_DB[c.kind] + 20 * Math.log10(c.gain) + masterDb, 2),
    });
  }
  return placements;
}

// ---------------------------------------------------------------------------
// ffmpeg argv (pure)
// ---------------------------------------------------------------------------

/**
 * Build the ffmpeg argv that mixes `placements` (absolute file paths) under
 * the video's own audio. Video is stream-copied; audio re-encoded AAC 192k.
 *
 * Windows-safe: no shell is involved (spawn argv) and the graph contains no
 * expressions — only plain `volume=<n>dB` and `adelay=<ms>|<ms>`.
 * `amix duration=first` keeps the output exactly as long as the voice track;
 * `alimiter level=disabled` stops the limiter from auto-gaining the voice.
 * Requires the video to have an audio stream (`[0:a]`).
 */
export function buildSfxMixArgs(
  videoPath: string,
  placements: SfxPlacement[],
  outputPath: string,
): string[] {
  const args: string[] = ['-hide_banner', '-i', toFFmpegPath(videoPath)];
  for (const p of placements) args.push('-i', toFFmpegPath(p.file));

  const chains = placements.map((p, i) => {
    const ms = Math.max(0, Math.round(p.at * 1000));
    const db = roundTo(p.gainDb, 2);
    return `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,lowpass=f=7000,volume=${db}dB,adelay=${ms}|${ms}[s${i}]`;
  });
  const labels = placements.map((_, i) => `[s${i}]`).join('');
  chains.push(
    `[0:a]${labels}amix=inputs=${placements.length + 1}:duration=first:normalize=0:dropout_transition=0,alimiter=limit=0.95:level=disabled[aout]`,
  );

  args.push(
    '-filter_complex',
    chains.join(';'),
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-y',
    toFFmpegPath(outputPath),
  );
  return args;
}

// ---------------------------------------------------------------------------
// Mixing (I/O)
// ---------------------------------------------------------------------------

/** Directory holding the scene SFX (packaged: `<resources>/sfx/scene`). */
export function resolveSceneSfxDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'sfx', 'scene');
  }
  return join(process.cwd(), 'resources', 'sfx', 'scene');
}

export type MixSceneSfxResult =
  | { ok: true; outputPath: string; placed: number }
  | { ok: false; error: string };

/**
 * Mix scene cues into `videoPath`, writing `opts.outputPath`.
 *
 * Never throws. Missing SFX files are skipped with a warning. When nothing is
 * placed, ffmpeg is not run and `outputPath` is the untouched `videoPath` —
 * the caller keeps the original file. The ffmpeg process is registered with
 * the render pipeline's `activeCommands`, so `cancelRender()` kills it; an
 * aborted `signal` does the same.
 */
export async function mixSceneSfx(
  videoPath: string,
  cues: SceneCue[],
  opts: { clipDuration: number; outputPath: string; masterDb?: number; signal?: AbortSignal },
): Promise<MixSceneSfxResult> {
  const started = Date.now();
  const elapsed = (): number => Date.now() - started;

  try {
    if (opts.signal?.aborted) return { ok: false, error: 'aborted' };

    const planned = planSceneSfx(cues, {
      clipDuration: opts.clipDuration,
      masterDb: opts.masterDb,
    });

    const dir = resolveSceneSfxDir();
    const placements: SfxPlacement[] = [];
    const missing = new Set<string>();
    for (const p of planned) {
      const abs = join(dir, p.file);
      if (!existsSync(abs)) {
        missing.add(p.file);
        continue;
      }
      placements.push({ ...p, file: abs });
    }
    if (missing.size > 0) {
      log('warn', 'SceneSfx', 'Skipping missing scene SFX files', { dir, files: [...missing] });
    }

    if (placements.length === 0) {
      log('info', 'SceneSfx', 'No scene SFX placed; keeping original audio', {
        cues: cues.length,
        planned: planned.length,
        elapsedMs: elapsed(),
      });
      return { ok: true, outputPath: videoPath, placed: 0 };
    }

    if (opts.outputPath === videoPath) {
      return { ok: false, error: 'outputPath must differ from videoPath' };
    }

    const args = buildSfxMixArgs(videoPath, placements, opts.outputPath);
    log('info', 'SceneSfx', 'Mixing scene SFX', {
      cues: cues.length,
      placed: placements.length,
      inputs: placements.length + 1,
    });

    const error = await runFfmpeg(args, opts.signal);
    if (error) {
      removeQuietly(opts.outputPath);
      log('warn', 'SceneSfx', 'Scene SFX mix failed', { error, elapsedMs: elapsed() });
      return { ok: false, error };
    }

    log('info', 'SceneSfx', 'Scene SFX mixed', {
      placed: placements.length,
      outputPath: opts.outputPath,
      elapsedMs: elapsed(),
    });
    return { ok: true, outputPath: opts.outputPath, placed: placements.length };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log('error', 'SceneSfx', 'Scene SFX mix threw', { error, elapsedMs: elapsed() });
    return { ok: false, error };
  }
}

/** Run ffmpeg with a full argv (ending in `-y <output>`). Resolves an error string or null. */
function runFfmpeg(args: string[], signal?: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    // FfmpegCommand appends `-y <output>` itself; hand it everything before.
    const output = args[args.length - 1];
    const cmd = ffmpeg().outputOptions(args.slice(0, -2));
    let aborted = false;
    let settled = false;

    const onAbort = (): void => {
      aborted = true;
      cmd.kill('SIGTERM');
    };
    const finish = (error: string | null): void => {
      if (settled) return;
      settled = true;
      activeCommands.delete(cmd);
      signal?.removeEventListener('abort', onAbort);
      resolve(error);
    };

    // The command's error message already carries the stderr tail.
    cmd
      .on('end', () => finish(null))
      .on('error', (err: Error) => finish(aborted ? 'aborted' : err.message));

    activeCommands.add(cmd);
    signal?.addEventListener('abort', onAbort, { once: true });
    cmd.save(output);
  });
}

function removeQuietly(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* best effort */
  }
}
