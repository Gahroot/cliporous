import type { FeedbackControlScene } from '../types';
import { feedbackLevel, smoothPhase } from './kinematics';

/** Illustrative normalized readings, never pressure units or source statistics. */
export const FEEDBACK_TARGET = 0.5;
const HIGH_READING = 0.84;
const RISE_SECONDS = 0.35;
const SENSOR_SECONDS = 0.18;
const SIGNAL_HOLD_SECONDS = 0.08;
const VALVE_SECONDS = 0.32;
const CORRECTED_OPENING = 0.25;

export type FeedbackControlPose = Readonly<{
  gauge: Readonly<{ value: number; target: number }>;
  valve: Readonly<{ open: number }>;
  sensor: Readonly<{
    /** Response to the excess reading; returns to rest exactly with the gauge. */
    active: number;
    /** One command reveal from sensor to valve, never a looping/resetting particle. */
    signal: number;
  }>;
}>;

/**
 * One seekable schedule: rise → detect/send → close inlet → pressure correction → hold.
 * The parser reserves >= .55/.55/1s between beats and >= .6s after settleAt.
 * Fixed sub-beats leave a readable pause before sensing and before valve actuation.
 * This is authored cause/effect, not a simulation or a delta-time controller.
 */
export function sampleFeedbackControl(t: number, scene: FeedbackControlScene): FeedbackControlPose {
  const { exceedAt, senseAt, correctAt, settleAt } = scene;
  const risenAt = exceedAt + RISE_SECONDS;
  const sensedAt = senseAt + SENSOR_SECONDS;
  const signalledAt = correctAt - SIGNAL_HOLD_SECONDS;
  const valveAt = correctAt + VALVE_SECONDS;
  if (
    ![t, exceedAt, senseAt, correctAt, settleAt].every(Number.isFinite) ||
    senseAt <= risenAt ||
    signalledAt <= sensedAt ||
    settleAt <= valveAt
  ) {
    return {
      gauge: { value: FEEDBACK_TARGET, target: FEEDBACK_TARGET },
      valve: { open: 1 },
      sensor: { active: 0, signal: 0 },
    };
  }

  // Bound seeks before phase division: a finite far-future time can otherwise overflow
  // a short phase duration to Infinity and make clamp01 treat the phase as invalid/rest.
  const time = Math.max(exceedAt, Math.min(t, settleAt));
  const rising = feedbackLevel(time, exceedAt, risenAt, FEEDBACK_TARGET, HIGH_READING);
  // The inlet finishes closing BEFORE pressure starts falling, even at minimum beat gaps.
  const correction = smoothPhase(time, valveAt, settleAt);
  return {
    gauge: {
      value: feedbackLevel(time, valveAt, settleAt, rising, FEEDBACK_TARGET),
      target: FEEDBACK_TARGET,
    },
    valve: { open: feedbackLevel(time, correctAt, valveAt, 1, CORRECTED_OPENING) },
    sensor: {
      active: smoothPhase(time, senseAt, sensedAt) * (1 - correction),
      signal: smoothPhase(time, senseAt, signalledAt),
    },
  };
}
