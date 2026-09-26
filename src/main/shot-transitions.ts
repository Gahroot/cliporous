// ---------------------------------------------------------------------------
// Shot Transitions — FFmpeg filter builder for between-shot visual transitions
//
// Generates time-limited FFmpeg filters at shot boundaries within a single
// continuous clip stream (no segment splitting, so no true two-stream
// dissolve). Every effect is shaped by an eased bell envelope that rises into
// the cut and settles out of it, instead of the old linear triangle.
//
//   Luma (per boundary, timeline-gated `enable`):
//     crossfade  → eased partial dip (brightness + saturation) — reads as a
//                  soft dissolve through the cut without going to black
//     dip-black  → eased full dip to black
//     glitch     → RGB split + noise burst
//
//   Motion (ALL boundaries folded into ONE zoompan pass — one resample of
//   the clip regardless of how many motion transitions it has):
//     zoom-in    → gentle eased push into the cut
//     zoom-punch → sharper, bigger push
//     swipe-*    → whip-pan: accelerates toward one edge into the cut,
//                  decelerates in from the opposite edge after it
//
// FFmpeg constraints this is built around (verified on ffmpeg-static 6.0):
//   - `crop` has no timeline (`enable`) support and its w/h are init-only,
//     so crop cannot animate a zoom — zoompan evaluates per input frame.
//   - `rgbashift` shift options are constants, not expressions.
//   - `eq` supports `enable` and per-frame expressions via `eval=frame`.
// ---------------------------------------------------------------------------

import type { ShotStyleConfig, ShotTransitionConfig, ShotTransitionType } from '@shared/types';
import { easeExpr } from './render/transition-easing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TRANSITION_DURATION = 0.3;
const MIN_TRANSITION_DURATION = 0.15;
const MAX_TRANSITION_DURATION = 1.0;

/** Peak brightness drop for the in-stream `crossfade` (0 = none, 1 = black). */
const SOFT_DIP_DEPTH = 0.35;
/** Peak zoom added by `zoom-in` / `zoom-punch`. */
const ZOOM_IN_AMOUNT = 0.06;
const ZOOM_PUNCH_AMOUNT = 0.12;
/** Zoom headroom that gives the whip-pan room to travel. */
const SWIPE_ZOOM_AMOUNT = 0.1;

function clampDuration(d: number | undefined): number {
  const dur = d ?? DEFAULT_TRANSITION_DURATION;
  return Math.max(MIN_TRANSITION_DURATION, Math.min(MAX_TRANSITION_DURATION, dur));
}

/** Output geometry, required to build the zoompan pass for motion transitions. */
export interface ShotTransitionFrame {
  width: number;
  height: number;
  fps: number;
}

interface TransitionWindow {
  type: ShotTransitionType;
  /** Window start / boundary / end in clip-relative seconds. */
  start: number;
  boundary: number;
  end: number;
}

function transitionWindow(
  transition: ShotTransitionConfig,
  boundaryTime: number,
  clipDuration: number,
): TransitionWindow {
  const dur = clampDuration(transition.duration);
  return {
    type: transition.type,
    start: Math.max(0, boundaryTime - dur / 2),
    boundary: boundaryTime,
    end: Math.min(clipDuration, boundaryTime + dur / 2),
  };
}

const f3 = (n: number): string => n.toFixed(3);

/** Clamped 0→1 progress of `tv` across [a, b]. */
function progress(tv: string, a: number, b: number): string {
  return `clip((${tv}-${f3(a)})/${Math.max(b - a, 1e-3).toFixed(4)},0,1)`;
}

/**
 * Eased bell: 0 at the window edges, 1 at the boundary. Smoothstep up into
 * the cut and back down out of it (zero velocity at every edge, so there's
 * no visible "kick" where the effect starts or stops).
 */
