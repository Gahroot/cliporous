export const DEFAULT_RUN_LIMITS = Object.freeze({
  maxAttempts: 120,
  holdoutReserve: 20,
  requestMs: 90_000,
  wallMs: 2 * 60 * 60 * 1000,
  maxOutputBytes: 1024 * 1024,
  maxConsecutiveTransient: 2,
});
export type AttemptOutcome =
  | 'completed'
  | 'transient'
  | 'unknown'
  | 'quota'
  | 'billing'
  | 'auth'
  | 'configuration'
  | 'cancelled';
export interface LimitsState {
  startedAt: number;
  attempts: number;
  consecutiveTransient: number;
  stop: Exclude<AttemptOutcome, 'completed' | 'transient'> | 'retry-limit' | null;
}
export type LimitDecision = { ok: true; attempt: number } | { ok: false; reason: string };
export interface RunLimits {
  begin(split: 'discovery' | 'holdout'): LimitDecision;
  finish(outcome: AttemptOutcome): void;
  snapshot(): LimitsState;
}
/** Run-owned accounting. Reserve BEFORE every outline/draft/review/retry, never per plan. */
export function createRunLimits(
  options: { now?: () => number; state?: LimitsState } = {},
): RunLimits {
  const now = options.now ?? Date.now;
  const state: LimitsState = options.state
    ? { ...options.state }
    : { startedAt: now(), attempts: 0, consecutiveTransient: 0, stop: null };
  if (
    !Number.isFinite(state.startedAt) ||
    state.startedAt < 0 ||
    state.startedAt > now() ||
    !Number.isInteger(state.attempts) ||
    state.attempts < 0 ||
    state.attempts > DEFAULT_RUN_LIMITS.maxAttempts ||
    !Number.isInteger(state.consecutiveTransient) ||
    state.consecutiveTransient < 0 ||
    state.consecutiveTransient > 2 ||
    ![
      null,
      'unknown',
      'quota',
      'billing',
      'auth',
      'configuration',
      'cancelled',
      'retry-limit',
    ].includes(state.stop)
  ) {
    throw new Error('Invalid run limit checkpoint');
  }
  let inFlight = false;
  return {
    begin(split) {
      if (state.stop) return { ok: false, reason: state.stop };
      if (inFlight) return { ok: false, reason: 'in-flight' };
      if (now() - state.startedAt >= DEFAULT_RUN_LIMITS.wallMs)
        return { ok: false, reason: 'wall-limit' };
      if (state.attempts >= DEFAULT_RUN_LIMITS.maxAttempts)
        return { ok: false, reason: 'attempt-limit' };
      if (
        split === 'discovery' &&
        state.attempts >= DEFAULT_RUN_LIMITS.maxAttempts - DEFAULT_RUN_LIMITS.holdoutReserve
      )
        return { ok: false, reason: 'holdout-reserve' };
      inFlight = true;
      state.attempts++;
      return { ok: true, attempt: state.attempts };
    },
    finish(outcome) {
      if (!inFlight) throw new Error('No owned attempt to complete');
      inFlight = false;
      if (outcome === 'transient') {
        state.consecutiveTransient++;
        if (state.consecutiveTransient >= DEFAULT_RUN_LIMITS.maxConsecutiveTransient)
          state.stop = 'retry-limit';
      } else if (outcome === 'completed') state.consecutiveTransient = 0;
      else state.stop = outcome;
    },
    snapshot() {
      return { ...state, ...(inFlight ? { stop: 'unknown' as const } : {}) };
    },
  };
}
