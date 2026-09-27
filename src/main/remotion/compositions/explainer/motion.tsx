/**
 * Motion kit for explainer scenes: "nothing sits still" idle motion, emphasis
 * reactions, stage entrance/exit, particle bursts, glow and velocity blur.
 *
 * Determinism rules (renders must be frame-exact and repeatable):
 *  - every value is a pure function of the frame (never Date/performance/clock);
 *  - randomness only via `hash01(seed)`.
 *
 * Idle motion is deliberately tiny (a few px / <1.5°) — premium edits breathe,
 * they do not wobble.
 */

import type React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ramp, useExplainerContext, useSceneTime, useStage } from './stage';

/** Deterministic 0–1 hash for any integer/string seed (mulberry32 step). */
export function hash01(seed: number | string): number {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761) >>> 0;
  let t = (h + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Remocn radial-burst easing constants (smooth, premium ease-out).
export const EASE_OUT_SOFT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT_SOFT = Easing.bezier(0.65, 0, 0.25, 1);

// ---------------------------------------------------------------------------
// Idle motion
// ---------------------------------------------------------------------------

export interface FloatOffset {
  x: number;
  y: number;
  rotate: number;
}

/**
 * Gentle floating drift. `seed` desynchronises neighbouring elements so a row
 * of cards does not bob in lockstep.
 */
export function useFloat(seed: number | string = 0, amplitude = 6, periodSec = 4.6): FloatOffset {
  const { t } = useSceneTime();
  const phase = hash01(seed) * Math.PI * 2;
  const w = (Math.PI * 2) / periodSec;
  return {
    x: Math.sin(t * w * 0.7 + phase * 1.3) * amplitude * 0.45,
    y: Math.sin(t * w + phase) * amplitude,
    rotate: Math.sin(t * w * 0.55 + phase) * amplitude * 0.12,
  };
}

/** CSS transform string for a float offset. */
export function floatTransform(f: FloatOffset): string {
  return `translate(${f.x.toFixed(2)}px, ${f.y.toFixed(2)}px) rotate(${f.rotate.toFixed(3)}deg)`;
}

/** Slow 0–1 breathing value for glow pulses (period ~3.2 s). */
export function useBreath(seed: number | string = 0, periodSec = 3.2): number {
  const { t } = useSceneTime();
  const phase = hash01(`b${seed}`) * Math.PI * 2;
  return 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / periodSec + phase);
}

/**
 * Soft contact shadow that shifts with the float, so objects feel lit and
 * grounded. Returns a CSS box-shadow value.
 */
export function useLivingShadow(seed: number | string = 0, strength = 1): string {
  const f = useFloat(seed);
  const y = 26 + f.y * 1.4;
  const blur = 64 - f.y * 2;
  const alpha = 0.42 * strength;
  return `${(f.x * 0.8).toFixed(1)}px ${y.toFixed(1)}px ${blur.toFixed(1)}px rgba(0,0,0,${alpha.toFixed(2)})`;
}

// ---------------------------------------------------------------------------
// Emphasis reactions
// ---------------------------------------------------------------------------

export interface Reaction {
  scale: number;
  x: number;
  rotate: number;
  /** 0–1 extra glow for the reacting element. */
  glow: number;
}

const NO_REACTION: Reaction = { scale: 1, x: 0, rotate: 0, glow: 0 };

/**
 * Reaction to the scene's emphasis pulses. `target` = element index; pulses
 * without a target apply to every element (use `target === undefined` for the
 * whole-scene wrapper).
 */
export function useReaction(target?: number): Reaction {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { extras } = useExplainerContext();
  const pulses = extras.pulses;
  if (!pulses || pulses.length === 0) return NO_REACTION;
  let out = NO_REACTION;
  for (const p of pulses) {
    const matches = target === undefined ? p.target === undefined : p.target === target;
    if (!matches) continue;
    const local = frame - Math.round(p.at * fps);
    if (local < 0 || local > fps * 0.9) continue;
    if (p.strength === 'shake') {
      const decay = Math.exp(-local / (fps * 0.18));
      out = {
        scale: 1 + 0.02 * decay,
        x: Math.sin(local * 1.9) * 9 * decay,
        rotate: Math.sin(local * 1.6) * 1.2 * decay,
        glow: decay,
      };
    } else {
      const s = spring({ frame: local, fps, config: { stiffness: 260, damping: 11, mass: 0.6 } });
      const bump = Math.sin(Math.min(1, s) * Math.PI) * (1 - local / (fps * 0.9));
      out = { scale: 1 + 0.07 * bump, x: 0, rotate: 0, glow: bump };
    }
  }
  return out;
}

export function reactionTransform(r: Reaction): string {
  return `translateX(${r.x.toFixed(2)}px) rotate(${r.rotate.toFixed(3)}deg) scale(${r.scale.toFixed(4)})`;
}

// ---------------------------------------------------------------------------
// Stage entrance / exit
// ---------------------------------------------------------------------------

/**
 * Stage enter (slide up + scale + unblur) and exit (scale away + fade) —
 * scenes never cut in or out. `durationSec` is the scene's visible length.
 */