function bellExpr(w: TransitionWindow, tv: string): string {
  const up = easeExpr('smoothstep', progress(tv, w.start, w.boundary));
  const down = easeExpr('smoothstep', progress(tv, w.boundary, w.end));
  return `if(lt(${tv},${f3(w.boundary)}),${up},1-${down})`;
}

/** Sharper bell for zoom-punch: fast attack into the cut, eased release. */
function punchBellExpr(w: TransitionWindow, tv: string): string {
  const up = easeExpr('easeInCubic', progress(tv, w.start, w.boundary));
  const down = easeExpr('easeOutCubic', progress(tv, w.boundary, w.end));
  return `if(lt(${tv},${f3(w.boundary)}),${up},1-${down})`;
}

/**
 * Whip-pan direction: 0 → +1 accelerating into the cut, then −1 → 0
 * decelerating out of it. The jump from +1 to −1 lands exactly on the cut,
 * so the motion reads as one continuous camera move across two shots.
 */
function whipExpr(w: TransitionWindow, tv: string): string {
  const into = easeExpr('easeInCubic', progress(tv, w.start, w.boundary));
  const outOf = easeExpr('easeOutCubic', progress(tv, w.boundary, w.end));
  return `if(lt(${tv},${f3(w.boundary)}),${into},${outOf}-1)`;
}

function gate(w: TransitionWindow, tv: string): string {
  return `between(${tv},${f3(w.start)},${f3(w.end)})`;
}

// ---------------------------------------------------------------------------
// Luma / texture transitions (one filter per boundary)
// ---------------------------------------------------------------------------

function buildLumaFilter(w: TransitionWindow): string {
  const enable = `enable='${gate(w, 't')}'`;
  switch (w.type) {
    case 'crossfade': {
      const env = bellExpr(w, 't');
      return (
        `eq=brightness='-${SOFT_DIP_DEPTH}*${env}':saturation='1-0.5*${env}'` +
        `:eval=frame:${enable}`
      );
    }
    case 'dip-black': {
      const env = bellExpr(w, 't');
      return `eq=brightness='-${env}':saturation='1-${env}':eval=frame:${enable}`;
    }
    case 'glitch': {
      // Strongest split in the middle half of the window, noise across all of it.
      const q = (w.end - w.start) / 4;
      const core = `enable='between(t,${f3(w.boundary - q)},${f3(w.boundary + q)})'`;
      return [
        `rgbashift=rh=6:bh=-6:${enable}`,
        `rgbashift=rh=6:bh=-6:${core}`,
        `noise=alls=30:allf=t:${enable}`,
      ].join(',');
    }
    default:
      return '';
  }
}

/**
 * Build the luma/texture filter for a single boundary. Motion transitions
 * (zoom/swipe) need the output geometry and are built by
 * `buildShotTransitionFilters` as one combined zoompan pass — this returns ''
 * for them.
 */
export function buildTransitionFilter(
  transition: ShotTransitionConfig,
  boundaryTime: number,
  clipDuration: number,
): string {
  if (transition.type === 'none') return '';
  return buildLumaFilter(transitionWindow(transition, boundaryTime, clipDuration));
}

// ---------------------------------------------------------------------------
// Motion transitions (one zoompan for the whole clip)
// ---------------------------------------------------------------------------

const MOTION_TYPES: ReadonlySet<ShotTransitionType> = new Set([
  'zoom-in',
  'zoom-punch',
  'swipe-left',
  'swipe-up',
  'swipe-down',
]);

function sumTerms(terms: string[]): string {
  return terms.length === 0 ? '0' : terms.join('+');
}

/**
 * One zoompan evaluating every motion window. Outside all windows z = 1 and
 * x/y are centered, i.e. an identity pass-through.
 */
