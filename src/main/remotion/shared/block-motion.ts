/** Frame-clock motion shared by content blocks. No bounce, zoom, or wall time. */
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export interface BlockMotion {
  opacity: number;
  transform: string;
}

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Keep most of an insert still for reading, even when its duration is short. */
export function getBlockMotion(frame: number, fps: number, durationInFrames: number): BlockMotion {
  const lastFrame = Math.max(0, durationInFrames - 1);
  if (lastFrame < 3) return { opacity: 1, transform: 'translateY(0px)' };

  const enterFrames = Math.max(1, Math.min(Math.round(fps * 0.4), Math.floor(lastFrame * 0.25)));
  const exitFrames = Math.max(1, Math.min(Math.round(fps * 0.2), Math.floor(lastFrame * 0.2)));
  const enter = interpolate(frame, [0, enterFrames], [0, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.cubic),
  });
  const exit = interpolate(frame, [lastFrame - exitFrames, lastFrame], [0, 1], {
    ...CLAMP,
    easing: Easing.inOut(Easing.quad),
  });

  return {
    opacity: enter * (1 - exit),
    transform: `translateY(${18 * (1 - enter)}px)`,
  };
}

/** Bounded stagger: every item settles before the reading hold, without overshoot. */
export function getBlockReveal(
  frame: number,
  fps: number,
  durationInFrames: number,
  index = 0,
  count = 1,
): number {
  if (durationInFrames < 4) return 1;
  const finish = Math.max(1, Math.min(fps * 0.9, Math.floor((durationInFrames - 1) * 0.55)));
  const delay = Math.min(fps * 0.12, finish * 0.15);
  const stagger = count > 1 ? Math.min(fps * 0.06, (finish * 0.25) / (count - 1)) : 0;
  const start = delay + Math.max(0, Math.min(index, count - 1)) * stagger;

  return interpolate(frame, [start, finish], [0, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.cubic),
  });
}

export function useBlockMotion(): BlockMotion {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return getBlockMotion(frame, fps, durationInFrames);
}
