/** Seekable motion vocabulary. No clocks, accumulated state or mutable random generators. */
import { spring } from 'remotion';

/** Mass alone does not define weight: damping relative to stiffness controls overshoot. */
export const MOTION = {
  snappy: { stiffness: 300, damping: 26, mass: 0.8 },
  default: { stiffness: 190, damping: 22, mass: 1 },
  heavy: { stiffness: 120, damping: 25, mass: 1.2 },
  gentle: { stiffness: 160, damping: 26, mass: 1 },
  playful: { stiffness: 210, damping: 12, mass: 0.8 },
  stamp: { stiffness: 420, damping: 23, mass: 0.8 },
} as const;
export type MotionWeight = keyof typeof MOTION;

export function motionProgress(
  frame: number,
  fps: number,
  at: number,
  weight: MotionWeight = 'default',
): number {
  return spring({ frame: frame - at * fps, fps, config: MOTION[weight] });
}

/** Seconds-based follow-through: a signed recoil that starts AND ends at zero. */
export function settleOffset(seconds: number, frequency = 5, decay = 9): number {
  if (seconds <= 0 || seconds >= 1.2) return 0;
  // Smooth final taper removes even the tiny truncation discontinuity.
  const tail = Math.min(1, (1.2 - seconds) / 0.2);
  return Math.sin(seconds * frequency * Math.PI * 2) * Math.exp(-decay * seconds) * tail;
}

/** Delayed sampling, not previous-frame state; safe when frames render out of order. */
export function followThrough(
  sample: (frame: number) => number,
  frame: number,
  fps: number,
  delaySec = 0.06,
): number {
  return sample(frame - delaySec * fps);
}

/** Delay in seconds. Center/edge reveals are symmetric, including even-length lists. */
export function staggerDelay(
  index: number,
  count: number,
  stepSec = 0.035,
  from: 'start' | 'center' | 'edges' = 'start',
): number {
  const center = (count - 1) / 2;
  const distance = Math.abs(index - center);
  const rank = from === 'start' ? index : from === 'center' ? distance : center - distance;
  return Math.max(0, rank) * stepSec;
}

/** An impulse has a zero initial displacement, so a second pulse cannot snap the first. */
export function emphasisImpulse(frame: number, fps: number, at: number): number {
  const elapsedFrames = frame - at * fps;
  if (elapsedFrames <= 0 || elapsedFrames >= fps * 0.9) return 0;
  const dt = elapsedFrames / fps;
  const attack = motionProgress(frame, fps, at, 'snappy');
  const release = Math.exp(-dt * 5) * Math.min(1, (0.9 - dt) / 0.2);
  return attack * release;
}

/** Brief terminal-label decode. Stable by frame/index; the final text is never changed. */
export function decodeLabel(
  text: string,
  frame: number,
  fps: number,
  at = 0,
  duration = 0.45,
): string {
  const p = Math.max(0, Math.min(1, (frame / fps - at) / duration));
  if (p >= 1) return text;
  if (p <= 0) return '';
  const chars = Array.from(text);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const tick = Math.floor((frame / fps) * 18);
  return chars
    .map((char, index) => {
      if (/\s/.test(char) || index < Math.floor(p * chars.length)) return char;
      return (
        alphabet[(index * 17 + tick * 7 + (char.codePointAt(0) ?? 0)) % alphabet.length] ?? char
      );
    })
    .join('');
}

/** Smooth saturation bounds overlapping accents without a hard clipping corner. */
export function boundAccent(value: number, limit: number): number {
  return limit * Math.tanh(value / limit);
}
