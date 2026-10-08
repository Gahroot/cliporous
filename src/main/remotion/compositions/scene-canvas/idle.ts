/**
 * Settled panel motion: once a panel's own animation is done it keeps living while it stays on
 * the board instead of freezing on its last frame. Pure and seekable: every value is a function
 * of the panel-local time, so any frame renders identically in isolation and out of order.
 *
 * The layer is zero at the settle point (value and slope), so it eases in without a jump, and it
 * never replays an entrance: it only floats, tilts, turns 3D cameras a little and pulses.
 */
import { emphasisImpulse } from '../explainer/motion-tokens';
import { collectSceneTimes, type ExplainerScene } from '../explainer/types';
import { seeded } from '../storyboard/camera';

export const PANEL_IDLE = {
  /** A panel counts as settled this long after its last beat. */
  settleAfterLastBeatSec: 1.2,
  /** Idle motion eases in over this long. */
  rampSec: 1.4,
  /** Stage pixels of float (the canvas camera usually shows the stage at ~0.6–0.8×). */
  floatPx: 14,
  /** CSS tilt of the whole panel, a 2.5D turntable for flat and 3D panels alike. */
  tiltDeg: 2.4,
  /** Extra camera azimuth for clay 3D panels. */
  orbitDeg: 10,
  /** The finished panel re-emphasises itself on this cadence. */
  pulseEverySec: 4.2,
  pulseScale: 0.022,
} as const;

export interface PanelIdle {
  x: number;
  y: number;
  rotateX: number;
  rotateY: number;
  scale: number;
  /** 0–1 accent glow behind the panel. */
  glow: number;
  /** Extra 3D camera azimuth in degrees. */
  orbitDeg: number;
}

export const NO_IDLE: PanelIdle = {
  x: 0,
  y: 0,
  rotateX: 0,
  rotateY: 0,
  scale: 1,
  glow: 0,
  orbitDeg: 0,
};

/** Panel-local second at which the scene's own animation is finished. */
export function panelSettleSec(scene: ExplainerScene, ownSec: number): number {
  const beats = collectSceneTimes(scene);
  const lastBeat = beats[beats.length - 1];
  const settle = lastBeat === undefined ? ownSec : lastBeat + PANEL_IDLE.settleAfterLastBeatSec;
  return Math.min(Math.max(0.5, ownSec), Math.max(0.5, settle));
}

/** Smoothstep: zero value and zero slope at both ends. */
function ease(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
}

export function panelIdleAt(
  localSec: number,
  settleSec: number,
  fps: number,
  seed: string,
): PanelIdle {
  const u = localSec - settleSec;
  if (!(u > 0)) return NO_IDLE;
  const P = PANEL_IDLE;
  const w = ease(u / P.rampSec);
  const phase = (k: number): number => seeded(seed, 40 + k) * Math.PI * 2;
  const wave = (periodSec: number, k: number): number =>
    Math.sin((u * Math.PI * 2) / periodSec + phase(k)) - Math.sin(phase(k));
  // A pulse every `pulseEverySec`, the first one a full period after settling.
  const n = Math.floor(u / P.pulseEverySec);
  const impulse =
    n >= 1 ? emphasisImpulse(localSec * fps, fps, settleSec + n * P.pulseEverySec) : 0;
  return {
    x: w * wave(7.3, 0) * P.floatPx * 0.6,
    y: w * wave(5.4, 1) * P.floatPx,
    rotateX: w * wave(11.2, 2) * P.tiltDeg * 0.5,
    rotateY: w * wave(8.6, 3) * P.tiltDeg,
    scale: 1 + w * impulse * P.pulseScale,
    glow: w * (0.18 + 0.12 * (0.5 + 0.5 * wave(6.1, 4)) + 0.45 * impulse),
    orbitDeg: w * wave(12.8, 5) * P.orbitDeg * 0.5,
  };
}

export function idleTransform(idle: PanelIdle): string {
  return [
    `translate(${idle.x.toFixed(2)}px, ${idle.y.toFixed(2)}px)`,
    `perspective(2600px)`,
    `rotateX(${idle.rotateX.toFixed(3)}deg)`,
    `rotateY(${idle.rotateY.toFixed(3)}deg)`,
    `scale(${idle.scale.toFixed(4)})`,
  ].join(' ');
}