function buildMotionFilter(windows: TransitionWindow[], frame: ShotTransitionFrame): string {
  const tv = 'in_time';
  const zoomTerms: string[] = [];
  const xTerms: string[] = [];
  const yTerms: string[] = [];

  for (const w of windows) {
    const g = gate(w, tv);
    switch (w.type) {
      case 'zoom-in':
        zoomTerms.push(`${g}*${ZOOM_IN_AMOUNT}*(${bellExpr(w, tv)})`);
        break;
      case 'zoom-punch':
        zoomTerms.push(`${g}*${ZOOM_PUNCH_AMOUNT}*(${punchBellExpr(w, tv)})`);
        break;
      case 'swipe-left':
      case 'swipe-up':
      case 'swipe-down': {
        // Zoom headroom eases in/out on the same bell as the pan so the window
        // edges don't pop from 1.0× to the headroom zoom. At the edges the whip
        // offset is 0 too, and at the cut (full pan) the headroom is full.
        zoomTerms.push(`${g}*${SWIPE_ZOOM_AMOUNT}*(${bellExpr(w, tv)})`);
        const dir = `${g}*(${whipExpr(w, tv)})`;
        if (w.type === 'swipe-left') xTerms.push(dir);
        else if (w.type === 'swipe-up') yTerms.push(dir);
        else yTerms.push(`-(${dir})`);
        break;
      }
      default:
        break;
    }
  }

  // Pan ranges over [0, iw - iw/zoom]; centre ± half-range × direction.
  const z = `1+${sumTerms(zoomTerms)}`;
  const x = `(iw-iw/zoom)/2*(1+clip(${sumTerms(xTerms)},-1,1))`;
  const y = `(ih-ih/zoom)/2*(1+clip(${sumTerms(yTerms)},-1,1))`;
  return (
    `zoompan=z='if(isnan(${tv}),1,${z})':x='${x}':y='${y}'` +
    `:d=1:s=${frame.width}x${frame.height}:fps=${frame.fps}`
  );
}

// ---------------------------------------------------------------------------
// Multi-shot transition builder
// ---------------------------------------------------------------------------

/**
 * Build FFmpeg filter string for all shot transitions in a clip.
 *
 * For each consecutive shot pair, checks the outgoing shot's `transitionOut`
 * and the incoming shot's `transitionIn`. If both are specified, `transitionOut`
 * takes precedence (the outgoing shot "owns" the boundary).
 *
 * Luma/texture transitions emit one timeline-gated filter per boundary;
 * motion transitions are folded into a single zoompan appended at the end.
 * Motion transitions are skipped when `frame` is not supplied.
 *
 * @param shots        Per-shot style configs (clip-relative times)
 * @param clipDuration Total clip duration in seconds
 * @param frame        Output geometry for the motion (zoompan) pass
 * @returns            Chained FFmpeg filter string or empty string
 */
export function buildShotTransitionFilters(
  shots: ShotStyleConfig[],
  clipDuration: number,
  frame?: ShotTransitionFrame,
): string {
  if (shots.length < 2) return '';

  // Sort by shotIndex to ensure correct boundary ordering
  const sorted = [...shots].sort((a, b) => a.shotIndex - b.shotIndex);

  const filters: string[] = [];
  const motionWindows: TransitionWindow[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const outgoing = sorted[i];
    const incoming = sorted[i + 1];
    if (!outgoing || !incoming) continue;

    // Outgoing shot's transitionOut takes precedence over incoming's transitionIn
    const transition: ShotTransitionConfig | null | undefined =
      outgoing.transitionOut ?? incoming.transitionIn;
    if (!transition || transition.type === 'none') continue;

    // Boundary time is the end of the outgoing shot (= start of incoming)
    const w = transitionWindow(transition, outgoing.endTime, clipDuration);
    if (w.end <= w.start) continue;

    if (MOTION_TYPES.has(w.type)) {
      motionWindows.push(w);
    } else {
      const filter = buildLumaFilter(w);
      if (filter) filters.push(filter);
    }
  }

  if (frame && motionWindows.length > 0) {
    filters.push(buildMotionFilter(motionWindows, frame));
  }

  return filters.join(',');
}
