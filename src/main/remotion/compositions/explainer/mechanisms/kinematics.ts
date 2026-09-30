/** Seekable authored mechanics. All times are seconds, angles radians, distances model units. */
export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** A bounded phase, including exact endpoints; invalid timelines remain at rest. */
export function phase(t: number, startAt: number, endAt: number): number {
  if (![t, startAt, endAt].every(Number.isFinite) || endAt <= startAt) return 0;
  return clamp01((t - startAt) / (endAt - startAt));
}

export function smoothPhase(t: number, startAt: number, endAt: number): number {
  const u = phase(t, startAt, endAt);
  return u * u * (3 - 2 * u);
}

/** Integral of smoothstep, with a linear tail after full speed. */
function integratedRamp(elapsed: number, duration: number): number {
  const u = clamp01(elapsed / duration);
  return duration * (u ** 3 - u ** 4 / 2) + Math.max(0, elapsed - duration);
}

export type SpinSchedule = Readonly<{
  startAt: number;
  driveAt: number;
  coastAt: number;
  stopAt: number;
  speed: number;
}>;
export type SpinPose = Readonly<{ angle: number; speed: number }>;

/** Analytic acceleration/cruise/braking; angle AND speed are continuous at each boundary. */
export function spinUpCoast(t: number, schedule: SpinSchedule): SpinPose {
  const { startAt, driveAt, coastAt, stopAt, speed } = schedule;
  if (
    ![t, startAt, driveAt, coastAt, stopAt, speed].every(Number.isFinite) ||
    driveAt <= startAt ||
    coastAt < driveAt ||
    stopAt <= coastAt ||
    speed < 0
  )
    return { angle: 0, speed: 0 };
  const time = Math.min(t, stopAt);
  const up = integratedRamp(time - startAt, driveAt - startAt);
  const down = integratedRamp(time - coastAt, stopAt - coastAt);
  return {
    angle: speed * Math.max(0, up - down),
    speed: speed * Math.max(0, smoothPhase(t, startAt, driveAt) - smoothPhase(t, coastAt, stopAt)),
  };
}

export type BeltPose = Readonly<{ distance: number; wheelAngle: number; offset: number }>;
/** Rollers and tread markers derive from ONE unwrapped distance, never independent cycles. */
export function beltTravel(distance: number, radius: number, pitch: number): BeltPose {
  if (![distance, radius, pitch].every(Number.isFinite) || radius <= 0 || pitch <= 0) {
    return { distance: 0, wheelAngle: 0, offset: 0 };
  }
  return { distance, wheelAngle: -distance / radius, offset: ((distance % pitch) + pitch) % pitch };
}

export type PulleyPose = Readonly<{ wheelAngle: number; loadY: number; effortY: number }>;
/** Fixed pulley: equal opposite travel keeps the cable length constant. */
export function pulleyTravel(distance: number, radius: number): PulleyPose {
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) {
    return { wheelAngle: 0, loadY: 0, effortY: 0 };
  }
  return { wheelAngle: distance / radius, loadY: distance, effortY: -distance };
}

/** Detent wheel: forward stroke then hold; the pawl may reset, the wheel never does. */
export function ratchetAngle(t: number, startAt: number, endAt: number, steps: number): number {
  const count = Number.isFinite(steps) ? Math.max(1, Math.min(24, Math.floor(steps))) : 1;
  const travel = phase(t, startAt, endAt) * count;
  const detent = Math.floor(travel);
  const stroke = clamp01((travel - detent) / 0.65);
  return (detent + stroke * stroke * (3 - 2 * stroke)) * (Math.PI / 6);
}

/** Bounded single corrective response with exact target and no infinite oscillation tail. */
export function feedbackLevel(
  t: number,
  correctAt: number,
  settledAt: number,
  initial: number,
  target: number,
): number {
  const u = smoothPhase(t, correctAt, settledAt);
  const from = clamp01(initial);
  const to = clamp01(target);
  return from + (to - from) * u;
}

export type LeverPose = Readonly<{
  pivotX: number;
  angle: number;
  effort: readonly [number, number];
  load: readonly [number, number];
}>;
/** End contacts lie on the same rigid beam; changing the fulcrum changes both arm lengths. */
export function leverPose(pivotX: number, angle: number, halfLength = 1.15): LeverPose {
  const length = Number.isFinite(halfLength) ? Math.max(0.1, Math.min(2, halfLength)) : 1.15;
  const pivot = Number.isFinite(pivotX)
    ? Math.max(-length * 0.7, Math.min(length * 0.7, pivotX))
    : 0;
  const tilt = Number.isFinite(angle) ? Math.max(-0.4, Math.min(0.4, angle)) : 0;
  const contact = (x: number): readonly [number, number] => [
    pivot + (x - pivot) * Math.cos(tilt),
    (x - pivot) * Math.sin(tilt),
  ];
  return { pivotX: pivot, angle: tilt, effort: contact(-length), load: contact(length) };
}
