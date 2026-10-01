import { settleOffset } from '../motion-tokens';

export interface TechnologyPoint {
  x: number;
  y: number;
}

export function unitProgress(time: number, start: number, end: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (end <= start) return time < start ? 0 : 1;
  return Math.max(0, Math.min(1, (time - start) / (end - start)));
}

/** Zero velocity at both contacts, exactly settled outside the authored interval. */
export function phaseProgress(time: number, start: number, end: number): number {
  const p = unitProgress(time, start, end);
  return p * p * (3 - 2 * p);
}

export function mixNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * Math.max(0, Math.min(1, progress));
}

export function travelPoint(
  time: number,
  start: number,
  end: number,
  from: TechnologyPoint,
  to: TechnologyPoint,
): TechnologyPoint {
  const p = phaseProgress(time, start, end);
  return { x: mixNumber(from.x, to.x, p), y: mixNumber(from.y, to.y, p) };
}

/** A bounded receiver recoil, never a pre-contact response; static after 0.5 seconds. */
export function contactOffset(time: number, contact: number, amplitude = 5): number {
  const elapsed = time - contact;
  if (elapsed <= 0 || elapsed >= 0.5 || !Number.isFinite(elapsed)) return 0;
  return settleOffset(elapsed * 2.4) * Math.max(-8, Math.min(8, amplitude));
}

/** Short opacity reveal; callers choose a start only after its causal prerequisite. */
export function revealAt(time: number, at: number, duration = 0.25): number {
  return phaseProgress(time, at, at + duration);
}