export function useStageEnterExit(
  enter: boolean,
  exit: boolean,
  durationSec: number,
): React.CSSProperties {
  const { t } = useSceneTime();
  const inP = enter ? EASE_OUT_SOFT(Math.min(1, Math.max(0, t / 0.5))) : 1;
  const outStart = Math.max(0, durationSec - 0.38);
  const outP = exit ? EASE_IN_OUT_SOFT(Math.min(1, Math.max(0, (t - outStart) / 0.38))) : 0;
  const y = (1 - inP) * 90 - outP * 30;
  const scale = (0.94 + inP * 0.06) * (1 - outP * 0.05);
  const blur = (1 - inP) * 10 + outP * 8;
  return {
    opacity: inP * (1 - outP),
    transform: `translateY(${y.toFixed(2)}px) scale(${scale.toFixed(4)})`,
    filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
  };
}

// ---------------------------------------------------------------------------
// Velocity blur ("motion blur on fast moves", without multi-sample renders)
// ---------------------------------------------------------------------------

/**
 * Blur (px) proportional to how fast `valueAt(frame)` is changing. Cheap
 * stand-in for real motion blur: only kicks in on fast moves.
 */
export function useVelocityBlur(valueAt: (frame: number) => number, pxPerUnit = 0.35): number {
  const frame = useCurrentFrame();
  const v = Math.abs(valueAt(frame) - valueAt(frame - 1));
  const blur = Math.max(0, v * pxPerUnit - 0.4);
  return Math.min(10, blur);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Soft glow halo behind a focus item. Place inside a relatively-positioned box. */
export const Glow: React.FC<{ color: string; intensity: number; radius?: number }> = ({
  color,
  intensity,
  radius = 120,
}) => {
  if (intensity <= 0.01) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: -radius * 0.35,
        borderRadius: radius,
        background: `radial-gradient(closest-side, ${color} 0%, rgba(0,0,0,0) 100%)`,
        opacity: Math.min(1, intensity) * 0.55,
        filter: `blur(${Math.round(radius * 0.25)}px)`,
        pointerEvents: 'none',
      }}
    />
  );
};

/**
 * Light particle burst for big moments. Deterministic: particle angles,
 * distances and sizes come from `hash01(seed + i)`.
 */
export const Burst: React.FC<{
  atSec: number;
  x: number;
  y: number;
  color: string;
  count?: number;
  radius?: number;
  seed?: string;
}> = ({ atSec, x, y, color, count = 14, radius = 180, seed = 'burst' }) => {
  const { t } = useSceneTime();
  const local = t - atSec;
  if (local < 0 || local > 1.1) return null;
  const p = EASE_OUT_SOFT(Math.min(1, local / 0.9));
  const fade = 1 - Math.max(0, (local - 0.35) / 0.75);
  const particles = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + (hash01(`${seed}a${i}`) - 0.5) * 0.5;
    const d = radius * (0.55 + hash01(`${seed}d${i}`) * 0.6) * p;
    const size = 5 + hash01(`${seed}s${i}`) * 7;
    const sparkle = i % 3 === 0;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x + Math.cos(a) * d - size / 2,
          top: y + Math.sin(a) * d - size / 2,
          width: size,
          height: sparkle ? size * 2.2 : size,
          borderRadius: size,
          background: color,
          opacity: fade * (sparkle ? 0.95 : 0.7),
          transform: `rotate(${((a * 180) / Math.PI + 90).toFixed(1)}deg) scale(${(1 - p * 0.5).toFixed(3)})`,
          boxShadow: `0 0 ${size * 2}px ${color}`,
        }}
      />
    );
  });
  // Soft ring shock.
  const ring = radius * 0.9 * p;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: x - ring,
          top: y - ring,
          width: ring * 2,
          height: ring * 2,
          borderRadius: '50%',
          border: `2px solid ${color}`,
          opacity: 0.35 * fade * (1 - p),
        }}
      />
      {particles}
    </div>
  );
};

/** Overlay stamp that lands on top of any scene (`extras.overlayStamp`). */
export const OverlayStamp: React.FC<{ word: string; atSec: number }> = ({ word, atSec }) => {
  const S = useStage();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t } = useSceneTime();
  if (t < atSec - 0.02) return null;
  const local = frame - Math.round(atSec * fps);
  const s = spring({ frame: local, fps, config: { stiffness: 320, damping: 17, mass: 0.8 } });
  const scale = interpolate(s, [0, 1], [2.1, 1]);
  const opacity = interpolate(local, [0, 3], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '12%',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          transform: `rotate(-7deg) scale(${scale.toFixed(4)})`,
          opacity,
          padding: '14px 36px',
          border: `8px solid ${S.accent}`,
          borderRadius: 18,
          color: S.accent,
          fontFamily: S.font,
          fontWeight: 900,
          fontSize: 96,
          letterSpacing: 4,
          lineHeight: 1,
          textTransform: 'uppercase',
          background: 'rgba(0,0,0,0.18)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        {word}
      </div>
    </div>
  );
};

/** Dims the stage content from `atSec` (generic "broken"/"fails" beat). */
export function dimOpacity(t: number, atSec: number | undefined): number {
  if (atSec === undefined) return 1;
  return 1 - 0.62 * ramp(t, atSec, 0.5);
}
