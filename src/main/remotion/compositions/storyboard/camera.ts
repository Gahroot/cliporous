/**
 * Pure board geometry: camera pose over time, world→screen mapping, and the
 * seeded hand-drawn path helpers. No React, no clock — every value is a
 * function of `t`, so any frame renders identically in isolation.
 */

import { STORYBOARD_LIMITS } from '../../../../shared/storyboards';
import type { CameraShot, Pt, StoryBoardSpec } from './types';

export interface CameraPose {
  x: number;
  y: number;
  zoom: number;
}

/** Smooth ease-in-out with a soft landing (cubic bezier 0.65,0,0.25,1 approximated). */
export function easeInOut(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  // Quintic-ish S-curve: fast through the middle, long settle (matches a swipe).
  return c < 0.5 ? 16 * c ** 5 : 1 - (-2 * c + 2) ** 5 / 2;
}

export function boundedZoom(zoom: number): number {
  return Math.min(
    STORYBOARD_LIMITS.maxZoom,
    Math.max(STORYBOARD_LIMITS.minZoom, Number.isFinite(zoom) ? zoom : 1),
  );
}

/** Drift is finite even if a caller samples beyond the board's duration. */
function driftOffset(shot: CameraShot, t: number): number {
  const speed = Math.max(-12, Math.min(12, shot.driftX ?? 0));
  const offset = speed * Math.max(0, t - shot.at - shot.dur);
  return Math.max(-36, Math.min(36, offset));
}

/** Segment-local clock. Interrupted moves start at their actual pose, never their future target. */
export function cameraAt(shots: readonly CameraShot[], t: number): CameraPose {
  const first = shots[0];
  if (!first) return { x: 0, y: 0, zoom: 1 };
  let active = first;
  let from: CameraPose = { x: first.x, y: first.y, zoom: boundedZoom(first.zoom) };
  const sample = (time: number): CameraPose => {
    const p = active.dur <= 0 ? 1 : easeInOut((time - active.at) / active.dur);
    return {
      x: from.x + (active.x - from.x) * p + driftOffset(active, time),
      y: from.y + (active.y - from.y) * p,
      zoom: Math.exp(
        Math.log(from.zoom) + (Math.log(boundedZoom(active.zoom)) - Math.log(from.zoom)) * p,
      ),
    };
  };
  for (const shot of shots.slice(1)) {
    if (t < shot.at) break;
    from = sample(shot.at);
    active = shot;
  }
  return sample(t);
}

/** One opacity envelope includes paper, drawings, shadows and WebGL; outside it is alpha. */
export function boardOpacity(
  spec: Pick<StoryBoardSpec, 'boardIn' | 'boardOut'>,
  t: number,
): number {
  const progress = (at: number, dur: number): number =>
    dur <= 0 ? Number(t >= at) : Math.min(1, Math.max(0, (t - at) / dur));
  const smooth = (p: number): number => p * p * (3 - 2 * p);
  return (
    smooth(progress(spec.boardIn.at, spec.boardIn.dur)) *
    (1 - smooth(progress(spec.boardOut.at, spec.boardOut.dur)))
  );
}

export function worldToScreen(p: Pt, cam: CameraPose, width: number, height: number): Pt {
  return { x: (p.x - cam.x) * cam.zoom + width / 2, y: (p.y - cam.y) * cam.zoom + height / 2 };
}

/** CSS transform that maps world pixels onto the screen for `cam`. */
export function worldTransform(cam: CameraPose, width: number, height: number): string {
  const tx = width / 2 - cam.x * cam.zoom;
  const ty = height / 2 - cam.y * cam.zoom;
  return `translate(${tx}px, ${ty}px) scale(${cam.zoom})`;
}

/** Deterministic 0..1 hash for a string seed + integer index. */
export function seeded(seed: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < seed.length; k++) {
    h ^= seed.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Quadratic bezier point. */
export function quad(a: Pt, c: Pt, b: Pt, p: number): Pt {
  const u = 1 - p;
  return {
    x: u * u * a.x + 2 * u * p * c.x + p * p * b.x,
    y: u * u * a.y + 2 * u * p * c.y + p * p * b.y,
  };
}

/** Control point that bows the segment a→b by `bend` × its length. */
export function bendControl(a: Pt, b: Pt, bend: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: (a.x + b.x) / 2 + dy * bend, y: (a.y + b.y) / 2 - dx * bend };
}

/**
 * Low-frequency seeded wobble applied perpendicular to a polyline — reads as a
 * steady hand rather than noise. `amp` 0 returns the clean polyline.
 */
export function wobblePath(points: readonly Pt[], seed: string, amp: number): string {
  if (points.length === 0) return '';
  const ph1 = seeded(seed, 1) * Math.PI * 2;
  const ph2 = seeded(seed, 2) * Math.PI * 2;
  const n = points.length - 1;
  const out = points.map((p, i) => {
    if (amp === 0 || n === 0) return p;
    const prev = points[Math.max(0, i - 1)] ?? p;
    const next = points[Math.min(n, i + 1)] ?? p;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const s = i / n;
    const w = amp * (Math.sin(s * 5.1 + ph1) * 0.65 + Math.sin(s * 11.3 + ph2) * 0.35);
    return { x: p.x - (ty / len) * w, y: p.y + (tx / len) * w };
  });
  return out.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

export function sampleQuad(a: Pt, c: Pt, b: Pt, steps = 28): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => quad(a, c, b, i / steps));
}

/** Points along an S-shaped "ease" curve inside a w×h box (bottom-left → top-right). */
export function easeCurvePoints(x: number, y: number, w: number, h: number, steps = 40): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const s = i / steps;
    const e = s * s * (3 - 2 * s);
    return { x: x + s * w, y: y + h - e * h };
  });
}

/** Point at arc-length fraction `p` along a polyline. */
export function alongPolyline(points: readonly Pt[], p: number): Pt {
  const first = points[0];
  if (!first) return { x: 0, y: 0 };
  const lens: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] ?? first;
    const b = points[i] ?? first;
    lens.push((lens[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lens[lens.length - 1] ?? 0;
  const target = Math.min(1, Math.max(0, p)) * total;
  for (let i = 1; i < points.length; i++) {
    const l0 = lens[i - 1] ?? 0;
    const l1 = lens[i] ?? 0;
    if (target <= l1) {
      const a = points[i - 1] ?? first;
      const b = points[i] ?? first;
      const k = l1 === l0 ? 0 : (target - l0) / (l1 - l0);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return points[points.length - 1] ?? first;
}
