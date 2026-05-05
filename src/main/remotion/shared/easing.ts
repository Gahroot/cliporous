import { Easing } from 'remotion'

/**
 * Cinematic easing curves. Premium motion uses asymmetric curves — slow in,
 * fast out — which read as deliberate rather than mechanical.
 */
export const EASE = {
  /** out-expo: rapid arrival, gentle settle. Best for entries. */
  outExpo: Easing.bezier(0.16, 1, 0.3, 1),
  /** in-expo: gentle start, fast exit. Best for exits. */
  inExpo: Easing.bezier(0.7, 0, 0.84, 0),
  /** out-quart: softer than expo. Good for image scale. */
  outQuart: Easing.bezier(0.25, 1, 0.5, 1),
  /** in-out-quart: symmetric, for hold-to-hold motion. */
  inOutQuart: Easing.bezier(0.76, 0, 0.24, 1)
} as const
